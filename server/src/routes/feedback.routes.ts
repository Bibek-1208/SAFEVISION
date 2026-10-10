import { Router, Response } from 'express';
import { z } from 'zod';
import { DataStore, FalsePositiveFeedbackDoc } from '../models/DataStore';
import { SocketService } from '../services/socket/SocketService';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

const FalsePositiveSchema = z.object({
  incidentId: z.string(),
  reason: z.enum(['Lighting', 'Occlusion', 'Incorrect detection', 'Worker outside zone', 'Other']),
  notes: z.string().optional().default(''),
});

// POST /api/feedback/false-positive (Requires incident:false_positive - Safety Officer, Plant Manager, Admin)
router.post('/false-positive', authenticate, requirePermission(PERMISSIONS.INCIDENT_FALSE_POSITIVE), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const result = FalsePositiveSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Valid false positive reason required', details: result.error.errors });
  }

  const { incidentId, reason, notes } = result.data;

  // 1. Store feedback record for active learning loop
  const feedbackDoc: FalsePositiveFeedbackDoc = {
    id: `fb-${Date.now()}`,
    incidentId,
    reason,
    notes,
    submittedBy: `${user.name} (${user.role})`,
    timestamp: new Date().toISOString(),
  };
  store.feedbacks.push(feedbackDoc);

  // 2. Mark incident as FALSE_POSITIVE in incident queue
  const inc = store.incidents.find((i) => i.id === incidentId || i.incidentId === incidentId);
  if (inc) {
    inc.status = 'FALSE_POSITIVE';
    inc.falsePositiveReason = reason;
    inc.notes = notes;
    socketService.emitIncidentUpdated(inc);
  }

  // 3. Log to Immutable Audit Log
  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'FALSE_POSITIVE_MARKED',
    resourceType: 'INCIDENT',
    resourceId: incidentId,
    result: 'SUCCESS',
    metadata: { reason, notes },
  });

  return res.json({
    success: true,
    message: 'False positive feedback recorded for AI re-training.',
    feedback: feedbackDoc,
  });
});

// GET /api/feedback (Requires incident:view)
router.get('/', authenticate, requirePermission(PERMISSIONS.INCIDENT_VIEW), (req: AuthRequest, res: Response) => {
  res.json({ feedbacks: store.feedbacks });
});

export default router;
