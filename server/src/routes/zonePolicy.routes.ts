import { Router, Response } from 'express';
import { DataStore, ZoneSafetyPolicyDoc } from '../models/DataStore';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';
import { ZoneSafetyPolicyService, RiskAssessmentService, EscalationService } from '../services/safetyIntelligence';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const zonePolicyService = ZoneSafetyPolicyService.getInstance();
const riskAssessmentService = RiskAssessmentService.getInstance();
const escalationService = EscalationService.getInstance();
const socketService = SocketService.getInstance();

// GET /api/zone-policies - List all configured zone safety policies
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const policies = await zonePolicyService.listPolicies();

  // If user is restricted to specific zones, filter accordingly
  if (user.role !== 'ADMIN' && !user.zoneIds.includes('*')) {
    const scoped = policies.filter((p) =>
      user.zoneIds.some(
        (zid) =>
          zid.toLowerCase() === p.zoneId.toLowerCase() ||
          zid.toLowerCase() === p.zoneName.toLowerCase()
      )
    );
    return res.json({ policies: scoped, total: scoped.length });
  }

  return res.json({ policies, total: policies.length });
});

// GET /api/zone-policies/config/risk - Get active risk scoring configuration
router.get('/config/risk', authenticate, async (req: AuthRequest, res: Response) => {
  const config = await riskAssessmentService.getRiskConfiguration();
  return res.json({ config });
});

// PUT /api/zone-policies/config/risk - Update risk scoring configuration & weights
router.put('/config/risk', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'ADMIN' && user.role !== 'SAFETY_OFFICER') {
    return res.status(403).json({
      error: 'Permission denied: Only Admins and Safety Officers can modify risk weights.',
      code: 'ROLE_FORBIDDEN',
    });
  }

  try {
    const updated = await riskAssessmentService.updateRiskConfiguration(
      req.body,
      `${user.name} (${user.role})`
    );

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'RISK_CONFIG_UPDATED',
      resourceType: 'RISK_CONFIG',
      resourceId: updated.configId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: { version: updated.version },
    });

    socketService.emitRealtimeEvent('risk_config.updated', {
      config: updated,
      version: updated.version,
      updatedBy: user.name,
      timestamp: updated.updatedAt,
    });

    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update risk config.' });
  }
});

// GET /api/zone-policies/config/escalation - Get escalation policies
router.get('/config/escalation', authenticate, async (_req: AuthRequest, res: Response) => {
  return res.json({ policies: store.escalationPolicies });
});

// GET /api/zone-policies/:zoneId - Get safety policy for a single zone
router.get('/:zoneId', authenticate, async (req: AuthRequest, res: Response) => {
  const zoneId = String(req.params.zoneId);
  const policy = await zonePolicyService.getPolicyForZone(zoneId);
  return res.json({ policy });
});

// PUT /api/zone-policies/:zoneId - Update or upsert safety policy for a zone (Optimistic Concurrency Enforced)
router.put('/:zoneId', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const zoneId = String(req.params.zoneId);

  // Authorization check
  if (user.role !== 'ADMIN' && user.role !== 'SAFETY_OFFICER' && user.role !== 'PLANT_MANAGER') {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'SECURITY_ACCESS_DENIED',
      resourceType: 'ZONE_POLICY_UPDATE',
      resourceId: zoneId,
      ipAddress: req.ip,
      result: 'DENIED',
      metadata: { reason: 'Unauthorized role attempted to modify zone safety policy' },
    });
    return res.status(403).json({
      error: 'Permission denied: Only Admins, Plant Managers, and Safety Officers can edit zone policies.',
      code: 'ROLE_FORBIDDEN',
    });
  }

  // Zone scope check if not admin
  if (user.role !== 'ADMIN' && !user.zoneIds.includes('*')) {
    const isAllowed = user.zoneIds.some((zid) => zid.toLowerCase() === zoneId.toLowerCase());
    if (!isAllowed) {
      return res.status(403).json({
        error: `Scope denied: You are not authorized to configure zone '${zoneId}'.`,
        code: 'ZONE_SCOPE_FORBIDDEN',
      });
    }
  }

  const { requiredPPE, restrictedAreas, hazardTypes, severityRules, riskWeights, enabled, version, zoneName } = req.body;

  try {
    const updated = await zonePolicyService.upsertPolicy(
      {
        zoneId,
        zoneName: zoneName || zoneId,
        requiredPPE,
        restrictedAreas,
        hazardTypes,
        severityRules,
        riskWeights,
        enabled,
        version: version !== undefined ? Number(version) : undefined,
      },
      `${user.name} (${user.role})`
    );

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ZONE_POLICY_UPDATED',
      resourceType: 'ZONE_POLICY',
      resourceId: updated.policyId,
      zoneId: updated.zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: {
        version: updated.version,
        requiredPPE: updated.requiredPPE,
      },
    });

    return res.json({ success: true, policy: updated });
  } catch (err: any) {
    if (err.message && err.message.includes('concurrency conflict')) {
      return res.status(409).json({
        error: err.message,
        code: 'CONCURRENCY_CONFLICT',
      });
    }
    return res.status(500).json({ error: err.message || 'Failed to update zone policy.' });
  }
});

export default router;
