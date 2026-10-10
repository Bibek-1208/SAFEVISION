import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Incident, SystemHealth, Notification } from '../types';
import { safetyAudio } from '../services/SafetyAudioService';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

export type RealtimeStatus = 'ONLINE' | 'REALTIME DISCONNECTED' | 'RECONNECTING' | 'CONNECTING';

export interface CameraTelemetry {
  cameraId: string;
  status?: string;
  fps?: number;
  processedFps?: number;
  sourceFps?: number;
  latencyMs?: number;
  frameAgeMs?: number;
  droppedFrames?: number;
  processedFrames?: number;
  lastSeen?: string;
  timestamp?: string;
}

export interface PPEDetailItem {
  status: 'PRESENT' | 'MISSING' | 'UNKNOWN' | 'UNSUPPORTED' | string;
  confidence: number;
  item?: string | null;
  notes?: string;
  durationSec?: number;
}

export interface CameraDetectionItem {
  trackId: string;
  employeeId?: string | null;
  employeeName?: string | null;
  identityStatus?: string;
  className: string;
  confidence: number;
  personConfidence?: number;
  bbox: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    label?: string;
    color?: string;
  };
  ppe?: {
    helmet?: string;
    vest?: string;
    gloves?: string;
    shoes?: string;
    glasses?: string;
    mask?: string;
    [key: string]: string | undefined;
  };
  ppeDetails?: Record<string, PPEDetailItem>;
  overallCompliance?: 'COMPLIANT' | 'NON-COMPLIANT' | 'UNKNOWN' | string;
  complianceDurationSec?: number;
  temporalState?: string;
  violations?: string[];
  violation?: boolean;
}

export interface CameraDetectionsPayload {
  cameraId: string;
  timestamp: string;
  receivedAt?: number;
  frameWidth: number;
  frameHeight: number;
  detections: CameraDetectionItem[];
  geofenceBreaches?: Array<{
    zoneId: string;
    zoneName: string;
    trackId: string;
    isAuthorized: boolean;
    violationType?: string;
    isConfirmed?: boolean;
  }>;
  emergencyBlockages?: Array<{
    zoneId: string;
    zoneName: string;
    zoneType?: string;
    trackId: string;
    objectClass?: string;
    isConfirmed: boolean;
    durationSec: number;
    temporalThresholdSec: number;
  }>;
  loneWorkerStatuses?: Array<{
    zoneId: string;
    zoneName: string;
    state: string;
    workerCount: number;
    minimumWorkers: number;
    durationSec: number;
    warningThresholdSec: number;
    isolationThresholdSec: number;
    activeTrackId?: string;
    isConfirmedIncident: boolean;
  }>;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  realtimeStatus: RealtimeStatus;
  liveIncidents: Incident[];
  latestAlert: Incident | null;
  notifications: Notification[];
  unreadCount: number;
  systemHealth: SystemHealth;
  cameraTelemetry: Record<string, CameraTelemetry>;
  cameraDetections: Record<string, CameraDetectionsPayload>;
  clearLatestAlert: () => void;
  markNotificationsAsRead: () => void;
  triggerSimulatedDetection: (scenario?: any) => void;
  updateLocalIncident: (incident: Incident) => void;
  refetchAuthoritativeState: () => Promise<void>;
}

const defaultHealth: SystemHealth = {
  aiEngine: 'PROBING',
  camerasConnected: 0,
  totalCameras: 0,
  dbStatus: 'CONNECTING',
  realtimeStatus: 'CONNECTING',
  lastSync: new Date().toLocaleTimeString(),
  latencyMs: 0,
};

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('CONNECTING');
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const [latestAlert, setLatestAlert] = useState<Incident | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>(defaultHealth);
  const [cameraTelemetry, setCameraTelemetry] = useState<Record<string, CameraTelemetry>>({});
  const [cameraDetections, setCameraDetections] = useState<Record<string, CameraDetectionsPayload>>({});

  const refetchAuthoritativeState = useCallback(async () => {
    try {
      const res = await api.getIncidents({ limit: 20 });
      if (res && Array.isArray(res.incidents)) {
        setLiveIncidents(res.incidents);
      }
      const health = await api.getHealth();
      if (health) {
        setSystemHealth((prev) => ({
          ...prev,
          ...health,
          lastSync: new Date().toLocaleTimeString(),
        }));
      }
    } catch (e) {
      console.warn('[SafeVision] State refresh deferred:', e);
    }
  }, []);

  useEffect(() => {
    const activeToken = token || localStorage.getItem('safevision_token');

    const socketInstance = io(window.location.origin, {
      auth: { token: activeToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      setRealtimeStatus('ONLINE');
      console.log('[SafeVision Socket] Authenticated and connected to realtime hub');
      // Requirement 40: Refetch current authoritative state after reconnect
      refetchAuthoritativeState();
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      setRealtimeStatus('REALTIME DISCONNECTED');
      console.warn('[SafeVision Socket] Realtime disconnected:', reason);
    });

    socketInstance.io.on('reconnect_attempt', () => {
      setRealtimeStatus('RECONNECTING');
    });

    socketInstance.io.on('reconnect', () => {
      setIsConnected(true);
      setRealtimeStatus('ONLINE');
      refetchAuthoritativeState();
    });

    // Realtime: incident:new (Legacy event format)
    socketInstance.on('incident:new', (newIncident: Incident) => {
      setLiveIncidents((prev) => {
        if (prev.some((i) => i.id === newIncident.id || i.incidentId === newIncident.incidentId)) {
          return prev;
        }
        return [newIncident, ...prev];
      });

      setLatestAlert(newIncident);

      const sevUpper = (newIncident.severity || 'warning').toUpperCase();
      const typeUpper = (newIncident.violationType || 'safety_violation').replace(/_/g, ' ').toUpperCase();
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          title: `${sevUpper}: ${typeUpper}`,
          message: `${newIncident.employeeName || newIncident.workerName || 'Worker'} in ${newIncident.zone || 'Zone'} (${newIncident.cameraId || 'Camera'})`,
          severity: newIncident.severity === 'critical' ? 'critical' : 'warning',
          incidentId: newIncident.id,
          read: false,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);

      try {
        safetyAudio.triggerAlert(newIncident.severity === 'critical' ? 'CRITICAL' : 'HIGH');
      } catch (e) {}
    });

    // Realtime: incident:updated
    socketInstance.on('incident:updated', (updatedIncident: Incident) => {
      setLiveIncidents((prev) =>
        prev.map((i) =>
          i.id === updatedIncident.id || i.incidentId === updatedIncident.incidentId ? updatedIncident : i
        )
      );
      if (latestAlert && (latestAlert.id === updatedIncident.id || latestAlert.incidentId === updatedIncident.incidentId)) {
        setLatestAlert(updatedIncident);
      }
    });

    // Realtime Scoped Event Bus: realtime:event
    socketInstance.on('realtime:event', (payload: any) => {
      const { event, data } = payload || {};
      if (!event) return;

      if (event === 'incident.created' && data?.incident) {
        setLiveIncidents((prev) => {
          if (prev.some((i) => i.id === data.incident.id || i.incidentId === data.incident.incidentId)) {
            return prev;
          }
          return [data.incident, ...prev];
        });
        setLatestAlert(data.incident);
      } else if (
        (event === 'incident.updated' ||
          event === 'incident.acknowledged' ||
          event === 'incident.dispatched' ||
          event === 'incident.resolved' ||
          event === 'incident.false_positive') &&
        data?.incident
      ) {
        setLiveIncidents((prev) =>
          prev.map((i) =>
            i.id === data.incident.id || i.incidentId === data.incident.incidentId ? data.incident : i
          )
        );
        if (latestAlert && (latestAlert.id === data.incident.id || latestAlert.incidentId === data.incident.incidentId)) {
          setLatestAlert(data.incident);
        }
      } else if (event === 'system.health.updated' && data) {
        setSystemHealth((prev) => ({
          ...prev,
          ...data,
          lastSync: new Date().toLocaleTimeString(),
        }));
      } else if (event === 'camera:telemetry' && data?.cameraId) {
        handleCameraTelemetry(data);
      }
    });

    const handleCameraTelemetry = (data: any) => {
      if (data && data.cameraId) {
        setCameraTelemetry((prev) => ({
          ...prev,
          [data.cameraId]: {
            ...(prev[data.cameraId] || {}),
            ...data,
            lastSeen: data.lastSeen || data.timestamp || new Date().toISOString(),
          },
        }));
      }
    };

    socketInstance.on('camera:telemetry', handleCameraTelemetry);

    socketInstance.on('camera:online', (data: any) => {
      if (data?.cameraId) {
        setCameraTelemetry((prev) => ({
          ...prev,
          [data.cameraId]: {
            ...(prev[data.cameraId] || {}),
            cameraId: data.cameraId,
            status: 'LIVE',
            lastSeen: new Date().toISOString(),
          },
        }));
      }
    });

    socketInstance.on('camera:offline', (data: any) => {
      if (data?.cameraId) {
        setCameraTelemetry((prev) => ({
          ...prev,
          [data.cameraId]: {
            ...(prev[data.cameraId] || {}),
            cameraId: data.cameraId,
            status: 'OFFLINE',
            lastSeen: new Date().toISOString(),
          },
        }));
      }
    });

    // Real-time camera detections telemetry (for live CV bounding box overlay)
    socketInstance.on('camera:detections', (payload: any) => {
      const data: CameraDetectionsPayload = payload?.payload || payload;
      if (data?.cameraId) {
        const enriched: CameraDetectionsPayload = {
          ...data,
          receivedAt: payload?.receivedAt || Date.now(),
        };
        setCameraDetections((prev) => ({
          ...prev,
          [data.cameraId]: enriched,
          [data.cameraId.toUpperCase()]: enriched,
          [data.cameraId.toLowerCase()]: enriched,
        }));
      }
    });

    // Real-time camera lifecycle updates
    socketInstance.on('camera:created', () => {
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
    });

    socketInstance.on('camera:updated', () => {
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
    });

    socketInstance.on('camera:deleted', (data: any) => {
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
      if (data?.cameraId) {
        setCameraDetections((prev) => {
          const copy = { ...prev };
          delete copy[data.cameraId];
          return copy;
        });
        setCameraTelemetry((prev) => {
          const copy = { ...prev };
          delete copy[data.cameraId];
          return copy;
        });
      }
    });

    // Realtime: system:health
    socketInstance.on('system:health', (healthData: Partial<SystemHealth>) => {
      setSystemHealth((prev) => ({
        ...prev,
        ...healthData,
        lastSync: healthData.lastSync || new Date().toLocaleTimeString(),
      }));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [refetchAuthoritativeState, token]);

  const clearLatestAlert = () => setLatestAlert(null);

  const markNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const updateLocalIncident = (incident: Incident) => {
    setLiveIncidents((prev) => {
      const idx = prev.findIndex((i) => i.id === incident.id || i.incidentId === incident.incidentId);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = incident;
        return copy;
      }
      return [incident, ...prev];
    });
  };

  const triggerSimulatedDetection = async (scenario?: any) => {
    const token = localStorage.getItem('safevision_token');
    const defaultScenario = {
      workerId: 'DRILL-001',
      workerName: 'Safety Drill Worker',
      violationType: 'missing_helmet',
      severity: 'medium',
      confidence: 0.88,
      zone: scenario?.zone || 'GENERAL-ZONE',
      cameraId: scenario?.cameraId || 'CAM-DEFAULT',
      riskScore: 65,
      source: 'MANUAL',
      whyFlagged: [
        'Manual safety audit drill triggered by authorized personnel',
      ],
      recommendedAction: 'Verify PPE compliance at Zone checkpoint.',
    };

    const payload = scenario || defaultScenario;
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.incident) {
        updateLocalIncident(data.incident);
        setLatestAlert(data.incident);
      }
    } catch (err) {
      console.error('Failed to trigger manual incident audit', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        realtimeStatus,
        liveIncidents,
        latestAlert,
        notifications,
        unreadCount,
        systemHealth,
        cameraTelemetry,
        cameraDetections,
        clearLatestAlert,
        markNotificationsAsRead,
        triggerSimulatedDetection,
        updateLocalIncident,
        refetchAuthoritativeState,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
