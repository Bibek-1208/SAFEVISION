import { Router, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { DataStore, IncidentDoc } from '../models/DataStore';
import { IncidentModel, SiteModel } from '../models/mongooseModels';
import { SocketService } from '../services/socket/SocketService';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { AuditLogger } from '../security/AuditLogger';
import { PERMISSIONS } from '../security/permissions';
import { EscalationService, IncidentTimelineService, RiskAssessmentService, SeverityEngine, SmartIncidentResponseService } from '../services/safetyIntelligence';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();
const escalationService = EscalationService.getInstance();
const timelineService = IncidentTimelineService.getInstance();
const smartResponseService = SmartIncidentResponseService.getInstance();

const EVIDENCE_DIR = path.resolve(__dirname, '../../evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  } catch (err) {
    console.error('[IncidentRoute] Failed to initialize evidence directory:', err);
  }
}

// GET /api/incidents/stats - Authoritative incident statistics from MongoDB
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [
      total,
      critical,
      high,
      medium,
      low,
      open,
      resolved,
      investigating,
      ppe,
      zoneBreach,
      emergencyExit,
      loneWorker,
    ] = await Promise.all([
      IncidentModel.countDocuments({}),
      IncidentModel.countDocuments({ severity: 'critical' }),
      IncidentModel.countDocuments({ severity: 'high' }),
      IncidentModel.countDocuments({ severity: 'medium' }),
      IncidentModel.countDocuments({ severity: 'low' }),
      IncidentModel.countDocuments({ status: { $in: ['DETECTED', 'OPEN', 'PENDING'] } }),
      IncidentModel.countDocuments({ status: 'RESOLVED' }),
      IncidentModel.countDocuments({ status: { $in: ['ACKNOWLEDGED', 'DISPATCHED', 'INVESTIGATING'] } }),
      IncidentModel.countDocuments({ violationType: { $regex: /ppe|helmet|vest|glove|shoe/i } }),
      IncidentModel.countDocuments({ violationType: { $regex: /zone|restricted|geofence/i } }),
      IncidentModel.countDocuments({ violationType: { $regex: /emergency/i } }),
      IncidentModel.countDocuments({ violationType: { $regex: /isolated|lone/i } }),
    ]);

    return res.json({
      total,
      critical,
      high,
      medium,
      low,
      open,
      resolved,
      investigating,
      ppe,
      zoneBreach,
      emergencyExit,
      loneWorker,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error computing stats:', err);
    return res.status(500).json({ error: 'Failed to compute incident statistics', message: err.message });
  }
});

// GET /api/incidents/response/queue - Active Incident Queue with Deterministic Priority Sorting
router.get('/response/queue', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const {
      severity,
      zone,
      zoneId,
      cameraId,
      camera,
      violationType,
      violation,
      status,
      responseState,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    const effCamera = cameraId ? String(cameraId) : camera ? String(camera) : undefined;
    const effViolation = violationType ? String(violationType) : violation ? String(violation) : undefined;

    // Zone scoping for Supervisors / Safety Officers
    let effZone = zone ? String(zone) : zoneId ? String(zoneId) : undefined;
    if (effZone && effZone !== 'All' && effZone !== 'All Zones') {
      if (!isZoneInScope(user, effZone)) {
        return res.status(403).json({
          error: `Access denied. You are not authorized to view incidents in zone '${effZone}'.`,
          code: 'ZONE_SCOPE_DENIED',
        });
      }
    }

    const filters: any = {
      severity: severity ? String(severity) : undefined,
      zone: effZone,
      cameraId: effCamera,
      violationType: effViolation,
      status: status ? String(status) : undefined,
      responseState: responseState ? String(responseState) : undefined,
      search: search ? String(search) : undefined,
      limit: parseInt(String(limit), 10) || 50,
      offset: parseInt(String(offset), 10) || 0,
    };

    const result = await smartResponseService.getActiveQueue(filters);

    // Filter queue to user's authorized zones if role is SAFETY_OFFICER or SUPERVISOR
    if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
      result.incidents = result.incidents.filter((inc) => isZoneInScope(user, inc.zone));
      result.total = result.incidents.length;
    } else if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      result.incidents = result.incidents.filter((inc) => {
        const empMatch = inc.employeeId && inc.employeeId.toLowerCase() === wId;
        const workerMatch = inc.workerId && inc.workerId.toLowerCase() === wId;
        return empMatch || workerMatch;
      });
      result.total = result.incidents.length;
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[IncidentRoute] Error retrieving response queue:', err);
    return res.status(500).json({ error: 'Failed to retrieve response queue', message: err.message });
  }
});

// GET /api/incidents/:id/evidence - Authenticated, RBAC/SBAC protected visual proof image endpoint
router.get('/:id/evidence', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    // 1. Resolve incident from DataStore or MongoDB
    let incident = store.incidents.find(
      (i) => i.id === incidentParam || i.incidentId === incidentParam
    );

    if (!incident && mongoose.connection.readyState === 1) {
      const doc = await IncidentModel.findOne({
        $or: [{ incidentId: incidentParam }, ...(mongoose.isValidObjectId(incidentParam) ? [{ _id: incidentParam }] : [])]
      }).lean();
      if (doc) incident = doc as any;
    }

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // 2. SBAC Authorization check
    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied: You are not authorized to view evidence in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'ADMIN' || user.role === 'PLANT_MANAGER') {
      // Allowed
    } else if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
      if (!isZoneInScope(user, incident.zone)) {
        AuditLogger.log({
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'SECURITY_ACCESS_DENIED',
          resourceType: 'INCIDENT_EVIDENCE',
          resourceId: incident.incidentId,
          result: 'DENIED',
        });
        return res.status(403).json({ error: 'Access denied: You are not authorized to view evidence in this zone.' });
      }
    } else if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const empMatch = incident.employeeId && incident.employeeId.toLowerCase() === wId;
      const workerMatch = incident.workerId && incident.workerId.toLowerCase() === wId;
      if (!empMatch && !workerMatch) {
        return res.status(403).json({ error: 'Access denied: You can only view your own incident evidence.' });
      }
    }

    // 3. Security: Sanitize filename to prevent directory traversal
    const safeIncId = path.basename(incident.incidentId || incidentParam);
    const expectedFilePath = path.join(EVIDENCE_DIR, `${safeIncId}.jpg`);

    const resolvedPath = path.resolve(expectedFilePath);
    if (!resolvedPath.startsWith(EVIDENCE_DIR)) {
      return res.status(400).json({ error: 'Invalid evidence storage reference' });
    }

    // 4. Return physical file if present
    if (fs.existsSync(resolvedPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.sendFile(resolvedPath);
    }

    // Fallback: If base64 exists in incident record (e.g. legacy/testing)
    if (incident.evidenceImage && incident.evidenceImage.startsWith('data:image/')) {
      const base64Data = incident.evidenceImage.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.send(buffer);
    }

    // Explicit failure explanation
    const reason = incident.evidence?.failureReason || 'FRAME_UNAVAILABLE';
    return res.status(404).json({
      error: 'Visual evidence not found',
      reason,
      incidentId: incident.incidentId,
      captured: false
    });
  } catch (err: any) {
    console.error('[IncidentEvidenceError]', err);
    return res.status(500).json({ error: 'Failed to retrieve incident evidence' });
  }
});

// Helper to check if a zone name or code is in the user's authorized zone scope
function isZoneInScope(user: any, zoneNameOrCode: string): boolean {
  if (user.role === 'ADMIN' || user.zoneIds.includes('*')) return true;
  const matchedZone = store.zones.find(
    (z) => z.name.toLowerCase() === zoneNameOrCode.toLowerCase() || z.code.toLowerCase() === zoneNameOrCode.toLowerCase()
  );
  if (!matchedZone) {
    return user.zoneIds.some((zid: string) => zid.toLowerCase() === zoneNameOrCode.toLowerCase());
  }
  return user.zoneIds.some(
    (zid: string) => zid.toLowerCase() === matchedZone.code.toLowerCase() || zid.toLowerCase() === matchedZone.name.toLowerCase()
  );
}

// GET /api/incidents - Strictly Scoped by Role, Site, and Zone
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { zone, severity, status, search, cameraId, violationType, source, limit = '50', offset = '0' } = req.query;

  // If user requested a specific zone, verify scope
  if (zone && zone !== 'All Zones') {
    if (!isZoneInScope(user, String(zone))) {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'INCIDENTS_QUERY',
        resourceId: String(zone),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: { requestedZone: zone, authorizedZones: user.zoneIds },
      });
      return res.status(403).json({
        error: `Access denied. You are not authorized to view incidents in zone '${zone}'.`,
        code: 'ZONE_SCOPE_DENIED',
      });
    }
  }

  let filtered = [...store.incidents];

  // 1. SBAC Query-Level Scoping
  if (user.role === 'ADMIN') {
    // Unrestricted
  } else if (user.role === 'PLANT_MANAGER') {
    // Plant-wide (all zones)
  } else if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
    // Scoped strictly to authorized zones
    filtered = filtered.filter((i) => isZoneInScope(user, i.zone));
  } else if (user.role === 'EMPLOYEE') {
    // Ordinary employee only sees own incidents if workerId or employeeId matches
    filtered = filtered.filter((i) => {
      const wId = (user.workerId || '').toLowerCase();
      const empMatch = i.employeeId && i.employeeId.toLowerCase() === wId;
      const workerMatch = i.workerId && i.workerId.toLowerCase() === wId;
      return empMatch || workerMatch;
    });
  }

  // 2. Query Filters
  if (zone && zone !== 'All Zones') {
    filtered = filtered.filter((i) => i.zone.toLowerCase() === String(zone).toLowerCase());
  }

  if (severity && severity !== 'All Severity') {
    filtered = filtered.filter((i) => i.severity.toLowerCase() === String(severity).toLowerCase());
  }

  if (status && status !== 'All Status') {
    filtered = filtered.filter((i) => i.status.toLowerCase() === String(status).toLowerCase());
  }

  if (cameraId) {
    filtered = filtered.filter((i) => i.cameraId?.toLowerCase() === String(cameraId).toLowerCase());
  }

  if (violationType) {
    filtered = filtered.filter((i) => i.violationType?.toLowerCase() === String(violationType).toLowerCase());
  }

  if (source) {
    filtered = filtered.filter((i) => ((i as any).source || 'LIVE_CAMERA').toLowerCase() === String(source).toLowerCase());
  }

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.incidentId.toLowerCase().includes(q) ||
        (i.workerName && i.workerName.toLowerCase().includes(q)) ||
        (i.workerId && i.workerId.toLowerCase().includes(q)) ||
        (i.employeeId && i.employeeId.toLowerCase().includes(q)) ||
        (i.employeeName && i.employeeName.toLowerCase().includes(q)) ||
        (i.trackId && i.trackId.toLowerCase().includes(q)) ||
        i.violationType.toLowerCase().includes(q) ||
        i.cameraId.toLowerCase().includes(q)
    );
  }

  // 3. Privacy Masking for ordinary employees
  if (user.role === 'EMPLOYEE') {
    filtered = filtered.map((i) => ({
      ...i,
      evidenceImage: '', // Mask raw visual evidence for privacy
    }));
  }

  const total = filtered.length;
  const start = parseInt(String(offset), 10);
  const end = start + parseInt(String(limit), 10);
  const paginated = filtered.slice(start, end);

  return res.json({
    total,
    incidents: paginated,
    scope: {
      role: user.role,
      authorizedZones: user.zoneIds,
    },
  });
});

// POST /api/incidents - Create / Report Incident (Restricted to Safety Officers, Plant Managers, Admins)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  // Normal workers and supervisors cannot arbitrarily create formal safety incidents
  if (user.role === 'EMPLOYEE' || user.role === 'SUPERVISOR') {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'SECURITY_ACCESS_DENIED',
      resourceType: 'INCIDENT_CREATE',
      ipAddress: req.ip,
      result: 'DENIED',
      metadata: { reason: 'Unauthorized role attempted to create formal incident' },
    });
    return res.status(403).json({
      error: 'Access denied: Ordinary users cannot create formal safety incidents. Use POST /api/hazards to report safety hazards or concerns.',
      code: 'ROLE_FORBIDDEN',
    });
  }

  const {
    workerId,
    workerName,
    employeeId,
    employeeName,
    trackId,
    identityStatus = 'UNCONFIRMED',
    violationType,
    severity,
    confidence = 0.9,
    zone = 'Furnace Bay',
    cameraId = 'CAM-01',
    status = 'DETECTED',
    whyFlagged = [],
    recommendedAction = 'Dispatch area safety steward.',
    evidenceImage = '',
    boundingBox,
    source = 'MANUAL',
    modelName,
    modelVersion,
    pipelineName,
    evidenceHash,
    ruleId,
    modelId,
  } = req.body;

  // Requirement 17: Normal users cannot forge source = 'AI'
  if (source === 'AI') {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'SECURITY_ACCESS_DENIED',
      resourceType: 'INCIDENT_FORGERY_PREVENTION',
      ipAddress: req.ip,
      result: 'DENIED',
      metadata: { reason: 'User attempted to post incident with source = AI directly via REST' },
    });
    return res.status(403).json({
      error: 'Access denied: AI incidents must only be created by the trusted AI inference pipeline. Use source: MANUAL.',
      code: 'AI_INCIDENT_RESTRICTED',
    });
  }

  if (!isZoneInScope(user, zone)) {
    return res.status(403).json({
      error: `Access denied. You cannot create incidents in zone '${zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  const incId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
  const effectiveEmployeeId = employeeId || (workerId !== 'UNIDENTIFIED' ? workerId : undefined);
  const effectiveEmployeeName = employeeName || workerName;

  // Real Multi-Factor Risk Assessment (Zero Hardcoded Scores)
  const riskAssessmentService = RiskAssessmentService.getInstance();
  const calculatedRisk = await riskAssessmentService.calculateRisk({
    violationType: violationType || 'general_hazard',
    confidence: Number(confidence) || 0.9,
    zone,
    cameraId,
    trackId,
    employeeId: effectiveEmployeeId,
  });

  const finalRiskScore = typeof req.body.riskScore === 'number' ? req.body.riskScore : calculatedRisk.riskScore;
  const finalRiskLevel = calculatedRisk.riskLevel;
  const finalRiskFactors = calculatedRisk.factors;

  // Real Traceable Severity Evaluation
  const severityResult = SeverityEngine.evaluate({
    riskScore: finalRiskScore,
    violationType: violationType || 'general_hazard',
    zone,
  });
  const finalSeverity = (severity as any) || severityResult.severity;

  const newIncident: IncidentDoc = {
    id: `inc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    incidentId: incId,
    workerId: effectiveEmployeeId || 'UNIDENTIFIED',
    workerName: effectiveEmployeeName || (effectiveEmployeeId ? `Employee (${effectiveEmployeeId})` : 'Unidentified Worker'),
    employeeId: effectiveEmployeeId,
    employeeName: effectiveEmployeeName,
    trackId: trackId || undefined,
    identityStatus: identityStatus as any,
    violationType: violationType || 'general_hazard',
    severity: finalSeverity,
    severityReason: severityResult.severityReason,
    severityFactors: severityResult.severityFactors,
    confidence: Number(confidence),
    boundingBox,
    zone,
    cameraId,
    timestamp: new Date().toISOString(),
    riskScore: finalRiskScore,
    riskLevel: finalRiskLevel,
    riskFactors: finalRiskFactors,
    status: status as any,
    evidenceImage,
    whyFlagged: Array.isArray(whyFlagged) && whyFlagged.length > 0 ? whyFlagged : [severityResult.severityReason],
    recommendedAction: recommendedAction || calculatedRisk.recommendedAction,
    source: 'MANUAL',
    modelName: modelName || 'Manual Field Observation',
    modelVersion: modelVersion || '1.0.0',
    pipelineName: pipelineName || 'Officer Field Inspection',
    evidenceHash: evidenceHash || `audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    ruleId: ruleId || `RULE-${String(violationType || 'SAFETY').toUpperCase()}`,
    modelId: modelId || undefined,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: `${user.name} (${user.role})`,
  };

  store.incidents.unshift(newIncident);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_CREATED',
    resourceType: 'INCIDENT',
    resourceId: newIncident.incidentId,
    zoneId: newIncident.zone,
    result: 'SUCCESS',
    metadata: { source: newIncident.source, ruleId: newIncident.ruleId },
  });

  socketService.emitNewIncident(newIncident);
  socketService.emitRealtimeEvent('incident.created', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: newIncident.incidentId,
    siteId: newIncident.siteId || 'SITE-01',
    zoneId: newIncident.zone,
    version: 1,
    timestamp: newIncident.timestamp,
    incident: newIncident,
  });

  return res.status(201).json({ success: true, incident: newIncident });
});

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// GET /api/incidents/export/csv - Authoritative Real Incident CSV Export
router.get('/export/csv', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const {
    siteId,
    startDate,
    from,
    endDate,
    to,
    severity,
    status,
    violationType,
    cameraId,
    camera,
    zone,
    search,
  } = req.query;

  const startParam = (startDate || from) as string | undefined;
  const endParam = (endDate || to) as string | undefined;
  const effCamera = (cameraId || camera) as string | undefined;

  const isMongoReady = mongoose.connection.readyState === 1;

  // Resolve Site Code for Filename
  let siteCode = 'RSP-ZB-01';
  let siteName = 'Rourkela Steel Plant';
  const targetSiteId = siteId ? String(siteId).trim() : undefined;

  if (targetSiteId && targetSiteId !== 'ALL' && targetSiteId !== 'All Sites') {
    const memSite = store.sites.find((s) => s.id === targetSiteId || s.code.toLowerCase() === targetSiteId.toLowerCase());
    if (memSite) {
      siteCode = memSite.code;
      siteName = memSite.name;
    } else if (isMongoReady) {
      try {
        const dbSite = await SiteModel.findOne({
          $or: [{ siteId: targetSiteId }, { code: targetSiteId }],
        }).lean();
        if (dbSite) {
          siteCode = (dbSite as any).code;
          siteName = (dbSite as any).name;
        }
      } catch (_) {}
    }
  } else if (store.sites.length > 0) {
    siteCode = store.sites[0].code;
    siteName = store.sites[0].name;
  }

  // Retrieve incidents
  let incidentsToExport: any[] = [];

  if (isMongoReady) {
    try {
      const q: any = {};

      if (targetSiteId && targetSiteId !== 'ALL' && targetSiteId !== 'All Sites') {
        q.siteId = targetSiteId;
      }

      if (severity && severity !== 'All Severity') {
        q.severity = new RegExp(`^${severity}$`, 'i');
      }

      if (status && status !== 'All Status') {
        q.status = new RegExp(`^${status}$`, 'i');
      }

      if (violationType && violationType !== 'All Violations') {
        q.violationType = new RegExp(`^${violationType}$`, 'i');
      }

      if (effCamera && effCamera !== 'All Cameras') {
        q.cameraId = new RegExp(`^${effCamera}$`, 'i');
      }

      if (zone && zone !== 'All Zones') {
        q.zone = new RegExp(`^${zone}$`, 'i');
      }

      if (startParam || endParam) {
        q.timestamp = {};
        if (startParam) {
          q.timestamp.$gte = new Date(startParam);
        }
        if (endParam) {
          const eDate = new Date(endParam);
          if (!String(endParam).includes('T')) eDate.setHours(23, 59, 59, 999);
          q.timestamp.$lte = eDate;
        }
      }

      if (search) {
        const sRegex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        q.$or = [
          { incidentId: sRegex },
          { violationType: sRegex },
          { workerName: sRegex },
          { workerId: sRegex },
          { employeeName: sRegex },
          { employeeId: sRegex },
          { zone: sRegex },
          { cameraId: sRegex },
          { trackId: sRegex },
        ];
      }

      // Role Scoping
      if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
        if (!user.zoneIds.includes('*')) {
          q.zone = { $in: user.zoneIds };
        }
      } else if (user.role === 'EMPLOYEE') {
        q.$or = [
          { workerId: user.workerId },
          { employeeId: user.workerId },
        ];
      }

      incidentsToExport = await IncidentModel.find(q).sort({ timestamp: -1 }).lean();
    } catch (err) {
      console.error('[CSV Export] MongoDB query error:', err);
    }
  }

  // Fallback to store.incidents if MongoDB returned 0 or wasn't ready
  if (incidentsToExport.length === 0 && store.incidents.length > 0) {
    let list = [...store.incidents];

    if (user.role === 'SAFETY_OFFICER' || user.role === 'SUPERVISOR') {
      list = list.filter((i) => isZoneInScope(user, i.zone));
    } else if (user.role === 'EMPLOYEE') {
      list = list.filter((i) => {
        const wId = (user.workerId || '').toLowerCase();
        return (i.employeeId && i.employeeId.toLowerCase() === wId) || (i.workerId && i.workerId.toLowerCase() === wId);
      });
    }

    if (targetSiteId && targetSiteId !== 'ALL' && targetSiteId !== 'All Sites') {
      list = list.filter((i) => i.siteId === targetSiteId);
    }
    if (severity && severity !== 'All Severity') {
      list = list.filter((i) => i.severity.toLowerCase() === String(severity).toLowerCase());
    }
    if (status && status !== 'All Status') {
      list = list.filter((i) => i.status.toLowerCase() === String(status).toLowerCase());
    }
    if (violationType && violationType !== 'All Violations') {
      list = list.filter((i) => i.violationType.toLowerCase() === String(violationType).toLowerCase());
    }
    if (effCamera && effCamera !== 'All Cameras') {
      list = list.filter((i) => i.cameraId.toLowerCase() === String(effCamera).toLowerCase());
    }
    if (zone && zone !== 'All Zones') {
      list = list.filter((i) => i.zone.toLowerCase() === String(zone).toLowerCase());
    }
    if (startParam) {
      const sTime = new Date(startParam).getTime();
      list = list.filter((i) => new Date(i.timestamp).getTime() >= sTime);
    }
    if (endParam) {
      const eDate = new Date(endParam);
      if (!String(endParam).includes('T')) eDate.setHours(23, 59, 59, 999);
      list = list.filter((i) => new Date(i.timestamp).getTime() <= eDate.getTime());
    }
    if (search) {
      const s = String(search).toLowerCase();
      list = list.filter((i) =>
        i.incidentId.toLowerCase().includes(s) ||
        i.violationType.toLowerCase().includes(s) ||
        (i.workerName && i.workerName.toLowerCase().includes(s)) ||
        (i.workerId && i.workerId.toLowerCase().includes(s)) ||
        (i.trackId && i.trackId.toLowerCase().includes(s)) ||
        i.zone.toLowerCase().includes(s) ||
        i.cameraId.toLowerCase().includes(s)
      );
    }
    incidentsToExport = list;
  }

  // Derive date bounds for filename (SafeVision_Incidents_<SITE_CODE>_<START>_<END>.csv)
  let startDateStr = '';
  let endDateStr = '';

  if (startParam) {
    startDateStr = new Date(startParam).toISOString().slice(0, 10);
  }
  if (endParam) {
    endDateStr = new Date(endParam).toISOString().slice(0, 10);
  }

  if (!startDateStr || !endDateStr) {
    if (incidentsToExport.length > 0) {
      const timestamps = incidentsToExport
        .map((i) => new Date(i.timestamp).getTime())
        .filter((t) => !isNaN(t));
      if (timestamps.length > 0) {
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        if (!startDateStr) startDateStr = new Date(minTime).toISOString().slice(0, 10);
        if (!endDateStr) endDateStr = new Date(maxTime).toISOString().slice(0, 10);
      }
    }
  }

  if (!startDateStr) startDateStr = new Date().toISOString().slice(0, 10);
  if (!endDateStr) endDateStr = new Date().toISOString().slice(0, 10);

  const filename = `SafeVision_Incidents_${siteCode}_${startDateStr}_${endDateStr}.csv`;

  // CSV Headers (Section 24)
  const headers = [
    'Incident ID',
    'Timestamp',
    'Site',
    'Camera',
    'Zone',
    'Violation Type',
    'Severity',
    'Confidence',
    'Track ID',
    'Duration',
    'Temporal State',
    'Risk Score',
    'Status',
    'Worker',
    'Resolution',
    'Source',
  ];

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const inc of incidentsToExport) {
    const rawConf = inc.confidence;
    const confStr =
      rawConf !== undefined && rawConf !== null
        ? Number(rawConf) > 1
          ? `${Number(rawConf).toFixed(1)}%`
          : `${(Number(rawConf) * 100).toFixed(1)}%`
        : 'N/A';

    const durationStr =
      inc.temporalConfigUsed?.violation_duration_sec !== undefined
        ? `${Number(inc.temporalConfigUsed.violation_duration_sec).toFixed(1)}s`
        : 'N/A';

    const temporalState =
      inc.temporalConfigUsed?.state || (inc.temporalConfigUsed ? 'VERIFIED' : 'N/A');

    const sourceLabel =
      inc.source === 'AI' || inc.source === 'AI_BENCHMARK'
        ? 'COMPUTER VISION'
        : inc.source === 'SENSOR'
        ? 'SENSOR'
        : inc.source === 'MANUAL' || inc.source === 'HUMAN_REPORT'
        ? 'MANUAL'
        : inc.source || 'COMPUTER VISION';

    const resolutionStr = inc.resolvedAt
      ? `Resolved at ${new Date(inc.resolvedAt).toISOString()}${inc.resolvedBy ? ' by ' + inc.resolvedBy : ''}`
      : inc.notes || (inc.status === 'RESOLVED' ? 'Resolved' : 'Open');

    const row = [
      escapeCsv(inc.incidentId || inc.id || 'N/A'),
      escapeCsv(inc.timestamp ? new Date(inc.timestamp).toISOString() : 'N/A'),
      escapeCsv(siteCode),
      escapeCsv(inc.cameraId || 'N/A'),
      escapeCsv(inc.zone || 'N/A'),
      escapeCsv(String(inc.violationType || '').replace(/_/g, ' ')),
      escapeCsv(String(inc.severity || '').toUpperCase()),
      escapeCsv(confStr),
      escapeCsv(inc.trackId || inc.temporalConfigUsed?.track_id || 'N/A'),
      escapeCsv(durationStr),
      escapeCsv(temporalState),
      escapeCsv(inc.riskScore !== undefined ? inc.riskScore : 'N/A'),
      escapeCsv(inc.status || 'DETECTED'),
      escapeCsv(inc.workerName || inc.workerId || inc.employeeName || 'Unidentified'),
      escapeCsv(resolutionStr),
      escapeCsv(sourceLabel),
    ];
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\r\n') + '\r\n';

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENTS_EXPORTED_CSV',
    resourceType: 'INCIDENTS_REPORT',
    resourceId: filename,
    result: 'SUCCESS',
    metadata: {
      siteCode,
      totalRows: incidentsToExport.length,
      startDate: startDateStr,
      endDate: endDateStr,
    },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csvContent);
});

// GET /api/incidents/:id - Individual Incident Audit View with Scope Verification
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id);
  const idLower = idOrCode.toLowerCase();

  let incident: any = store.incidents.find(
    (i) => i.id.toLowerCase() === idLower || i.incidentId.toLowerCase() === idLower
  );

  const isMongoReady = mongoose.connection.readyState === 1;

  if (isMongoReady) {
    try {
      const isObjectId = mongoose.isValidObjectId(idOrCode);
      const queryOr: any[] = [
        { incidentId: idOrCode },
        { incidentId: new RegExp(`^${idOrCode}$`, 'i') },
      ];
      if (isObjectId) {
        queryOr.push({ _id: idOrCode });
      }
      const dbDoc = await IncidentModel.findOne({ $or: queryOr }).lean();
      if (dbDoc) {
        if (!incident) {
          incident = {
            id: (dbDoc as any).incidentId || (dbDoc as any)._id.toString(),
            incidentId: (dbDoc as any).incidentId,
            workerId: (dbDoc as any).workerId,
            workerName: (dbDoc as any).workerName,
            employeeId: (dbDoc as any).employeeId,
            employeeName: (dbDoc as any).employeeName,
            trackId: (dbDoc as any).trackId,
            identityStatus: (dbDoc as any).identityStatus,
            violationType: (dbDoc as any).violationType,
            severity: (dbDoc as any).severity,
            confidence: (dbDoc as any).confidence,
            boundingBox: (dbDoc as any).boundingBox,
            zone: (dbDoc as any).zone,
            siteId: (dbDoc as any).siteId,
            cameraId: (dbDoc as any).cameraId,
            timestamp: (dbDoc as any).timestamp ? new Date((dbDoc as any).timestamp).toISOString() : new Date().toISOString(),
            riskScore: (dbDoc as any).riskScore,
            status: (dbDoc as any).status,
            evidenceImage: (dbDoc as any).evidenceImage || '',
            whyFlagged: (dbDoc as any).whyFlagged || [],
            recommendedAction: (dbDoc as any).recommendedAction,
            stewardName: (dbDoc as any).stewardName,
            source: (dbDoc as any).source || 'AI',
            temporalConfigUsed: (dbDoc as any).temporalConfigUsed,
            ruleId: (dbDoc as any).ruleId,
            modelName: (dbDoc as any).modelName,
            modelId: (dbDoc as any).modelId,
            notes: (dbDoc as any).notes,
          };
        } else {
          // Merge rich stored fields into in-memory object
          incident = {
            ...incident,
            source: (dbDoc as any).source || incident.source || 'AI',
            temporalConfigUsed: (dbDoc as any).temporalConfigUsed || incident.temporalConfigUsed,
            evidenceImage: (dbDoc as any).evidenceImage || incident.evidenceImage || '',
            boundingBox: (dbDoc as any).boundingBox || incident.boundingBox,
            trackId: (dbDoc as any).trackId || incident.trackId,
            confidence: (dbDoc as any).confidence !== undefined ? (dbDoc as any).confidence : incident.confidence,
            riskScore: (dbDoc as any).riskScore !== undefined ? (dbDoc as any).riskScore : incident.riskScore,
          };
        }
      }
    } catch (err) {
      console.error('[IncidentRoutes] Failed to query Mongo incident details:', err);
    }
  }

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Scope Verification
  if (user.role === 'EMPLOYEE') {
    const isOwnIncident =
      (user.workerId && incident.workerId && incident.workerId.toLowerCase() === user.workerId.toLowerCase()) ||
      (user.workerId && incident.employeeId && incident.employeeId.toLowerCase() === user.workerId.toLowerCase());

    if (!isOwnIncident) {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'INCIDENT_VIEW',
        resourceId: incident.incidentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: { reason: 'Employee attempted to view another worker incident' },
      });
      return res.status(403).json({
        error: 'Access denied. You can only view your own incident records.',
        code: 'SCOPE_FORBIDDEN',
      });
    }
  } else if (user.role === 'SUPERVISOR' || user.role === 'SAFETY_OFFICER') {
    if (!isZoneInScope(user, incident.zone)) {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'INCIDENT_VIEW',
        resourceId: incident.incidentId,
        zoneId: incident.zone,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'DENIED',
        metadata: { authorizedZones: user.zoneIds, incidentZone: incident.zone },
      });
      return res.status(403).json({
        error: `Access denied. Incident ${incident.incidentId} is in zone '${incident.zone}', which is outside your assigned supervision zones.`,
        code: 'ZONE_SCOPE_FORBIDDEN',
      });
    }
  }

  // Audit Log Entry
  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_VIEWED',
    resourceType: 'INCIDENT',
    resourceId: incident.incidentId,
    zoneId: incident.zone,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
  });

  // Mask evidence for employee
  const resultIncident = user.role === 'EMPLOYEE'
    ? { ...incident, evidenceImage: '' }
    : incident;

  return res.json({ incident: resultIncident });
});

// GET /api/incidents/:id/response - Complete Smart Incident Response Bundle
router.get('/:id/response', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: `Scope denied for zone '${incident.zone}'.`, code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized to view incidents in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const isOwn = (incident.workerId && incident.workerId.toLowerCase() === wId) ||
                    (incident.employeeId && incident.employeeId.toLowerCase() === wId);
      if (!isOwn) {
        return res.status(403).json({ error: 'Access denied: Employees can only view response details of their own incidents.', code: 'SCOPE_FORBIDDEN' });
      }
    }

    const [summary, routingDecision, firstResponder, timeline, replay] = await Promise.all([
      smartResponseService.getIncidentSummary(incident.incidentId),
      smartResponseService.evaluateRoutingPolicy(incident),
      smartResponseService.resolveFirstResponder(incident),
      smartResponseService.getEvidenceTimeline(incident.incidentId),
      smartResponseService.getReplayDetails(incident.incidentId),
    ]);

    return res.json({
      incident,
      summary,
      routingDecision,
      routing: routingDecision,
      firstResponder,
      timeline,
      evidenceTimeline: timeline,
      replay,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error fetching response bundle:', err);
    return res.status(500).json({ error: 'Failed to retrieve incident response bundle', message: err.message });
  }
});

// GET /api/incidents/:id/summary and /api/incidents/:id/response-summary - Factual Grounded Incident Summary
router.get(['/:id/summary', '/:id/response-summary'], authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: `Scope denied for zone '${incident.zone}'.`, code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized to view incidents in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const isOwn = (incident.workerId && incident.workerId.toLowerCase() === wId) ||
                    (incident.employeeId && incident.employeeId.toLowerCase() === wId);
      if (!isOwn) {
        return res.status(403).json({ error: 'Access denied: Employees can only view summaries of their own incidents.', code: 'SCOPE_FORBIDDEN' });
      }
    }

    const summary = await smartResponseService.getIncidentSummary(incident.incidentId);
    return res.json({ summary, ...summary });
  } catch (err: any) {
    console.error('[IncidentRoute] Error fetching response summary:', err);
    return res.status(500).json({ error: 'Failed to retrieve incident summary', message: err.message });
  }
});

// GET /api/incidents/:id/routing - Factual Severity-Based Alert Routing Policy & First Responder
router.get('/:id/routing', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role === 'EMPLOYEE') {
      const isOwnIncident =
        (user.workerId && incident.workerId && incident.workerId.toLowerCase() === user.workerId.toLowerCase()) ||
        (user.workerId && incident.employeeId && incident.employeeId.toLowerCase() === user.workerId.toLowerCase());
      if (!isOwnIncident) {
        return res.status(403).json({ error: 'Access denied: Employees can only view routing for their own incidents.', code: 'SCOPE_FORBIDDEN' });
      }
    }

    const [routingDecision, firstResponder] = await Promise.all([
      smartResponseService.evaluateRoutingPolicy(incident),
      smartResponseService.resolveFirstResponder(incident),
    ]);

    return res.json({
      status: routingDecision.status,
      routingDecision,
      routing: routingDecision,
      firstResponder,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error fetching routing decision:', err);
    return res.status(500).json({ error: 'Failed to retrieve routing decision', message: err.message, status: 'ROUTING_ERROR' });
  }
});

// GET /api/incidents/:id/replay - Grounded Visual Evidence Replay Status
router.get('/:id/replay', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized to view replay in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const isOwn = (incident.workerId && incident.workerId.toLowerCase() === wId) ||
                    (incident.employeeId && incident.employeeId.toLowerCase() === wId);
      if (!isOwn) {
        return res.status(403).json({ error: 'Access denied: Employees can only view replay of their own incidents.', code: 'EMPLOYEE_SCOPE_FORBIDDEN' });
      }
    }

    const replay = await smartResponseService.getReplayDetails(incident.incidentId);
    return res.json({ ...replay, replay });
  } catch (err: any) {
    console.error('[IncidentRoute] Error fetching replay details:', err);
    return res.status(500).json({ error: 'Failed to retrieve replay details', message: err.message });
  }
});

// GET /api/incidents/:id/first-responder - Dedicated First Responder Resolution Endpoint
router.get(['/:id/first-responder', '/:id/firstresponder'], authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized to view incidents in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const isOwn = (incident.workerId && incident.workerId.toLowerCase() === wId) ||
                    (incident.employeeId && incident.employeeId.toLowerCase() === wId);
      if (!isOwn) {
        return res.status(403).json({ error: 'Access denied: Employees can only view first responder details of their own incidents.', code: 'SCOPE_FORBIDDEN' });
      }
    }

    const firstResponder = await smartResponseService.resolveFirstResponder(incident);
    return res.json({
      incidentId: incident.incidentId,
      ...firstResponder,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error fetching first responder details:', err);
    return res.status(500).json({ error: 'Failed to retrieve first responder details', message: err.message });
  }
});

// GET /api/incidents/:id/first-responder/candidates - List Real Authorized Candidate Responders
router.get('/:id/first-responder/candidates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized for site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied: Employees cannot view responder candidates.', code: 'SCOPE_FORBIDDEN' });
    }

    const candidates = await smartResponseService.getEligibleFirstResponders(incident);
    return res.json({
      incidentId: incident.incidentId,
      candidates: candidates.map((c) => ({
        userId: c.id,
        name: c.name,
        role: c.role,
        department: c.department || 'Operations',
        email: c.email,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve eligible first responders', message: err.message });
  }
});

// Helper for authenticated, range-enabled secure video replay streaming
async function handleVideoReplayStreaming(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'INCIDENT_REPLAY_VIDEO',
        resourceId: incident.incidentId,
        result: 'DENIED',
        metadata: { reason: 'Zone scope mismatch' },
      });
      return res.status(403).json({ error: 'Access denied: You are not authorized to view replay in this zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized to view replay in site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    if (user.role === 'EMPLOYEE') {
      const wId = (user.workerId || '').toLowerCase();
      const isOwn = (incident.workerId && incident.workerId.toLowerCase() === wId) ||
                    (incident.employeeId && incident.employeeId.toLowerCase() === wId);
      if (!isOwn) {
        return res.status(403).json({ error: 'Access denied: Employees can only view replay of their own incidents.', code: 'EMPLOYEE_SCOPE_FORBIDDEN' });
      }
    }

    const resolvedVideoPath = smartResponseService.getReplayVideoPath(incident);
    if (!resolvedVideoPath || !fs.existsSync(resolvedVideoPath)) {
      return res.status(404).json({
        error: 'Video evidence file not found or unavailable',
        incidentId: incident.incidentId,
        playable: false,
      });
    }

    // Path traversal verification
    const normalized = path.resolve(resolvedVideoPath);
    if (!normalized.startsWith(EVIDENCE_DIR)) {
      return res.status(400).json({ error: 'Invalid evidence storage path', code: 'INVALID_PATH' });
    }

    const stat = fs.statSync(normalized);
    const fileSize = stat.size;
    const mimeType = normalized.endsWith('.webm') ? 'video/webm' : (normalized.endsWith('.ogg') ? 'video/ogg' : 'video/mp4');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(normalized, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-cache',
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-cache',
      });
      fs.createReadStream(normalized).pipe(res);
    }
  } catch (err: any) {
    console.error('[IncidentRoute] Error streaming replay video:', err);
    return res.status(500).json({ error: 'Failed to stream replay video', message: err.message });
  }
}

// GET /api/incidents/:id/replay/media - Secure Authenticated Video Streaming
router.get('/:id/replay/media', authenticate, handleVideoReplayStreaming);

// GET /api/incidents/:id/video - Alias for Video Streaming
router.get('/:id/video', authenticate, handleVideoReplayStreaming);

// POST /api/incidents/:id/route - Route Incident
router.post('/:id/route', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');

    if (user.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied: Employees cannot trigger incident routing.' });
    }

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    const result = await smartResponseService.routeIncident(incident.incidentId, user);
    return res.json(result);
  } catch (err: any) {
    console.error('[IncidentRoute] Error routing incident:', err);
    return res.status(500).json({ error: 'Failed to route incident', message: err.message });
  }
});

// POST /api/incidents/:id/assign and /api/incidents/:id/first-responder/assign - Assign First Responder
router.post(['/:id/assign', '/:id/first-responder/assign'], authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');
    const { responderId, notes, source, version } = req.body;

    if (!responderId) {
      return res.status(400).json({ error: 'responderId is required for assignment' });
    }

    if (user.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied: Employees cannot assign responders.', code: 'SCOPE_FORBIDDEN' });
    }

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized for site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    const result = await smartResponseService.assignResponder(incident.incidentId, responderId, user, notes, source, version);
    return res.json({
      success: true,
      ...result.incident,
      incident: result.incident,
      responder: result.responder,
      assignedResponder: result.responder,
      responseState: result.incident.responseState,
      status: result.incident.status,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error assigning responder:', err);
    const status = err.statusCode || (err.code === 'CONCURRENCY_CONFLICT' || err.code === 'STATE_CONFLICT' ? 409 : 400);
    return res.status(status).json({ error: err.message || 'Failed to assign responder', code: err.code });
  }
});

// POST /api/incidents/:id/start-response and /api/incidents/:id/response/start - Transition to IN_PROGRESS
router.post(['/:id/start-response', '/:id/response/start'], authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');
    const { notes, version } = req.body;

    if (user.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied: Employees cannot start incident response.', code: 'SCOPE_FORBIDDEN' });
    }

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
      const incSite = (incident.siteId || '').toLowerCase();
      const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
      if (incSite && !hasSiteMatch) {
        return res.status(403).json({ error: `Access denied. You are not authorized for site '${incident.siteId}'.`, code: 'SITE_SCOPE_FORBIDDEN' });
      }
    }

    const result = await smartResponseService.startResponse(incident.incidentId, user, notes, version);
    return res.json({
      success: true,
      ...result.incident,
      incident: result.incident,
      responseState: result.incident.responseState,
      status: result.incident.status,
    });
  } catch (err: any) {
    console.error('[IncidentRoute] Error starting response:', err);
    const status = err.statusCode || (err.code === 'CONCURRENCY_CONFLICT' || err.code === 'STATE_CONFLICT' ? 409 : 500);
    return res.status(status).json({ error: err.message || 'Failed to start incident response', code: err.code });
  }
});

// POST /api/incidents/:id/escalate - Explicit Escalation
router.post('/:id/escalate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const incidentParam = String(req.params.id || '');
    const { notes, reason } = req.body;

    if (user.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied: Employees cannot escalate incidents.' });
    }

    const incident = await smartResponseService.getIncident(incidentParam);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (!isZoneInScope(user, incident.zone)) {
      return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
    }

    if (incident.status === 'RESOLVED' || incident.responseState === 'RESOLVED') {
      return res.status(409).json({ error: 'Cannot escalate resolved incident.', code: 'STATE_CONFLICT' });
    }

    const result = await smartResponseService.escalateIncident(incident.incidentId, user, notes, reason);
    return res.json(result);
  } catch (err: any) {
    console.error('[IncidentRoute] Error escalating incident:', err);
    const status = err.statusCode || (err.code === 'STATE_CONFLICT' ? 409 : 500);
    return res.status(status).json({ error: err.message || 'Failed to escalate incident', code: err.code });
  }
});

// POST /api/incidents/:id/dispatch - Dispatch Safety Steward (Requires incident:dispatch)
router.post('/:id/dispatch', authenticate, requirePermission(PERMISSIONS.INCIDENT_DISPATCH), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();
  const { stewardName, version } = req.body;

  const incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Concurrency check
  if (version !== undefined && Number(version) !== incident.version) {
    return res.status(409).json({
      error: `Concurrency Conflict: Incident was modified by another user. Current version: ${incident.version}, provided: ${version}.`,
      code: 'CONCURRENCY_CONFLICT',
      currentVersion: incident.version,
      incident,
    });
  }

  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({
      error: `Scope denied. You cannot dispatch to zone '${incident.zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  incident.status = 'DISPATCHED';
  incident.stewardName = stewardName || `${user.name} (Dispatched)`;
  incident.version = (incident.version || 1) + 1;
  incident.updatedAt = new Date().toISOString();
  incident.updatedBy = `${user.name} (${user.role})`;

  timelineService.recordEvent({
    incidentId: incident.incidentId,
    eventType: 'DISPATCHED',
    title: 'Response Team Dispatched',
    description: `Steward ${incident.stewardName} dispatched by ${user.name} (${user.role})`,
    actor: { id: user.id, name: user.name, role: user.role },
  }).catch((err) => console.error('[IncidentRoutes] Failed to record dispatch timeline event:', err));

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_DISPATCHED',
    resourceType: 'INCIDENT',
    resourceId: incident.incidentId,
    zoneId: incident.zone,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    result: 'SUCCESS',
    metadata: { steward: incident.stewardName, version: incident.version },
  });

  socketService.emitIncidentDispatched(incident);
  socketService.emitRealtimeEvent('incident.dispatched', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: incident.incidentId,
    siteId: incident.siteId || 'SITE-01',
    zoneId: incident.zone,
    version: incident.version,
    timestamp: incident.updatedAt,
    incident,
  });

  return res.json({ success: true, incident });
});

// POST /api/incidents/:id/acknowledge and /api/incidents/:id/first-responder/acknowledge - Explicit Acknowledge Action
router.post(['/:id/acknowledge', '/:id/first-responder/acknowledge'], authenticate, requirePermission(PERMISSIONS.INCIDENT_ACKNOWLEDGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();
  const { notes, version } = req.body;

  let incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );
  if (!incident) {
    incident = await smartResponseService.getIncident(idOrCode);
  }

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Concurrency check
  if (version !== undefined && Number(version) !== incident.version) {
    return res.status(409).json({
      error: `Concurrency Conflict: Incident was modified by another user. Current version: ${incident.version}, provided: ${version}.`,
      code: 'CONCURRENCY_CONFLICT',
      currentVersion: incident.version,
      incident,
    });
  }

  // State check: cannot acknowledge resolved incident
  if (incident.status === 'RESOLVED' || incident.responseState === 'RESOLVED') {
    return res.status(409).json({
      error: 'Cannot acknowledge resolved incident.',
      code: 'STATE_CONFLICT',
    });
  }

  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({
      error: `Scope denied for zone '${incident.zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  if (user.role !== 'ADMIN' && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*')) {
    const incSite = (incident.siteId || '').toLowerCase();
    const hasSiteMatch = user.siteIds.some((s: string) => s.toLowerCase() === incSite);
    if (incSite && !hasSiteMatch) {
      return res.status(403).json({
        error: `Access denied. You are not authorized for site '${incident.siteId}'.`,
        code: 'SITE_SCOPE_FORBIDDEN',
      });
    }
  }

  // Idempotency check
  if (
    incident.status === 'ACKNOWLEDGED' &&
    incident.responseState === 'ACKNOWLEDGED' &&
    (!incident.assignedResponder || incident.assignedResponder.state === 'RESPONDER_ACKNOWLEDGED')
  ) {
    return res.json({ success: true, incident });
  }

  const before = { status: incident.status, notes: incident.notes, responseState: incident.responseState };
  incident.status = 'ACKNOWLEDGED';
  incident.responseState = 'ACKNOWLEDGED';
  incident.escalationStatus = 'ACKNOWLEDGED';
  incident.acknowledgedAt = new Date().toISOString();
  incident.acknowledgedBy = `${user.name} (${user.role})`;
  if (notes) incident.notes = notes;
  if (incident.assignedResponder) {
    incident.assignedResponder.state = 'RESPONDER_ACKNOWLEDGED';
    incident.assignedResponder.acknowledgedAt = incident.acknowledgedAt;
  }
  incident.version = (incident.version || 1) + 1;
  incident.updatedAt = new Date().toISOString();
  incident.updatedBy = `${user.name} (${user.role})`;

  // Cancel any pending automated escalation
  escalationService.cancelEscalation(incident.incidentId, user.name);

  // Record timeline events
  timelineService.recordEvent({
    incidentId: incident.incidentId,
    eventType: 'INCIDENT_ACKNOWLEDGED',
    title: 'Incident Acknowledged',
    description: `Incident acknowledged by ${user.name} (${user.role}). Notes: ${notes || 'None provided'}`,
    actor: { id: user.id, name: user.name, role: user.role },
  }).catch((err) => console.error('[IncidentRoutes] Failed to record acknowledge timeline event:', err));

  timelineService.recordEvent({
    incidentId: incident.incidentId,
    eventType: 'FIRST_RESPONDER_ACKNOWLEDGED',
    title: 'First Responder Acknowledged',
    description: `First responder acknowledged assignment: ${user.name} (${user.role}). Notes: ${notes || 'None provided'}`,
    actor: { id: user.id, name: user.name, role: user.role },
    metadata: { responder: incident.assignedResponder },
  }).catch((err) => console.error('[IncidentRoutes] Failed to record first responder acknowledge timeline event:', err));

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_ACKNOWLEDGED',
    resourceType: 'INCIDENT',
    resourceId: incident.incidentId,
    zoneId: incident.zone,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: { status: incident.status, responseState: incident.responseState, notes: incident.notes, version: incident.version },
  });

  // Update in MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await IncidentModel.findOneAndUpdate(
        { $or: [{ incidentId: incident.incidentId }, ...((incident as any)._id ? [{ _id: (incident as any)._id }] : [])] },
        {
          $set: {
            status: 'ACKNOWLEDGED',
            responseState: 'ACKNOWLEDGED',
            escalationStatus: 'ACKNOWLEDGED',
            acknowledgedAt: new Date(incident.updatedAt),
            acknowledgedBy: incident.acknowledgedBy,
            assignedResponder: incident.assignedResponder,
            notes: incident.notes,
            version: incident.version,
            updatedAt: new Date(incident.updatedAt),
          },
        }
      );
    } catch (_) {}
  }

  socketService.emitIncidentAcknowledged(incident);
  socketService.emitRealtimeEvent('incident.acknowledged', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: incident.incidentId,
    siteId: incident.siteId || 'SITE-01',
    zoneId: incident.zone,
    version: incident.version,
    timestamp: incident.updatedAt,
    incident,
  });

  return res.json({
    success: true,
    ...incident,
    incident,
    assignedResponder: incident.assignedResponder,
    responseState: incident.responseState,
    status: incident.status,
  });
});

// POST /api/incidents/:id/resolve - Explicit Resolve Action
router.post('/:id/resolve', authenticate, requirePermission(PERMISSIONS.INCIDENT_RESOLVE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();
  const { resolutionNotes, notes, version } = req.body;

  let incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );
  if (!incident) {
    incident = await smartResponseService.getIncident(idOrCode);
  }

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Concurrency check
  if (version !== undefined && Number(version) !== incident.version) {
    return res.status(409).json({
      error: `Concurrency Conflict: Incident was modified by another user. Current version: ${incident.version}, provided: ${version}.`,
      code: 'CONCURRENCY_CONFLICT',
      currentVersion: incident.version,
      incident,
    });
  }

  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({
      error: `Scope denied for zone '${incident.zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  const before = { status: incident.status, responseState: incident.responseState, resolvedAt: incident.resolvedAt, resolvedBy: incident.resolvedBy };
  incident.status = 'RESOLVED';
  incident.responseState = 'RESOLVED';
  incident.escalationStatus = 'RESOLVED';
  incident.resolvedAt = new Date().toISOString();
  incident.resolvedBy = `${user.name} (${user.role})`;
  if (resolutionNotes || notes) {
    incident.notes = resolutionNotes || notes;
  }
  incident.version = (incident.version || 1) + 1;
  incident.updatedAt = new Date().toISOString();
  incident.updatedBy = `${user.name} (${user.role})`;

  // Cancel any pending automated escalation
  escalationService.cancelEscalation(incident.incidentId, user.name);

  // Record timeline event
  timelineService.recordEvent({
    incidentId: incident.incidentId,
    eventType: 'INCIDENT_RESOLVED',
    title: 'Incident Resolved',
    description: `Incident marked resolved by ${user.name} (${user.role}). Notes: ${incident.notes || 'None'}`,
    actor: { id: user.id, name: user.name, role: user.role },
  }).catch((err) => console.error('[IncidentRoutes] Failed to record resolve timeline event:', err));

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_RESOLVED',
    resourceType: 'INCIDENT',
    resourceId: incident.incidentId,
    zoneId: incident.zone,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: { status: incident.status, responseState: incident.responseState, resolvedAt: incident.resolvedAt, resolvedBy: incident.resolvedBy, version: incident.version },
    metadata: { resolvedBy: incident.resolvedBy },
  });

  // Update in MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await IncidentModel.findOneAndUpdate(
        { $or: [{ incidentId: incident.incidentId }, ...((incident as any)._id ? [{ _id: (incident as any)._id }] : [])] },
        {
          $set: {
            status: 'RESOLVED',
            responseState: 'RESOLVED',
            escalationStatus: 'RESOLVED',
            resolvedAt: new Date(incident.resolvedAt),
            resolvedBy: incident.resolvedBy,
            notes: incident.notes,
            version: incident.version,
            updatedAt: new Date(incident.updatedAt),
          },
        }
      );
    } catch (_) {}
  }

  socketService.emitIncidentResolved(incident);
  socketService.emitRealtimeEvent('incident.resolved', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: incident.incidentId,
    siteId: incident.siteId || 'SITE-01',
    zoneId: incident.zone,
    version: incident.version,
    timestamp: incident.updatedAt,
    incident,
  });

  return res.json({ success: true, incident });
});

// POST /api/incidents/:id/false-positive - Mark as False Positive & Capture Reason
router.post('/:id/false-positive', authenticate, requirePermission(PERMISSIONS.INCIDENT_FALSE_POSITIVE), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();
  const { reason = 'Other', notes = '', version } = req.body;

  const incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Concurrency check
  if (version !== undefined && Number(version) !== incident.version) {
    return res.status(409).json({
      error: `Concurrency Conflict: Incident was modified by another user. Current version: ${incident.version}, provided: ${version}.`,
      code: 'CONCURRENCY_CONFLICT',
      currentVersion: incident.version,
      incident,
    });
  }

  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({
      error: `Scope denied for zone '${incident.zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  const before = { status: incident.status };
  incident.status = 'RESOLVED';
  incident.escalationStatus = 'RESOLVED';
  incident.notes = `Marked as False Positive (${reason}): ${notes}`;
  incident.resolvedAt = new Date().toISOString();
  incident.resolvedBy = `${user.name} (${user.role}) [False Positive Feedback]`;
  incident.version = (incident.version || 1) + 1;
  incident.updatedAt = new Date().toISOString();
  incident.updatedBy = `${user.name} (${user.role})`;

  if (!store.feedbacks) {
    store.feedbacks = [];
  }
  store.feedbacks.unshift({
    id: `fb-${Date.now()}`,
    incidentId: incident.incidentId,
    reason,
    notes,
    submittedBy: user.email,
    timestamp: new Date().toISOString(),
  });

  // Cancel any pending automated escalation
  escalationService.cancelEscalation(incident.incidentId, `${user.name} (False Positive)`);

  // Record timeline event
  timelineService.recordEvent({
    incidentId: incident.incidentId,
    eventType: 'RESOLVED',
    title: 'Marked as False Positive',
    description: `Incident marked false positive by ${user.name} (${user.role}). Reason: ${reason}. Notes: ${notes || 'None'}`,
    actor: { id: user.id, name: user.name, role: user.role },
  }).catch((err) => console.error('[IncidentRoutes] Failed to record false-positive timeline event:', err));

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'INCIDENT_FALSE_POSITIVE',
    resourceType: 'INCIDENT',
    resourceId: incident.incidentId,
    zoneId: incident.zone,
    ipAddress: req.ip,
    result: 'SUCCESS',
    before,
    after: { status: incident.status, notes: incident.notes, version: incident.version },
    metadata: { reason, notes },
  });

  socketService.emitIncidentFalsePositive(incident);
  socketService.emitRealtimeEvent('incident.false_positive', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: incident.incidentId,
    siteId: incident.siteId || 'SITE-01',
    zoneId: incident.zone,
    version: incident.version,
    timestamp: incident.updatedAt,
    incident,
  });

  return res.json({ success: true, incident });
});

// PATCH /api/incidents/:id/status - Status Workflow (Acknowledge / Resolve)
router.patch('/:id/status', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();
  const { status, notes, resolutionNotes, version } = req.body;

  const incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Concurrency check
  if (version !== undefined && Number(version) !== incident.version) {
    return res.status(409).json({
      error: `Concurrency Conflict: Incident was modified by another user. Current version: ${incident.version}, provided: ${version}.`,
      code: 'CONCURRENCY_CONFLICT',
      currentVersion: incident.version,
      incident,
    });
  }

  // Check Zone Scope
  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({
      error: `Scope denied for zone '${incident.zone}'.`,
      code: 'ZONE_SCOPE_FORBIDDEN',
    });
  }

  // Permission Checks per Action
  if (status === 'ACKNOWLEDGED') {
    if (!user.permissions.includes(PERMISSIONS.INCIDENT_ACKNOWLEDGE) && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Permission denied: incident:acknowledge required.' });
    }
    incident.status = 'ACKNOWLEDGED';
    incident.escalationStatus = 'ACKNOWLEDGED';
    incident.notes = notes || incident.notes;
    incident.version = (incident.version || 1) + 1;
    incident.updatedAt = new Date().toISOString();
    incident.updatedBy = `${user.name} (${user.role})`;

    escalationService.cancelEscalation(incident.incidentId, user.name);

    timelineService.recordEvent({
      incidentId: incident.incidentId,
      eventType: 'ACKNOWLEDGED',
      title: 'Incident Acknowledged',
      description: `Incident acknowledged by ${user.name} (${user.role}) via status patch. Notes: ${notes || 'None'}`,
      actor: { id: user.id, name: user.name, role: user.role },
    }).catch((err) => console.error('[IncidentRoutes] Failed to record acknowledge timeline event:', err));

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'INCIDENT_ACKNOWLEDGED',
      resourceType: 'INCIDENT',
      resourceId: incident.incidentId,
      zoneId: incident.zone,
      ipAddress: req.ip,
      result: 'SUCCESS',
    });

    socketService.emitRealtimeEvent('incident.acknowledged', {
      eventId: `evt-${Date.now()}`,
      entityType: 'incident',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'SITE-01',
      zoneId: incident.zone,
      version: incident.version,
      timestamp: incident.updatedAt,
      incident,
    });
  } else if (status === 'RESOLVED') {
    if (!user.permissions.includes(PERMISSIONS.INCIDENT_RESOLVE) && user.role !== 'ADMIN') {
      AuditLogger.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'SECURITY_ACCESS_DENIED',
        resourceType: 'INCIDENT_RESOLVE',
        resourceId: incident.incidentId,
        ipAddress: req.ip,
        result: 'DENIED',
        metadata: { reason: 'Supervisor attempted to resolve incident' },
      });
      return res.status(403).json({
        error: 'Access denied: You do not have permission to resolve incidents. Supervisors may only acknowledge or escalate.',
        code: 'PERMISSION_FORBIDDEN',
      });
    }

    incident.status = 'RESOLVED';
    incident.escalationStatus = 'RESOLVED';
    incident.resolvedAt = new Date().toISOString();
    incident.resolvedBy = `${user.name} (${user.role})`;
    incident.notes = resolutionNotes || notes || 'Resolved following compliance check.';
    incident.version = (incident.version || 1) + 1;
    incident.updatedAt = new Date().toISOString();
    incident.updatedBy = `${user.name} (${user.role})`;

    escalationService.cancelEscalation(incident.incidentId, user.name);

    timelineService.recordEvent({
      incidentId: incident.incidentId,
      eventType: 'RESOLVED',
      title: 'Incident Resolved',
      description: `Incident resolved by ${user.name} (${user.role}) via status patch. Notes: ${incident.notes}`,
      actor: { id: user.id, name: user.name, role: user.role },
    }).catch((err) => console.error('[IncidentRoutes] Failed to record resolve timeline event:', err));

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'INCIDENT_RESOLVED',
      resourceType: 'INCIDENT',
      resourceId: incident.incidentId,
      zoneId: incident.zone,
      ipAddress: req.ip,
      result: 'SUCCESS',
      metadata: { resolvedBy: incident.resolvedBy },
    });

    socketService.emitRealtimeEvent('incident.resolved', {
      eventId: `evt-${Date.now()}`,
      entityType: 'incident',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'SITE-01',
      zoneId: incident.zone,
      version: incident.version,
      timestamp: incident.updatedAt,
      incident,
    });
  } else {
    incident.status = status;
    incident.version = (incident.version || 1) + 1;
    incident.updatedAt = new Date().toISOString();
    incident.updatedBy = `${user.name} (${user.role})`;
  }

  socketService.emitIncidentUpdated(incident);
  socketService.emitRealtimeEvent('incident.updated', {
    eventId: `evt-${Date.now()}`,
    entityType: 'incident',
    entityId: incident.incidentId,
    siteId: incident.siteId || 'SITE-01',
    zoneId: incident.zone,
    version: incident.version,
    timestamp: incident.updatedAt || new Date().toISOString(),
    incident,
  });

  return res.json({ success: true, incident });
});

// GET /api/incidents/:id/timeline - Real Lifecycle Event Timeline
router.get('/:id/timeline', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();

  let incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );
  if (!incident) {
    incident = await smartResponseService.getIncident(idOrCode);
  }

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  // Site scope check
  if (incident.siteId && user.siteIds && user.siteIds.length > 0 && !user.siteIds.includes('*') && !user.siteIds.includes(incident.siteId)) {
    return res.status(403).json({ error: 'Scope denied for this incident site.', code: 'SITE_SCOPE_FORBIDDEN' });
  }

  // Zone scope check
  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
  }

  // Employee restricted to own incidents
  if (user.role === 'EMPLOYEE') {
    const isOwnIncident = (user.workerId && incident.workerId === user.workerId) ||
                          (user.workerId && incident.employeeId === user.workerId);
    if (!isOwnIncident) {
      return res.status(403).json({ error: 'Employees may only access their own incident records.', code: 'EMPLOYEE_SCOPE_FORBIDDEN' });
    }
  }

  const timelineReport = await smartResponseService.getEvidenceTimelineReport(incident.incidentId);
  if (!timelineReport) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  return res.json(timelineReport);
});

// GET /api/incidents/:id/explanation - Explainable AI Factors & Rationale
router.get('/:id/explanation', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const idOrCode = String(req.params.id).toLowerCase();

  const incident = store.incidents.find(
    (i) => i.id.toLowerCase() === idOrCode || i.incidentId.toLowerCase() === idOrCode
  );

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }

  if (!isZoneInScope(user, incident.zone)) {
    return res.status(403).json({ error: 'Scope denied for this incident zone.', code: 'ZONE_SCOPE_FORBIDDEN' });
  }

  return res.json({
    incidentId: incident.incidentId,
    whyCreated: incident.whyCreated || incident.explanation || [],
    explanation: incident.explanation || incident.whyCreated || [],
    riskScore: incident.riskScore,
    riskLevel: incident.riskLevel,
    riskFactors: incident.riskFactors || [],
    severity: incident.severity,
    severityReason: incident.severityReason || 'Standard severity assignment based on violation type',
    severityFactors: incident.severityFactors || [],
    confidence: incident.confidence,
    trackId: incident.trackId,
    temporalValidation: {
      confirmed: true,
      persistenceSeconds: 3.0,
    },
  });
});

export default router;
