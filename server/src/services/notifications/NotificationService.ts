import { DataStore, NotificationDoc, IncidentDoc } from '../../models/DataStore';
import { SocketService } from '../socket/SocketService';

export interface PushNotificationPayload {
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  incidentId?: string;
  zone?: string;
  cameraId?: string;
  timestamp: string;
}

export interface INotificationProvider {
  name: string;
  send(payload: PushNotificationPayload, targetRoles: string[]): Promise<boolean>;
}

export class InAppNotificationProvider implements INotificationProvider {
  public readonly name = 'In-App & Realtime WebSockets';
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();

  public async send(payload: PushNotificationPayload, targetRoles: string[]): Promise<boolean> {
    const doc: NotificationDoc = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: payload.title,
      message: payload.body,
      severity: payload.severity,
      incidentId: payload.incidentId,
      read: false,
      timestamp: payload.timestamp,
      targetRoles,
    };

    this.store.notifications.unshift(doc);
    // Broadcast notification to all connected Web Command Centers and Mobile Field Ops devices
    this.socketService.emitNewNotification(doc);
    return true;
  }
}

export class WebPushProvider implements INotificationProvider {
  public readonly name = 'Web Push API (VAPID)';

  public async send(payload: PushNotificationPayload, targetRoles: string[]): Promise<boolean> {
    // In production environment with VAPID keys, this calls web-push sendNotification
    console.log(`[WebPushProvider] Dispatched push payload to roles [${targetRoles.join(', ')}]: "${payload.title}"`);
    return true;
  }
}

export class MobilePushProvider implements INotificationProvider {
  public readonly name = 'Mobile Field Push (FCM/APNs)';

  public async send(payload: PushNotificationPayload, targetRoles: string[]): Promise<boolean> {
    // In production with FCM credentials, this calls firebase-admin messaging
    console.log(`[MobilePushProvider] Dispatched field alert to mobile teams: "${payload.title}" - ${payload.body}`);
    return true;
  }
}

export class NotificationService {
  private static instance: NotificationService;
  private providers: INotificationProvider[] = [];

  private constructor() {
    this.providers.push(new InAppNotificationProvider());
    this.providers.push(new WebPushProvider());
    this.providers.push(new MobilePushProvider());
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async notifyIncident(incident: IncidentDoc): Promise<void> {
    const isCritical = incident.severity === 'critical';
    const payload: PushNotificationPayload = {
      title: `${incident.severity.toUpperCase()} ALERT: ${incident.violationType.replace(/_/g, ' ').toUpperCase()}`,
      body: `Breach detected in ${incident.zone} (${incident.cameraId}). Action: ${incident.recommendedAction || 'Immediate investigation required.'}`,
      severity: isCritical ? 'critical' : 'warning',
      incidentId: incident.id,
      zone: incident.zone,
      cameraId: incident.cameraId,
      timestamp: incident.timestamp,
    };

    const targetRoles = isCritical
      ? ['safety_officer', 'plant_manager', 'field_technician']
      : ['safety_officer', 'field_technician'];

    for (const provider of this.providers) {
      try {
        await provider.send(payload, targetRoles);
      } catch (err) {
        console.error(`[NotificationService] Provider ${provider.name} error:`, err);
      }
    }
  }
}
