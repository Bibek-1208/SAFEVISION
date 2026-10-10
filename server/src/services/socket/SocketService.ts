import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';
import { IncidentDoc, ShiftDoc, EmployeeDoc, AuditLogDoc, NotificationDoc, DataStore, UserDoc } from '../../models/DataStore';

export interface RealtimeEventEnvelope<T = any> {
  eventId: string;
  entityType: string;
  entityId: string;
  siteId?: string;
  zoneId?: string;
  version?: number;
  timestamp: string;
  payload: T;
}

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public init(httpServer: HTTPServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH'],
      },
    });

    // 1. Socket Authentication & RBAC/SBAC Room Assignment Middleware
    this.io.use((socket: Socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.split(' ')[1]);

      if (!token) {
        // Allow unauthenticated connection with public health-only room
        socket.data.user = null;
        return next();
      }

      try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
        const store = DataStore.getInstance();
        const user = store.users.find((u) => u.id === decoded.id);
        if (user && user.status !== 'DISABLED') {
          socket.data.user = user;
        } else {
          socket.data.user = null;
        }
        next();
      } catch (err) {
        socket.data.user = null;
        next();
      }
    });

    // 2. Connection Handler
    this.io.on('connection', (socket: Socket) => {
      const user: UserDoc | null = socket.data.user;

      if (user) {
        console.log(`[SocketService] Authenticated user connected: ${user.email} (${user.role}) [Socket: ${socket.id}]`);
        // Join authorized backend-determined rooms ONLY
        socket.join(`user:${user.id}`);
        socket.join(`role:${user.role}`);

        if (Array.isArray(user.siteIds)) {
          user.siteIds.forEach((sid) => socket.join(`site:${sid}`));
        }

        if (Array.isArray(user.zoneIds)) {
          user.zoneIds.forEach((zid) => {
            socket.join(`zone:${zid}`);
            socket.join(`zone:${zid.toLowerCase()}`);
          });
        }

        // Global supervisor / admin room
        if (user.role === 'ADMIN' || user.role === 'PLANT_MANAGER') {
          socket.join('admin:all');
          socket.join('zone:*');
        }
      } else {
        console.log(`[SocketService] Anonymous client connected [Socket: ${socket.id}]`);
        socket.join('public:health');
      }

      // Initial truthful system beacon
      const store = DataStore.getInstance();
      const liveCameras = store.cameras.filter((c) => c.status === 'LIVE').length;
      socket.emit('system:health', {
        status: liveCameras > 0 ? 'HEALTHY' : 'DEGRADED',
        aiEngine: 'ONLINE',
        camerasConnected: liveCameras,
        totalCameras: store.cameras.length,
        dbStatus: 'HEALTHY',
        realtimeStatus: 'CONNECTED',
        lastSync: new Date().toISOString(),
        uptime: process.uptime(),
      });

      socket.on('disconnect', () => {
        // Cleanup handled by Socket.IO
      });
    });

    return this.io;
  }

  public get isInitialized(): boolean {
    return this.io !== null;
  }

  /**
   * Dispatches a scoped realtime event strictly to authorized rooms.
   */
  public emitRealtimeEvent<T>(
    eventName: string,
    payload: T,
    options: {
      entityType?: string;
      entityId?: string;
      siteId?: string;
      zoneId?: string;
      targetRoles?: string[];
      targetUserId?: string;
      version?: number;
    } = {}
  ): void {
    if (!this.io) return;

    const envelope: RealtimeEventEnvelope<T> = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      entityType: options.entityType || 'SYSTEM',
      entityId: options.entityId || 'SYS-01',
      siteId: options.siteId,
      zoneId: options.zoneId,
      version: options.version || 1,
      timestamp: new Date().toISOString(),
      payload,
    };

    // Determine target rooms
    const targetRooms = new Set<string>();

    // Admins always receive operational events
    targetRooms.add('role:ADMIN');
    targetRooms.add('role:PLANT_MANAGER');

    if (options.targetRoles) {
      options.targetRoles.forEach((r) => targetRooms.add(`role:${r.toUpperCase()}`));
    }

    if (options.targetUserId) {
      targetRooms.add(`user:${options.targetUserId}`);
    }

    if (options.siteId) {
      targetRooms.add(`site:${options.siteId}`);
    }

    if (options.zoneId) {
      targetRooms.add(`zone:${options.zoneId}`);
      targetRooms.add(`zone:${options.zoneId.toLowerCase()}`);
      targetRooms.add('zone:*');
    }

    // Safety officers receive zone/safety events
    targetRooms.add('role:SAFETY_OFFICER');

    // Emit to rooms
    targetRooms.forEach((room) => {
      this.io!.to(room).emit(eventName, envelope);
    });

    // Also support backward-compatible un-nested event for existing dashboard listeners
    targetRooms.forEach((room) => {
      this.io!.to(room).emit(eventName, payload);
    });
  }

  public emitNewIncident(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:new', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
      targetRoles: ['SAFETY_OFFICER', 'SUPERVISOR', 'PLANT_MANAGER', 'ADMIN'],
    });
    this.emitRealtimeEvent('incident.created', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
    this.emitAnalyticsSummaryUpdate({
      timestamp: incident.timestamp,
      cameraId: incident.cameraId,
      zoneId: incident.zoneId || incident.zone,
      violationType: incident.violationType,
      severity: incident.severity,
    });
  }

  /**
   * Lightweight analytics summary update for Phase 10.1
   */
  public emitAnalyticsSummaryUpdate(update: {
    timestamp: Date | string;
    cameraId: string;
    zoneId: string;
    violationType: string;
    severity: string;
  }): void {
    if (!this.io) return;
    this.io.emit('analytics:summary_update', update);
  }

  public emitIncidentUpdated(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:updated', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
  }

  public emitIncidentAcknowledged(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:acknowledged', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
    this.emitIncidentUpdated(incident);
  }

  public emitIncidentDispatched(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:dispatched', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
    this.emitIncidentUpdated(incident);
  }

  public emitIncidentResolved(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:resolved', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
    this.emitIncidentUpdated(incident);
  }

  public emitIncidentFalsePositive(incident: IncidentDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('incident:false_positive', incident, {
      entityType: 'INCIDENT',
      entityId: incident.incidentId,
      siteId: incident.siteId || 'site-rsp-1',
      zoneId: incident.zoneId || incident.zone,
      version: incident.version || 1,
    });
    this.emitIncidentUpdated(incident);
  }

  public emitCameraStatus(cameraId: string, status: 'ONLINE' | 'OFFLINE', details?: any): void {
    if (!this.io) return;
    const event = status === 'ONLINE' ? 'camera:online' : 'camera:offline';
    this.emitRealtimeEvent(event, { cameraId, status, ...details, timestamp: new Date().toISOString() }, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
  }

  public emitCameraTelemetry(cameraId: string, telemetry: any): void {
    if (!this.io) return;
    const envelope = {
      cameraId,
      ...telemetry,
      timestamp: new Date().toISOString()
    };
    this.emitRealtimeEvent('camera:telemetry', envelope, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
    this.io.emit('camera:telemetry', envelope);
    this.emitCameraStatus(cameraId, telemetry.status === 'LIVE' ? 'ONLINE' : 'OFFLINE', telemetry);
  }

  public emitCameraDetections(cameraId: string, payload: any): void {
    if (!this.io) return;
    const envelope = {
      cameraId,
      timestamp: payload.timestamp || new Date().toISOString(),
      receivedAt: Date.now(),
      frameWidth: payload.frameWidth || 1280,
      frameHeight: payload.frameHeight || 720,
      detections: payload.detections || [],
      geofenceBreaches: payload.geofenceBreaches || [],
    };
    this.emitRealtimeEvent('camera:detections', envelope, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
    this.io.emit('camera:detections', envelope);
  }

  public emitZoneBreach(cameraId: string, breach: any): void {
    if (!this.io) return;
    const envelope = {
      cameraId,
      ...breach,
      timestamp: new Date().toISOString(),
    };
    this.emitRealtimeEvent('zone:breach', envelope, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
    this.io.emit('zone:breach', envelope);
  }

  public emitCameraCreated(camera: any): void {
    if (!this.io) return;
    this.emitRealtimeEvent('camera:created', camera, {
      entityType: 'CAMERA',
      entityId: camera.id || camera.code,
    });
    this.io.emit('camera:created', camera);
  }

  public emitCameraUpdated(camera: any): void {
    if (!this.io) return;
    this.emitRealtimeEvent('camera:updated', camera, {
      entityType: 'CAMERA',
      entityId: camera.id || camera.code,
    });
    this.io.emit('camera:updated', camera);
  }

  public emitCameraDeleted(cameraId: string): void {
    if (!this.io) return;
    this.emitRealtimeEvent('camera:deleted', { cameraId }, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
    this.io.emit('camera:deleted', { cameraId });
  }

  public emitCameraError(cameraId: string, error: { code: string; message: string }): void {
    if (!this.io) return;
    this.emitRealtimeEvent('camera:error', { cameraId, error, timestamp: new Date().toISOString() }, {
      entityType: 'CAMERA',
      entityId: cameraId,
    });
  }

  public emitShiftUpdated(shift: ShiftDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('shift:updated', shift, {
      entityType: 'SHIFT',
      entityId: (shift as any).shiftId || shift.id,
      siteId: shift.siteId,
    });
  }

  public emitEmployeeCreated(employee: EmployeeDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('employee:created', employee, {
      entityType: 'EMPLOYEE',
      entityId: employee.employeeId,
      siteId: employee.siteId,
      zoneId: employee.assignedZoneId,
    });
  }

  public emitEmployeeUpdated(employee: EmployeeDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('employee:updated', employee, {
      entityType: 'EMPLOYEE',
      entityId: employee.employeeId,
      siteId: employee.siteId,
      zoneId: employee.assignedZoneId,
    });
  }

  public emitAuditNew(auditLog: AuditLogDoc): void {
    if (!this.io) return;
    this.io.to('role:ADMIN').emit('audit:new', auditLog);
  }

  public emitNewNotification(notification: NotificationDoc): void {
    if (!this.io) return;
    this.emitRealtimeEvent('notification:new', notification, {
      entityType: 'NOTIFICATION',
      entityId: notification.id,
      targetRoles: notification.targetRoles,
    });
  }

  public emitSystemHealth(healthData: any): void {
    if (!this.io) return;
    this.io.emit('system:health', healthData);
  }

  public emitSiteCreated(site: any): void {
    if (!this.io) return;
    this.emitRealtimeEvent('site:created', site, {
      entityType: 'SITE',
      entityId: site.id || site.siteId,
    });
    this.io.emit('site:created', site);
  }

  public emitSiteUpdated(site: any): void {
    if (!this.io) return;
    this.emitRealtimeEvent('site:updated', site, {
      entityType: 'SITE',
      entityId: site.id || site.siteId,
    });
    this.io.emit('site:updated', site);
  }

  public emitSiteDeleted(siteId: string): void {
    if (!this.io) return;
    this.emitRealtimeEvent('site:deleted', { siteId }, {
      entityType: 'SITE',
      entityId: siteId,
    });
    this.io.emit('site:deleted', { siteId });
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  public emit(eventName: string, payload: any): void {
    if (!this.io) return;
    this.io.emit(eventName, payload);
  }
}

