import {
  DataStore,
  RestrictedZoneDoc,
  EmergencyZoneDoc,
  EmergencyZoneType,
  Point2D,
  ZoneScheduleConfig,
  BoundingBox,
  LoneWorkerState,
} from '../../models/DataStore';
import {
  RestrictedZoneModel,
  EmergencyZoneModel,
  EmployeeModel,
  CameraModel,
} from '../../models/mongooseModels';
import { TemporalVerificationService, VerificationResult } from '../verification/TemporalVerificationService';
import { SocketService } from '../socket/SocketService';
import mongoose from 'mongoose';

export interface GeofenceBreachResult {
  zone: RestrictedZoneDoc;
  trackId: string;
  employeeId?: string | null;
  employeeName?: string | null;
  identityStatus: string;
  isAuthorized: boolean;
  violationType?: string;
  reason?: string;
  missingPPE?: string;
  referencePoint: Point2D;
  boundingBox: BoundingBox;
  temporalResult?: VerificationResult;
}

export interface EmergencyBlockageResult {
  zone: EmergencyZoneDoc;
  trackId: string;
  objectClass: string;
  confidence: number;
  boundingBox: BoundingBox;
  referencePoint: Point2D;
  isConfirmed: boolean;
  durationSec: number;
  temporalThresholdSec: number;
  state: 'CANDIDATE_BLOCKAGE' | 'BLOCKED';
  temporalResult: VerificationResult;
  whyFlagged: string;
  evidenceFrameBase64?: string;
}

export interface LoneWorkerEvaluationResult {
  zone: RestrictedZoneDoc;
  trackId: string;
  workerCount: number;
  minimumWorkers: number;
  durationSec: number;
  warningThresholdSec: number;
  isolationThresholdSec: number;
  checkInRequired: boolean;
  checkInTimeoutSec: number;
  state:
    | 'CLEAR'
    | 'INSIDE_CANDIDATE'
    | 'ISOLATED'
    | 'WARNING'
    | 'CHECK_IN_REQUIRED'
    | 'INCIDENT'
    | 'RESOLVED';
  isConfirmedIncident: boolean;
  confidence: number;
  boundingBox: BoundingBox;
  whyFlagged: string;
  evidenceFrameBase64?: string;
}

export interface EmergencyZoneLiveStatus {
  zoneId: string;
  cameraId: string;
  name: string;
  zoneType: EmergencyZoneType;
  state: 'CLEAR' | 'CANDIDATE_BLOCKAGE' | 'BLOCKED' | 'DISABLED' | 'CAMERA_OFFLINE' | 'AI_INFERENCE_UNAVAILABLE';
  activeTrackId?: string;
  objectClass?: string;
  durationSec: number;
  confidence?: number;
  riskLevel: string;
  lastUpdate: string;
  temporalThresholdSec: number;
}

export class GeofenceEngine {
  private static instance: GeofenceEngine;
  private store = DataStore.getInstance();
  private temporalService = TemporalVerificationService.getInstance();
  private socketService = SocketService.getInstance();
  private emergencyZoneStates: Map<string, EmergencyZoneLiveStatus> = new Map();
  private loneWorkerStates: Map<string, LoneWorkerState> = new Map();
  private loneWorkerTrackHistory: Map<
    string,
    {
      firstSeenMs: number;
      lastSeenMs: number;
      trackId: string;
      lastWarningMs?: number;
      lastCheckInReqMs?: number;
      lastIncidentMs?: number;
      checkedIn?: boolean;
      lastCheckInAt?: string;
      lastCheckInBy?: string;
    }
  > = new Map();

  private constructor() {}

  public static getInstance(): GeofenceEngine {
    if (!GeofenceEngine.instance) {
      GeofenceEngine.instance = new GeofenceEngine();
    }
    return GeofenceEngine.instance;
  }

  /**
   * Ray-casting Point-In-Polygon (PIP) calculation.
   * Tests whether a normalized 2D point (x: 0-1, y: 0-1) is inside a polygon.
   */
  public isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
      return false;
    }

    const { x, y } = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Validates a normalized polygonal boundary (>= 3 vertices, 0 <= x, y <= 1).
   */
  public validatePolygon(polygon: any): { valid: boolean; error?: string } {
    if (!polygon || !Array.isArray(polygon)) {
      return { valid: false, error: 'Polygon must be an array of coordinate points.' };
    }
    if (polygon.length < 3) {
      return { valid: false, error: 'A polygon must contain at least 3 vertices to form an enclosed zone.' };
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

  /**
   * Calculates the authoritative ground reference point for a person.
   * Returns the bottom-center of the bounding box: ( (xmin + xmax)/2, ymax ).
   * Coordinates are normalized to [0, 1].
   */
  public getPersonReferencePoint(
    bbox: BoundingBox | number[],
    frameWidth: number = 1280,
    frameHeight: number = 720
  ): Point2D {
    let ymin = 0;
    let xmin = 0;
    let ymax = 0;
    let xmax = 0;

    if (Array.isArray(bbox) && bbox.length >= 4) {
      // Format: [ymin, xmin, ymax, xmax]
      ymin = Number(bbox[0]) || 0;
      xmin = Number(bbox[1]) || 0;
      ymax = Number(bbox[2]) || 0;
      xmax = Number(bbox[3]) || 0;
    } else if (typeof bbox === 'object' && bbox !== null) {
      ymin = Number((bbox as BoundingBox).ymin) || 0;
      xmin = Number((bbox as BoundingBox).xmin) || 0;
      ymax = Number((bbox as BoundingBox).ymax) || 0;
      xmax = Number((bbox as BoundingBox).xmax) || 0;
    }

    // Handle pixel coordinates (exceed 100) vs percentage (1.0 to 100) vs normalized (0 to 1.0)
    if (xmax > 100 || ymax > 100) {
      const fw = frameWidth > 0 ? frameWidth : 1280;
      const fh = frameHeight > 0 ? frameHeight : 720;
      xmin /= fw;
      xmax /= fw;
      ymin /= fh;
      ymax /= fh;
    } else if (xmin > 1.0 || xmax > 1.0 || ymin > 1.0 || ymax > 1.0) {
      xmin /= 100;
      xmax /= 100;
      ymin /= 100;
      ymax /= 100;
    }

    const x = Math.max(0, Math.min(1, (xmin + xmax) / 2));
    const y = Math.max(0, Math.min(1, ymax));

    return { x, y };
  }

  /**
   * Authoritative server-side schedule evaluation.
   * Checks if restriction is currently active according to configured days and time range.
   */
  public isScheduleActive(schedule?: ZoneScheduleConfig, referenceDate: Date = new Date()): boolean {
    if (!schedule || !schedule.enabled) {
      // When no schedule is configured or schedule is disabled, restriction is active 24/7 if zone is enabled
      return true;
    }

    const isUtc = schedule.timezone?.toUpperCase() === 'UTC';
    const dayIndex = isUtc ? referenceDate.getUTCDay() : referenceDate.getDay();

    // Days check (case-insensitive)
    if (schedule.days && schedule.days.length > 0) {
      const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const currentDay = daysOfWeek[dayIndex];
      const isDayMatch = schedule.days.some((d) => {
        const normD = String(d).toUpperCase().trim();
        return normD.startsWith(currentDay) || currentDay.startsWith(normD) || String(dayIndex) === normD;
      });
      if (!isDayMatch) {
        return false;
      }
    }

    // Time window check (HH:mm)
    if (!schedule.startTime || !schedule.endTime) {
      return true;
    }

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const [endH, endM] = schedule.endTime.split(':').map(Number);

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
      return true;
    }

    const hours = isUtc ? referenceDate.getUTCHours() : referenceDate.getHours();
    const minutes = isUtc ? referenceDate.getUTCMinutes() : referenceDate.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Standard daytime window (e.g., 08:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight window (e.g., 22:00 - 06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Evaluates worker authorization for a restricted zone.
   * Strictly adheres to project identity context without fabricating employees or assuming unauthorized.
   */
  public async evaluateAuthorization(
    zone: RestrictedZoneDoc,
    person: {
      trackId: string;
      employeeId?: string | null;
      employeeName?: string | null;
      identityStatus?: string;
      ppeState?: Record<string, string>;
    }
  ): Promise<{
    isAuthorized: boolean;
    violationType?: string;
    reason?: string;
    missingPPE?: string;
  }> {
    // 1. EMERGENCY Zone: Immediate hazard / evacuation zone - NO workers authorized
    if (zone.zoneType === 'EMERGENCY') {
      return {
        isAuthorized: false,
        violationType: 'restricted_zone',
        reason: `CRITICAL: Person entered emergency evacuation zone '${zone.name}'.`,
      };
    }

    // 2. Confirmed Employee Identity
    const isConfirmed = person.identityStatus === 'CONFIRMED' && Boolean(person.employeeId);
    if (isConfirmed && person.employeeId) {
      // Look up employee record
      let employee = this.store.employees.find((e) => e.employeeId === person.employeeId || e.id === person.employeeId);
      if (!employee && mongoose.connection.readyState === 1) {
        try {
          const dbEmp = await EmployeeModel.findOne({ employeeId: person.employeeId });
          if (dbEmp) employee = dbEmp.toObject() as any;
        } catch (_) {}
      }

      // Check allowed list
      const allowedEmployees = zone.allowedEmployees || [];
      const allowedRoles = zone.allowedRoles || [];
      const allowedDepartments = zone.allowedDepartments || [];

      // If no restrictions configured, all confirmed employees are authorized
      const hasSpecificAuth =
        allowedEmployees.length > 0 || allowedRoles.length > 0 || allowedDepartments.length > 0;

      let isAllowed = !hasSpecificAuth;

      if (hasSpecificAuth) {
        if (allowedEmployees.includes(person.employeeId) || (employee && (allowedEmployees.includes(employee.employeeId) || allowedEmployees.includes(employee.id)))) {
          isAllowed = true;
        }
        if (employee?.roleTitle && allowedRoles.some((r) => r.toLowerCase() === employee!.roleTitle.toLowerCase())) {
          isAllowed = true;
        }
        if (employee?.department && allowedDepartments.some((d) => d.toLowerCase() === employee!.department.toLowerCase())) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return {
          isAuthorized: false,
          violationType: 'restricted_zone',
          reason: `Unauthorized worker ${employee?.fullName || person.employeeName || person.employeeId} entered restricted zone '${zone.name}'.`,
        };
      }

      // Check required PPE for authorized worker in this high-risk/restricted zone
      if (zone.requiredPPE && zone.requiredPPE.length > 0 && person.ppeState) {
        for (const reqItem of zone.requiredPPE) {
          const normReq = reqItem.toLowerCase().trim();
          const state =
            normReq.includes('helmet') || normReq.includes('hat')
              ? person.ppeState.helmet
              : normReq.includes('vest')
              ? person.ppeState.vest
              : normReq.includes('glove')
              ? person.ppeState.gloves
              : normReq.includes('shoe') || normReq.includes('foot')
              ? person.ppeState.shoes
              : undefined;

          if (state === 'MISSING') {
            const violType = normReq.includes('helmet')
              ? 'missing_helmet'
              : normReq.includes('vest')
              ? 'missing_vest'
              : normReq.includes('glove')
              ? 'no_gloves'
              : 'no_safety_footwear';

            return {
              isAuthorized: true,
              missingPPE: reqItem,
              violationType: violType,
              reason: `Worker in ${zone.name} missing required PPE: ${reqItem.toUpperCase()}`,
            };
          }
        }
      }

      return { isAuthorized: true };
    }

    // 3. UNCONFIRMED / UNKNOWN Identity
    // Follow the zone's explicitly configured unknownIdentityPolicy
    const policy = zone.unknownIdentityPolicy || 'FLAG_UNKNOWN';

    if (policy === 'DENY') {
      return {
        isAuthorized: false,
        violationType: 'restricted_zone',
        reason: `Unidentified person entered restricted zone '${zone.name}'. Deny-on-unknown policy enforced.`,
      };
    }

    if (policy === 'FLAG_UNKNOWN') {
      return {
        isAuthorized: false,
        violationType: 'unverified_person_in_restricted_zone',
        reason: `Unconfirmed identity track ${person.trackId} observed inside restricted zone '${zone.name}'.`,
      };
    }

    // ALLOW: Permitted unless missing PPE
    return { isAuthorized: true };
  }

  /**
   * Retrieves active, non-deleted restricted zones for a camera.
   */
  public async getActiveZonesForCamera(cameraId: string): Promise<RestrictedZoneDoc[]> {
    const cleanId = (cameraId || '').trim();
    if (!cleanId) return [];

    // Resolve authoritative camera identity from store if registered
    const matchedCam = this.store.cameras.find(
      (c) =>
        (c.code && c.code.toLowerCase() === cleanId.toLowerCase()) ||
        (c.id && c.id.toLowerCase() === cleanId.toLowerCase()) ||
        (c.code && c.code.replace(/-/g, '').toLowerCase() === cleanId.replace(/-/g, '').toLowerCase())
    );

    const validIds = new Set<string>([
      cleanId.toLowerCase(),
      cleanId.replace(/-/g, '').toLowerCase(),
      ...(matchedCam?.code ? [matchedCam.code.toLowerCase(), matchedCam.code.replace(/-/g, '').toLowerCase()] : []),
      ...(matchedCam?.id ? [matchedCam.id.toLowerCase()] : []),
    ]);

    // 1. From memory
    let memZones = this.store.restrictedZones.filter(
      (z) =>
        z.zoneType !== 'LONE_WORKER_ZONE' &&
        (validIds.has((z.cameraId || '').toLowerCase()) ||
          validIds.has((z.cameraId || '').replace(/-/g, '').toLowerCase())) &&
        z.enabled &&
        !z.isDeleted
    );

    if (memZones.length > 0) {
      return memZones;
    }

    // 2. From MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const queryRegexes = Array.from(validIds).map((id) => new RegExp(`^${id}$`, 'i'));
        const dbDocs = await RestrictedZoneModel.find({
          cameraId: { $in: queryRegexes },
          zoneType: { $ne: 'LONE_WORKER_ZONE' },
          enabled: true,
          isDeleted: { $ne: true },
        });

        if (dbDocs && dbDocs.length > 0) {
          const docs = dbDocs.map((d: any) => ({
            id: d.zoneId,
            zoneId: d.zoneId,
            siteId: d.siteId,
            cameraId: d.cameraId,
            name: d.name,
            description: d.description,
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
            deletedAt: d.deletedAt,
            createdBy: d.createdBy,
            updatedBy: d.updatedBy,
            createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt ? d.updatedAt.toISOString() : new Date().toISOString(),
            version: d.version || 1,
          })) as RestrictedZoneDoc[];

          // Cache in memory
          for (const doc of docs) {
            const idx = this.store.restrictedZones.findIndex((z) => z.zoneId === doc.zoneId);
            if (idx >= 0) {
              this.store.restrictedZones[idx] = doc;
            } else {
              this.store.restrictedZones.push(doc);
            }
          }
          return docs;
        }
      } catch (err: any) {
        console.warn(`[GeofenceEngine] DB query error for camera ${cleanId}:`, err.message);
      }
    }

    return memZones;
  }

  /**
   * Evaluates tracked workers against camera-specific restricted zones.
   */
  public async evaluateTracksForCamera(
    cameraId: string,
    trackedWorkers: Array<{
      trackId: string;
      employeeId?: string | null;
      employeeName?: string | null;
      identityStatus?: string;
      ppeState?: Record<string, string>;
      bbox?: number[] | BoundingBox;
      boundingBox?: BoundingBox;
      confidence?: number;
    }>,
    frameBase64?: string,
    frameWidth: number = 1280,
    frameHeight: number = 720
  ): Promise<GeofenceBreachResult[]> {
    const zones = await this.getActiveZonesForCamera(cameraId);
    if (!zones || zones.length === 0) {
      return [];
    }

    const breaches: GeofenceBreachResult[] = [];
    const now = new Date();

    for (const zone of zones) {
      if (zone.zoneType === 'LONE_WORKER_ZONE') {
        continue;
      }

      // 1. Check schedule
      if (!this.isScheduleActive(zone.schedule, now)) {
        continue; // Restriction is currently inactive
      }

      // 2. Check each tracked worker
      for (const worker of trackedWorkers) {
        const rawBox = worker.boundingBox || worker.bbox;
        if (!rawBox) continue;

        const refPoint = this.getPersonReferencePoint(rawBox as any, frameWidth, frameHeight);
        const isInside = this.isPointInPolygon(refPoint, zone.polygon);

        if (!isInside) {
          continue; // Outside polygon
        }

        // Inside polygon: check authorization
        const auth = await this.evaluateAuthorization(zone, worker);

        const boundingBox: BoundingBox = Array.isArray(rawBox)
          ? {
              ymin: rawBox[0],
              xmin: rawBox[1],
              ymax: rawBox[2],
              xmax: rawBox[3],
              label: `${worker.trackId} | ${zone.name}`,
              color: '#EF4444',
            }
          : {
              ...(rawBox as BoundingBox),
              label: `${worker.trackId} | ${zone.name}`,
              color: '#EF4444',
            };

        if (!auth.isAuthorized || auth.missingPPE) {
          const violationType = auth.violationType || 'restricted_zone';

          // Temporal Verification to eliminate single-frame noise
          const temporalResult = this.temporalService.recordSighting({
            trackingId: worker.trackId,
            violationClass: violationType,
            zone: zone.name,
            cameraId,
            confidence: worker.confidence || 0.85,
            boundingBox,
            evidenceFrameBase64: frameBase64,
          });

          breaches.push({
            zone,
            trackId: worker.trackId,
            employeeId: worker.employeeId,
            employeeName: worker.employeeName,
            identityStatus: worker.identityStatus || 'UNCONFIRMED',
            isAuthorized: auth.isAuthorized,
            violationType,
            reason: auth.reason,
            missingPPE: auth.missingPPE,
            referencePoint: refPoint,
            boundingBox,
            temporalResult,
          });
        }
      }
    }

    return breaches;
  }

  /**
   * Evaluates if a normalized bounding box physically intersects/occupies a normalized polygon.
   */
  public doesBoundingBoxIntersectPolygon(
    bbox: BoundingBox | number[],
    polygon: Point2D[],
    frameWidth: number = 1280,
    frameHeight: number = 720
  ): boolean {
    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) return false;

    let ymin = 0, xmin = 0, ymax = 0, xmax = 0;
    if (Array.isArray(bbox) && bbox.length >= 4) {
      ymin = Number(bbox[0]) || 0;
      xmin = Number(bbox[1]) || 0;
      ymax = Number(bbox[2]) || 0;
      xmax = Number(bbox[3]) || 0;
    } else if (typeof bbox === 'object' && bbox !== null) {
      ymin = Number((bbox as BoundingBox).ymin) || 0;
      xmin = Number((bbox as BoundingBox).xmin) || 0;
      ymax = Number((bbox as BoundingBox).ymax) || 0;
      xmax = Number((bbox as BoundingBox).xmax) || 0;
    }

    if (xmax > 100 || ymax > 100) {
      const fw = frameWidth > 0 ? frameWidth : 1280;
      const fh = frameHeight > 0 ? frameHeight : 720;
      xmin /= fw; xmax /= fw; ymin /= fh; ymax /= fh;
    } else if (xmin > 1.0 || xmax > 1.0 || ymin > 1.0 || ymax > 1.0) {
      xmin /= 100; xmax /= 100; ymin /= 100; ymax /= 100;
    }

    xmin = Math.max(0, Math.min(1, xmin));
    xmax = Math.max(0, Math.min(1, xmax));
    ymin = Math.max(0, Math.min(1, ymin));
    ymax = Math.max(0, Math.min(1, ymax));

    // 1. Check representative reference points inside polygon
    const pointsToTest: Point2D[] = [
      { x: (xmin + xmax) / 2, y: ymax }, // bottom-center (ground anchor)
      { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 }, // center
      { x: xmin, y: ymin },
      { x: xmax, y: ymin },
      { x: xmin, y: ymax },
      { x: xmax, y: ymax },
      { x: (xmin + xmax) / 2, y: ymin },
      { x: xmin, y: (ymin + ymax) / 2 },
      { x: xmax, y: (ymin + ymax) / 2 },
    ];

    for (const pt of pointsToTest) {
      if (this.isPointInPolygon(pt, polygon)) {
        return true;
      }
    }

    // 2. Check if any polygon vertex is inside bounding box
    for (const polyPt of polygon) {
      if (polyPt.x >= xmin && polyPt.x <= xmax && polyPt.y >= ymin && polyPt.y <= ymax) {
        return true;
      }
    }

    return false;
  }

  /**
   * Retrieves active, non-deleted emergency safety zones for a camera.
   */
  public async getActiveEmergencyZonesForCamera(cameraId: string): Promise<EmergencyZoneDoc[]> {
    const cleanId = (cameraId || '').trim();
    if (!cleanId) return [];

    const matchedCam = this.store.cameras.find(
      (c) =>
        (c.code && c.code.toLowerCase() === cleanId.toLowerCase()) ||
        (c.id && c.id.toLowerCase() === cleanId.toLowerCase()) ||
        (c.code && c.code.replace(/-/g, '').toLowerCase() === cleanId.replace(/-/g, '').toLowerCase())
    );

    const validIds = new Set<string>([
      cleanId.toLowerCase(),
      cleanId.replace(/-/g, '').toLowerCase(),
      ...(matchedCam?.code ? [matchedCam.code.toLowerCase(), matchedCam.code.replace(/-/g, '').toLowerCase()] : []),
      ...(matchedCam?.id ? [matchedCam.id.toLowerCase()] : []),
    ]);

    // 1. From memory
    let memZones = this.store.emergencyZones.filter(
      (z) =>
        (validIds.has((z.cameraId || '').toLowerCase()) ||
          validIds.has((z.cameraId || '').replace(/-/g, '').toLowerCase())) &&
        z.enabled &&
        !z.isDeleted
    );

    if (memZones.length > 0) {
      return memZones;
    }

    // 2. From MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const queryRegexes = Array.from(validIds).map((id) => new RegExp(`^${id}$`, 'i'));
        const dbDocs = await EmergencyZoneModel.find({
          cameraId: { $in: queryRegexes },
          enabled: true,
          isDeleted: { $ne: true },
        });

        if (dbDocs && dbDocs.length > 0) {
          const docs = dbDocs.map((d: any) => ({
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
            createdBy: d.createdBy || 'SYSTEM',
            updatedBy: d.updatedBy || 'SYSTEM',
            createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt ? d.updatedAt.toISOString() : new Date().toISOString(),
            version: d.version || 1,
          })) as EmergencyZoneDoc[];

          // Cache in memory
          for (const doc of docs) {
            const idx = this.store.emergencyZones.findIndex((z) => z.zoneId === doc.zoneId);
            if (idx >= 0) {
              this.store.emergencyZones[idx] = doc;
            } else {
              this.store.emergencyZones.push(doc);
            }
          }
          return docs;
        }
      } catch (err: any) {
        console.warn(`[GeofenceEngine] Emergency DB query error for camera ${cleanId}:`, err.message);
      }
    }

    return memZones;
  }

  /**
   * Evaluates camera tracks against camera-specific emergency safety areas.
   * Detects real physical visual obstruction with temporal verification.
   */
  public async evaluateEmergencyBlockages(
    cameraId: string,
    tracks: Array<{
      trackId: string;
      objectClass?: string;
      confidence?: number;
      bbox?: number[] | BoundingBox;
      boundingBox?: BoundingBox;
    }>,
    frameBase64?: string,
    frameWidth: number = 1280,
    frameHeight: number = 720,
    frameTimestampMs?: number
  ): Promise<EmergencyBlockageResult[]> {
    const zones = await this.getActiveEmergencyZonesForCamera(cameraId);
    if (!zones || zones.length === 0) {
      return [];
    }

    const blockages: EmergencyBlockageResult[] = [];
    const now = frameTimestampMs !== undefined ? frameTimestampMs : Date.now();

    for (const zone of zones) {
      if (!zone.enabled) {
        this.emergencyZoneStates.set(zone.zoneId, {
          zoneId: zone.zoneId,
          cameraId: zone.cameraId,
          name: zone.name,
          zoneType: zone.zoneType,
          state: 'DISABLED',
          durationSec: 0,
          riskLevel: zone.riskLevel,
          lastUpdate: new Date(now).toISOString(),
          temporalThresholdSec: (zone.temporalThresholdMs || 3000) / 1000,
        });
        continue;
      }

      const allowedClasses = (zone.allowedObjectClasses && zone.allowedObjectClasses.length > 0)
        ? zone.allowedObjectClasses.map((c) => c.toLowerCase().trim())
        : ['person', 'tool'];

      // Find all tracks intersecting this emergency polygon with relevant object class
      let candidateTrack: {
        trackId: string;
        objectClass: string;
        confidence: number;
        boundingBox: BoundingBox;
        referencePoint: Point2D;
      } | null = null;

      for (const t of tracks) {
        const rawBox = t.boundingBox || t.bbox;
        if (!rawBox) continue;

        const objClass = (t.objectClass || 'person').toLowerCase().trim();
        // Model taxonomy enforcement (Section 6): only evaluate supported classes
        if (!allowedClasses.includes(objClass)) {
          continue; // Object class not relevant for this emergency area
        }

        const intersects = this.doesBoundingBoxIntersectPolygon(rawBox, zone.polygon, frameWidth, frameHeight);
        if (!intersects) {
          continue; // Outside emergency area
        }

        const refPoint = this.getPersonReferencePoint(rawBox as any, frameWidth, frameHeight);
        const boundingBox: BoundingBox = Array.isArray(rawBox)
          ? {
              ymin: rawBox[0],
              xmin: rawBox[1],
              ymax: rawBox[2],
              xmax: rawBox[3],
              label: `${t.trackId} | ${objClass.toUpperCase()}`,
              color: '#EF4444',
            }
          : {
              ...(rawBox as BoundingBox),
              label: `${t.trackId} | ${objClass.toUpperCase()}`,
              color: '#EF4444',
            };

        candidateTrack = {
          trackId: t.trackId,
          objectClass: objClass,
          confidence: t.confidence || 0.85,
          boundingBox,
          referencePoint: refPoint,
        };
        break; // evaluate primary occupant
      }

      if (!candidateTrack) {
        // If this is an empty background telemetry tick (no frameBase64 provided),
        // do not let it wipe out an active in-flight candidate or confirmed blockage.
        const prevState = this.emergencyZoneStates.get(zone.zoneId);
        if (!frameBase64 && prevState && (prevState.state === 'CANDIDATE_BLOCKAGE' || prevState.state === 'BLOCKED')) {
          continue;
        }

        if (prevState && prevState.activeTrackId) {
          this.temporalService.clearEntry(cameraId, zone.name, prevState.activeTrackId, 'emergency_route_blockage');
        }

        this.emergencyZoneStates.set(zone.zoneId, {
          zoneId: zone.zoneId,
          cameraId: zone.cameraId,
          name: zone.name,
          zoneType: zone.zoneType,
          state: 'CLEAR',
          durationSec: 0,
          riskLevel: zone.riskLevel,
          lastUpdate: new Date(now).toISOString(),
          temporalThresholdSec: (zone.temporalThresholdMs || 3000) / 1000,
        });
        continue;
      }

      // Relevant object inside emergency polygon: evaluate temporal threshold
      const thresholdMs = zone.temporalThresholdMs || 3000;
      const temporalResult = this.temporalService.recordSighting({
        trackingId: candidateTrack.trackId,
        violationClass: 'emergency_route_blockage',
        zone: zone.name,
        cameraId,
        confidence: candidateTrack.confidence,
        boundingBox: candidateTrack.boundingBox,
        evidenceFrameBase64: frameBase64,
        timestampMs: now,
        thresholdMs,
      });

      const isConfirmed = Boolean(temporalResult.isConfirmed);
      const isPastThreshold = Boolean(temporalResult.hasBeenConfirmed || temporalResult.status === 'CONFIRMED');
      const liveState = isPastThreshold ? 'BLOCKED' : 'CANDIDATE_BLOCKAGE';
      const durationSec = temporalResult.persistedDurationSec;
      const threshSec = thresholdMs / 1000;

      const whyFlagged = `Tracked object ${candidateTrack.trackId} (${candidateTrack.objectClass.toUpperCase()}) remained within configured ${zone.name} (${zone.zoneType.replace(/_/g, ' ')}) area for ${durationSec.toFixed(1)} seconds, exceeding the configured ${threshSec.toFixed(1)} second blockage threshold.`;

      this.emergencyZoneStates.set(zone.zoneId, {
        zoneId: zone.zoneId,
        cameraId: zone.cameraId,
        name: zone.name,
        zoneType: zone.zoneType,
        state: liveState,
        activeTrackId: candidateTrack.trackId,
        objectClass: candidateTrack.objectClass,
        durationSec,
        confidence: candidateTrack.confidence,
        riskLevel: zone.riskLevel,
        lastUpdate: new Date(now).toISOString(),
        temporalThresholdSec: threshSec,
      });

      blockages.push({
        zone,
        trackId: candidateTrack.trackId,
        objectClass: candidateTrack.objectClass,
        confidence: candidateTrack.confidence,
        boundingBox: candidateTrack.boundingBox,
        referencePoint: candidateTrack.referencePoint,
        isConfirmed,
        durationSec,
        temporalThresholdSec: threshSec,
        state: liveState,
        temporalResult,
        whyFlagged,
        evidenceFrameBase64: frameBase64,
      });
    }

    return blockages;
  }

  /**
   * Retrieves live states for all emergency zones, with real database truth and camera connectivity checks.
   */
  public async getEmergencyZoneStates(
    siteId?: string,
    isAiAvailable: boolean = true
  ): Promise<{
    summary: {
      totalConfigured: number;
      clearCount: number;
      candidateCount: number;
      blockedCount: number;
      offlineCount: number;
    };
    states: EmergencyZoneLiveStatus[];
  }> {
    let zones: EmergencyZoneDoc[] = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const query: any = { isDeleted: { $ne: true } };
        if (siteId) query.siteId = siteId;
        const dbDocs = await EmergencyZoneModel.find(query).lean();
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
          createdBy: d.createdBy || 'SYSTEM',
          updatedBy: d.updatedBy || 'SYSTEM',
          createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt ? d.updatedAt.toISOString() : new Date().toISOString(),
          version: d.version || 1,
        }));
      } catch (err: any) {
        console.warn('[GeofenceEngine] DB query error for getEmergencyZoneStates:', err.message);
      }
    }

    if (zones.length === 0) {
      zones = this.store.emergencyZones.filter(
        (z) => !z.isDeleted && (!siteId || z.siteId === siteId)
      );
    }

    const states: EmergencyZoneLiveStatus[] = [];
    let clearCount = 0;
    let candidateCount = 0;
    let blockedCount = 0;
    let offlineCount = 0;

    for (const zone of zones) {
      // Find camera
      const cam = this.store.cameras.find(
        (c) =>
          c.code?.toLowerCase() === zone.cameraId.toLowerCase() ||
          c.id?.toLowerCase() === zone.cameraId.toLowerCase() ||
          (c.name && c.name.toLowerCase() === zone.cameraId.toLowerCase())
      );

      const isCamOffline = !cam || cam.status === 'OFFLINE' || cam.status === 'ERROR' || cam.status === 'STREAM_ERROR' || cam.status === 'NO_FRAMES';

      let state: EmergencyZoneLiveStatus['state'] = 'CLEAR';
      let durationSec = 0;
      let activeTrackId: string | undefined = undefined;
      let objectClass: string | undefined = undefined;
      let confidence: number | undefined = undefined;

      if (!zone.enabled) {
        state = 'DISABLED';
      } else if (!isAiAvailable) {
        state = 'AI_INFERENCE_UNAVAILABLE';
        offlineCount++;
      } else if (isCamOffline) {
        state = 'CAMERA_OFFLINE';
        offlineCount++;
      } else {
        const cached = this.emergencyZoneStates.get(zone.zoneId);
        if (cached && (cached.state === 'BLOCKED' || cached.state === 'CANDIDATE_BLOCKAGE')) {
          state = cached.state;
          durationSec = cached.durationSec;
          activeTrackId = cached.activeTrackId;
          objectClass = cached.objectClass;
          confidence = cached.confidence;

          if (state === 'BLOCKED') blockedCount++;
          else candidateCount++;
        } else {
          state = 'CLEAR';
          clearCount++;
        }
      }

      states.push({
        zoneId: zone.zoneId,
        cameraId: zone.cameraId,
        name: zone.name,
        zoneType: zone.zoneType,
        state,
        activeTrackId,
        objectClass,
        durationSec,
        confidence,
        riskLevel: zone.riskLevel,
        lastUpdate: new Date().toISOString(),
        temporalThresholdSec: (zone.temporalThresholdMs || 3000) / 1000,
      });
    }

    return {
      summary: {
        totalConfigured: zones.length,
        clearCount,
        candidateCount,
        blockedCount,
        offlineCount,
      },
      states,
    };
  }

  public resetEmergencyZone(zoneId: string): void {
    this.emergencyZoneStates.delete(zoneId);
  }

  /**
   * Phase 9.3: Retrieves active, non-deleted lone-worker zones for a camera.
   */
  public async getActiveLoneWorkerZonesForCamera(cameraId: string): Promise<RestrictedZoneDoc[]> {
    const cleanId = (cameraId || '').trim();
    if (!cleanId) return [];

    const matchedCam = this.store.cameras.find(
      (c) =>
        (c.code && c.code.toLowerCase() === cleanId.toLowerCase()) ||
        (c.id && c.id.toLowerCase() === cleanId.toLowerCase()) ||
        (c.code && c.code.replace(/-/g, '').toLowerCase() === cleanId.replace(/-/g, '').toLowerCase())
    );

    const validIds = new Set<string>([
      cleanId.toLowerCase(),
      cleanId.replace(/-/g, '').toLowerCase(),
      ...(matchedCam?.code ? [matchedCam.code.toLowerCase(), matchedCam.code.replace(/-/g, '').toLowerCase()] : []),
      ...(matchedCam?.id ? [matchedCam.id.toLowerCase()] : []),
    ]);

    // 1. From MongoDB if connected (authoritative database source)
    if (mongoose.connection.readyState === 1) {
      try {
        const queryRegexes = Array.from(validIds).map((id) => new RegExp(`^${id}$`, 'i'));
        const dbDocs = await RestrictedZoneModel.find({
          cameraId: { $in: queryRegexes },
          zoneType: 'LONE_WORKER_ZONE',
          isDeleted: { $ne: true },
        }).lean();

        if (dbDocs && dbDocs.length > 0) {
          const docs = dbDocs.map((d: any) => ({
            id: d.zoneId,
            zoneId: d.zoneId,
            siteId: d.siteId,
            cameraId: d.cameraId,
            name: d.name,
            description: d.description || '',
            zoneType: 'LONE_WORKER_ZONE',
            polygon: d.polygon,
            enabled: d.enabled !== false,
            riskLevel: d.riskLevel || 'HIGH',
            allowedRoles: d.allowedRoles || [],
            allowedEmployees: d.allowedEmployees || [],
            allowedDepartments: d.allowedDepartments || [],
            unknownIdentityPolicy: d.unknownIdentityPolicy || 'FLAG_UNKNOWN',
            schedule: d.schedule,
            requiredPPE: d.requiredPPE || [],
            minimumWorkers: d.minimumWorkers !== undefined ? d.minimumWorkers : 2,
            isolationThresholdSec: d.isolationThresholdSec !== undefined ? d.isolationThresholdSec : 120,
            warningThresholdSec: d.warningThresholdSec !== undefined ? d.warningThresholdSec : 90,
            checkInRequired: d.checkInRequired !== false,
            checkInTimeoutSec: d.checkInTimeoutSec !== undefined ? d.checkInTimeoutSec : 30,
            authorizedWorkerPolicy: d.authorizedWorkerPolicy || 'ALLOW_ANY',
            isDeleted: d.isDeleted || false,
            deletedAt: d.deletedAt,
            createdBy: d.createdBy || 'SYSTEM',
            updatedBy: d.updatedBy || 'SYSTEM',
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
            version: d.version || 1,
          })) as RestrictedZoneDoc[];

          // Update memory cache
          for (const doc of docs) {
            const idx = this.store.restrictedZones.findIndex((z) => z.zoneId === doc.zoneId);
            if (idx >= 0) {
              this.store.restrictedZones[idx] = doc;
            } else {
              this.store.restrictedZones.push(doc);
            }
          }
          return docs;
        }
      } catch (err: any) {
        console.warn(`[GeofenceEngine] Lone Worker DB query error for camera ${cleanId}:`, err.message);
      }
    }

    // 2. Fallback to memory
    const memZones = this.store.restrictedZones.filter(
      (z) =>
        z.zoneType === 'LONE_WORKER_ZONE' &&
        (validIds.has((z.cameraId || '').toLowerCase()) ||
          validIds.has((z.cameraId || '').replace(/-/g, '').toLowerCase())) &&
        !z.isDeleted
    );
    return memZones;
  }

  /**
   * Phase 9.3: Evaluates camera tracks against camera-specific lone worker zones.
   * Enforces multi-worker rules, temporal verification, warning state, check-in timeout, and real evidence.
   */
  public async evaluateLoneWorkerZones(
    cameraId: string,
    tracks: Array<{
      trackId: string;
      objectClass?: string;
      confidence?: number;
      bbox?: number[] | BoundingBox;
      boundingBox?: BoundingBox;
    }>,
    frameBase64?: string,
    frameWidth: number = 1280,
    frameHeight: number = 720,
    frameTimestampMs?: number
  ): Promise<LoneWorkerEvaluationResult[]> {
    const zones = await this.getActiveLoneWorkerZonesForCamera(cameraId);
    if (!zones || zones.length === 0) {
      return [];
    }

    const results: LoneWorkerEvaluationResult[] = [];
    const now = frameTimestampMs !== undefined ? frameTimestampMs : Date.now();

    for (const zone of zones) {
      const minWorkers = zone.minimumWorkers !== undefined && zone.minimumWorkers > 0 ? zone.minimumWorkers : 2;
      const warningThreshSec = zone.warningThresholdSec !== undefined ? zone.warningThresholdSec : 90;
      const isolationThreshSec = zone.isolationThresholdSec !== undefined ? zone.isolationThresholdSec : 120;
      const checkInReq = zone.checkInRequired !== false;
      const checkInTimeout = zone.checkInTimeoutSec !== undefined ? zone.checkInTimeoutSec : 30;

      if (!zone.enabled) {
        this.loneWorkerStates.set(zone.zoneId, {
          zoneId: zone.zoneId,
          cameraId: zone.cameraId,
          name: zone.name,
          zoneType: 'LONE_WORKER_ZONE',
          state: 'DISABLED',
          workerCount: 0,
          minimumWorkers: minWorkers,
          durationSec: 0,
          warningThresholdSec: warningThreshSec,
          isolationThresholdSec: isolationThreshSec,
          checkInRequired: checkInReq,
          checkInTimeoutSec: checkInTimeout,
          checkInPending: false,
          riskLevel: zone.riskLevel || 'HIGH',
          lastUpdate: new Date(now).toISOString(),
        });
        continue;
      }

      // Filter tracks for human persons / workers
      const personTracks = (tracks || []).filter((t) => {
        const cls = (t.objectClass || 'person').toLowerCase().trim();
        return cls === 'person' || cls === 'worker';
      });

      // Find all occupants inside the lone worker polygon using foot point
      const occupants: Array<{
        trackId: string;
        confidence: number;
        boundingBox: BoundingBox;
        refPoint: Point2D;
      }> = [];

      for (const t of personTracks) {
        const rawBox = t.boundingBox || t.bbox;
        if (!rawBox) continue;

        const refPoint = this.getPersonReferencePoint(rawBox as any, frameWidth, frameHeight);
        if (this.isPointInPolygon(refPoint, zone.polygon)) {
          let ymin = 0, xmin = 0, ymax = 0, xmax = 0;
          if (Array.isArray(rawBox) && rawBox.length >= 4) {
            ymin = Number(rawBox[0]); xmin = Number(rawBox[1]); ymax = Number(rawBox[2]); xmax = Number(rawBox[3]);
          } else if (typeof rawBox === 'object' && rawBox !== null) {
            ymin = Number((rawBox as BoundingBox).ymin); xmin = Number((rawBox as BoundingBox).xmin);
            ymax = Number((rawBox as BoundingBox).ymax); xmax = Number((rawBox as BoundingBox).xmax);
          }

          const boundingBox: BoundingBox = {
            ymin,
            xmin,
            ymax,
            xmax,
            label: `${t.trackId} | WORKER`,
            color: '#06B6D4',
          };

          occupants.push({
            trackId: t.trackId,
            confidence: t.confidence || 0.85,
            boundingBox,
            refPoint,
          });
        }
      }

      const workerCount = occupants.length;
      let hist = this.loneWorkerTrackHistory.get(zone.zoneId);

      // Case 1: Minimum worker threshold satisfied (No isolation violation)
      if (workerCount >= minWorkers) {
        if (hist && (now - hist.firstSeenMs) > 1000) {
          // Condition resolved by joining worker(s)
          this.socketService.emit('lone_worker.resolved', {
            cameraId: zone.cameraId,
            zoneId: zone.zoneId,
            zoneName: zone.name,
            trackId: hist.trackId,
            workerCount,
            minimumWorkers: minWorkers,
            resolutionReason: `Worker joined by partner(s) (${workerCount}/${minWorkers} workers present)`,
            timestamp: new Date(now).toISOString(),
          });
        }
        this.loneWorkerTrackHistory.delete(zone.zoneId);

        this.loneWorkerStates.set(zone.zoneId, {
          zoneId: zone.zoneId,
          cameraId: zone.cameraId,
          name: zone.name,
          zoneType: 'LONE_WORKER_ZONE',
          state: 'CLEAR',
          workerCount,
          minimumWorkers: minWorkers,
          durationSec: 0,
          warningThresholdSec: warningThreshSec,
          isolationThresholdSec: isolationThreshSec,
          checkInRequired: checkInReq,
          checkInTimeoutSec: checkInTimeout,
          checkInPending: false,
          riskLevel: zone.riskLevel || 'HIGH',
          lastUpdate: new Date(now).toISOString(),
        });
        continue;
      }

      // Case 2: Zero workers inside zone
      if (workerCount === 0) {
        // Track loss grace period: absorb temporary detector dropouts (<= 2.5s)
        if (hist && (now - hist.lastSeenMs) <= 2500) {
          // Maintain current state during temporary dropout
          const cached = this.loneWorkerStates.get(zone.zoneId);
          if (cached) {
            this.loneWorkerStates.set(zone.zoneId, {
              ...cached,
              lastUpdate: new Date(now).toISOString(),
            });
          }
          continue;
        }

        if (hist) {
          // Genuine exit after grace period
          this.socketService.emit('lone_worker.resolved', {
            cameraId: zone.cameraId,
            zoneId: zone.zoneId,
            zoneName: zone.name,
            trackId: hist.trackId,
            workerCount: 0,
            minimumWorkers: minWorkers,
            resolutionReason: 'Worker exited lone worker zone',
            timestamp: new Date(now).toISOString(),
          });
          this.loneWorkerTrackHistory.delete(zone.zoneId);
        }

        this.loneWorkerStates.set(zone.zoneId, {
          zoneId: zone.zoneId,
          cameraId: zone.cameraId,
          name: zone.name,
          zoneType: 'LONE_WORKER_ZONE',
          state: 'CLEAR',
          workerCount: 0,
          minimumWorkers: minWorkers,
          durationSec: 0,
          warningThresholdSec: warningThreshSec,
          isolationThresholdSec: isolationThreshSec,
          checkInRequired: checkInReq,
          checkInTimeoutSec: checkInTimeout,
          checkInPending: false,
          riskLevel: zone.riskLevel || 'HIGH',
          lastUpdate: new Date(now).toISOString(),
        });
        continue;
      }

      // Case 3: 0 < workerCount < minWorkers -> Worker is isolated!
      const primaryOccupant = occupants[0];
      if (!hist || hist.trackId !== primaryOccupant.trackId) {
        hist = {
          firstSeenMs: now,
          lastSeenMs: now,
          trackId: primaryOccupant.trackId,
          checkedIn: false,
        };
        this.loneWorkerTrackHistory.set(zone.zoneId, hist);
      } else {
        hist.lastSeenMs = now;
      }

      const durationSec = Math.max(0, (now - hist.firstSeenMs) / 1000);
      let state: LoneWorkerState['state'] = 'ISOLATED';
      let isConfirmedIncident = false;
      let checkInPending = false;

      if (durationSec < warningThreshSec) {
        state = 'INSIDE_CANDIDATE';
      } else if (durationSec >= warningThreshSec && durationSec < isolationThreshSec) {
        state = 'WARNING';
        if (!hist.lastWarningMs || (now - hist.lastWarningMs) >= 5000) {
          hist.lastWarningMs = now;
          this.socketService.emit('lone_worker.warning', {
            cameraId: zone.cameraId,
            zoneId: zone.zoneId,
            zoneName: zone.name,
            trackId: primaryOccupant.trackId,
            workerCount,
            minimumWorkers: minWorkers,
            durationSec,
            warningThresholdSec: warningThreshSec,
            isolationThresholdSec: isolationThreshSec,
            timestamp: new Date(now).toISOString(),
          });
        }
      } else if (durationSec >= isolationThreshSec) {
        if (checkInReq) {
          if (hist.checkedIn) {
            state = 'RESOLVED';
          } else {
            const checkInElapsed = durationSec - isolationThreshSec;
            if (checkInElapsed < checkInTimeout) {
              state = 'CHECK_IN_REQUIRED';
              checkInPending = true;
              if (!hist.lastCheckInReqMs || (now - hist.lastCheckInReqMs) >= 5000) {
                hist.lastCheckInReqMs = now;
                this.socketService.emit('lone_worker.checkin_required', {
                  cameraId: zone.cameraId,
                  zoneId: zone.zoneId,
                  zoneName: zone.name,
                  trackId: primaryOccupant.trackId,
                  workerCount,
                  minimumWorkers: minWorkers,
                  durationSec,
                  checkInTimeoutSec: checkInTimeout,
                  remainingSec: Math.max(0, checkInTimeout - checkInElapsed),
                  timestamp: new Date(now).toISOString(),
                });
              }
            } else {
              state = 'INCIDENT';
              isConfirmedIncident = true;
            }
          }
        } else {
          state = 'INCIDENT';
          isConfirmedIncident = true;
        }
      }

      // Record live status
      this.loneWorkerStates.set(zone.zoneId, {
        zoneId: zone.zoneId,
        cameraId: zone.cameraId,
        name: zone.name,
        zoneType: 'LONE_WORKER_ZONE',
        state,
        activeTrackId: primaryOccupant.trackId,
        workerCount,
        minimumWorkers: minWorkers,
        durationSec,
        warningThresholdSec: warningThreshSec,
        isolationThresholdSec: isolationThreshSec,
        checkInRequired: checkInReq,
        checkInTimeoutSec: checkInTimeout,
        checkInPending,
        lastCheckInAt: hist.lastCheckInAt,
        lastCheckInBy: hist.lastCheckInBy,
        riskLevel: zone.riskLevel || 'HIGH',
        lastUpdate: new Date(now).toISOString(),
      });

      // Section 10 & 20: Duplicate Incident Protection (60s cooldown per event)
      if (isConfirmedIncident) {
        if (!hist.lastIncidentMs || (now - hist.lastIncidentMs) >= 60000) {
          hist.lastIncidentMs = now;
          results.push({
            zone,
            trackId: primaryOccupant.trackId,
            workerCount,
            minimumWorkers: minWorkers,
            durationSec,
            warningThresholdSec: warningThreshSec,
            isolationThresholdSec: isolationThreshSec,
            checkInRequired: checkInReq,
            checkInTimeoutSec: checkInTimeout,
            state,
            isConfirmedIncident: true,
            confidence: primaryOccupant.confidence,
            boundingBox: primaryOccupant.boundingBox,
            whyFlagged: `Worker ${primaryOccupant.trackId} isolated for ${durationSec.toFixed(1)}s in ${zone.name} (Threshold: ${isolationThreshSec}s, Minimum: ${minWorkers} workers)`,
            evidenceFrameBase64: frameBase64,
          });
        }
      }
    }

    return results;
  }

  /**
   * Phase 9.3: Performs authoritative check-in resolution for an isolated worker.
   */
  public performLoneWorkerCheckIn(
    zoneId: string,
    trackId: string,
    operator: string,
    reason: string = 'Authorized safety check-in verified'
  ): { success: boolean; message: string; state?: LoneWorkerState } {
    const hist = this.loneWorkerTrackHistory.get(zoneId);
    const cached = this.loneWorkerStates.get(zoneId);

    if (!cached) {
      return { success: false, message: 'Lone worker zone state not active' };
    }

    const nowIso = new Date().toISOString();
    if (hist) {
      hist.checkedIn = true;
      hist.lastCheckInAt = nowIso;
      hist.lastCheckInBy = operator;
    }

    const updatedState: LoneWorkerState = {
      ...cached,
      state: 'RESOLVED',
      checkInPending: false,
      lastCheckInAt: nowIso,
      lastCheckInBy: operator,
      lastResolutionReason: reason,
      lastUpdate: nowIso,
    };
    this.loneWorkerStates.set(zoneId, updatedState);

    this.socketService.emit('lone_worker.resolved', {
      cameraId: cached.cameraId,
      zoneId: cached.zoneId,
      zoneName: cached.name,
      trackId: trackId || cached.activeTrackId,
      resolutionReason: `Authorized check-in completed by ${operator}: ${reason}`,
      operator,
      timestamp: nowIso,
    });

    return { success: true, message: 'Check-in recorded successfully', state: updatedState };
  }

  /**
   * Phase 9.3: Returns live status of all lone worker zones for dashboard & API telemetry.
   */
  public async getLoneWorkerStates(
    siteId?: string,
    isAiAvailable: boolean = true,
    offlineCameraIds: Set<string> = new Set()
  ): Promise<{
    summary: {
      totalConfigured: number;
      activeIsolatedCount: number;
      warningCount: number;
      checkInRequiredCount: number;
      openIncidentsCount: number;
      safeCount: number;
      offlineCount: number;
    };
    states: LoneWorkerState[];
  }> {
    let zones: RestrictedZoneDoc[] = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const query: any = { zoneType: 'LONE_WORKER_ZONE', isDeleted: { $ne: true } };
        if (siteId) query.siteId = siteId;
        const dbDocs = await RestrictedZoneModel.find(query).lean();
        zones = dbDocs.map((d: any) => ({
          id: d.zoneId,
          zoneId: d.zoneId,
          siteId: d.siteId,
          cameraId: d.cameraId,
          name: d.name,
          description: d.description || '',
          zoneType: 'LONE_WORKER_ZONE',
          polygon: d.polygon,
          enabled: d.enabled !== false,
          riskLevel: d.riskLevel || 'HIGH',
          allowedRoles: d.allowedRoles || [],
          allowedEmployees: d.allowedEmployees || [],
          allowedDepartments: d.allowedDepartments || [],
          unknownIdentityPolicy: d.unknownIdentityPolicy || 'FLAG_UNKNOWN',
          schedule: d.schedule,
          requiredPPE: d.requiredPPE || [],
          minimumWorkers: d.minimumWorkers !== undefined ? d.minimumWorkers : 2,
          isolationThresholdSec: d.isolationThresholdSec !== undefined ? d.isolationThresholdSec : 120,
          warningThresholdSec: d.warningThresholdSec !== undefined ? d.warningThresholdSec : 90,
          checkInRequired: d.checkInRequired !== false,
          checkInTimeoutSec: d.checkInTimeoutSec !== undefined ? d.checkInTimeoutSec : 30,
          authorizedWorkerPolicy: d.authorizedWorkerPolicy || 'ALLOW_ANY',
          isDeleted: d.isDeleted || false,
          deletedAt: d.deletedAt,
          createdBy: d.createdBy || 'SYSTEM',
          updatedBy: d.updatedBy || 'SYSTEM',
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
          version: d.version || 1,
        }));
      } catch (err: any) {
        console.warn('[GeofenceEngine] DB query error for getLoneWorkerStates:', err.message);
      }
    }

    if (zones.length === 0) {
      zones = this.store.restrictedZones.filter(
        (z) => z.zoneType === 'LONE_WORKER_ZONE' && !z.isDeleted && (!siteId || z.siteId === siteId)
      );
    }

    const states: LoneWorkerState[] = [];
    let activeIsolatedCount = 0;
    let warningCount = 0;
    let checkInRequiredCount = 0;
    let openIncidentsCount = 0;
    let safeCount = 0;
    let offlineCount = 0;

    for (const zone of zones) {
      const cam = this.store.cameras.find(
        (c) =>
          c.code?.toLowerCase() === zone.cameraId.toLowerCase() ||
          c.id?.toLowerCase() === zone.cameraId.toLowerCase() ||
          (c.name && c.name.toLowerCase() === zone.cameraId.toLowerCase())
      );

      const cached = this.loneWorkerStates.get(zone.zoneId);
      const isRecentlyActive = cached && cached.lastUpdate && (Date.now() - new Date(cached.lastUpdate).getTime() < 10000);

      const isCamOffline =
        !isRecentlyActive && (
          !cam ||
          offlineCameraIds.has(zone.cameraId.toLowerCase()) ||
          cam.status === 'OFFLINE' ||
          cam.status === 'ERROR' ||
          cam.status === 'STREAM_ERROR' ||
          cam.status === 'NO_FRAMES'
        );

      const minWorkers = zone.minimumWorkers !== undefined && zone.minimumWorkers > 0 ? zone.minimumWorkers : 2;
      const warningThresh = zone.warningThresholdSec !== undefined ? zone.warningThresholdSec : 90;
      const isolationThresh = zone.isolationThresholdSec !== undefined ? zone.isolationThresholdSec : 120;
      const checkInReq = zone.checkInRequired !== false;
      const checkInTimeout = zone.checkInTimeoutSec !== undefined ? zone.checkInTimeoutSec : 30;

      let state: LoneWorkerState['state'] = 'CLEAR';
      let durationSec = 0;
      let activeTrackId: string | undefined = undefined;
      let workerCount = 0;
      let checkInPending = false;
      let lastCheckInAt: string | undefined = undefined;
      let lastCheckInBy: string | undefined = undefined;

      if (!zone.enabled) {
        state = 'DISABLED';
      } else if (!isAiAvailable) {
        state = 'AI_INFERENCE_UNAVAILABLE';
        offlineCount++;
      } else if (isCamOffline) {
        state = 'CAMERA_OFFLINE';
        offlineCount++;
      } else {
        if (cached) {
          state = cached.state;
          durationSec = cached.durationSec;
          activeTrackId = cached.activeTrackId;
          workerCount = cached.workerCount;
          checkInPending = cached.checkInPending;
          lastCheckInAt = cached.lastCheckInAt;
          lastCheckInBy = cached.lastCheckInBy;

          if (state === 'INCIDENT') openIncidentsCount++;
          else if (state === 'CHECK_IN_REQUIRED') checkInRequiredCount++;
          else if (state === 'WARNING') warningCount++;
          else if (state === 'ISOLATED' || state === 'INSIDE_CANDIDATE') activeIsolatedCount++;
          else safeCount++;
        } else {
          state = 'CLEAR';
          safeCount++;
        }
      }

      states.push({
        zoneId: zone.zoneId,
        cameraId: zone.cameraId,
        name: zone.name,
        zoneType: 'LONE_WORKER_ZONE',
        state,
        activeTrackId,
        workerCount,
        minimumWorkers: minWorkers,
        durationSec,
        warningThresholdSec: warningThresh,
        isolationThresholdSec: isolationThresh,
        checkInRequired: checkInReq,
        checkInTimeoutSec: checkInTimeout,
        checkInPending,
        lastCheckInAt,
        lastCheckInBy,
        riskLevel: zone.riskLevel || 'HIGH',
        lastUpdate: new Date().toISOString(),
      });
    }

    return {
      summary: {
        totalConfigured: zones.length,
        activeIsolatedCount,
        warningCount,
        checkInRequiredCount,
        openIncidentsCount,
        safeCount,
        offlineCount,
      },
      states,
    };
  }

  public resetLoneWorkerZone(zoneId: string): void {
    this.loneWorkerStates.delete(zoneId);
    this.loneWorkerTrackHistory.delete(zoneId);
  }
}
