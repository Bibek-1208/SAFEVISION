import { Router, Response } from 'express';
import { DataStore, RestrictedZoneDoc, Point2D } from '../models/DataStore';
import { RestrictedZoneModel, CameraModel, SiteModel } from '../models/mongooseModels';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';
import { SocketService } from '../services/socket/SocketService';
import { GeofenceEngine } from '../services/safetyIntelligence/GeofenceEngine';
import mongoose from 'mongoose';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();
const geofenceEngine = GeofenceEngine.getInstance();

const VALID_ZONE_TYPES = ['RESTRICTED', 'HIGH_RISK', 'EMERGENCY', 'AUTHORIZED_ONLY', 'LONE_WORKER_ZONE'];
const VALID_RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const VALID_UNKNOWN_POLICIES = ['DENY', 'ALLOW', 'FLAG_UNKNOWN'];

/**
 * Validates normalized polygon points.
 * Must be an array of >= 3 points with 0 <= x, y <= 1.
 */
function validatePolygon(polygon: any): { valid: boolean; error?: string } {
  if (!polygon || !Array.isArray(polygon)) {
    return { valid: false, error: 'Polygon must be an array of coordinate points.' };
  }
  if (polygon.length < 3) {
    return { valid: false, error: 'A polygon must contain at least 3 points to form an enclosed zone.' };
  }
  for (let i = 0; i < polygon.length; i++) {
    const pt = polygon[i];
    if (typeof pt !== 'object' || pt === null) {
      return { valid: false, error: `Point at index ${i} is not a valid coordinate object.` };
    }
    const x = Number(pt.x);
    const y = Number(pt.y);
    if (isNaN(x) || isNaN(y)) {
      return { valid: false, error: `Point at index ${i} contains non-numeric coordinates.` };
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return {
        valid: false,
        error: `Point at index ${i} (${x}, ${y}) is outside normalized range [0, 1]. Coordinates must be normalized.`,
      };
    }
  }
  return { valid: true };
}

// GET /api/restricted-zones - List restricted zones (Scoped & Filterable)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const cameraId = req.query.cameraId as string | undefined;
  const siteId = req.query.siteId as string | undefined;
  const enabledOnly = req.query.enabled === 'true';
  const includeDeleted = req.query.includeDeleted === 'true' && user.role === 'ADMIN';

  try {
    let zones: RestrictedZoneDoc[] = [];

    // Query MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      const query: any = {};
      if (!includeDeleted) {
        query.isDeleted = { $ne: true };
      }
      if (cameraId) {
        query.cameraId = new RegExp(`^${cameraId.trim()}$`, 'i');
      }
      if (siteId) {
        query.siteId = siteId;
      }
      if (enabledOnly) {
        query.enabled = true;
      }

      const dbDocs = await RestrictedZoneModel.find(query).sort({ createdAt: -1 }).lean();
      zones = dbDocs.map((d: any) => ({
        id: d.zoneId,
        zoneId: d.zoneId,
        siteId: d.siteId,
        cameraId: d.cameraId,
        name: d.name,
        description: d.description || '',
        zoneType: d.zoneType,
        polygon: d.polygon,
        enabled: d.enabled !== false,
        riskLevel: d.riskLevel,
        allowedRoles: d.allowedRoles || [],
        allowedEmployees: d.allowedEmployees || [],
        allowedDepartments: d.allowedDepartments || [],
        unknownIdentityPolicy: d.unknownIdentityPolicy || 'FLAG_UNKNOWN',
        schedule: d.schedule,
        requiredPPE: d.requiredPPE || [],
        isDeleted: d.isDeleted || false,
        deletedAt: d.deletedAt ? new Date(d.deletedAt).toISOString() : null,
        minimumWorkers: d.minimumWorkers !== undefined ? d.minimumWorkers : 2,
        isolationThresholdSec: d.isolationThresholdSec !== undefined ? d.isolationThresholdSec : 120,
        warningThresholdSec: d.warningThresholdSec !== undefined ? d.warningThresholdSec : 90,
        checkInRequired: d.checkInRequired === true,
        checkInTimeoutSec: d.checkInTimeoutSec !== undefined ? d.checkInTimeoutSec : 30,
        authorizedWorkerPolicy: d.authorizedWorkerPolicy || 'TRACK_ONLY',
        createdBy: d.createdBy,
        updatedBy: d.updatedBy,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        version: d.version || 1,
      }));

      // Synchronize in-memory store
      store.restrictedZones = zones;
    } else {
      // Memory fallback
      zones = [...store.restrictedZones];
      if (!includeDeleted) {
        zones = zones.filter((z) => !z.isDeleted);
      }
      if (cameraId) {
        zones = zones.filter((z) => z.cameraId.toLowerCase() === cameraId.toLowerCase().trim());
      }
      if (siteId) {
        zones = zones.filter((z) => z.siteId === siteId);
      }
      if (enabledOnly) {
        zones = zones.filter((z) => z.enabled);
      }
    }

    // Role-based Site Scoping
    if (user.role !== 'ADMIN' && user.siteIds && !user.siteIds.includes('*')) {
      zones = zones.filter((z) => user.siteIds.includes(z.siteId));
    }

    return res.json({ zones, total: zones.length });
  } catch (error: any) {
    console.error('[RestrictedZone] List error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list restricted zones' });
  }
});

// GET /api/restricted-zones/camera/:cameraId - Active restricted zones for a camera view
router.get('/camera/:cameraId', authenticate, async (req: AuthRequest, res: Response) => {
  const cameraId = String(req.params.cameraId).trim();
  try {
    let zones: RestrictedZoneDoc[] = [];

    if (mongoose.connection.readyState === 1) {
      const dbDocs = await RestrictedZoneModel.find({
        cameraId: new RegExp(`^${cameraId}$`, 'i'),
        enabled: true,
        isDeleted: { $ne: true },
      }).lean();

      zones = dbDocs.map((d: any) => ({
        id: d.zoneId,
        zoneId: d.zoneId,
        siteId: d.siteId,
        cameraId: d.cameraId,
        name: d.name,
        description: d.description || '',
        zoneType: d.zoneType,
        polygon: d.polygon,
        enabled: d.enabled !== false,
        riskLevel: d.riskLevel,
        allowedRoles: d.allowedRoles || [],
        allowedEmployees: d.allowedEmployees || [],
        allowedDepartments: d.allowedDepartments || [],
        unknownIdentityPolicy: d.unknownIdentityPolicy || 'FLAG_UNKNOWN',
        schedule: d.schedule,
        requiredPPE: d.requiredPPE || [],
        isDeleted: false,
        minimumWorkers: d.minimumWorkers !== undefined ? d.minimumWorkers : 2,
        isolationThresholdSec: d.isolationThresholdSec !== undefined ? d.isolationThresholdSec : 120,
        warningThresholdSec: d.warningThresholdSec !== undefined ? d.warningThresholdSec : 90,
        checkInRequired: d.checkInRequired === true,
        checkInTimeoutSec: d.checkInTimeoutSec !== undefined ? d.checkInTimeoutSec : 30,
        authorizedWorkerPolicy: d.authorizedWorkerPolicy || 'TRACK_ONLY',
        createdBy: d.createdBy,
        updatedBy: d.updatedBy,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        version: d.version || 1,
      }));
    } else {
      zones = store.restrictedZones.filter(
        (z) => z.cameraId.toLowerCase() === cameraId.toLowerCase() && z.enabled && !z.isDeleted
      );
    }

    return res.json({ zones, total: zones.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve camera restricted zones' });
  }
});

// GET /api/restricted-zones/:id - Get single restricted zone
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id).trim();

  try {
    let zone: RestrictedZoneDoc | undefined;

    if (mongoose.connection.readyState === 1) {
      const doc = await RestrictedZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      }).lean();

      if (doc) {
        zone = {
          id: (doc as any).zoneId,
          zoneId: (doc as any).zoneId,
          siteId: (doc as any).siteId,
          cameraId: (doc as any).cameraId,
          name: (doc as any).name,
          description: (doc as any).description || '',
          zoneType: (doc as any).zoneType,
          polygon: (doc as any).polygon,
          enabled: (doc as any).enabled !== false,
          riskLevel: (doc as any).riskLevel,
          allowedRoles: (doc as any).allowedRoles || [],
          allowedEmployees: (doc as any).allowedEmployees || [],
          allowedDepartments: (doc as any).allowedDepartments || [],
          unknownIdentityPolicy: (doc as any).unknownIdentityPolicy || 'FLAG_UNKNOWN',
          schedule: (doc as any).schedule,
          requiredPPE: (doc as any).requiredPPE || [],
          isDeleted: (doc as any).isDeleted || false,
          minimumWorkers: (doc as any).minimumWorkers !== undefined ? (doc as any).minimumWorkers : 2,
          isolationThresholdSec: (doc as any).isolationThresholdSec !== undefined ? (doc as any).isolationThresholdSec : 120,
          warningThresholdSec: (doc as any).warningThresholdSec !== undefined ? (doc as any).warningThresholdSec : 90,
          checkInRequired: (doc as any).checkInRequired === true,
          checkInTimeoutSec: (doc as any).checkInTimeoutSec !== undefined ? (doc as any).checkInTimeoutSec : 30,
          authorizedWorkerPolicy: (doc as any).authorizedWorkerPolicy || 'TRACK_ONLY',
          createdBy: (doc as any).createdBy,
          updatedBy: (doc as any).updatedBy,
          createdAt: (doc as any).createdAt ? new Date((doc as any).createdAt).toISOString() : new Date().toISOString(),
          updatedAt: (doc as any).updatedAt ? new Date((doc as any).updatedAt).toISOString() : new Date().toISOString(),
          version: (doc as any).version || 1,
        };
      }
    }

    if (!zone) {
      zone = store.restrictedZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted);
    }

    if (!zone) {
      return res.status(404).json({ error: `Restricted zone '${id}' not found.`, code: 'ZONE_NOT_FOUND' });
    }

    return res.json({ zone });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve restricted zone' });
  }
});

// POST /api/restricted-zones - Create Restricted Zone (RBAC Protected)
router.post('/', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  const {
    siteId = 'site-rsp-1',
    cameraId,
    name,
    description = '',
    zoneType = 'RESTRICTED',
    polygon,
    enabled = true,
    riskLevel = 'HIGH',
    allowedRoles = [],
    allowedEmployees = [],
    allowedDepartments = [],
    unknownIdentityPolicy = 'FLAG_UNKNOWN',
    schedule,
    requiredPPE = [],
    minimumWorkers = 2,
    isolationThresholdSec = 120,
    warningThresholdSec = 90,
    checkInRequired = false,
    checkInTimeoutSec = 30,
    authorizedWorkerPolicy = 'TRACK_ONLY',
  } = req.body;

  // 1. Strict Validation (Reject invalid requests per requirement 10)
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Validation error: Zone name is required and cannot be empty.', code: 'INVALID_NAME' });
  }

  if (!cameraId || typeof cameraId !== 'string' || cameraId.trim().length === 0) {
    return res.status(400).json({ error: 'Validation error: cameraId is required. Geofences must be camera-specific.', code: 'INVALID_CAMERA' });
  }

  // Verify camera exists
  let camExists = store.cameras.some((c) => c.code.toLowerCase() === cameraId.toLowerCase().trim() || c.id === cameraId);
  let resolvedCameraCode = cameraId.trim();
  const matchedMemCam = store.cameras.find((c) => c.code.toLowerCase() === cameraId.toLowerCase().trim() || c.id === cameraId);
  if (matchedMemCam) {
    resolvedCameraCode = matchedMemCam.code;
  } else if (!camExists && mongoose.connection.readyState === 1) {
    const dbCam = await CameraModel.findOne({ $or: [{ code: cameraId }, { cameraId }, { _id: mongoose.isValidObjectId(cameraId) ? cameraId : null }] });
    if (!dbCam) {
      return res.status(400).json({ error: `Validation error: Camera '${cameraId}' does not exist.`, code: 'CAMERA_NOT_FOUND' });
    }
    resolvedCameraCode = (dbCam as any).code || cameraId;
  }

  // Verify site exists
  const siteExists = store.sites.some((s) => s.id === siteId || s.code === siteId);
  if (!siteExists && mongoose.connection.readyState === 1) {
    const dbSite = await SiteModel.findOne({ $or: [{ siteId }, { code: siteId }] });
    if (!dbSite) {
      return res.status(400).json({ error: `Validation error: Site '${siteId}' does not exist.`, code: 'SITE_NOT_FOUND' });
    }
  }

  if (!VALID_ZONE_TYPES.includes(zoneType)) {
    return res.status(400).json({
      error: `Validation error: Invalid zoneType '${zoneType}'. Must be one of: ${VALID_ZONE_TYPES.join(', ')}`,
      code: 'INVALID_ZONE_TYPE',
    });
  }

  if (zoneType === 'LONE_WORKER_ZONE') {
    if (minimumWorkers !== undefined && (isNaN(Number(minimumWorkers)) || Number(minimumWorkers) < 1)) {
      return res.status(400).json({ error: 'Validation error: minimumWorkers must be a positive integer >= 1.', code: 'INVALID_MIN_WORKERS' });
    }
    if (isolationThresholdSec !== undefined && (isNaN(Number(isolationThresholdSec)) || Number(isolationThresholdSec) <= 0)) {
      return res.status(400).json({ error: 'Validation error: isolationThresholdSec must be > 0.', code: 'INVALID_ISOLATION_THRESHOLD' });
    }
    if (warningThresholdSec !== undefined && (isNaN(Number(warningThresholdSec)) || Number(warningThresholdSec) <= 0)) {
      return res.status(400).json({ error: 'Validation error: warningThresholdSec must be > 0.', code: 'INVALID_WARNING_THRESHOLD' });
    }
    if (Number(warningThresholdSec) > Number(isolationThresholdSec)) {
      return res.status(400).json({ error: 'Validation error: warningThresholdSec cannot exceed isolationThresholdSec.', code: 'INVALID_THRESHOLD_ORDER' });
    }
  }

  if (!VALID_RISK_LEVELS.includes(riskLevel)) {
    return res.status(400).json({
      error: `Validation error: Invalid riskLevel '${riskLevel}'. Must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
      code: 'INVALID_RISK_LEVEL',
    });
  }

  if (!VALID_UNKNOWN_POLICIES.includes(unknownIdentityPolicy)) {
    return res.status(400).json({
      error: `Validation error: Invalid unknownIdentityPolicy '${unknownIdentityPolicy}'. Must be one of: ${VALID_UNKNOWN_POLICIES.join(', ')}`,
      code: 'INVALID_UNKNOWN_POLICY',
    });
  }

  // Validate polygon
  const polyVal = validatePolygon(polygon);
  if (!polyVal.valid) {
    return res.status(400).json({ error: `Validation error: ${polyVal.error}`, code: 'INVALID_POLYGON' });
  }

  // Format clean normalized polygon points
  const cleanPolygon: Point2D[] = polygon.map((pt: any) => ({
    x: Math.round(Number(pt.x) * 10000) / 10000,
    y: Math.round(Number(pt.y) * 10000) / 10000,
  }));

  const zoneId = `RZ-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
  const nowIso = new Date().toISOString();

  const newZone: RestrictedZoneDoc = {
    id: zoneId,
    zoneId,
    siteId,
    cameraId: resolvedCameraCode,
    name: name.trim(),
    description: description.trim(),
    zoneType,
    polygon: cleanPolygon,
    enabled: Boolean(enabled),
    riskLevel,
    allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : [],
    allowedEmployees: Array.isArray(allowedEmployees) ? allowedEmployees : [],
    allowedDepartments: Array.isArray(allowedDepartments) ? allowedDepartments : [],
    unknownIdentityPolicy,
    schedule: schedule && typeof schedule === 'object' ? schedule : { enabled: false },
    requiredPPE: Array.isArray(requiredPPE) ? requiredPPE : [],
    minimumWorkers: Number(minimumWorkers) || 2,
    isolationThresholdSec: Number(isolationThresholdSec) || 120,
    warningThresholdSec: Number(warningThresholdSec) || 90,
    checkInRequired: Boolean(checkInRequired),
    checkInTimeoutSec: Number(checkInTimeoutSec) || 30,
    authorizedWorkerPolicy: authorizedWorkerPolicy || 'TRACK_ONLY',
    isDeleted: false,
    deletedAt: null,
    createdBy: `${user.name} (${user.role})`,
    updatedBy: `${user.name} (${user.role})`,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };

  try {
    // 2. Persist to MongoDB
    if (mongoose.connection.readyState === 1) {
      await RestrictedZoneModel.create({
        ...newZone,
        createdAt: new Date(nowIso),
        updatedAt: new Date(nowIso),
      });
    }

    // 3. Update memory
    store.restrictedZones.unshift(newZone);
    geofenceEngine.resetLoneWorkerZone(zoneId);

    // 4. Audit Log (Cryptographic Hash Chain)
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ZONE_CREATED',
      resourceType: 'RESTRICTED_ZONE',
      resourceId: zoneId,
      siteId,
      zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: {
        name: newZone.name,
        cameraId: newZone.cameraId,
        zoneType: newZone.zoneType,
        riskLevel: newZone.riskLevel,
        vertexCount: newZone.polygon.length,
      },
    });

    // 5. Broadcast Realtime Socket.IO Event
    socketService.emitRealtimeEvent('restricted_zone.created', {
      zone: newZone,
      actor: user.name,
      timestamp: nowIso,
    });

    return res.status(201).json({ success: true, zone: newZone });
  } catch (error: any) {
    console.error('[RestrictedZone] Creation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to persist restricted zone' });
  }
});

// PUT /api/restricted-zones/:id - Update Restricted Zone
router.put('/:id', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const id = String(req.params.id).trim();

  const {
    name,
    description,
    zoneType,
    polygon,
    enabled,
    riskLevel,
    allowedRoles,
    allowedEmployees,
    allowedDepartments,
    unknownIdentityPolicy,
    schedule,
    requiredPPE,
    version,
    minimumWorkers,
    isolationThresholdSec,
    warningThresholdSec,
    checkInRequired,
    checkInTimeoutSec,
    authorizedWorkerPolicy,
  } = req.body;

  try {
    let existing = store.restrictedZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted);
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await RestrictedZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc && !existing) {
        existing = dbDoc.toObject() as any;
      }
    }

    if (!existing) {
      return res.status(404).json({ error: `Restricted zone '${id}' not found.`, code: 'ZONE_NOT_FOUND' });
    }

    // Optimistic concurrency check
    if (version !== undefined && Number(version) !== existing.version) {
      return res.status(409).json({
        error: `Concurrency conflict: Zone version mismatch (Client: ${version}, Server: ${existing.version})`,
        code: 'CONCURRENCY_CONFLICT',
      });
    }

    // Validation if updating polygon
    if (polygon !== undefined) {
      const polyVal = validatePolygon(polygon);
      if (!polyVal.valid) {
        return res.status(400).json({ error: `Validation error: ${polyVal.error}`, code: 'INVALID_POLYGON' });
      }
    }

    if (zoneType !== undefined && !VALID_ZONE_TYPES.includes(zoneType)) {
      return res.status(400).json({
        error: `Validation error: Invalid zoneType '${zoneType}'. Must be one of: ${VALID_ZONE_TYPES.join(', ')}`,
        code: 'INVALID_ZONE_TYPE',
      });
    }

    if ((zoneType || existing.zoneType) === 'LONE_WORKER_ZONE') {
      const effMin = minimumWorkers !== undefined ? Number(minimumWorkers) : existing.minimumWorkers;
      const effIso = isolationThresholdSec !== undefined ? Number(isolationThresholdSec) : existing.isolationThresholdSec;
      const effWarn = warningThresholdSec !== undefined ? Number(warningThresholdSec) : existing.warningThresholdSec;

      if (effMin !== undefined && (isNaN(effMin) || effMin < 1)) {
        return res.status(400).json({ error: 'Validation error: minimumWorkers must be a positive integer >= 1.', code: 'INVALID_MIN_WORKERS' });
      }
      if (effIso !== undefined && (isNaN(effIso) || effIso <= 0)) {
        return res.status(400).json({ error: 'Validation error: isolationThresholdSec must be > 0.', code: 'INVALID_ISOLATION_THRESHOLD' });
      }
      if (effWarn !== undefined && (isNaN(effWarn) || effWarn <= 0)) {
        return res.status(400).json({ error: 'Validation error: warningThresholdSec must be > 0.', code: 'INVALID_WARNING_THRESHOLD' });
      }
      if (effWarn !== undefined && effIso !== undefined && effWarn > effIso) {
        return res.status(400).json({ error: 'Validation error: warningThresholdSec cannot exceed isolationThresholdSec.', code: 'INVALID_THRESHOLD_ORDER' });
      }
    }

    if (riskLevel !== undefined && !VALID_RISK_LEVELS.includes(riskLevel)) {
      return res.status(400).json({
        error: `Validation error: Invalid riskLevel '${riskLevel}'. Must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
        code: 'INVALID_RISK_LEVEL',
      });
    }

    const nowIso = new Date().toISOString();
    const updatedPolygon = polygon
      ? polygon.map((pt: any) => ({
          x: Math.round(Number(pt.x) * 10000) / 10000,
          y: Math.round(Number(pt.y) * 10000) / 10000,
        }))
      : existing.polygon;

    const updatedZone: RestrictedZoneDoc = {
      ...existing,
      name: name !== undefined ? name.trim() : existing.name,
      description: description !== undefined ? description.trim() : existing.description,
      zoneType: zoneType !== undefined ? zoneType : existing.zoneType,
      polygon: updatedPolygon,
      enabled: enabled !== undefined ? Boolean(enabled) : existing.enabled,
      riskLevel: riskLevel !== undefined ? riskLevel : existing.riskLevel,
      allowedRoles: allowedRoles !== undefined ? allowedRoles : existing.allowedRoles,
      allowedEmployees: allowedEmployees !== undefined ? allowedEmployees : existing.allowedEmployees,
      allowedDepartments: allowedDepartments !== undefined ? allowedDepartments : existing.allowedDepartments,
      unknownIdentityPolicy: unknownIdentityPolicy !== undefined ? unknownIdentityPolicy : existing.unknownIdentityPolicy,
      schedule: schedule !== undefined ? schedule : existing.schedule,
      requiredPPE: requiredPPE !== undefined ? requiredPPE : existing.requiredPPE,
      minimumWorkers: minimumWorkers !== undefined ? Number(minimumWorkers) : existing.minimumWorkers,
      isolationThresholdSec: isolationThresholdSec !== undefined ? Number(isolationThresholdSec) : existing.isolationThresholdSec,
      warningThresholdSec: warningThresholdSec !== undefined ? Number(warningThresholdSec) : existing.warningThresholdSec,
      checkInRequired: checkInRequired !== undefined ? Boolean(checkInRequired) : existing.checkInRequired,
      checkInTimeoutSec: checkInTimeoutSec !== undefined ? Number(checkInTimeoutSec) : existing.checkInTimeoutSec,
      authorizedWorkerPolicy: authorizedWorkerPolicy !== undefined ? authorizedWorkerPolicy : existing.authorizedWorkerPolicy,
      updatedBy: `${user.name} (${user.role})`,
      updatedAt: nowIso,
      version: existing.version + 1,
    };

    // Persist to MongoDB
    if (mongoose.connection.readyState === 1 && dbDoc) {
      dbDoc.name = updatedZone.name;
      dbDoc.description = updatedZone.description;
      dbDoc.zoneType = updatedZone.zoneType;
      dbDoc.polygon = updatedZone.polygon;
      dbDoc.enabled = updatedZone.enabled;
      dbDoc.riskLevel = updatedZone.riskLevel;
      dbDoc.allowedRoles = updatedZone.allowedRoles;
      dbDoc.allowedEmployees = updatedZone.allowedEmployees;
      dbDoc.allowedDepartments = updatedZone.allowedDepartments;
      dbDoc.unknownIdentityPolicy = updatedZone.unknownIdentityPolicy;
      dbDoc.schedule = updatedZone.schedule;
      dbDoc.requiredPPE = updatedZone.requiredPPE;
      if (updatedZone.minimumWorkers !== undefined) dbDoc.minimumWorkers = updatedZone.minimumWorkers;
      if (updatedZone.isolationThresholdSec !== undefined) dbDoc.isolationThresholdSec = updatedZone.isolationThresholdSec;
      if (updatedZone.warningThresholdSec !== undefined) dbDoc.warningThresholdSec = updatedZone.warningThresholdSec;
      if (updatedZone.checkInRequired !== undefined) dbDoc.checkInRequired = updatedZone.checkInRequired;
      if (updatedZone.checkInTimeoutSec !== undefined) dbDoc.checkInTimeoutSec = updatedZone.checkInTimeoutSec;
      if (updatedZone.authorizedWorkerPolicy !== undefined) dbDoc.authorizedWorkerPolicy = updatedZone.authorizedWorkerPolicy;
      dbDoc.updatedBy = updatedZone.updatedBy;
      dbDoc.updatedAt = new Date(nowIso);
      dbDoc.version = updatedZone.version;
      await dbDoc.save();
    }

    // Update memory
    const memIdx = store.restrictedZones.findIndex((z) => z.zoneId === existing!.zoneId);
    if (memIdx >= 0) {
      store.restrictedZones[memIdx] = updatedZone;
    }
    geofenceEngine.resetLoneWorkerZone(id);

    // Audit Log
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ZONE_UPDATED',
      resourceType: 'RESTRICTED_ZONE',
      resourceId: updatedZone.zoneId,
      siteId: updatedZone.siteId,
      zoneId: updatedZone.zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: {
        version: updatedZone.version,
        name: updatedZone.name,
        zoneType: updatedZone.zoneType,
        enabled: updatedZone.enabled,
      },
    });

    // Broadcast Realtime Event
    socketService.emitRealtimeEvent('restricted_zone.updated', {
      zone: updatedZone,
      actor: user.name,
      timestamp: nowIso,
    });

    return res.json({ success: true, zone: updatedZone });
  } catch (error: any) {
    console.error('[RestrictedZone] Update error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update restricted zone' });
  }
});

// PATCH /api/restricted-zones/:id/toggle - Enable / Disable Zone (Separate from deletion)
router.patch('/:id/toggle', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const id = String(req.params.id).trim();

  try {
    let zone = store.restrictedZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted);
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await RestrictedZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc && !zone) {
        zone = dbDoc.toObject() as any;
      }
    }

    if (!zone) {
      return res.status(404).json({ error: `Restricted zone '${id}' not found.`, code: 'ZONE_NOT_FOUND' });
    }

    const newEnabledState = !zone.enabled;
    const nowIso = new Date().toISOString();
    const action = newEnabledState ? 'ZONE_ENABLED' : 'ZONE_DISABLED';

    zone.enabled = newEnabledState;
    zone.updatedBy = `${user.name} (${user.role})`;
    zone.updatedAt = nowIso;
    zone.version += 1;

    if (mongoose.connection.readyState === 1 && dbDoc) {
      dbDoc.enabled = newEnabledState;
      dbDoc.updatedBy = zone.updatedBy;
      dbDoc.updatedAt = new Date(nowIso);
      dbDoc.version = zone.version;
      await dbDoc.save();
    }
    geofenceEngine.resetLoneWorkerZone(id);

    // Audit Log
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action,
      resourceType: 'RESTRICTED_ZONE',
      resourceId: zone.zoneId,
      siteId: zone.siteId,
      zoneId: zone.zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: { enabled: newEnabledState, version: zone.version },
    });

    // Realtime Broadcast
    socketService.emitRealtimeEvent('restricted_zone.toggled', {
      zoneId: zone.zoneId,
      enabled: newEnabledState,
      actor: user.name,
      timestamp: nowIso,
    });

    return res.json({ success: true, zone });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to toggle restricted zone' });
  }
});

// DELETE /api/restricted-zones/:id - Soft Delete Restricted Zone (Preserves historical incidents)
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const id = String(req.params.id).trim();

  try {
    let zone = store.restrictedZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted);
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await RestrictedZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc && !zone) {
        zone = dbDoc.toObject() as any;
      }
    }

    if (!zone) {
      return res.status(404).json({ error: `Restricted zone '${id}' not found.`, code: 'ZONE_NOT_FOUND' });
    }

    const nowIso = new Date().toISOString();

    // Soft delete per Requirement 27
    zone.isDeleted = true;
    zone.enabled = false;
    zone.deletedAt = nowIso;
    zone.updatedBy = `${user.name} (${user.role})`;
    zone.updatedAt = nowIso;
    zone.version += 1;

    if (mongoose.connection.readyState === 1 && dbDoc) {
      dbDoc.isDeleted = true;
      dbDoc.enabled = false;
      dbDoc.deletedAt = new Date(nowIso);
      dbDoc.updatedBy = zone.updatedBy;
      dbDoc.updatedAt = new Date(nowIso);
      dbDoc.version = zone.version;
      await dbDoc.save();
    }

    // Filter out from active memory list
    store.restrictedZones = store.restrictedZones.filter((z) => z.zoneId !== zone!.zoneId);
    geofenceEngine.resetLoneWorkerZone(zone.zoneId);

    // Audit Log
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ZONE_DELETED',
      resourceType: 'RESTRICTED_ZONE',
      resourceId: zone.zoneId,
      siteId: zone.siteId,
      zoneId: zone.zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: {
        name: zone.name,
        cameraId: zone.cameraId,
        deletedAt: nowIso,
        retentionReason: 'Historical incident integrity preserved via soft deletion.',
      },
    });

    // Realtime Broadcast
    socketService.emitRealtimeEvent('restricted_zone.deleted', {
      zoneId: zone.zoneId,
      actor: user.name,
      timestamp: nowIso,
    });

    return res.json({ success: true, message: `Restricted zone '${zone.name}' successfully deleted.`, zoneId: zone.zoneId });
  } catch (error: any) {
    console.error('[RestrictedZone] Deletion error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete restricted zone' });
  }
});

// GET /api/restricted-zones/lone-worker/states - Current active lone worker states across cameras
router.get('/lone-worker/states', authenticate, async (req: AuthRequest, res: Response) => {
  const cameraId = req.query.cameraId as string | undefined;
  try {
    const data = await geofenceEngine.getLoneWorkerStates();
    let states = data.states;
    if (cameraId) {
      states = states.filter((s) => s.cameraId.toLowerCase() === cameraId.toLowerCase().trim());
    }
    return res.json({ success: true, count: states.length, summary: data.summary, states });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to get lone worker states' });
  }
});

// POST /api/restricted-zones/lone-worker/check-in - Authorized check-in action (RBAC protected)
router.post('/lone-worker/check-in', authenticate, requirePermission(PERMISSIONS.INCIDENT_ACKNOWLEDGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { zoneId, trackId, notes } = req.body;

  if (!zoneId) {
    return res.status(400).json({ error: 'zoneId is required for check-in resolution.' });
  }

  try {
    const resolved = geofenceEngine.performLoneWorkerCheckIn(
      zoneId,
      trackId ? String(trackId) : '',
      `${user.name} (${user.role})`,
      notes || 'Manual authorized check-in from dashboard'
    );

    if (!resolved.success) {
      return res.status(404).json({ error: resolved.message });
    }

    // Audit log
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LONE_WORKER_CHECK_IN',
      resourceType: 'LONE_WORKER_ZONE',
      resourceId: zoneId,
      siteId: 'site-rsp-1',
      zoneId,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: {
        trackId,
        notes,
        operator: user.name,
      },
    });

    socketService.emit('lone_worker.checked_in', {
      zoneId,
      trackId,
      operator: user.name,
      timestamp: new Date().toISOString(),
      notes,
    });

    return res.json({ success: true, message: `Check-in recorded for zone ${zoneId}`, zoneId, state: resolved.state });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Check-in failed' });
  }
});

export default router;
