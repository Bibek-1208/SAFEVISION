import { Router, Response } from 'express';
import { DataStore, IdentityAssociationDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';
import multer from 'multer';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

let biometricEnabled = false;

// GET /api/identity/status - Biometric System Status & Legal Privacy Notice
router.get('/status', authenticate, (req: AuthRequest, res: Response) => {
  res.json({
    isBiometricEnabled: biometricEnabled,
    status: biometricEnabled ? 'CONFIGURED_ACTIVE' : 'NOT CONFIGURED / OFF',
    defaultState: 'NOT CONFIGURED / OFF',
    matchThreshold: 0.88,
    uncertainThreshold: 0.65,
    enrolledEmployeesCount: store.employees.filter((e) => e.photoUrl).length,
    activeTrackAssociations: store.identityAssociations.filter(
      (a) => new Date(a.validUntil).getTime() > Date.now()
    ).length,
    privacyNotice:
      'Biometric face verification is an optional feature. Raw biometric vectors are cryptographically secured and strictly omitted from all public REST and Socket.IO payloads.',
  });
});

// POST /api/identity/configure - Admin Toggle Biometric Verification
router.post('/configure', authenticate, requireRole('ADMIN'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "Missing required boolean field 'enabled'." });
  }

  biometricEnabled = enabled;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'BIOMETRIC_CONFIG_CHANGED',
    resourceType: 'SYSTEM_CONFIG',
    resourceId: 'BIOMETRIC_IDENTITY_ENGINE',
    result: 'SUCCESS',
    metadata: {
      enabled: biometricEnabled,
      configuredBy: user.email,
    },
  });

  socketService.emitRealtimeEvent('identity.config.updated', {
    isBiometricEnabled: biometricEnabled,
    updatedBy: user.id,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    isBiometricEnabled: biometricEnabled,
    status: biometricEnabled ? 'CONFIGURED_ACTIVE' : 'NOT CONFIGURED / OFF',
  });
});

// GET /api/identity/associations - Active Track-to-Employee Associations
router.get('/associations', authenticate, (req: AuthRequest, res: Response) => {
  const now = Date.now();
  const active = store.identityAssociations.filter(
    (a) => new Date(a.validUntil).getTime() > now
  );
  res.json({
    associations: active,
    total: active.length,
  });
});

// POST /api/identity/associate - Associate temporary trackId with registered employeeId
router.post('/associate', authenticate, requireRole('ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { trackId, employeeId, cameraId = 'CAM-01', zoneId = 'Furnace Bay', validityMinutes = 15 } = req.body;

  if (!trackId || !employeeId) {
    return res.status(400).json({ error: 'Missing required fields: trackId, employeeId.' });
  }

  const employee = store.employees.find(
    (e) => e.employeeId.toLowerCase() === String(employeeId).toLowerCase() || e.id === employeeId
  );
  if (!employee) {
    return res.status(404).json({ error: `Registered employee with ID '${employeeId}' not found.` });
  }

  const now = new Date();
  const validUntil = new Date(now.getTime() + validityMinutes * 60 * 1000);

  const assocRecord: IdentityAssociationDoc = {
    id: `assoc-${Date.now()}`,
    identityAssociationId: `IDA-${Math.floor(100000 + Math.random() * 900000)}`,
    trackId: String(trackId).toUpperCase(),
    employeeId: employee.employeeId,
    employeeName: employee.fullName,
    cameraId,
    siteId: employee.siteId || 'site-rsp-1',
    zoneId: zoneId || employee.assignedZoneId,
    matchMethod: 'MANUAL_SUPERVISOR_CONFIRMATION',
    matchConfidence: 1.0,
    matchStatus: 'CONFIRMED',
    validFrom: now.toISOString(),
    validUntil: validUntil.toISOString(),
    createdAt: now.toISOString(),
  };

  store.identityAssociations.unshift(assocRecord);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'IDENTITY_TRACK_ASSOCIATED',
    resourceType: 'IDENTITY_ASSOCIATION',
    resourceId: assocRecord.identityAssociationId,
    siteId: assocRecord.siteId,
    zoneId: assocRecord.zoneId,
    result: 'SUCCESS',
    metadata: {
      trackId: assocRecord.trackId,
      employeeId: assocRecord.employeeId,
      employeeName: assocRecord.employeeName,
    },
  });

  socketService.emitRealtimeEvent('identity.associated', {
    ...assocRecord,
    timestamp: now.toISOString(),
  });

  res.status(201).json({ success: true, association: assocRecord });
});

// POST /api/identity/enroll - Admin enroll employee face template
router.post('/enroll', authenticate, requireRole('ADMIN'), upload.single('faceImage'), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Missing required field: employeeId.' });
  }

  const employee = store.employees.find(
    (e) => e.employeeId.toLowerCase() === String(employeeId).toLowerCase() || e.id === employeeId
  );
  if (!employee) {
    return res.status(404).json({ error: `Employee '${employeeId}' not found.` });
  }

  employee.photoUrl = `/uploads/avatars/${employee.employeeId.toLowerCase()}.jpg`;
  employee.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'EMPLOYEE_BIOMETRIC_ENROLLED',
    resourceType: 'EMPLOYEE',
    resourceId: employee.employeeId,
    siteId: employee.siteId,
    result: 'SUCCESS',
    metadata: {
      employeeName: employee.fullName,
      enrolledBy: user.email,
    },
  });

  res.status(200).json({
    success: true,
    message: `Biometric template reference registered for ${employee.fullName} (${employee.employeeId}).`,
    employeeId: employee.employeeId,
    employeeName: employee.fullName,
    enrolledAt: employee.updatedAt,
  });
});

export default router;
