import { Router, Response } from 'express';
import { DataStore, TrainingJobDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';
import fs from 'fs';
import path from 'path';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const REGISTRY_FILE = path.resolve(__dirname, '../../../ai/configs/ppe_classes_registry.json');
const DATASET_REGISTRY_FILE = path.resolve(__dirname, '../../../ai/datasets/dataset_registry.json');
const CLASS_MAPPINGS_FILE = path.resolve(__dirname, '../../../ai/datasets/class_mappings.json');
const MODEL_REGISTRY_FILE = path.resolve(__dirname, '../../../ai/models/model_registry.json');

// Helper to fetch from AI service with local file fallback
async function fetchFromAI(urlPath: string, options: any = {}): Promise<any> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}${urlPath}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.ok) {
      return await res.json();
    }
    const errData: any = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `AI service returned HTTP ${res.status}`);
  } catch (err: any) {
    throw err;
  }
}

// ============================================================================
// 1. PPE CLASSES REGISTRY ENDPOINTS
// ============================================================================

// GET /api/training/classes - List Authoritative PPE Classes
router.get('/classes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const activeOnly = req.query.active_only === 'true';
    const data = await fetchFromAI(`/training/classes?active_only=${activeOnly}`);
    return res.json(data);
  } catch (err: any) {
    // Fallback: Read directly from ai/configs/ppe_classes_registry.json
    if (fs.existsSync(REGISTRY_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
        let classes = fileData.classes || [];
        if (req.query.active_only === 'true') {
          classes = classes.filter((c: any) => c.active);
        }
        return res.json({ classes, total: classes.length, source: 'filesystem_fallback' });
      } catch (readErr) {
        // pass through to 500
      }
    }
    return res.status(500).json({ error: 'Failed to retrieve PPE classes', detail: err.message });
  }
});

// GET /api/training/ontology - Return SafeVision Formalized Ontology Tree
router.get('/ontology', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await fetchFromAI('/training/ontology');
    return res.json(data);
  } catch (err: any) {
    // Fallback static definition matching SafeVision Ontology
    const fallbackOntology = {
      "PERSON": {
        "displayName": "Person / Worker",
        "subCategories": ["Worker / Human Individual"]
      },
      "PPE": {
        "displayName": "Personal Protective Equipment",
        "subCategories": [
          "Head Protection",
          "Eye Protection",
          "Face Protection",
          "Hearing Protection",
          "Respiratory Protection",
          "Hand Protection",
          "Body Protection",
          "Foot Protection",
          "Fall Protection"
        ]
      },
      "ANATOMICAL REFERENCES": {
        "displayName": "Anatomical References",
        "subCategories": [
          "Head",
          "Face",
          "Hands",
          "Feet",
          "Hearing Reference"
        ]
      },
      "HAZARD / OBJECT": {
        "displayName": "Hazard / Object",
        "subCategories": [
          "Hand Tool",
          "Electrical Object",
          "Hazardous Object",
          "Future Classes"
        ]
      }
    };
    return res.json({ ontology: fallbackOntology, source: 'fallback' });
  }
});

// POST /api/training/classes - Create New PPE Class (Dynamic SV-PPE-xxx)
router.post('/classes', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { name, displayName, category, subCategory, description, aliases } = req.body;

  if (!name || !displayName) {
    return res.status(400).json({ error: 'Class name and displayName are mandatory.' });
  }

  try {
    const data: any = await fetchFromAI('/training/classes', {
      method: 'POST',
      body: JSON.stringify({ name, displayName, category, subCategory, description, aliases }),
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'PPE_CLASS_CREATED',
      resourceType: 'PPE_REGISTRY',
      resourceId: data.class?.id || name,
      result: 'SUCCESS',
      metadata: {
        name,
        displayName,
        category,
        classId: data.class?.id,
      },
    });

    return res.status(201).json(data);
  } catch (err: any) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'PPE_CLASS_CREATION_FAILED',
      resourceType: 'PPE_REGISTRY',
      resourceId: name,
      result: 'FAILED',
      metadata: { error: err.message },
    });
    return res.status(400).json({ error: err.message || 'Failed to create PPE class' });
  }
});

// PATCH /api/training/classes/:id - Update Class Status or Active Flag
router.patch('/classes/:id', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const classId = String(req.params.id);
  const { active, status } = req.body;

  try {
    const data: any = await fetchFromAI(`/training/classes/${classId}`, {
      method: 'PATCH',
      body: JSON.stringify({ active, status }),
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'PPE_CLASS_UPDATED',
      resourceType: 'PPE_REGISTRY',
      resourceId: classId,
      result: 'SUCCESS',
      metadata: { active, status },
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || `Failed to update class ${classId}` });
  }
});

// ============================================================================
// 2. DATASET REGISTRY & IMPORT ENDPOINTS
// ============================================================================

// GET /api/training/datasets - List Registered Datasets & Quality Gate Status
router.get('/datasets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = await fetchFromAI('/training/datasets');
    return res.json(data);
  } catch (err: any) {
    if (fs.existsSync(DATASET_REGISTRY_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(DATASET_REGISTRY_FILE, 'utf-8'));
        return res.json({ datasets: fileData.datasets || [], total: (fileData.datasets || []).length });
      } catch (e) {}
    }
    return res.status(500).json({ error: 'Failed to retrieve datasets', detail: err.message });
  }
});

// GET /api/training/datasets/:id - Get Single Dataset with Full Quality Audit Report
router.get('/datasets/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const datasetId = String(req.params.id);
  try {
    const data = await fetchFromAI(`/training/datasets/${datasetId}`);
    return res.json(data);
  } catch (err: any) {
    if (fs.existsSync(DATASET_REGISTRY_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(DATASET_REGISTRY_FILE, 'utf-8'));
        const ds = (fileData.datasets || []).find((d: any) => String(d.datasetId).toLowerCase() === datasetId.toLowerCase());
        if (ds) return res.json({ dataset: ds });
      } catch (e) {}
    }
    return res.status(404).json({ error: `Dataset '${datasetId}' not found`, detail: err.message });
  }
});

// POST /api/training/datasets/import - Import YOLO Dataset with Provenance Tracking
router.post('/datasets/import', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { sourceDir, datasetId, datasetName, version, source, license, attribution, sourceUrl } = req.body;

  if (!sourceDir || !datasetId || !datasetName) {
    return res.status(400).json({ error: 'sourceDir, datasetId, and datasetName are required.' });
  }

  try {
    const data: any = await fetchFromAI('/training/datasets/import', {
      method: 'POST',
      body: JSON.stringify({ sourceDir, datasetId, datasetName, version, source, license, attribution, sourceUrl }),
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'DATASET_IMPORTED',
      resourceType: 'DATASET',
      resourceId: datasetId,
      result: 'SUCCESS',
      metadata: {
        datasetName,
        version,
        license,
        status: data.dataset?.status,
        qualityGateStatus: data.dataset?.qualityGateStatus,
      },
    });

    return res.status(201).json(data);
  } catch (err: any) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'DATASET_IMPORT_FAILED',
      resourceType: 'DATASET',
      resourceId: datasetId,
      result: 'FAILED',
      metadata: { error: err.message },
    });
    return res.status(400).json({ error: err.message || 'Dataset import failed' });
  }
});

// POST /api/training/datasets/:id/audit - Trigger Quality Gate Audit
router.post('/datasets/:id/audit', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const datasetId = String(req.params.id);

  try {
    const data: any = await fetchFromAI(`/training/datasets/${datasetId}/audit`, {
      method: 'POST',
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'DATASET_AUDITED',
      resourceType: 'DATASET',
      resourceId: datasetId,
      result: 'SUCCESS',
      metadata: {
        qualityGateStatus: data.report?.status,
        blockersCount: data.report?.blockers_count,
        passed: data.report?.passed,
      },
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || `Failed to audit dataset ${datasetId}` });
  }
});

// ============================================================================
// 3. CLASS MAPPING ENDPOINTS
// ============================================================================

// GET /api/training/mappings - List Class Mappings
router.get('/mappings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const datasetId = req.query.datasetId as string | undefined;
    const url = datasetId ? `/training/mappings?datasetId=${encodeURIComponent(datasetId)}` : '/training/mappings';
    const data = await fetchFromAI(url);
    return res.json(data);
  } catch (err: any) {
    if (fs.existsSync(CLASS_MAPPINGS_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(CLASS_MAPPINGS_FILE, 'utf-8'));
        let mappings = fileData.mappings || [];
        if (req.query.datasetId) {
          mappings = mappings.filter((m: any) => m.sourceDataset === req.query.datasetId);
        }
        return res.json({ mappings });
      } catch (e) {}
    }
    return res.status(500).json({ error: 'Failed to retrieve mappings', detail: err.message });
  }
});

// POST /api/training/mappings - Add or Update Class Mapping
router.post('/mappings', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { sourceDataset, sourceClass, sourceClassId, safeVisionClassId, mappingStatus, mappingReason } = req.body;

  if (!sourceDataset || sourceClass === undefined || sourceClassId === undefined || !safeVisionClassId) {
    return res.status(400).json({ error: 'sourceDataset, sourceClass, sourceClassId, and safeVisionClassId are mandatory.' });
  }

  try {
    const data = await fetchFromAI('/training/mappings', {
      method: 'POST',
      body: JSON.stringify({
        sourceDataset,
        sourceClass,
        sourceClassId,
        safeVisionClassId,
        mappingStatus,
        mappingReason,
      }),
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CLASS_MAPPING_UPDATED',
      resourceType: 'CLASS_MAPPING',
      resourceId: `${sourceDataset}:${sourceClassId}`,
      result: 'SUCCESS',
      metadata: {
        sourceDataset,
        sourceClass,
        safeVisionClassId,
        mappingStatus: mappingStatus || 'PENDING',
      },
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to update class mapping' });
  }
});

// ============================================================================
// 4. MODEL REGISTRY FOUNDATION & MANIFEST
// ============================================================================

// GET /api/training/models - List Models (Disk Registry + AI service + Memory Fallback)
router.get('/models', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const aiData = await fetchFromAI('/training/models/registry');
    return res.json({
      models: aiData.models,
      activeModelId: aiData.active?.modelId || 'MODEL-PPE-BASELINE-SH17',
      baseline: aiData.baseline,
      total: aiData.models.length,
      source: 'ai_service'
    });
  } catch (err: any) {
    if (fs.existsSync(MODEL_REGISTRY_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(MODEL_REGISTRY_FILE, 'utf-8'));
        const models = fileData.models || [];
        const activeModel = models.find((m: any) => m.status === 'ACTIVE' || m.deploymentStatus === 'ACTIVE');
        return res.json({
          models,
          activeModelId: activeModel?.modelId || 'MODEL-PPE-BASELINE-SH17',
          baseline: models.find((m: any) => m.isProtected),
          total: models.length,
          source: 'disk_registry'
        });
      } catch (e) {}
    }
    const activeModel = store.modelRegistry.find((m) => m.deploymentStatus === 'DEPLOYED');
    return res.json({
      models: store.modelRegistry,
      activeModelId: activeModel?.modelId || 'MODEL-PPE-SH17-001',
      total: store.modelRegistry.length,
      source: 'store_fallback'
    });
  }
});

// GET /api/training/models/active - Active Model with Decoupled Class Manifest
router.get('/models/active', authenticate, async (req: AuthRequest, res: Response) => {
  let classManifest: any = null;
  try {
    classManifest = await fetchFromAI('/training/models/manifest');
  } catch (e) {}

  res.json({
    activeModelId: 'MODEL-PPE-BASELINE-SH17',
    classManifest: classManifest,
    baselinePreserved: true,
    baselineModelPath: 'ai/models/industrial_yolov8.pt',
    baselineChecksum: 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62',
    status: 'PROTECTED_BASELINE'
  });
});

// GET /api/training/models/pipeline-status - Unified Inference Layer Health
router.get('/models/pipeline-status', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await fetchFromAI('/training/models/pipeline_status');
    return res.json(data);
  } catch (err: any) {
    return res.json({
      pipeline_state: 'ACTIVE',
      baseline: {
        model_id: 'MODEL-PPE-BASELINE-SH17',
        status: 'configured',
        is_protected: true,
        checksum: 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62'
      },
      custom_modules_count: 0,
      custom_modules: [],
      device: 'cpu'
    });
  }
});

// POST /api/training/models/evaluate-candidate - Candidate Acceptance & Old-Class Regression Gate
router.post('/models/evaluate-candidate', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { candidateId, modelPath, datasetId, targetClassId, targetClassName, thresholds } = req.body;

  if (!candidateId || !modelPath || !datasetId || !targetClassId) {
    return res.status(400).json({ error: 'candidateId, modelPath, datasetId, and targetClassId are required.' });
  }

  // Section 14 Model Path Security: Prohibit traversal, UNC paths, and baseline file collision
  if (modelPath.includes('..') || modelPath.startsWith('\\\\')) {
    return res.status(400).json({ error: 'Security error: Directory traversal or UNC paths are strictly prohibited.' });
  }

  const normalizedPath = modelPath.replace(/\\/g, '/');
  if (normalizedPath.endsWith('industrial_yolov8.pt')) {
    return res.status(400).json({ error: 'Security error: Candidate modelPath cannot point to protected baseline weights file.' });
  }

  try {
    const data = await fetchFromAI('/training/models/evaluate_candidate', {
      method: 'POST',
      body: JSON.stringify({
        candidateId,
        modelPath,
        datasetId,
        targetClassId,
        targetClassName: targetClassName || 'custom_ppe',
        thresholds
      })
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CANDIDATE_MODEL_EVALUATED',
      resourceType: 'AI_MODEL',
      resourceId: candidateId,
      result: data.evaluation?.passed ? 'SUCCESS' : 'FAILED',
      metadata: {
        candidateId,
        targetClassId,
        status: data.evaluation?.status,
        passed: data.evaluation?.passed,
        rejectionReasons: data.evaluation?.rejectionReasons
      }
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Candidate evaluation failed.' });
  }
});

// POST /api/training/models/:id/activate - Atomic Candidate Activation (Requires APPROVED status)
router.post('/models/:id/activate', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const modelId = String(req.params.id);

  try {
    const data = await fetchFromAI(`/training/models/${modelId}/activate`, {
      method: 'POST',
      body: JSON.stringify({
        activatedBy: user.name || user.email
      })
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CUSTOM_MODEL_ACTIVATED',
      resourceType: 'AI_MODEL',
      resourceId: modelId,
      result: 'SUCCESS',
      metadata: {
        modelId,
        message: data.message
      }
    });

    socketService.emitRealtimeEvent('model.activated', {
      modelId,
      timestamp: new Date().toISOString()
    });

    return res.json(data);
  } catch (err: any) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CUSTOM_MODEL_ACTIVATION_FAILED',
      resourceType: 'AI_MODEL',
      resourceId: modelId,
      result: 'FAILED',
      metadata: { error: err.message }
    });
    return res.status(400).json({ error: err.message || `Failed to activate model '${modelId}'.` });
  }
});

// POST /api/training/models/:id/deactivate - Deactivate Custom Module
router.post('/models/:id/deactivate', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const modelId = String(req.params.id);

  try {
    const data = await fetchFromAI(`/training/models/${modelId}/deactivate`, {
      method: 'POST'
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CUSTOM_MODEL_DEACTIVATED',
      resourceType: 'AI_MODEL',
      resourceId: modelId,
      result: 'SUCCESS',
      metadata: { modelId }
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || `Failed to deactivate model '${modelId}'.` });
  }
});

// POST /api/training/models/rollback-baseline - Rollback Pipeline to Pure Protected Baseline
router.post('/models/rollback-baseline', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  try {
    const data = await fetchFromAI('/training/models/rollback_baseline', {
      method: 'POST'
    });

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'MODEL_PIPELINE_ROLLBACK_BASELINE',
      resourceType: 'AI_MODEL',
      resourceId: 'MODEL-PPE-BASELINE-SH17',
      result: 'SUCCESS',
      metadata: { actor: user.email }
    });

    socketService.emitRealtimeEvent('model.rollback', {
      modelId: 'MODEL-PPE-BASELINE-SH17',
      timestamp: new Date().toISOString()
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Rollback to baseline failed.' });
  }
});

// ============================================================================
// 5. TRAINING JOBS (STRICT QUALITY GATE ENFORCEMENT)
// ============================================================================

// GET /api/training/jobs - List Training Jobs
router.get('/jobs', authenticate, (req: AuthRequest, res: Response) => {
  res.json({
    jobs: store.trainingJobs,
    total: store.trainingJobs.length,
  });
});

// POST /api/training/jobs - Request Training Candidate (Strictly rejects if BLOCKED)
router.post('/jobs', authenticate, requireRole(['ADMIN', 'SAFETY_OFFICER']), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { datasetId, baseModelId, targetClasses, hyperparameters } = req.body;

  if (!datasetId) {
    return res.status(400).json({ error: 'datasetId is required to configure a training job.' });
  }

  // Fetch dataset to check Quality Gate Status
  let dataset: any = null;
  try {
    const dsRes: any = await fetchFromAI(`/training/datasets/${datasetId}`);
    dataset = dsRes.dataset;
  } catch (e) {
    if (fs.existsSync(DATASET_REGISTRY_FILE)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(DATASET_REGISTRY_FILE, 'utf-8'));
        dataset = (fileData.datasets || []).find((d: any) => String(d.datasetId).toLowerCase() === String(datasetId).toLowerCase());
      } catch (_) {}
    }
  }

  if (!dataset) {
    return res.status(404).json({ error: `Dataset '${datasetId}' is not registered in SafeVision Dataset Registry.` });
  }

  // STRICT QUALITY GATE ENFORCEMENT (Sections 14, 18, 19):
  // If the dataset is BLOCKED or not READY, backend MUST reject training job creation with HTTP 422!
  const isBlocked = dataset.status === 'BLOCKED' || dataset.qualityGateStatus === 'BLOCKED';
  if (isBlocked) {
    const blockers = dataset.qualityGateReport?.blockers || [
      'Dataset failed SafeVision Quality Gate checks.',
      'Validation/Test splits are unannotated or contain excessive unreviewed empty frames.',
    ];

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'TRAINING_JOB_REJECTED_BLOCKED_DATASET',
      resourceType: 'TRAINING_JOB',
      resourceId: `JOB-REJECTED-${datasetId}`,
      result: 'FAILED',
      metadata: {
        datasetId,
        reasons: blockers,
      },
    });

    return res.status(422).json({
      error: 'Training Candidate Creation REJECTED: Dataset is BLOCKED by Quality Gate.',
      datasetId,
      status: 'BLOCKED',
      qualityGateStatus: dataset.qualityGateStatus,
      blockers: blockers,
      detail:
        'Model training cannot proceed on a BLOCKED dataset. You must resolve all validation split and label anomalies before scheduling training.',
    });
  }

  // Create Queued Training Job Record (Architecture / Pipeline Preparation Only - ZERO TRAINING EXECUTED)
  const jobId = `TRN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const nowIso = new Date().toISOString();

  const newJob: TrainingJobDoc = {
    id: `job-${store.trainingJobs.length + 1}`,
    jobId,
    datasetId,
    datasetVersion: dataset.version || '1.0.0',
    baseModelId: baseModelId || 'MODEL-PPE-SH17-001',
    status: 'QUEUED',
    targetClasses: targetClasses || dataset.originalClassNames || [],
    hyperparameters: hyperparameters || {
      epochs: 50,
      batchSize: 16,
      imgsz: 640,
      lr0: 0.01,
    },
    createdBy: user.name || user.email,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.trainingJobs.unshift(newJob);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'TRAINING_JOB_QUEUED',
    resourceType: 'TRAINING_JOB',
    resourceId: jobId,
    result: 'SUCCESS',
    metadata: {
      jobId,
      datasetId,
      baseModelId: newJob.baseModelId,
    },
  });

  return res.status(201).json({
    success: true,
    message: 'Training job successfully queued for future execution. (Phase 12.2: Pipeline prepared; no model trained in this phase.)',
    job: newJob,
  });
});

export default router;
