import mongoose from 'mongoose';
import { SocketService } from '../socket/SocketService';
import { DataStore, RestrictedZoneDoc } from '../../models/DataStore';
import {
  IncidentModel,
  EmployeeModel,
  CameraModel,
  ShiftModel,
  HazardReportModel,
  ZoneSafetyPolicyModel,
  NearMissModel,
  RestrictedZoneModel,
} from '../../models/mongooseModels';

export class ChangeStreamWatcher {
  private static instance: ChangeStreamWatcher;
  private isWatching = false;
  private resumeTokens: Map<string, any> = new Map();
  private socketService = SocketService.getInstance();

  private constructor() {}

  public static getInstance(): ChangeStreamWatcher {
    if (!ChangeStreamWatcher.instance) {
      ChangeStreamWatcher.instance = new ChangeStreamWatcher();
    }
    return ChangeStreamWatcher.instance;
  }

  public async start(): Promise<void> {
    if (this.isWatching) return;

    if (mongoose.connection.readyState !== 1) {
      console.log('[ChangeStreamWatcher] MongoDB not connected; change streams waiting for DB connection.');
      mongoose.connection.once('open', () => this.start());
      return;
    }

    try {
      this.isWatching = true;
      console.log('[ChangeStreamWatcher] Initializing MongoDB Change Streams on collections...');

      this.watchIncidents();
      this.watchEmployees();
      this.watchCameras();
      this.watchShifts();
      this.watchHazards();
      this.watchZonePolicies();
      this.watchNearMisses();
      this.watchRestrictedZones();
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Change streams initialization notice:', err.message);
      this.isWatching = false;
    }
  }

  private watchIncidents(): void {
    try {
      const options: any = { fullDocument: 'updateLookup' };
      const resumeToken = this.resumeTokens.get('incidents');
      if (resumeToken) options.resumeAfter = resumeToken;

      const stream = IncidentModel.watch([], options);

      stream.on('change', (change: any) => {
        if (change._id) this.resumeTokens.set('incidents', change._id);

        const op = change.operationType;
        const doc = change.fullDocument;
        if (!doc) return;

        let eventType = 'incident.updated';
        if (op === 'insert') {
          eventType = 'incident.created';
        } else if (doc.status === 'ACKNOWLEDGED') {
          eventType = 'incident.acknowledged';
        } else if (doc.status === 'DISPATCHED') {
          eventType = 'incident.dispatched';
        } else if (doc.status === 'RESOLVED') {
          eventType = 'incident.resolved';
        } else if (doc.status === 'FALSE_POSITIVE') {
          eventType = 'incident.false_positive';
        }

        this.socketService.emitRealtimeEvent(
          eventType,
          {
            incident: doc,
          },
          {
            entityType: 'incident',
            entityId: doc.incidentId,
            siteId: doc.siteId || 'SITE-01',
            zoneId: doc.zone,
            version: doc.version || 1,
          }
        );

        if (op === 'insert') {
          this.socketService.emitAnalyticsSummaryUpdate({
            timestamp: doc.timestamp,
            cameraId: doc.cameraId,
            zoneId: doc.zoneId || doc.zone,
            violationType: doc.violationType,
            severity: doc.severity,
          });
        }
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] Incident stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Incidents change stream unsupported or inactive:', err.message);
    }
  }

  private watchEmployees(): void {
    try {
      const stream = EmployeeModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;
        if (!doc) return;

        // Strip any sensitive biometric templates before broadcasting
        const safeEmployee = {
          id: doc.id,
          employeeId: doc.employeeId,
          name: doc.name,
          department: doc.department,
          role: doc.role,
          siteId: doc.siteId,
          zoneId: doc.zoneId,
          shift: doc.shift,
          status: doc.status,
          assignedZone: doc.assignedZone,
          updatedAt: doc.updatedAt,
        };

        const eventType = op === 'insert' ? 'employee.created' : 'employee.updated';

        this.socketService.emitRealtimeEvent(
          eventType,
          { employee: safeEmployee },
          {
            entityType: 'employee',
            entityId: doc.employeeId || doc.id,
            siteId: doc.siteId || 'SITE-01',
            zoneId: doc.zoneId,
          }
        );
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] Employee stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Employee change stream unsupported:', err.message);
    }
  }

  private watchCameras(): void {
    try {
      const stream = CameraModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;
        if (!doc) return;

        let eventType = 'camera.updated';
        if (op === 'insert') {
          eventType = 'camera.created';
        } else if (doc.status === 'LIVE') {
          eventType = 'camera.online';
        } else if (doc.status === 'OFFLINE') {
          eventType = 'camera.offline';
        }

        // Never expose RTSP credentials in socket payloads
        const safeCam = {
          id: doc.id,
          name: doc.name,
          code: doc.code,
          zone: doc.zone,
          status: doc.status,
          fps: doc.fps,
          resolution: doc.resolution,
          latencyMs: doc.latencyMs,
          lastHeartbeat: doc.lastHeartbeat,
        };

        this.socketService.emitRealtimeEvent(
          eventType,
          { camera: safeCam },
          {
            entityType: 'camera',
            entityId: doc.code || doc.id,
            zoneId: doc.zone,
          }
        );
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] Camera stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Camera change stream unsupported:', err.message);
    }
  }

  private watchShifts(): void {
    try {
      const stream = ShiftModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;

        const eventType =
          op === 'insert' ? 'shift.created' : op === 'delete' ? 'shift.deleted' : 'shift.updated';

        this.socketService.emitRealtimeEvent(
          eventType,
          { shift: doc, deletedId: op === 'delete' ? change.documentKey?._id : undefined },
          {
            entityType: 'shift',
            entityId: doc?.id || String(change.documentKey?._id || 'SHIFT'),
          }
        );
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] Shift stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Shift change stream unsupported:', err.message);
    }
  }

  private watchHazards(): void {
    try {
      const stream = HazardReportModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;
        if (!doc) return;

        if (op === 'insert') {
          this.socketService.emitRealtimeEvent(
            'hazard.created',
            { hazard: doc },
            {
              entityType: 'hazard',
              entityId: doc.hazardReportId || doc.id,
              zoneId: doc.zoneName,
            }
          );
        }
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] Hazard stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] Hazard change stream unsupported:', err.message);
    }
  }

  private watchZonePolicies(): void {
    try {
      const stream = ZoneSafetyPolicyModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const doc = change.fullDocument;
        if (!doc) return;

        this.socketService.emitRealtimeEvent(
          'policy.updated',
          { policy: doc },
          {
            entityType: 'zone_safety_policy',
            entityId: doc.policyId,
            siteId: doc.siteId,
            zoneId: doc.zoneId,
            version: doc.version,
          }
        );
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] ZonePolicy stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] ZonePolicy change stream unsupported:', err.message);
    }
  }

  private watchNearMisses(): void {
    try {
      const stream = NearMissModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;
        if (!doc) return;

        if (op === 'insert') {
          this.socketService.emitRealtimeEvent(
            'near_miss.created',
            { nearMiss: doc },
            {
              entityType: 'near_miss',
              entityId: doc.nearMissId,
              siteId: doc.siteId,
              zoneId: doc.zoneId,
            }
          );
        }
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] NearMiss stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] NearMiss change stream unsupported:', err.message);
    }
  }

  private watchRestrictedZones(): void {
    try {
      const stream = RestrictedZoneModel.watch([], { fullDocument: 'updateLookup' });

      stream.on('change', (change: any) => {
        const op = change.operationType;
        const doc = change.fullDocument;
        const store = DataStore.getInstance();

        if ((op === 'insert' || op === 'update' || op === 'replace') && doc) {
          const zoneObj: RestrictedZoneDoc = {
            id: doc.zoneId || doc.id || String(doc._id),
            zoneId: doc.zoneId,
            siteId: doc.siteId || 'site-rsp-1',
            cameraId: doc.cameraId,
            name: doc.name,
            description: doc.description,
            zoneType: doc.zoneType,
            polygon: doc.polygon || [],
            enabled: doc.enabled !== false,
            riskLevel: doc.riskLevel,
            allowedRoles: doc.allowedRoles || [],
            allowedEmployees: doc.allowedEmployees || [],
            allowedDepartments: doc.allowedDepartments || [],
            unknownIdentityPolicy: doc.unknownIdentityPolicy || 'FLAG_UNKNOWN',
            schedule: doc.schedule,
            requiredPPE: doc.requiredPPE || [],
            isDeleted: doc.isDeleted === true,
            version: doc.version || 1,
            createdBy: doc.createdBy || 'SYSTEM',
            updatedBy: doc.updatedBy || 'SYSTEM',
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
          };

          const idx = store.restrictedZones.findIndex((z) => z.zoneId === zoneObj.zoneId);
          if (idx >= 0) {
            store.restrictedZones[idx] = zoneObj;
          } else {
            store.restrictedZones.push(zoneObj);
          }

          const eventName = op === 'insert' ? 'restricted_zone.created' : 'restricted_zone.updated';
          this.socketService.emitRealtimeEvent(
            eventName,
            { zone: zoneObj },
            {
              entityType: 'restricted_zone',
              entityId: zoneObj.zoneId,
              zoneId: zoneObj.name,
            }
          );
        } else if (op === 'delete') {
          const deletedId = String(change.documentKey?._id || '');
          store.restrictedZones = store.restrictedZones.filter(
            (z) => z.id !== deletedId && (z as any)._id?.toString() !== deletedId
          );
          this.socketService.emitRealtimeEvent(
            'restricted_zone.deleted',
            { zoneId: deletedId },
            {
              entityType: 'restricted_zone',
              entityId: deletedId,
            }
          );
        }
      });

      stream.on('error', (err: any) => {
        console.warn('[ChangeStreamWatcher] RestrictedZone stream notice:', err.message);
      });
    } catch (err: any) {
      console.warn('[ChangeStreamWatcher] RestrictedZone change stream unsupported:', err.message);
    }
  }
}

