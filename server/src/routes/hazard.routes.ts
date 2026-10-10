import { Router, Response } from 'express';
import { DataStore, HazardDoc } from '../models/DataStore';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

// POST /api/hazards - Report Unsafe Conditions (Employees, Supervisors, Officers)
router.post('/', authenticate, requirePermission(PERMISSIONS.HAZARD_REPORT), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { zoneId, zoneName, hazardType, description, severity = 'medium' } = req.body;

  if (!zoneName || !description) {
    return res.status(400).json({ error: 'Zone and hazard description are required.' });
  }

  const newHazard: HazardDoc = {
    id: `hz-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    reporterId: user.id,
    reporterName: user.name,
    zoneId: zoneId || 'ZONE-A',
    zoneName,
    hazardType: hazardType || 'UNSAFE_CONDITION',
    description,
    severity: severity as any,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };

  store.hazards.unshift(newHazard);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'HAZARD_REPORTED',
    resourceType: 'HAZARD',
    resourceId: newHazard.id,
    zoneId: newHazard.zoneName,
    result: 'SUCCESS',
    metadata: { type: newHazard.hazardType, severity: newHazard.severity },
  });

  // Notify Safety Officers and Area Supervisors
  store.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: `HAZARD REPORTED: ${newHazard.hazardType}`,
    message: `${newHazard.description} in ${newHazard.zoneName} (Reported by ${user.name})`,
    severity: newHazard.severity === 'critical' ? 'critical' : 'warning',
    read: false,
    timestamp: newHazard.createdAt,
    targetRoles: ['safety_officer', 'plant_manager'],
  });

  return res.status(201).json({ success: true, hazard: newHazard });
});

// GET /api/hazards - Scoped Hazard List
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  let hazards = [...store.hazards];

  if (user.role === 'EMPLOYEE') {
    // Employee only sees their own reports
    hazards = hazards.filter((h) => h.reporterId === user.id);
  } else if (user.role === 'SUPERVISOR' && !user.zoneIds.includes('*')) {
    hazards = hazards.filter((h) =>
      user.zoneIds.some((zid) => zid.toLowerCase() === h.zoneId.toLowerCase() || zid.toLowerCase() === h.zoneName.toLowerCase())
    );
  }

  res.json({ hazards, total: hazards.length });
});

export default router;
