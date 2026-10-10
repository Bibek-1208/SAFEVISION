import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { DataStore } from '../models/DataStore';
import {
  IncidentModel,
  CameraModel,
  RestrictedZoneModel,
  SafetyRuleModel,
  ShiftModel,
  EmployeeModel,
  SiteModel,
} from '../models/mongooseModels';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const store = DataStore.getInstance();

export interface SearchResultItem {
  id: string;
  entityType: 'incidents' | 'cameras' | 'workers' | 'rules' | 'zones' | 'shifts' | 'sites';
  title: string;
  subtitle: string;
  badge?: string;
  url: string;
  violationType?: string;
  camera?: string;
  zone?: string;
  timestamp?: string;
  confidence?: number;
  severity?: string;
  trackId?: string;
  status?: string;
  location?: string;
}

export interface GroupedSearchResults {
  incidents: SearchResultItem[];
  cameras: SearchResultItem[];
  workers: SearchResultItem[];
  rules: SearchResultItem[];
  zones: SearchResultItem[];
  shifts: SearchResultItem[];
  sites: SearchResultItem[];
}

// GET /api/search - Authoritative Real Global Search
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const queryRaw = req.query.q || req.query.query || '';
  const q = String(queryRaw).trim().toLowerCase();

  const emptyCategories: GroupedSearchResults = {
    incidents: [],
    cameras: [],
    workers: [],
    rules: [],
    zones: [],
    shifts: [],
    sites: [],
  };

  if (!q || q.length < 1) {
    return res.json({
      query: '',
      totalResults: 0,
      categories: emptyCategories,
      grouped: emptyCategories,
    });
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '8'), 10), 1), 20);
  const isMongoReady = mongoose.connection.readyState === 1;

  // 1. Incidents
  const matchedIncidents: SearchResultItem[] = [];
  const seenIncidentIds = new Set<string>();

  // Fetch real incidents from MongoDB if available
  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbIncidents = await IncidentModel.find({
        $or: [
          { incidentId: regex },
          { violationType: regex },
          { workerName: regex },
          { workerId: regex },
          { zone: regex },
          { cameraId: regex },
          { severity: regex },
          { status: regex },
          { 'temporalConfigUsed.track_id': regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const inc of dbIncidents as any[]) {
        const id = inc.incidentId || inc._id.toString();
        seenIncidentIds.add(id);
        const violationFormatted = String(inc.violationType || '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const dateStr = inc.timestamp
          ? new Date(inc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' · ' +
            new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const confNum =
          inc.confidence !== undefined && inc.confidence !== null
            ? Number(inc.confidence) > 1
              ? Number(inc.confidence)
              : Math.round(Number(inc.confidence) * 1000) / 10
            : undefined;

        matchedIncidents.push({
          id,
          entityType: 'incidents',
          title: violationFormatted || inc.incidentId,
          subtitle: `${inc.zone || 'Industrial Sector'} · ${inc.cameraId || 'CCTV'}${dateStr ? ' · ' + dateStr : ''}`,
          badge: inc.severity?.toUpperCase(),
          url: `/incidents/${inc._id || inc.incidentId}`,
          violationType: violationFormatted,
          camera: inc.cameraId,
          zone: inc.zone,
          timestamp: inc.timestamp ? new Date(inc.timestamp).toISOString() : undefined,
          confidence: confNum,
          severity: inc.severity?.toUpperCase(),
          trackId: inc.trackId || inc.temporalConfigUsed?.track_id,
          status: inc.status,
        });
      }
    } catch (_) {}
  }

  // Also check store incidents
  if (matchedIncidents.length < limit) {
    for (const inc of store.incidents) {
      const id = inc.id || inc.incidentId;
      if (seenIncidentIds.has(id)) continue;

      const haystack = [
        inc.incidentId,
        inc.violationType,
        inc.violationType?.replace(/_/g, ' '),
        inc.workerName,
        inc.workerId,
        inc.zone,
        inc.cameraId,
        inc.severity,
        inc.status,
        inc.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenIncidentIds.add(id);
        const violationFormatted = String(inc.violationType || '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const dateStr = inc.timestamp
          ? new Date(inc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' · ' +
            new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const confNum =
          inc.confidence !== undefined && inc.confidence !== null
            ? Number(inc.confidence) > 1
              ? Number(inc.confidence)
              : Math.round(Number(inc.confidence) * 1000) / 10
            : undefined;

        matchedIncidents.push({
          id,
          entityType: 'incidents',
          title: violationFormatted || inc.incidentId,
          subtitle: `${inc.zone || 'Industrial Sector'} · ${inc.cameraId || 'CCTV'}${dateStr ? ' · ' + dateStr : ''}`,
          badge: inc.severity?.toUpperCase(),
          url: `/incidents/${id}`,
          violationType: violationFormatted,
          camera: inc.cameraId,
          zone: inc.zone,
          timestamp: inc.timestamp ? new Date(inc.timestamp).toISOString() : undefined,
          confidence: confNum,
          severity: inc.severity?.toUpperCase(),
          trackId: inc.trackId || (inc as any).temporalConfigUsed?.track_id,
          status: inc.status,
        });
        if (matchedIncidents.length >= limit) break;
      }
    }
  }

  // 2. Cameras
  const matchedCameras: SearchResultItem[] = [];
  const seenCameraIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbCameras = await CameraModel.find({
        $or: [
          { cameraId: regex },
          { code: regex },
          { name: regex },
          { zone: regex },
          { status: regex },
          { protocol: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const cam of dbCameras as any[]) {
        const id = cam.cameraId || cam._id.toString();
        seenCameraIds.add(id);
        matchedCameras.push({
          id,
          entityType: 'cameras',
          title: `${cam.code || cam.cameraId} — ${cam.name}`,
          subtitle: `Zone: ${cam.zone} • ${cam.status}`,
          badge: cam.status,
          url: `/cameras`,
        });
      }
    } catch (_) {}
  }

  if (matchedCameras.length < limit) {
    for (const cam of store.cameras) {
      const id = cam.id || cam.code;
      if (seenCameraIds.has(id)) continue;

      const haystack = [cam.code, cam.name, cam.zone, cam.status, cam.protocol, cam.id, (cam as any).cameraId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenCameraIds.add(id);
        matchedCameras.push({
          id,
          entityType: 'cameras',
          title: `${cam.code} — ${cam.name}`,
          subtitle: `Zone: ${cam.zone} • ${cam.status}`,
          badge: cam.status,
          url: `/cameras`,
        });
        if (matchedCameras.length >= limit) break;
      }
    }
  }

  // 3. Workers / Personnel
  const matchedWorkers: SearchResultItem[] = [];
  const seenWorkerIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbEmployees = await EmployeeModel.find({
        $or: [
          { employeeId: regex },
          { fullName: regex },
          { name: regex },
          { department: regex },
          { roleTitle: regex },
          { email: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const emp of dbEmployees as any[]) {
        const id = emp.employeeId || emp._id.toString();
        seenWorkerIds.add(id);
        matchedWorkers.push({
          id,
          entityType: 'workers',
          title: `${emp.fullName || emp.name} (${emp.employeeId})`,
          subtitle: `${emp.roleTitle || emp.department || 'Personnel'} • Shift: ${emp.shift || 'General'}`,
          badge: emp.status || 'ACTIVE',
          url: `/employees`,
        });
      }
    } catch (_) {}
  }

  if (matchedWorkers.length < limit) {
    for (const emp of store.employees) {
      const id = emp.employeeId || emp.id;
      if (seenWorkerIds.has(id)) continue;

      const haystack = [
        emp.employeeId,
        emp.fullName,
        emp.name,
        emp.department,
        emp.roleTitle,
        emp.shift,
        emp.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenWorkerIds.add(id);
        matchedWorkers.push({
          id,
          entityType: 'workers',
          title: `${emp.fullName || emp.name} (${emp.employeeId})`,
          subtitle: `${emp.roleTitle || emp.department || 'Personnel'} • Shift: ${emp.shift}`,
          badge: emp.status || 'ACTIVE',
          url: `/employees`,
        });
        if (matchedWorkers.length >= limit) break;
      }
    }
  }

  // Also include tracks from incidents if query matches track ID
  if (matchedWorkers.length < limit) {
    for (const inc of store.incidents) {
      if (inc.workerId && !seenWorkerIds.has(inc.workerId)) {
        if (inc.workerId.toLowerCase().includes(q) || (inc.workerName && inc.workerName.toLowerCase().includes(q))) {
          seenWorkerIds.add(inc.workerId);
          matchedWorkers.push({
            id: inc.workerId,
            entityType: 'workers',
            title: `${inc.workerName || inc.workerId}`,
            subtitle: `Tracked in ${inc.zone} (${inc.cameraId})`,
            badge: (inc as any).workerRole || 'WORKER',
            url: `/employees`,
          });
          if (matchedWorkers.length >= limit) break;
        }
      }
    }
  }

  // 4. Safety Rules
  const matchedRules: SearchResultItem[] = [];
  const seenRuleIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbRules = await SafetyRuleModel.find({
        $or: [
          { ruleId: regex },
          { name: regex },
          { description: regex },
          { category: regex },
          { severity: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const r of dbRules as any[]) {
        const id = r.ruleId || r._id.toString();
        seenRuleIds.add(id);
        matchedRules.push({
          id,
          entityType: 'rules',
          title: r.name,
          subtitle: `${r.category || 'Safety'} • Min Confidence: ${Math.round((r.minConfidenceThreshold || 0.5) * 100)}%`,
          badge: r.severity?.toUpperCase(),
          url: `/safety-rules`,
        });
      }
    } catch (_) {}
  }

  if (matchedRules.length < limit) {
    for (const rule of store.safetyRules) {
      const id = rule.id || rule.ruleCode;
      if (seenRuleIds.has(id)) continue;

      const haystack = [rule.name, rule.description, rule.violationClass, rule.severity, rule.ruleCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenRuleIds.add(id);
        matchedRules.push({
          id,
          entityType: 'rules',
          title: rule.name,
          subtitle: `${rule.violationClass} • Min Confidence: ${Math.round((rule.confidenceThreshold || rule.minConfidence || 0.5) * 100)}%`,
          badge: rule.severity?.toUpperCase(),
          url: `/safety-rules`,
        });
        if (matchedRules.length >= limit) break;
      }
    }
  }

  // 5. Zones & Restricted Zones
  const matchedZones: SearchResultItem[] = [];
  const seenZoneIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbZones = await RestrictedZoneModel.find({
        isDeleted: false,
        $or: [
          { zoneId: regex },
          { name: regex },
          { description: regex },
          { cameraId: regex },
          { riskLevel: regex },
          { zoneType: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const z of dbZones as any[]) {
        const id = z.zoneId || z._id.toString();
        seenZoneIds.add(id);
        matchedZones.push({
          id,
          entityType: 'zones',
          title: `${z.name} [${z.zoneType}]`,
          subtitle: `Camera: ${z.cameraId} • Risk: ${z.riskLevel}`,
          badge: z.enabled ? 'ACTIVE' : 'MUTED',
          url: `/restricted-zones`,
        });
      }
    } catch (_) {}
  }

  if (matchedZones.length < limit) {
    for (const rz of store.restrictedZones) {
      const id = rz.zoneId || rz.id;
      if (seenZoneIds.has(id)) continue;

      const haystack = [rz.zoneId, rz.name, rz.description, rz.cameraId, rz.riskLevel, rz.zoneType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenZoneIds.add(id);
        matchedZones.push({
          id,
          entityType: 'zones',
          title: `${rz.name} [${rz.zoneType}]`,
          subtitle: `Camera: ${rz.cameraId} • Risk: ${rz.riskLevel}`,
          badge: rz.enabled ? 'ACTIVE' : 'MUTED',
          url: `/restricted-zones`,
        });
        if (matchedZones.length >= limit) break;
      }
    }
  }

  if (matchedZones.length < limit) {
    for (const z of store.zones) {
      const id = z.id || z.code;
      if (seenZoneIds.has(id)) continue;

      const haystack = [z.name, z.code, z.dangerLevel, ...(z.requiredPPE || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenZoneIds.add(id);
        matchedZones.push({
          id,
          entityType: 'zones',
          title: z.name,
          subtitle: `Danger: ${z.dangerLevel} • PPE: ${(z.requiredPPE || []).join(', ')}`,
          badge: z.dangerLevel?.toUpperCase(),
          url: `/restricted-zones`,
        });
        if (matchedZones.length >= limit) break;
      }
    }
  }

  // 6. Shifts
  const matchedShifts: SearchResultItem[] = [];
  const seenShiftIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbShifts = await ShiftModel.find({
        $or: [
          { shiftId: regex },
          { name: regex },
          { code: regex },
          { startTime: regex },
          { endTime: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const s of dbShifts as any[]) {
        const id = s.shiftId || s._id.toString();
        seenShiftIds.add(id);
        matchedShifts.push({
          id,
          entityType: 'shifts',
          title: `${s.name} (${s.code})`,
          subtitle: `Hours: ${s.startTime} – ${s.endTime}`,
          badge: s.active ? 'ACTIVE' : 'STANDBY',
          url: `/shifts`,
        });
      }
    } catch (_) {}
  }

  if (matchedShifts.length < limit) {
    for (const shift of store.shifts) {
      const id = shift.id || shift.code;
      if (seenShiftIds.has(id)) continue;

      const haystack = [shift.name, shift.code, shift.startTime, shift.endTime, ...(shift.days || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenShiftIds.add(id);
        matchedShifts.push({
          id,
          entityType: 'shifts',
          title: `${shift.name} (${shift.code})`,
          subtitle: `Hours: ${shift.startTime} – ${shift.endTime}`,
          badge: shift.active ? 'ACTIVE' : 'STANDBY',
          url: `/shifts`,
        });
        if (matchedShifts.length >= limit) break;
      }
    }
  }

  // 7. Sites
  const matchedSites: SearchResultItem[] = [];
  const seenSiteIds = new Set<string>();

  if (isMongoReady) {
    try {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const dbSites = await SiteModel.find({
        $or: [
          { siteId: regex },
          { name: regex },
          { code: regex },
          { location: regex },
          { companyName: regex },
          { industry: regex },
        ],
      })
        .limit(limit)
        .lean();

      for (const site of dbSites as any[]) {
        const id = site.siteId || site._id.toString();
        seenSiteIds.add(id);
        matchedSites.push({
          id,
          entityType: 'sites',
          title: `${site.name} (${site.code})`,
          subtitle: `${site.companyName || 'SafeVision'} • ${site.location}`,
          badge: site.code,
          url: `/onboarding`,
        });
      }
    } catch (_) {}
  }

  if (matchedSites.length < limit) {
    for (const site of store.sites) {
      const id = site.id || site.code;
      if (seenSiteIds.has(id)) continue;

      const haystack = [site.name, site.code, site.location, site.companyName, site.industry]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        seenSiteIds.add(id);
        matchedSites.push({
          id,
          entityType: 'sites',
          title: `${site.name} (${site.code})`,
          subtitle: `${site.companyName || 'SafeVision'} • ${site.location}`,
          badge: site.code,
          url: `/onboarding`,
        });
        if (matchedSites.length >= limit) break;
      }
    }
  }

  const categories: GroupedSearchResults = {
    incidents: matchedIncidents,
    cameras: matchedCameras,
    workers: matchedWorkers,
    rules: matchedRules,
    zones: matchedZones,
    shifts: matchedShifts,
    sites: matchedSites,
  };

  const totalResults =
    matchedIncidents.length +
    matchedCameras.length +
    matchedWorkers.length +
    matchedRules.length +
    matchedZones.length +
    matchedShifts.length +
    matchedSites.length;

  res.json({
    query: q,
    totalResults,
    categories,
    grouped: categories,
  });
});

export default router;
