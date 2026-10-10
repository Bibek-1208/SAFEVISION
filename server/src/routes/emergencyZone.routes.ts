import { Router, Response } from 'express';
import { DataStore, EmergencyZoneDoc, EmergencyZoneType, Point2D } from '../models/DataStore';
import { EmergencyZoneModel, CameraModel, SiteModel } from '../models/mongooseModels';
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

export const VALID_EMERGENCY_ZONE_TYPES: EmergencyZoneType[] = [
  'EMERGENCY_EXIT',
  'ESCAPE_ROUTE',
  'FIRE_EXTINGUISHER_ACCESS',
  'EMERGENCY_PANEL_ACCESS',
  'EVACUATION_PATH',
];

export const VALID_RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

// Verified real model taxonomy from ai/models/industrial_yolov8.pt (17 classes)
export const MODEL_SUPPORTED_CLASSES = [
  'person',
  'ear',
  'ear-mufs',
  'face',
  'face-guard',
  'face-mask',
  'foot',
  'tool',
  'glasses',
  'gloves',
  'helmet',
  'hands',
  'head',
  'medical-suit',
  'shoes',
  'safety-suit',
  'safety-vest',
];

export const MODEL_OBSTRUCTION_CLASSES = ['person', 'tool'];

/**
 * Validates normalized polygon points.
 * Must be an array of >= 3 points with 0 <= x, y <= 1.
 */
function validatePolygon(polygon: any): { valid: boolean; error?: string } {
  if (!polygon || !Array.isArray(polygon)) {
    return { valid: false, error: 'Polygon must be an array of coordinate points.' };
  }
  if (polygon.length < 3) {
    return { valid: false, error: 'A polygon must contain at least 3 points to form an enclosed emergency area.' };
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

// GET /api/emergency-zones/model/taxonomy - Verified model taxonomy & supported classes
router.get('/model/taxonomy', authenticate, async (_req: AuthRequest, res: Response) => {
  return res.json({
    modelId: 'MODEL-PPE-SH17-001',
    modelName: 'SafeVision-Industrial-YOLOv8',
    allModelClasses: MODEL_SUPPORTED_CLASSES,
    supportedObstructionClasses: MODEL_OBSTRUCTION_CLASSES,
    unsupportedClassesNote: 'Classes such as pallet, box, forklift, cart are not part of the active YOLOv8 model taxonomy. Any obstruction detection is strictly limited to verifiable detections (person, tool).',
  });
});

// GET /api/emergency-zones/states - Live state of all emergency zones with summary counts
router.get('/states', authenticate, async (req: AuthRequest, res: Response) => {
  const siteId = req.query.siteId as string | undefined;
  try {
    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    let isAiAvailable = true;
    try {
      const ping = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(1200) });
      isAiAvailable = ping.ok;
    } catch {
      isAiAvailable = false;
    }

    const liveData = await geofenceEngine.getEmergencyZoneStates(siteId, isAiAvailable);
    return res.json({
      success: true,
      summary: liveData.summary,
      states: liveData.states,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to fetch emergency zone states: ${err.message}` });
  }
});

// GET /api/emergency-zones - List emergency zones (Scoped & Filterable)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const cameraId = req.query.cameraId as string | undefined;
  const siteId = req.query.siteId as string | undefined;
  const enabledOnly = req.query.enabled === 'true';
  const includeDeleted = req.query.includeDeleted === 'true' && user.role === 'ADMIN';

  try {
    let zones: EmergencyZoneDoc[] = [];

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

      const dbDocs = await EmergencyZoneModel.find(query).sort({ createdAt: -1 }).lean();
      zones = dbDocs.map((d: any) => ({
        id: d.zoneId,
        zoneId: d.zoneId,
        siteId: d.siteId,
        cameraId: d.cameraId,
        name: d.name,
        description: d.description,
        zoneType: d.zoneType,
        polygon: d.polygon,
        enabled: d.enabled !== false,
        riskLevel: d.riskLevel || 'HIGH',
        temporalThresholdMs: d.temporalThresholdMs || 3000,
        allowedObjectClasses: d.allowedObjectClasses || ['person', 'tool'],
        isDeleted: d.isDeleted || false,
        deletedAt: d.deletedAt,
        createdBy: d.createdBy,
        updatedBy: d.updatedBy,
        createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: d.updatedAt ? d.updatedAt.toISOString() : new Date().toISOString(),
        version: d.version || 1,
      }));
    }

    if (zones.length === 0) {
      zones = store.emergencyZones.filter((z) => {
        if (!includeDeleted && z.isDeleted) return false;
        if (cameraId && z.cameraId.toLowerCase() !== cameraId.toLowerCase()) return false;
        if (siteId && z.siteId !== siteId) return false;
        if (enabledOnly && !z.enabled) return false;
        return true;
      });
    }

    return res.json({
      success: true,
      count: zones.length,
      zones,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to fetch emergency zones: ${err.message}` });
  }
});

// GET /api/emergency-zones/:id - Get single emergency zone
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    let zone: EmergencyZoneDoc | null = null;
    if (mongoose.connection.readyState === 1) {
      const dbDoc = await EmergencyZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      }).lean();
      if (dbDoc) {
        const d: any = dbDoc;
        zone = {
          id: d.zoneId,
          zoneId: d.zoneId,
          siteId: d.siteId,
          cameraId: d.cameraId,
          name: d.name,
          description: d.description,
          zoneType: d.zoneType,
          polygon: d.polygon,
          enabled: d.enabled !== false,
          riskLevel: d.riskLevel || 'HIGH',
          temporalThresholdMs: d.temporalThresholdMs || 3000,
          allowedObjectClasses: d.allowedObjectClasses || ['person', 'tool'],
          isDeleted: d.isDeleted || false,
          deletedAt: d.deletedAt,
          createdBy: d.createdBy,
          updatedBy: d.updatedBy,
          createdAt: d.createdAt ? (d.createdAt.toISOString ? d.createdAt.toISOString() : String(d.createdAt)) : new Date().toISOString(),
          updatedAt: d.updatedAt ? (d.updatedAt.toISOString ? d.updatedAt.toISOString() : String(d.updatedAt)) : new Date().toISOString(),
          version: d.version || 1,
        };
      }
    }

    if (!zone) {
      zone = store.emergencyZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted) || null;
    }

    if (!zone) {
      return res.status(404).json({ error: `Emergency zone '${id}' not found.` });
    }

    return res.json({ success: true, zone });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to fetch emergency zone: ${err.message}` });
  }
});

// POST /api/emergency-zones - Create emergency zone
router.post('/', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const {
    siteId = 'site-rsp-1',
    cameraId,
    name,
    description = '',
    zoneType = 'EMERGENCY_EXIT',
    polygon,
    enabled = true,
    riskLevel = 'HIGH',
    temporalThresholdMs = 3000,
    allowedObjectClasses = ['person', 'tool'],
  } = req.body;

  // 1. Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Zone name is required.' });
  }
  if (!cameraId || typeof cameraId !== 'string' || cameraId.trim().length === 0) {
    return res.status(400).json({ error: 'Valid cameraId is required.' });
  }

  // 2. Validate zoneType
  if (!VALID_EMERGENCY_ZONE_TYPES.includes(zoneType)) {
    return res.status(400).json({
      error: `Invalid emergency zoneType '${zoneType}'. Must be one of: ${VALID_EMERGENCY_ZONE_TYPES.join(', ')}`,
    });
  }

  // 3. Validate riskLevel
  const normalizedRisk = String(riskLevel).toUpperCase();
  if (!VALID_RISK_LEVELS.includes(normalizedRisk)) {
    return res.status(400).json({
      error: `Invalid riskLevel '${riskLevel}'. Must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
    });
  }

  // 4. Validate polygon
  const polyValidation = validatePolygon(polygon);
  if (!polyValidation.valid) {
    return res.status(400).json({ error: polyValidation.error });
  }

  // 5. Verify camera existence
  let cameraExists = store.cameras.some(
    (c) =>
      c.code.toLowerCase() === cameraId.trim().toLowerCase() ||
      c.id.toLowerCase() === cameraId.trim().toLowerCase()
  );
  if (!cameraExists && mongoose.connection.readyState === 1) {
    const dbCam = await CameraModel.findOne({
      $or: [
        { code: new RegExp(`^${cameraId.trim()}$`, 'i') },
        { cameraId: new RegExp(`^${cameraId.trim()}$`, 'i') },
        { _id: mongoose.isValidObjectId(cameraId.trim()) ? cameraId.trim() : null },
      ],
    });
    if (dbCam) cameraExists = true;
  }
  if (!cameraExists) {
    return res.status(400).json({
      error: `Camera '${cameraId}' does not exist. Emergency zones must belong to a configured camera.`,
    });
  }

  // 6. Validate object classes against model taxonomy (Section 6)
  const filteredClasses: string[] = [];
  const unsupportedReport: string[] = [];
  if (Array.isArray(allowedObjectClasses)) {
    for (const cls of allowedObjectClasses) {
      const normCls = String(cls).toLowerCase().trim();
      if (MODEL_SUPPORTED_CLASSES.includes(normCls)) {
        filteredClasses.push(normCls);
      } else {
        unsupportedReport.push(normCls);
      }
    }
    if (unsupportedReport.length > 0) {
      return res.status(400).json({
        error: `Requested obstruction classes [${unsupportedReport.join(', ')}] are UNSUPPORTED_BY_MODEL. The loaded YOLOv8 model only supports: ${MODEL_SUPPORTED_CLASSES.join(', ')}.`,
        code: 'UNSUPPORTED_BY_MODEL',
        unsupportedClasses: unsupportedReport,
      });
    }
  }
  if (filteredClasses.length === 0) {
    filteredClasses.push('person', 'tool');
  }

  const zoneId = `EMRG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const nowStr = new Date().toISOString();

  const newZone: EmergencyZoneDoc = {
    id: zoneId,
    zoneId,
    siteId,
    cameraId: cameraId.trim(),
    name: name.trim(),
    description: description ? description.trim() : '',
    zoneType,
    polygon,
    enabled: Boolean(enabled),
    riskLevel: normalizedRisk as any,
    temporalThresholdMs: Math.max(500, Number(temporalThresholdMs) || 3000),
    allowedObjectClasses: filteredClasses,
    isDeleted: false,
    deletedAt: null,
    createdBy: user.email || user.name || 'USER',
    updatedBy: user.email || user.name || 'USER',
    createdAt: nowStr,
    updatedAt: nowStr,
    version: 1,
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await EmergencyZoneModel.create({
        zoneId: newZone.zoneId,
        siteId: newZone.siteId,
        cameraId: newZone.cameraId,
        name: newZone.name,
        description: newZone.description,
        zoneType: newZone.zoneType,
        polygon: newZone.polygon,
        enabled: newZone.enabled,
        riskLevel: newZone.riskLevel,
        temporalThresholdMs: newZone.temporalThresholdMs,
        allowedObjectClasses: newZone.allowedObjectClasses,
        isDeleted: false,
        deletedAt: null,
        createdBy: newZone.createdBy,
        updatedBy: newZone.updatedBy,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    store.emergencyZones.unshift(newZone);

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'EMERGENCY_ZONE_CREATED',
      resourceType: 'EMERGENCY_ZONE',
      resourceId: newZone.zoneId,
      siteId: newZone.siteId,
      result: 'SUCCESS',
      metadata: {
        cameraId: newZone.cameraId,
        zoneType: newZone.zoneType,
        name: newZone.name,
        polygonVertices: newZone.polygon.length,
        temporalThresholdMs: newZone.temporalThresholdMs,
        unsupportedClassesRequested: unsupportedReport.length > 0 ? unsupportedReport : undefined,
      },
    });

    socketService.emit('emergency_zone.created', {
      zone: newZone,
      action: 'CREATED',
      actor: user.email,
      timestamp: nowStr,
    });

    return res.status(201).json({
      success: true,
      zone: newZone,
      ...(unsupportedReport.length > 0
        ? {
            notice: `Requested classes [${unsupportedReport.join(', ')}] are unsupported by current model taxonomy and were ignored.`,
            status: 'UNSUPPORTED_BY_MODEL',
          }
        : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to create emergency zone: ${err.message}` });
  }
});

// PUT /api/emergency-zones/:id - Update emergency zone
router.put('/:id', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const updates = req.body;

  try {
    let existing: EmergencyZoneDoc | null = null;
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await EmergencyZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc) {
        existing = dbDoc.toObject() as any;
      }
    }

    if (!existing) {
      existing = store.emergencyZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted) || null;
    }

    if (!existing) {
      return res.status(404).json({ error: `Emergency zone '${id}' not found.` });
    }

    // Validate updates
    if (updates.zoneType && !VALID_EMERGENCY_ZONE_TYPES.includes(updates.zoneType)) {
      return res.status(400).json({
        error: `Invalid zoneType. Must be one of: ${VALID_EMERGENCY_ZONE_TYPES.join(', ')}`,
      });
    }

    if (updates.riskLevel) {
      const normRisk = String(updates.riskLevel).toUpperCase();
      if (!VALID_RISK_LEVELS.includes(normRisk)) {
        return res.status(400).json({
          error: `Invalid riskLevel. Must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
        });
      }
      updates.riskLevel = normRisk;
    }

    if (updates.polygon) {
      const polyVal = validatePolygon(updates.polygon);
      if (!polyVal.valid) {
        return res.status(400).json({ error: polyVal.error });
      }
    }

    if (updates.temporalThresholdMs !== undefined) {
      updates.temporalThresholdMs = Math.max(500, Number(updates.temporalThresholdMs) || 3000);
    }

    const nowStr = new Date().toISOString();
    const updatedZone: EmergencyZoneDoc = {
      ...existing,
      ...updates,
      updatedBy: user.email || user.name || 'USER',
      updatedAt: nowStr,
      version: (existing.version || 1) + 1,
    };

    if (dbDoc) {
      Object.assign(dbDoc, {
        name: updatedZone.name,
        description: updatedZone.description,
        zoneType: updatedZone.zoneType,
        polygon: updatedZone.polygon,
        enabled: updatedZone.enabled,
        riskLevel: updatedZone.riskLevel,
        temporalThresholdMs: updatedZone.temporalThresholdMs,
        allowedObjectClasses: updatedZone.allowedObjectClasses,
        updatedBy: updatedZone.updatedBy,
        updatedAt: new Date(),
        version: updatedZone.version,
      });
      await dbDoc.save();
    }

    const memIdx = store.emergencyZones.findIndex((z) => z.zoneId === existing!.zoneId);
    if (memIdx >= 0) {
      store.emergencyZones[memIdx] = updatedZone;
    } else {
      store.emergencyZones.push(updatedZone);
    }

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'EMERGENCY_ZONE_UPDATED',
      resourceType: 'EMERGENCY_ZONE',
      resourceId: updatedZone.zoneId,
      siteId: updatedZone.siteId,
      result: 'SUCCESS',
      metadata: { updates },
    });

    socketService.emit('emergency_zone.updated', {
      zone: updatedZone,
      action: 'UPDATED',
      actor: user.email,
      timestamp: nowStr,
    });

    return res.json({ success: true, zone: updatedZone });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to update emergency zone: ${err.message}` });
  }
});

// PATCH /api/emergency-zones/:id/toggle - Toggle enabled status
router.patch('/:id/toggle', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    let existing: EmergencyZoneDoc | null = null;
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await EmergencyZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc) existing = dbDoc.toObject() as any;
    }

    if (!existing) {
      existing = store.emergencyZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted) || null;
    }

    if (!existing) {
      return res.status(404).json({ error: `Emergency zone '${id}' not found.` });
    }

    const newEnabled = !existing.enabled;
    const nowStr = new Date().toISOString();

    if (dbDoc) {
      dbDoc.enabled = newEnabled;
      dbDoc.updatedBy = user.email || 'USER';
      dbDoc.updatedAt = new Date();
      dbDoc.version = (dbDoc.version || 1) + 1;
      await dbDoc.save();
    }

    const memIdx = store.emergencyZones.findIndex((z) => z.zoneId === existing!.zoneId);
    if (memIdx >= 0) {
      store.emergencyZones[memIdx].enabled = newEnabled;
      store.emergencyZones[memIdx].updatedBy = user.email || 'USER';
      store.emergencyZones[memIdx].updatedAt = nowStr;
    }

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'EMERGENCY_ZONE_TOGGLED',
      resourceType: 'EMERGENCY_ZONE',
      resourceId: existing.zoneId,
      siteId: existing.siteId,
      result: 'SUCCESS',
      metadata: { enabled: newEnabled },
    });

    socketService.emit('emergency_zone.toggled', {
      zoneId: existing.zoneId,
      enabled: newEnabled,
      actor: user.email,
      timestamp: nowStr,
    });

    return res.json({
      success: true,
      zoneId: existing.zoneId,
      enabled: newEnabled,
      message: `Emergency zone '${existing.name}' is now ${newEnabled ? 'ENABLED' : 'DISABLED'}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to toggle emergency zone: ${err.message}` });
  }
});

// DELETE /api/emergency-zones/:id - Delete emergency zone (Soft Delete)
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.ZONE_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    let existing: EmergencyZoneDoc | null = null;
    let dbDoc: any = null;

    if (mongoose.connection.readyState === 1) {
      dbDoc = await EmergencyZoneModel.findOne({
        $or: [{ zoneId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        isDeleted: { $ne: true },
      });
      if (dbDoc) existing = dbDoc.toObject() as any;
    }

    if (!existing) {
      existing = store.emergencyZones.find((z) => (z.zoneId === id || z.id === id) && !z.isDeleted) || null;
    }

    if (!existing) {
      return res.status(404).json({ error: `Emergency zone '${id}' not found.` });
    }

    const nowStr = new Date().toISOString();

    if (dbDoc) {
      dbDoc.isDeleted = true;
      dbDoc.deletedAt = new Date();
      dbDoc.updatedBy = user.email || 'USER';
      dbDoc.updatedAt = new Date();
      await dbDoc.save();
    }

    const memIdx = store.emergencyZones.findIndex((z) => z.zoneId === existing!.zoneId);
    if (memIdx >= 0) {
      store.emergencyZones[memIdx].isDeleted = true;
      store.emergencyZones[memIdx].deletedAt = nowStr;
    }

    geofenceEngine.resetEmergencyZone(existing.zoneId);

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'EMERGENCY_ZONE_DELETED',
      resourceType: 'EMERGENCY_ZONE',
      resourceId: existing.zoneId,
      siteId: existing.siteId,
      result: 'SUCCESS',
    });

    socketService.emit('emergency_zone.deleted', {
      zoneId: existing.zoneId,
      actor: user.email,
      timestamp: nowStr,
    });

    return res.json({
      success: true,
      message: `Emergency zone '${existing.name}' (${existing.zoneId}) successfully deleted.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to delete emergency zone: ${err.message}` });
  }
});

export default router;
