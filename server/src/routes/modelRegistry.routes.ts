import { Router, Response } from 'express';
import { DataStore, ModelRegistryDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

// GET /api/models - List Model & Data Provenance Registry
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  res.json({
    models: store.modelRegistry,
    activeModelId: store.modelRegistry.find((m) => m.deploymentStatus === 'DEPLOYED')?.modelId || 'MODEL-PPE-SH17-001',
    total: store.modelRegistry.length,
    licensingNotice: 'SH17 dataset and models derived from it are released under CC BY-NC-SA 4.0. Commercial industrial deployment requires separate written authorization from copyright holders.',
  });
});

// GET /api/models/:id - Get Model Provenance Detail
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  const modelIdParam = String(req.params.id).toLowerCase();
  const model = store.modelRegistry.find(
    (m) => m.modelId.toLowerCase() === modelIdParam || m.id.toLowerCase() === modelIdParam
  );
  if (!model) {
    return res.status(404).json({ error: `Model '${req.params.id}' not found in registry.` });
  }
  res.json({ model });
});

// GET /api/models/:id/runtime - Query Physical Model File & Inference Verification
router.get('/:id/runtime', authenticate, async (req: AuthRequest, res: Response) => {
  const modelIdParam = String(req.params.id).toLowerCase();
  const model = store.modelRegistry.find(
    (m) => m.modelId.toLowerCase() === modelIdParam || m.id.toLowerCase() === modelIdParam
  );
  if (!model) {
    return res.status(404).json({ error: `Model '${req.params.id}' not found in registry.` });
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  try {
    const aiRes = await fetch(`${aiServiceUrl}/models/${model.modelId}/runtime_status`);
    if (aiRes.ok) {
      const data = await aiRes.json();
      return res.json(data);
    }
  } catch (err: any) {
    // Return explicit unconfigured response if AI service is offline
  }

  res.json({
    model_id: model.modelId,
    is_registered: true,
    model_file_present: false,
    checksum_matched: false,
    model_loadable: false,
    model_loaded: false,
    inference_working: false,
    classes_available: false,
    runtime_state: 'NOT CONFIGURED / NOT LOADED',
    detail: 'Physical model weights file missing on disk in ai/models/. Cannot deploy until verified weights are placed.',
  });
});

// POST /api/models/:id/deploy - Explicit Model Deployment with Physical Verification (Admin Only)
router.post('/:id/deploy', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const modelIdParam = String(req.params.id).toLowerCase();
  const model = store.modelRegistry.find(
    (m) => m.modelId.toLowerCase() === modelIdParam || m.id.toLowerCase() === modelIdParam
  );
  if (!model) {
    return res.status(404).json({ error: `Model '${req.params.id}' not found in registry.` });
  }

  // Runtime Verification: Do NOT mark DEPLOYED merely because a MongoDB registry record exists
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  let isDeployable = false;
  let verificationDetail = 'Model weights file missing on disk.';

  try {
    const aiRes = await fetch(`${aiServiceUrl}/models/${model.modelId}/runtime_status`);
    if (aiRes.ok) {
      const checkData: any = await aiRes.json();
      if (checkData.runtime_state === 'READY_FOR_DEPLOYMENT') {
        isDeployable = true;
      } else {
        verificationDetail = checkData.detail || `Runtime state is '${checkData.runtime_state}'`;
      }
    }
  } catch (e: any) {
    verificationDetail = `AI microservice connection error: ${e.message}`;
  }

  if (!isDeployable) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'MODEL_DEPLOYMENT_REJECTED',
      resourceType: 'AI_MODEL',
      resourceId: model.modelId,
      result: 'FAILED',
      metadata: {
        reason: 'Missing physical weights file or checksum mismatch',
        detail: verificationDetail,
      },
    });

    return res.status(422).json({
      error: `Model '${model.modelName}' cannot be deployed: ${verificationDetail}. Status must remain NOT CONFIGURED / NOT LOADED until verified model weights are placed in ai/models/.`,
      runtimeVerification: {
        is_registered: true,
        model_file_present: false,
        runtime_state: 'NOT CONFIGURED / NOT LOADED',
        detail: verificationDetail,
      },
    });
  }

  // Deactivate other models
  store.modelRegistry.forEach((m) => {
    if (m.deploymentStatus === 'DEPLOYED') {
      m.deploymentStatus = 'VALIDATED';
      m.updatedAt = new Date().toISOString();
    }
  });

  model.deploymentStatus = 'DEPLOYED';
  model.activatedAt = new Date().toISOString();
  model.activatedBy = user.name || user.email;
  model.version = (model.version || 1) + 1;
  model.updatedAt = model.activatedAt;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'MODEL_DEPLOYED',
    resourceType: 'AI_MODEL',
    resourceId: model.modelId,
    result: 'SUCCESS',
    metadata: {
      modelName: model.modelName,
      modelVersion: model.modelVersion,
      checksum: model.weightsChecksum,
    },
  });

  socketService.emitRealtimeEvent('model.deployed', {
    modelId: model.modelId,
    version: model.version,
    timestamp: model.updatedAt,
  });

  res.json({ success: true, message: `Model '${model.modelName}' activated as production model.`, model });
});

// POST /api/models/:id/rollback - Rollback Model Deployment (Admin Only)
router.post('/:id/rollback', authenticate, requireRole('ADMIN'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetIdParam = String(req.params.id).toLowerCase();
  const targetModel = store.modelRegistry.find(
    (m) => m.modelId.toLowerCase() === targetIdParam || m.id.toLowerCase() === targetIdParam
  );
  if (!targetModel) {
    return res.status(404).json({ error: `Target model '${req.params.id}' not found in registry.` });
  }

  store.modelRegistry.forEach((m) => {
    m.deploymentStatus = m.modelId === targetModel.modelId ? 'DEPLOYED' : 'VALIDATED';
    m.updatedAt = new Date().toISOString();
  });

  targetModel.activatedAt = new Date().toISOString();
  targetModel.activatedBy = `${user.name || user.email} (ROLLBACK)`;
  targetModel.version = (targetModel.version || 1) + 1;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'MODEL_ROLLBACK',
    resourceType: 'AI_MODEL',
    resourceId: targetModel.modelId,
    result: 'SUCCESS',
    metadata: { rolledBackTo: targetModel.modelId },
  });

  socketService.emitRealtimeEvent('model.rollback', {
    modelId: targetModel.modelId,
    version: targetModel.version,
    timestamp: targetModel.updatedAt,
  });

  res.json({ success: true, message: `Rollback completed to model '${targetModel.modelId}'.`, model: targetModel });
});

export default router;
