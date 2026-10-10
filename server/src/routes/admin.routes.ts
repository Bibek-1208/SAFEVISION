import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { DataStore, UserDoc } from '../models/DataStore';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { Role, ROLE_PERMISSIONS, PERMISSIONS } from '../security/permissions';

const router = Router();
const store = DataStore.getInstance();

// All admin endpoints require ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN'));

// GET /api/admin/users - List all users
router.get('/users', (req: AuthRequest, res: Response) => {
  const users = store.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    siteIds: u.siteIds,
    zoneIds: u.zoneIds,
    teamIds: u.teamIds,
    department: u.department,
    shift: u.shift,
    permissions: u.permissions,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
  }));
  res.json({ users, total: users.length });
});

// POST /api/admin/users - Create new user with role and automatic permissions
router.post('/users', (req: AuthRequest, res: Response) => {
  const { name, email, password = 'Password123!', role, siteIds = ['site-rsp-1'], zoneIds = ['*'], department, shift } = req.body;

  if (!email || !name || !role) {
    return res.status(400).json({ error: 'Missing required fields: email, name, role.' });
  }

  const existing = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'A user with this email address already exists.' });
  }

  const validRole = role as Role;
  const permissions = ROLE_PERMISSIONS[validRole] || [];
  const nowIso = new Date().toISOString();

  const newUser: UserDoc = {
    id: `usr-${Date.now()}`,
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: validRole,
    status: 'ACTIVE',
    siteIds: Array.isArray(siteIds) ? siteIds : [siteIds],
    zoneIds: Array.isArray(zoneIds) ? zoneIds : [zoneIds],
    teamIds: [],
    department: department || 'General Operations',
    shift: shift || 'UNASSIGNED',
    permissions,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastLogin: null,
  };

  store.users.push(newUser);

  AuditLogger.log({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'USER_CREATED',
    resourceType: 'USER',
    resourceId: newUser.id,
    result: 'SUCCESS',
    metadata: { createdUserEmail: newUser.email, role: newUser.role },
  });

  res.status(201).json({ success: true, user: newUser });
});

// PATCH /api/admin/users/:id/role - Change role (Permissions update automatically!)
router.patch('/users/:id/role', (req: AuthRequest, res: Response) => {
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { role, siteIds, zoneIds } = req.body;
  if (!role || !ROLE_PERMISSIONS[role as Role]) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }

  const oldRole = user.role;
  user.role = role as Role;
  user.permissions = ROLE_PERMISSIONS[user.role]; // Automatically update permissions
  if (siteIds) user.siteIds = siteIds;
  if (zoneIds) user.zoneIds = zoneIds;
  user.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'USER_ROLE_CHANGED',
    resourceType: 'USER',
    resourceId: user.id,
    result: 'SUCCESS',
    metadata: { previousRole: oldRole, newRole: user.role },
  });

  res.json({ success: true, user });
});

// PATCH /api/admin/users/:id/status - Enable / Disable account
router.patch('/users/:id/status', (req: AuthRequest, res: Response) => {
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { status } = req.body;
  if (status !== 'ACTIVE' && status !== 'DISABLED') {
    return res.status(400).json({ error: 'Status must be ACTIVE or DISABLED.' });
  }

  user.status = status;
  user.updatedAt = new Date().toISOString();

  AuditLogger.log({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: status === 'DISABLED' ? 'USER_DISABLED' : 'USER_ENABLED',
    resourceType: 'USER',
    resourceId: user.id,
    result: 'SUCCESS',
    metadata: { status },
  });

  res.json({ success: true, user });
});

// GET /api/admin/audit-logs - Immutable Audit Trail
router.get('/audit-logs', (req: AuthRequest, res: Response) => {
  const { action, resourceType, limit = '100' } = req.query;
  const logs = AuditLogger.getLogs({
    action: action ? String(action) : undefined,
    resourceType: resourceType ? String(resourceType) : undefined,
    limit: parseInt(String(limit), 10),
  });
  res.json({ auditLogs: logs, total: logs.length });
});

// GET /api/admin/audit-logs/verify - Verify Cryptographic SHA-256 Hash Chain Integrity
router.get('/audit-logs/verify', (req: AuthRequest, res: Response) => {
  const verification = AuditLogger.verifyIntegrity();
  res.json({
    ...verification,
    verifiedAt: new Date().toISOString(),
    verifier: req.user!.email,
  });
});

// GET /api/admin/system-health - Diagnostics
router.get('/system-health', async (req: AuthRequest, res: Response) => {
  const { probeAiService } = await import('./health.routes');
  const { isMongoConnected, isReplicaSetVerified, replicaSetName } = await import('../config/db');
  const mongoose = (await import('mongoose')).default;

  const aiProbe = await probeAiService();
  const liveCameras = store.cameras.filter((c) => c.status === 'LIVE').length;
  const dbConnected = isMongoConnected && mongoose.connection.readyState === 1;

  const isOnline = aiProbe.status === 'ONLINE';
  const aiDetails = aiProbe.details || {};
  const isModelLoaded = isOnline && (aiDetails.modelStatus === 'MODEL LOADED' || aiDetails.model_loaded === true || aiDetails.runtimeState === 'READY');

  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
  if (!isOnline || !isModelLoaded || !dbConnected || liveCameras === 0) {
    overallStatus = 'DEGRADED';
  }

  const aiEngineName = aiDetails.ai_engine || (isModelLoaded ? (aiDetails.modelName || 'SafeVision-Industrial-YOLOv8') : 'MODEL NOT CONFIGURED');

  res.json({
    status: overallStatus,
    coreService: 'SafeVision Node Command Core v1.4.2',
    uptimeSeconds: Math.round(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    activeUsersCount: store.users.filter((u) => u.status === 'ACTIVE').length,
    totalAuditRecords: store.auditLogs.length,
    activeFeedsCount: liveCameras,
    database: dbConnected
      ? (isReplicaSetVerified ? `MongoDB Replica Set (${replicaSetName})` : 'MongoDB Standalone')
      : 'DATABASE OFFLINE (Ephemeral Mock Session)',
    aiEngine: aiEngineName,
    components: {
      ai: {
        status: isOnline ? (isModelLoaded ? 'ONLINE' : 'DEGRADED') : 'OFFLINE',
        serviceStatus: isOnline ? 'AI ONLINE' : 'AI OFFLINE',
        modelStatus: isModelLoaded ? (aiDetails.runtimeState === 'READY' ? 'READY' : 'ONLINE') : (isOnline ? 'DEGRADED' : 'OFFLINE'),
        modelName: aiDetails.modelName || 'Industrial YOLOv8',
        modelId: aiDetails.modelId || 'MODEL-PPE-SH17-001',
        engine: aiEngineName,
        device: aiDetails.device || 'cpu',
        gpuName: aiDetails.gpu_name || null,
        latencyMs: aiProbe.latencyMs,
        classCount: aiDetails.classCount || 17,
        actualChecksum: aiDetails.actualChecksum || null,
      },
      database: {
        status: dbConnected ? 'CONNECTED' : 'DATABASE OFFLINE',
      },
    },
    ai: {
      status: isOnline ? (isModelLoaded ? (aiDetails.runtimeState === 'READY' ? 'READY' : 'ONLINE') : 'DEGRADED') : 'OFFLINE',
      serviceStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      modelStatus: isOnline ? (isModelLoaded ? (aiDetails.runtimeState || 'READY') : 'DEGRADED') : 'OFFLINE',
      modelName: aiDetails.modelName || 'Industrial YOLOv8',
      modelId: aiDetails.modelId || 'MODEL-PPE-SH17-001',
      classCount: aiDetails.classCount || 17,
      classes: aiDetails.classes || [],
      device: aiDetails.device || 'cpu',
      gpuName: aiDetails.gpu_name || null,
      latencyMs: aiProbe.latencyMs,
      actualChecksum: aiDetails.actualChecksum || null,
    },
  });
});

export default router;
