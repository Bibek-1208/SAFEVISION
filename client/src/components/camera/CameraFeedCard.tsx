import React, { useState, useRef, useEffect } from 'react';
import {
  Camera as CameraIcon,
  Maximize2,
  CameraOff,
  RefreshCw,
  AlertTriangle,
  Play,
  Pause,
  Compass,
  Volume2,
  Eye,
  Video,
  ShieldCheck,
  Upload,
  Radio,
  ExternalLink,
  ShieldAlert,
  MoreVertical,
  Edit2,
  Trash2,
  Power,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { Camera, BoundingBox, RestrictedZone, EmergencyZone, Incident } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';

interface CameraFeedCardProps {
  camera: Camera;
  isPrimary?: boolean;
  detections?: Array<{
    workerId: string;
    workerName?: string;
    label: string;
    box: BoundingBox;
    severity: 'critical' | 'high' | 'medium' | 'low';
    confidence: number;
  }>;
  activeIncidents?: Incident[];
  onSelect?: () => void;
  onSnapshot?: (snapshotData: string) => void;
  onRealIncidentDetected?: (incident: any) => void;
  onOpenIncident?: (incident: Incident) => void;
  onRequestUpload?: (camera: Camera) => void;
  onRequestAddIp?: () => void;
  onToggleFullscreen?: () => void;
  onConfigureZones?: (camera: Camera) => void;
  onEditCamera?: (camera: Camera) => void;
  onCameraDeleted?: (cameraCode: string) => void;
  onCameraUpdated?: (camera: Camera) => void;
}

function isPointInPoly(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getNormalizedRefPoint(bx: any, srcW: number = 1280, srcH: number = 720): { x: number; y: number } {
  if (!bx) return { x: 0, y: 0 };
  let ymin = Number(bx.ymin ?? 0);
  let xmin = Number(bx.xmin ?? 0);
  let ymax = Number(bx.ymax ?? 0);
  let xmax = Number(bx.xmax ?? 0);

  if (xmax > 100 || ymax > 100) {
    // Pixel coordinates
    const fw = srcW > 0 ? srcW : 1280;
    const fh = srcH > 0 ? srcH : 720;
    xmin /= fw;
    xmax /= fw;
    ymin /= fh;
    ymax /= fh;
  } else if (xmin > 1.0 || xmax > 1.0 || ymin > 1.0 || ymax > 1.0) {
    // Percentage coordinates (0 - 100)
    xmin /= 100;
    xmax /= 100;
    ymin /= 100;
    ymax /= 100;
  }

  const rx = Math.max(0, Math.min(1, (xmin + xmax) / 2));
  const ry = Math.max(0, Math.min(1, ymax));
  return { x: rx, y: ry };
}

function formatDuration(sec: number = 0): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  return `${mins.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

interface PPECardItem {
  name: string;
  status: 'PRESENT' | 'MISSING' | 'UNKNOWN' | 'UNSUPPORTED' | string;
  confidence: number;
  durationSec?: number;
  required?: boolean;
}

interface WorkerSafetyCardData {
  trackId: string;
  employeeId?: string | null;
  employeeName?: string | null;
  identityStatus?: string;
  personConfidence: number;
  overallCompliance: 'COMPLIANT' | 'NON-COMPLIANT' | 'UNKNOWN' | string;
  complianceDurationSec: number;
  temporalState?: string;
  isBreach?: boolean;
  breachZoneName?: string;
  items: PPECardItem[];
}

function drawWorkerSafetyCard(
  ctx: CanvasRenderingContext2D,
  data: WorkerSafetyCardData,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  canvasW: number,
  canvasH: number
) {
  const isLarge = canvasW >= 900;
  const cardW = isLarge ? 228 : 182;
  const headerH = isLarge ? 24 : 20;
  const rowH = isLarge ? 17 : 14;
  const footerH = isLarge ? 22 : 18;
  const rowCount = data.items.length;
  const cardH = headerH + (rowCount * rowH) + footerH + 8;

  // Smart horizontal positioning: prefer right of person, flip to left if screen edge reached
  let cardX = dx + dw + 8;
  if (cardX + cardW > canvasW - 8) {
    cardX = dx - cardW - 8;
  }
  // Clamp inside canvas bounds
  cardX = Math.max(8, Math.min(canvasW - cardW - 8, cardX));
  let cardY = Math.max(8, Math.min(canvasH - cardH - 8, dy));

  const isCompliant = data.overallCompliance === 'COMPLIANT';
  const isNonCompliant = data.overallCompliance === 'NON-COMPLIANT' || data.isBreach;
  const isUnknown = !isCompliant && !isNonCompliant;

  const themeColor = isNonCompliant ? '#EF4444' : isCompliant ? '#10B981' : '#F59E0B';
  const bgAlpha = 'rgba(10, 15, 26, 0.94)';

  ctx.save();

  // 1. Draw Card Background with Rounded Corners
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 5);
  ctx.fillStyle = bgAlpha;
  ctx.fill();
  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 2. Header: TRACK-ID / Worker Name & Real Person Detection Confidence
  const headerBg = isNonCompliant
    ? 'rgba(239, 68, 68, 0.18)'
    : isCompliant
    ? 'rgba(16, 185, 129, 0.15)'
    : 'rgba(245, 158, 11, 0.15)';
  
  ctx.beginPath();
  ctx.rect(cardX, cardY, cardW, headerH);
  ctx.fillStyle = headerBg;
  ctx.fill();

  // Header bottom border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + headerH);
  ctx.lineTo(cardX + cardW, cardY + headerH);
  ctx.stroke();

  // Header Title: Real ByteTrack ID / Employee
  const isConfirmed = data.identityStatus === 'CONFIRMED' && data.employeeName;
  const titleText = isConfirmed
    ? `${data.employeeName}`
    : `${data.trackId || 'WORKER'}`;
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = isLarge ? 'bold 11px "Roboto Mono", monospace' : 'bold 9.5px "Roboto Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  const maxTitleW = cardW - 55;
  let displayTitle = titleText;
  if (ctx.measureText(displayTitle).width > maxTitleW) {
    while (displayTitle.length > 4 && ctx.measureText(displayTitle + '..').width > maxTitleW) {
      displayTitle = displayTitle.slice(0, -1);
    }
    displayTitle += '..';
  }
  ctx.fillText(displayTitle, cardX + 7, cardY + headerH / 2);

  // Real Person Detection Confidence
  const personConfPct = Math.round(data.personConfidence * 100);
  ctx.textAlign = 'right';
  ctx.fillStyle = themeColor;
  ctx.font = isLarge ? 'bold 11px "Roboto Mono", monospace' : 'bold 9.5px "Roboto Mono", monospace';
  ctx.fillText(`${personConfPct}%`, cardX + cardW - 7, cardY + headerH / 2);

  // 3. PPE Rows
  let curY = cardY + headerH + 4;
  data.items.forEach((item) => {
    const itemY = curY + rowH / 2;
    
    // Item Name
    ctx.textAlign = 'left';
    ctx.fillStyle = '#CBD5E1';
    ctx.font = isLarge ? '500 10px "Roboto Mono", monospace' : '500 8.5px "Roboto Mono", monospace';
    ctx.fillText(item.name, cardX + 7, itemY);

    // Status Badge & Color
    let statusColor = '#94A3B8';
    let statusText = item.status;
    if (item.status === 'PRESENT') {
      statusColor = '#10B981';
    } else if (item.status === 'MISSING') {
      statusColor = '#EF4444';
    } else if (item.status === 'UNKNOWN') {
      statusColor = '#F59E0B';
    } else if (item.status === 'UNSUPPORTED') {
      statusColor = '#64748B';
    }

    // Center: Status Text
    ctx.textAlign = 'center';
    ctx.fillStyle = statusColor;
    ctx.font = isLarge ? 'bold 9.5px "Roboto Mono", monospace' : 'bold 8px "Roboto Mono", monospace';
    const statusCenterX = cardX + (cardW * 0.52);
    ctx.fillText(statusText, statusCenterX, itemY);

    // Right: Real Confidence or Dash
    ctx.textAlign = 'right';
    let confDisplay = '—';
    if ((item.status === 'PRESENT' || item.status === 'MISSING') && item.confidence > 0) {
      confDisplay = `${Math.round(item.confidence * 100)}%`;
    }
    
    // If per-item duration active, show timer next to missing confidence
    if (item.status === 'MISSING' && item.durationSec && item.durationSec > 0) {
      confDisplay = `${confDisplay} (${formatDuration(item.durationSec)})`;
    }

    ctx.fillStyle = statusColor;
    ctx.font = isLarge ? 'bold 10px "Roboto Mono", monospace' : 'bold 8.5px "Roboto Mono", monospace';
    ctx.fillText(confDisplay, cardX + cardW - 7, itemY);

    curY += rowH;
  });

  // 4. Footer Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX, curY + 2);
  ctx.lineTo(cardX + cardW, curY + 2);
  ctx.stroke();

  // 5. Footer: Overall Compliance & Continuous Duration Timer
  const footerY = curY + 2 + (footerH / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = themeColor;
  ctx.font = isLarge ? 'bold 10px "Roboto Mono", monospace' : 'bold 8.5px "Roboto Mono", monospace';

  let footerStatusLabel = 'PPE COMPLIANT';
  if (data.isBreach) {
    footerStatusLabel = 'ZONE BREACH';
  } else if (isNonCompliant) {
    footerStatusLabel = 'PPE NON-COMPLIANT';
  } else if (isUnknown) {
    footerStatusLabel = 'PPE OBSERVING';
  }
  ctx.fillText(footerStatusLabel, cardX + 7, footerY);

  // Authoritative continuous duration timer from backend
  ctx.textAlign = 'right';
  ctx.fillStyle = isNonCompliant ? '#EF4444' : '#94A3B8';
  ctx.font = isLarge ? 'bold 10.5px "Roboto Mono", monospace' : 'bold 9px "Roboto Mono", monospace';
  const timerStr = formatDuration(data.complianceDurationSec);
  ctx.fillText(timerStr, cardX + cardW - 7, footerY);

  ctx.restore();
}

export const CameraFeedCard: React.FC<CameraFeedCardProps> = ({
  camera,
  isPrimary = false,
  detections = [],
  activeIncidents = [],
  onSelect,
  onSnapshot,
  onRealIncidentDetected,
  onOpenIncident,
  onRequestUpload,
  onRequestAddIp,
  onToggleFullscreen,
  onConfigureZones,
  onEditCamera,
  onCameraDeleted,
  onCameraUpdated,
}) => {
  const [status, setStatus] = useState<Camera['status']>(camera.status || 'OFFLINE');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [hornActive, setHornActive] = useState(false);

  // Kebab Menu & Camera Management
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [probeMessage, setProbeMessage] = useState<{ reachable: boolean; text: string } | null>(null);

  // Database-backed Dynamic Restricted Zones for this Camera
  const [zones, setZones] = useState<RestrictedZone[]>([]);
  // Database-backed Dynamic Emergency Zones for this Camera (Phase 9.2)
  const [emergencyZones, setEmergencyZones] = useState<EmergencyZone[]>([]);

  // Webcam & Stream State
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [imgStreamError, setImgStreamError] = useState(false);
  const [showPermDialog, setShowPermDialog] = useState(false);

  // Real AI Inference Metrics
  const [liveDetections, setLiveDetections] = useState<any[]>([]);
  const [liveTracks, setLiveTracks] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<string>('configured');
  const [lastInferTimeMs, setLastInferTimeMs] = useState<number | null>(null);
  const [measuredFps, setMeasuredFps] = useState<number>(0);
  const [sessionIncidentIds, setSessionIncidentIds] = useState<Set<string>>(new Set());

  const { socket, cameraTelemetry, cameraDetections } = useSocket();

  const handleTestConnection = async () => {
    setShowMenu(false);
    setIsProbing(true);
    setProbeMessage(null);
    try {
      const res = await api.probeCamera(camera.code);
      setProbeMessage({
        reachable: Boolean(res.reachable),
        text: res.message || (res.reachable ? `Reachable (${res.latencyMs || 0}ms)` : 'Unreachable endpoint'),
      });
    } catch (err: any) {
      setProbeMessage({
        reachable: false,
        text: err.message || 'Probe request failed',
      });
    } finally {
      setIsProbing(false);
      setTimeout(() => setProbeMessage(null), 5000);
    }
  };

  const handleReconnect = async () => {
    setShowMenu(false);
    setStatus('LOADING');
    try {
      await api.connectCamera(camera.code);
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
    } catch (err: any) {
      console.error('[Reconnect Error]', err);
    }
  };

  const handleToggleEnable = async () => {
    setShowMenu(false);
    const newEnabled = camera.enabled === false;
    try {
      const res = await api.updateCamera(camera.code, { enabled: newEnabled });
      if (res.camera && onCameraUpdated) {
        onCameraUpdated(res.camera);
      }
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
    } catch (err: any) {
      console.error('[Toggle Enable Error]', err);
    }
  };

  const handleDeleteCamera = async () => {
    setIsDeleting(true);
    try {
      await api.deleteCamera(camera.code);
      setShowDeleteConfirm(false);
      if (onCameraDeleted) {
        onCameraDeleted(camera.code);
      }
      window.dispatchEvent(new CustomEvent('safevision:cameras-updated'));
    } catch (err: any) {
      console.error('[Delete Camera Error]', err);
      alert(`Failed to remove camera: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Load and subscribe to real-time zone changes for this camera
  useEffect(() => {
    let isMounted = true;
    const loadCameraZones = async () => {
      try {
        const camKey = camera.code || camera.id;
        if (!camKey) return;
        const [res, emrgRes] = await Promise.all([
          api.getCameraRestrictedZones(camKey).catch(() => ({ zones: [] })),
          api.getCameraEmergencyZones(camKey).catch(() => ({ zones: [] })),
        ]);
        if (isMounted) {
          if (Array.isArray(res.zones)) {
            setZones(res.zones.filter((z) => !z.isDeleted));
          }
          if (Array.isArray(emrgRes.zones)) {
            setEmergencyZones(emrgRes.zones.filter((z) => !z.isDeleted));
          }
        }
      } catch (err) {
        console.debug('[CameraFeedCard] Failed to load zones for camera:', camera.code);
      }
    };

    loadCameraZones();

    const handleZoneUpdate = (evt: any) => {
      if (
        !evt?.zone?.cameraId ||
        evt.zone.cameraId === camera.code ||
        evt.zone.cameraId === camera.id
      ) {
        loadCameraZones();
      }
    };

    if (socket) {
      socket.on('zone:created', handleZoneUpdate);
      socket.on('zone:updated', handleZoneUpdate);
      socket.on('zone:toggled', handleZoneUpdate);
      socket.on('zone:deleted', handleZoneUpdate);
      socket.on('emergency_zone.created', handleZoneUpdate);
      socket.on('emergency_zone.updated', handleZoneUpdate);
      socket.on('emergency_zone.toggled', handleZoneUpdate);
      socket.on('emergency_zone.deleted', handleZoneUpdate);
      socket.on('emergency_route.blocked', handleZoneUpdate);
      socket.on('lone_worker.warning', handleZoneUpdate);
      socket.on('lone_worker.checkin_required', handleZoneUpdate);
      socket.on('lone_worker.incident_created', handleZoneUpdate);
      socket.on('lone_worker.resolved', handleZoneUpdate);
      socket.on('lone_worker.checked_in', handleZoneUpdate);
    }

    return () => {
      isMounted = false;
      if (socket) {
        socket.off('zone:created', handleZoneUpdate);
        socket.off('zone:updated', handleZoneUpdate);
        socket.off('zone:toggled', handleZoneUpdate);
        socket.off('zone:deleted', handleZoneUpdate);
        socket.off('emergency_zone.created', handleZoneUpdate);
        socket.off('emergency_zone.updated', handleZoneUpdate);
        socket.off('emergency_zone.toggled', handleZoneUpdate);
        socket.off('emergency_zone.deleted', handleZoneUpdate);
        socket.off('emergency_route.blocked', handleZoneUpdate);
        socket.off('lone_worker.warning', handleZoneUpdate);
        socket.off('lone_worker.checkin_required', handleZoneUpdate);
        socket.off('lone_worker.incident_created', handleZoneUpdate);
        socket.off('lone_worker.resolved', handleZoneUpdate);
        socket.off('lone_worker.checked_in', handleZoneUpdate);
      }
    };
  }, [camera.code, camera.id, socket]);
  const telemetry = cameraTelemetry[camera.id] || cameraTelemetry[camera.code];
  const realDetectionsPayload =
    cameraDetections[camera.code] ||
    cameraDetections[camera.id] ||
    (camera.code ? cameraDetections[camera.code.toUpperCase()] : undefined) ||
    (camera.code ? cameraDetections[camera.code.toLowerCase()] : undefined) ||
    (camera.id ? cameraDetections[camera.id.toUpperCase()] : undefined) ||
    (camera.id ? cameraDetections[camera.id.toLowerCase()] : undefined);

  // Authoritative stream configuration & connection isolation (Section 1, 3, 10, 18)
  const isConfigured = Boolean(camera.streamUrl && camera.streamUrl.trim().length > 0 && camera.streamUrl !== 'NONE');
  const isEnabled = camera.enabled !== false;

  const isLive = webcamActive || (
    isEnabled &&
    isConfigured &&
    telemetry?.status === 'LIVE' &&
    telemetry?.fps !== undefined &&
    telemetry.fps > 0 &&
    !imgStreamError
  );

  type CameraEffectiveStatus = 'DISABLED' | 'NOT_CONFIGURED' | 'LIVE' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE';

  const isConnecting = isEnabled && isConfigured && !isLive && (
    telemetry?.status === 'CONNECTING' ||
    telemetry?.status === 'RECONNECTING' ||
    status === 'LOADING'
  );

  const effectiveStatus: CameraEffectiveStatus = (
    !isEnabled
      ? 'DISABLED'
      : !isConfigured
      ? 'NOT_CONFIGURED'
      : isLive
      ? 'LIVE'
      : isConnecting
      ? (telemetry?.status === 'RECONNECTING' ? 'RECONNECTING' : 'CONNECTING')
      : 'OFFLINE'
  );

  const displayFps = isLive && telemetry?.fps !== undefined && telemetry.fps > 0
    ? `${telemetry.fps.toFixed(1)} FPS`
    : (webcamActive && measuredFps > 0 ? `${measuredFps.toFixed(1)} FPS` : 'N/A');

  const displayLatency = isLive && telemetry?.latencyMs !== undefined
    ? `${Math.round(telemetry.latencyMs)}ms`
    : (lastInferTimeMs !== null && webcamActive ? `${lastInferTimeMs}ms` : 'N/A');

  const displayFrameAge = isLive && telemetry?.frameAgeMs !== undefined
    ? `${Math.round(telemetry.frameAgeMs)}ms`
    : 'N/A';

  const displayLastSeen = isLive
    ? (telemetry?.lastSeen ? new Date(telemetry.lastSeen).toLocaleTimeString() : 'Just now')
    : (telemetry?.lastSeen
        ? new Date(telemetry.lastSeen).toLocaleTimeString()
        : (camera.lastSeen ? new Date(camera.lastSeen).toLocaleTimeString() : 'N/A'));

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'LIVE':
      case 'ONLINE':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
      case 'CONNECTING':
      case 'RECONNECTING':
        return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
      case 'DISABLED':
      case 'NOT_CONFIGURED':
        return 'text-slate-400 border-slate-700 bg-slate-800/40';
      case 'OFFLINE':
      default:
        return 'text-red-400 border-red-500/40 bg-red-500/10';
    }
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inferIntervalRef = useRef<any>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcRef = useRef<number>(performance.now());
  const detectionsPayloadRef = useRef(realDetectionsPayload);
  detectionsPayloadRef.current = realDetectionsPayload;

  // STRICT OVERLAY & STREAM ISOLATION (Section 7 & 13)
  // Clean all state immediately when camera ID, code, or status changes
  useEffect(() => {
    setStatus(camera.status);
    setImgStreamError(false);
    setLiveDetections([]);
    setLiveTracks([]);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [camera.code, camera.id, camera.status]);

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (inferIntervalRef.current) {
        clearInterval(inferIntervalRef.current);
      }
    };
  }, []);

  // Activate Local Physical Webcam
  const requestWebcamAccess = async () => {
    setShowPermDialog(false);
    setWebcamError(null);
    setStatus('LOADING');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setWebcamActive(true);
      setStatus('LIVE');
      startLiveInferenceLoop();
    } catch (err: any) {
      console.error('[Webcam Error]', err);
      setWebcamActive(false);
      setStatus('ERROR');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setWebcamError('Camera permission denied by user. Please allow camera access in your browser address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setWebcamError('No physical video input or camera device detected on this workstation.');
      } else {
        setWebcamError(`Hardware camera error: ${err.message || 'Unable to access media stream.'}`);
      }
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (inferIntervalRef.current) {
      clearInterval(inferIntervalRef.current);
      inferIntervalRef.current = null;
    }
    setWebcamActive(false);
    setLiveDetections([]);
    setLiveTracks([]);
    setLastInferTimeMs(null);
    setMeasuredFps(0);
    setStatus('OFFLINE');
  };

  // Real Frame Inference Grabber Loop (3 FPS for optimal latency & CPU)
  const startLiveInferenceLoop = () => {
    if (inferIntervalRef.current) clearInterval(inferIntervalRef.current);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 640;
    offscreenCanvas.height = 480;
    const offCtx = offscreenCanvas.getContext('2d');

    inferIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !offCtx) return;

      offCtx.drawImage(videoRef.current, 0, 0, 640, 480);
      const frameBase64 = offscreenCanvas.toDataURL('image/jpeg', 0.7);

      frameCountRef.current += 1;
      const now = performance.now();
      if (now - lastFpsCalcRef.current >= 1000) {
        setMeasuredFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }

      const t0 = performance.now();
      try {
        const token = localStorage.getItem('safevision_token');
        const res = await fetch('/api/detection/frame', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            frameBase64,
            cameraId: camera.code,
            zone: camera.zone,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const t1 = performance.now();
          setLastInferTimeMs(Math.round(t1 - t0));
          setAiStatus(json.modelStatus || 'configured');
          if (json.detections) {
            setLiveDetections(json.detections);
          }
          if (json.trackedWorkers) {
            setLiveTracks(json.trackedWorkers);
          }
          if (json.createdIncidents && json.createdIncidents.length > 0) {
            json.createdIncidents.forEach((inc: any) => {
              const id = inc.id || inc._id || inc.incident_id;
              if (id) {
                setSessionIncidentIds((prev) => new Set(prev).add(id));
              }
              if (onRealIncidentDetected) onRealIncidentDetected(inc);
            });
          }
        } else {
          setAiStatus('offline');
        }
      } catch (e) {
        setAiStatus('offline');
      }
    }, 350); // ~3 FPS sampling
  };

  // Canvas Overlay Drawing Loop (Syncs bounding boxes with video)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (showBoundingBoxes && (effectiveStatus === 'LIVE' || webcamActive)) {
        // 1. Draw unconfigured / offline AI indicator if relevant
        if (aiStatus === 'unconfigured') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
          ctx.fillRect(10, 10, 260, 24);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px "Roboto Mono", monospace';
          ctx.fillText('AI NOT CONFIGURED (NO WEIGHTS)', 16, 26);
        } else if (aiStatus === 'offline') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
          ctx.fillRect(10, 10, 220, 24);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px "Roboto Mono", monospace';
          ctx.fillText('AI SERVICE UNAVAILABLE', 16, 26);
        }

        // 2. Check for fresh real-time detections from AI pipeline via Socket.IO
        const currentPayload = detectionsPayloadRef.current || realDetectionsPayload;
        const now = Date.now();
        let isRecent = false;
        if (currentPayload) {
          if (currentPayload.receivedAt) {
            isRecent = (now - currentPayload.receivedAt) < 3000;
          } else {
            const rawTs = currentPayload.timestamp;
            const normalizedTs = rawTs
              ? (rawTs.endsWith('Z') || rawTs.includes('+') ? new Date(rawTs).getTime() : new Date(rawTs + 'Z').getTime())
              : 0;
            isRecent = (now - normalizedTs) < 3000;
          }
        }

        if (!isRecent && liveDetections.length > 0) {
          setLiveDetections([]);
        }

        // 3. Draw Authoritative Database-Backed Restricted Zones for this camera
        if (zones && zones.length > 0) {
          zones.forEach((zone) => {
            if (!zone.polygon || zone.polygon.length < 3) return;
            const isEnabled = zone.enabled;

            // Check if any tracked person reference point is inside this polygon
            let hasTrackInside = false;

            // 1. Check authoritative backend breach payload from Socket.IO
            if (currentPayload?.geofenceBreaches && Array.isArray(currentPayload.geofenceBreaches)) {
              const matchedBreach = currentPayload.geofenceBreaches.some(
                (b: any) => b.zoneId === zone.zoneId || b.zoneId === zone.id
              );
              if (matchedBreach) {
                hasTrackInside = true;
              }
            }

            // 2. Real-time client-side PIP validation on current detections
            if (!hasTrackInside && isRecent && currentPayload?.detections && currentPayload.detections.length > 0) {
              const srcW = currentPayload.frameWidth || 1280;
              const srcH = currentPayload.frameHeight || 720;
              for (const d of currentPayload.detections) {
                const bx = d.bbox;
                if (!bx) continue;
                const ref = getNormalizedRefPoint(bx, srcW, srcH);
                if (isPointInPoly(ref, zone.polygon)) {
                  hasTrackInside = true;
                  break;
                }
              }
            } else if (!hasTrackInside && webcamActive && liveTracks.length > 0) {
              for (const t of liveTracks) {
                const bb = t.bbox;
                if (!bb || bb.length < 4) continue;
                const ref = getNormalizedRefPoint({ ymin: bb[0], xmin: bb[1], ymax: bb[2], xmax: bb[3] }, 640, 480);
                if (isPointInPoly(ref, zone.polygon)) {
                  hasTrackInside = true;
                  break;
                }
              }
            }

            // Color scheme based on zone type
            let baseColor = '#EF4444'; // RESTRICTED
            if (zone.zoneType === 'HIGH_RISK') baseColor = '#F97316';
            else if (zone.zoneType === 'EMERGENCY') baseColor = '#EC4899';
            else if (zone.zoneType === 'AUTHORIZED_ONLY') baseColor = '#8B5CF6';
            else if (zone.zoneType === 'LONE_WORKER_ZONE') baseColor = '#06B6D4';

            if (!isEnabled) {
              baseColor = '#64748B'; // Slate for disabled
            }

            const isLoneWorker = zone.zoneType === 'LONE_WORKER_ZONE';
            const lwState = isLoneWorker && currentPayload?.loneWorkerStatuses
              ? currentPayload.loneWorkerStatuses.find((s: any) => s.zoneId === zone.zoneId || s.zoneId === zone.id)
              : null;

            // Draw Polygon
            ctx.save();
            ctx.beginPath();
            const firstPt = zone.polygon[0];
            ctx.moveTo(firstPt.x * w, firstPt.y * h);
            for (let i = 1; i < zone.polygon.length; i++) {
              ctx.lineTo(zone.polygon[i].x * w, zone.polygon[i].y * h);
            }
            ctx.closePath();

            if (isLoneWorker && isEnabled) {
              if (lwState?.state === 'INCIDENT') {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
                ctx.fill();
                ctx.strokeStyle = '#EF4444';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#EF4444';
                ctx.shadowBlur = 10;
                ctx.stroke();
              } else if (lwState?.state === 'CHECK_IN_REQUIRED') {
                ctx.fillStyle = 'rgba(249, 115, 22, 0.28)';
                ctx.fill();
                ctx.strokeStyle = '#F97316';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              } else if (lwState?.state === 'WARNING') {
                ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
                ctx.fill();
                ctx.strokeStyle = '#F59E0B';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              } else if (lwState?.state === 'ISOLATED' || lwState?.state === 'INSIDE_CANDIDATE') {
                ctx.fillStyle = 'rgba(6, 182, 212, 0.20)';
                ctx.fill();
                ctx.strokeStyle = '#06B6D4';
                ctx.lineWidth = 2;
                ctx.stroke();
              } else {
                ctx.fillStyle = 'rgba(6, 182, 212, 0.10)';
                ctx.fill();
                ctx.strokeStyle = '#06B6D4';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
              }
            } else if (hasTrackInside && isEnabled) {
              // Active Breach! Pulsating red fill and warning border
              ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
              ctx.fill();
              ctx.strokeStyle = '#EF4444';
              ctx.lineWidth = 3;
              ctx.shadowColor = '#EF4444';
              ctx.shadowBlur = 10;
              ctx.stroke();
            } else if (isEnabled) {
              // Active normal restricted zone
              ctx.fillStyle = baseColor + '18';
              ctx.fill();
              ctx.strokeStyle = baseColor;
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              ctx.stroke();
            } else {
              // Disabled zone
              ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
              ctx.fill();
              ctx.strokeStyle = '#64748B';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
            }
            ctx.restore();

            // Draw zone label tag at first polygon point
            const tagX = Math.max(10, Math.min(w - 260, firstPt.x * w));
            const tagY = Math.max(24, Math.min(h - 15, firstPt.y * h - 6));
            let statusLabel = !isEnabled
              ? 'DISABLED'
              : hasTrackInside
              ? '⚠️ VIOLATION DETECTED'
              : 'GEOFENCE ACTIVE';

            if (isLoneWorker && isEnabled) {
              if (lwState) {
                statusLabel = `${lwState.state} (${lwState.workerCount}/${lwState.minimumWorkers} • ${formatDuration(lwState.durationSec)})`;
              } else {
                statusLabel = hasTrackInside ? 'OCCUPIED' : 'MONITORING ACTIVE';
              }
            }

            const tagText = `${zone.name} [${zone.zoneType}] • ${statusLabel}`;
            ctx.save();
            ctx.font = 'bold 9px "Roboto Mono", monospace';
            const textMetrics = ctx.measureText(tagText);
            const boxW = textMetrics.width + 14;
            const boxH = 18;

            ctx.fillStyle = (isLoneWorker && lwState?.state === 'INCIDENT') || (hasTrackInside && isEnabled && !isLoneWorker)
              ? 'rgba(239, 68, 68, 0.95)'
              : (isLoneWorker && lwState?.state === 'CHECK_IN_REQUIRED')
              ? 'rgba(234, 88, 12, 0.95)'
              : (isLoneWorker && lwState?.state === 'WARNING')
              ? 'rgba(217, 119, 6, 0.95)'
              : !isEnabled
              ? 'rgba(51, 65, 85, 0.85)'
              : 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(tagX, tagY - boxH + 4, boxW, boxH);
            ctx.strokeStyle = (isLoneWorker && lwState?.state === 'INCIDENT') || (hasTrackInside && isEnabled && !isLoneWorker)
              ? '#EF4444'
              : baseColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(tagX, tagY - boxH + 4, boxW, boxH);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(tagText, tagX + 7, tagY - 3);

            // Prominent Warning Banner at Top of Canvas if Lone Worker Alert or Zone Breached
            if (isLoneWorker && isEnabled && lwState && (lwState.state === 'WARNING' || lwState.state === 'CHECK_IN_REQUIRED' || lwState.state === 'INCIDENT')) {
              const lwBannerColor = lwState.state === 'INCIDENT' ? 'rgba(220, 38, 38, 0.95)' : lwState.state === 'CHECK_IN_REQUIRED' ? 'rgba(234, 88, 12, 0.95)' : 'rgba(217, 119, 6, 0.95)';
              const alertMsg = `⚠️ LONE WORKER ${lwState.state.replace(/_/g, ' ')}: ${zone.name.toUpperCase()} (Worker #${lwState.activeTrackId || '?'} • ${formatDuration(lwState.durationSec)})`;
              ctx.font = 'bold 11px "Roboto Mono", monospace';
              const mWidth = ctx.measureText(alertMsg).width + 30;
              const bannerX = (w - mWidth) / 2;
              ctx.fillStyle = lwBannerColor;
              ctx.fillRect(bannerX, 8, mWidth, 24);
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bannerX, 8, mWidth, 24);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillText(alertMsg, bannerX + 15, 24);
            } else if (hasTrackInside && isEnabled && !isLoneWorker) {
              const alertMsg = `⚠️ RESTRICTED ZONE VIOLATION: ${zone.name.toUpperCase()}`;
              ctx.font = 'bold 11px "Roboto Mono", monospace';
              const mWidth = ctx.measureText(alertMsg).width + 30;
              const bannerX = (w - mWidth) / 2;
              ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
              ctx.fillRect(bannerX, 8, mWidth, 24);
              ctx.strokeStyle = '#FECACA';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bannerX, 8, mWidth, 24);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillText(alertMsg, bannerX + 15, 24);
            }
            ctx.restore();
          });
        }

        // 4. Draw Authoritative Emergency Exits / Escape Routes for this camera (Phase 9.2)
        if (emergencyZones && emergencyZones.length > 0) {
          emergencyZones.forEach((eZone) => {
            if (!eZone.polygon || eZone.polygon.length < 3) return;
            const isEnabled = eZone.enabled;

            // Check if any tracked object is inside/blocking this emergency polygon
            let blockageState: 'CLEAR' | 'CANDIDATE_BLOCKAGE' | 'BLOCKED' = 'CLEAR';

            // Check authoritative payload from backend via Socket.IO or live frame response
            if (currentPayload?.emergencyBlockages && Array.isArray(currentPayload.emergencyBlockages)) {
              const matched = currentPayload.emergencyBlockages.find(
                (b: any) => b.zoneId === eZone.zoneId || b.zoneId === eZone.id
              );
              if (matched) {
                blockageState = matched.isConfirmed ? 'BLOCKED' : 'CANDIDATE_BLOCKAGE';
              }
            }

            // Real-time client-side PIP check on current detections if not reported yet
            if (blockageState === 'CLEAR' && isRecent && currentPayload?.detections && currentPayload.detections.length > 0) {
              const srcW = currentPayload.frameWidth || 1280;
              const srcH = currentPayload.frameHeight || 720;
              for (const d of currentPayload.detections) {
                const bx = d.bbox;
                if (!bx) continue;
                const ref = getNormalizedRefPoint(bx, srcW, srcH);
                if (isPointInPoly(ref, eZone.polygon)) {
                  blockageState = 'CANDIDATE_BLOCKAGE';
                  break;
                }
              }
            } else if (blockageState === 'CLEAR' && webcamActive && liveTracks.length > 0) {
              for (const t of liveTracks) {
                const bb = t.bbox;
                if (!bb || bb.length < 4) continue;
                const ref = getNormalizedRefPoint({ ymin: bb[0], xmin: bb[1], ymax: bb[2], xmax: bb[3] }, 640, 480);
                if (isPointInPoly(ref, eZone.polygon)) {
                  blockageState = 'CANDIDATE_BLOCKAGE';
                  break;
                }
              }
            }

            const firstPt = eZone.polygon[0];

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(firstPt.x * w, firstPt.y * h);
            for (let i = 1; i < eZone.polygon.length; i++) {
              ctx.lineTo(eZone.polygon[i].x * w, eZone.polygon[i].y * h);
            }
            ctx.closePath();

            if (!isEnabled) {
              // Disabled emergency area
              ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
              ctx.fill();
              ctx.strokeStyle = '#64748B';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
            } else if (blockageState === 'BLOCKED') {
              // Confirmed Blockage: Red boundary, pulsating highlight
              const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
              ctx.fillStyle = `rgba(239, 68, 68, ${0.25 + pulse * 0.15})`;
              ctx.fill();
              ctx.strokeStyle = '#EF4444';
              ctx.lineWidth = 3;
              ctx.shadowColor = '#EF4444';
              ctx.shadowBlur = 12 + pulse * 6;
              ctx.stroke();
            } else if (blockageState === 'CANDIDATE_BLOCKAGE') {
              // Candidate Blockage: Amber boundary
              ctx.fillStyle = 'rgba(245, 158, 11, 0.20)';
              ctx.fill();
              ctx.strokeStyle = '#F59E0B';
              ctx.lineWidth = 2.5;
              ctx.shadowColor = '#F59E0B';
              ctx.shadowBlur = 8;
              ctx.stroke();
            } else {
              // Normal CLEAR: Green/neutral boundary
              ctx.fillStyle = 'rgba(16, 185, 129, 0.10)';
              ctx.fill();
              ctx.strokeStyle = '#10B981';
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 5]);
              ctx.stroke();
            }
            ctx.restore();

            // Label tag on polygon
            const tagX = Math.max(10, Math.min(w - 260, firstPt.x * w));
            const tagY = Math.max(24, Math.min(h - 15, firstPt.y * h - 6));
            let statusText = '';
            let tagBg = 'rgba(15, 23, 42, 0.88)';
            let tagBorder = '#10B981';

            if (!isEnabled) {
              statusText = `${eZone.name} [${eZone.zoneType.replace(/_/g, ' ')}] • DISABLED`;
              tagBg = 'rgba(51, 65, 85, 0.85)';
              tagBorder = '#64748B';
            } else if (blockageState === 'BLOCKED') {
              statusText = `[⚠ EMERGENCY ROUTE BLOCKED] • ${eZone.name}`;
              tagBg = 'rgba(220, 38, 38, 0.95)';
              tagBorder = '#EF4444';
            } else if (blockageState === 'CANDIDATE_BLOCKAGE') {
              statusText = `[CANDIDATE BLOCKAGE] • ${eZone.name}`;
              tagBg = 'rgba(217, 119, 6, 0.95)';
              tagBorder = '#F59E0B';
            } else {
              statusText = `[${eZone.zoneType.replace(/_/g, ' ')}] • ${eZone.name} • CLEAR`;
              tagBg = 'rgba(6, 78, 59, 0.85)';
              tagBorder = '#10B981';
            }

            ctx.save();
            ctx.font = 'bold 9px "Roboto Mono", monospace';
            const textMetrics = ctx.measureText(statusText);
            const boxW = textMetrics.width + 14;
            const boxH = 18;

            ctx.fillStyle = tagBg;
            ctx.fillRect(tagX, tagY - boxH + 4, boxW, boxH);
            ctx.strokeStyle = tagBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(tagX, tagY - boxH + 4, boxW, boxH);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(statusText, tagX + 7, tagY - 3);

            // Prominent Warning Banner if BLOCKED
            if (blockageState === 'BLOCKED' && isEnabled) {
              const alertMsg = `🚨 EMERGENCY ROUTE OBSTRUCTED: ${eZone.name.toUpperCase()}`;
              ctx.font = 'bold 11px "Roboto Mono", monospace';
              const mWidth = ctx.measureText(alertMsg).width + 30;
              const bannerX = (w - mWidth) / 2;
              ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
              ctx.fillRect(bannerX, 36, mWidth, 24);
              ctx.strokeStyle = '#FECACA';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bannerX, 36, mWidth, 24);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillText(alertMsg, bannerX + 15, 52);
            }
            ctx.restore();
          });
        }

        if (isRecent && currentPayload?.detections && currentPayload.detections.length > 0) {
          const sourceWidth = currentPayload.frameWidth || 1280;
          const sourceHeight = currentPayload.frameHeight || 720;

          currentPayload.detections.forEach((d) => {
            const bx = d.bbox;
            if (!bx) return;

            // Compute normalized bounding box coordinates [0, 1]
            let normXmin = Number(bx.xmin ?? 0);
            let normXmax = Number(bx.xmax ?? 0);
            let normYmin = Number(bx.ymin ?? 0);
            let normYmax = Number(bx.ymax ?? 0);

            if (normXmax > 100 || normYmax > 100) {
              normXmin /= sourceWidth;
              normXmax /= sourceWidth;
              normYmin /= sourceHeight;
              normYmax /= sourceHeight;
            } else if (normXmax > 1.0 || normYmax > 1.0 || normXmin > 1.0 || normYmin > 1.0) {
              normXmin /= 100;
              normXmax /= 100;
              normYmin /= 100;
              normYmax /= 100;
            }

            const dx = normXmin * w;
            const dy = normYmin * h;
            const dw = (normXmax - normXmin) * w;
            const dh = (normYmax - normYmin) * h;

            const personRef = { x: (normXmin + normXmax) / 2, y: normYmax };
            const insideActiveZone = zones.find(
              (z) => z.enabled && !z.isDeleted && isPointInPoly(personRef, z.polygon)
            );
            const isLoneWorkerZone = insideActiveZone?.zoneType === 'LONE_WORKER_ZONE';
            const matchedLoneWorkerState = isLoneWorkerZone && currentPayload?.loneWorkerStatuses
              ? currentPayload.loneWorkerStatuses.find(
                  (s: any) => (s.zoneId === insideActiveZone.zoneId || s.zoneId === insideActiveZone.id)
                )
              : null;
            const isBreach = (!isLoneWorkerZone && Boolean(insideActiveZone)) || currentPayload?.geofenceBreaches?.some((b: any) => b.trackId === d.trackId);

            // Construct items for Worker Safety Card
            const items: PPECardItem[] = [];

            // 1. Helmet
            const hDet = d.ppeDetails?.helmet;
            items.push({
              name: 'Helmet',
              status: (hDet?.status || d.ppe?.helmet || 'UNKNOWN').toUpperCase(),
              confidence: hDet?.confidence || 0,
              durationSec: hDet?.durationSec || 0,
            });

            // 2. Safety Vest
            const vDet = d.ppeDetails?.vest;
            items.push({
              name: 'Safety Vest',
              status: (vDet?.status || d.ppe?.vest || 'UNKNOWN').toUpperCase(),
              confidence: vDet?.confidence || 0,
              durationSec: vDet?.durationSec || 0,
            });

            // 3. Gloves
            const gDet = d.ppeDetails?.gloves;
            items.push({
              name: 'Gloves',
              status: (gDet?.status || d.ppe?.gloves || 'UNKNOWN').toUpperCase(),
              confidence: gDet?.confidence || 0,
              durationSec: gDet?.durationSec || 0,
            });

            // 4. Shoes / Boots
            const sDet = d.ppeDetails?.shoes;
            items.push({
              name: 'Safety Shoes',
              status: (sDet?.status || d.ppe?.shoes || 'UNKNOWN').toUpperCase(),
              confidence: sDet?.confidence || 0,
              durationSec: sDet?.durationSec || 0,
            });

            // 5. Eye Protection / Glasses
            const glDet = d.ppeDetails?.glasses;
            items.push({
              name: 'Eye Protect',
              status: (glDet?.status || d.ppe?.glasses || 'UNKNOWN').toUpperCase(),
              confidence: glDet?.confidence || 0,
              durationSec: glDet?.durationSec || 0,
            });

            // 6. Face Mask (if present or evaluated)
            const mDet = d.ppeDetails?.mask || d.ppeDetails?.['face-mask'];
            if (mDet || d.ppe?.mask) {
              items.push({
                name: 'Face Mask',
                status: (mDet?.status || d.ppe?.mask || 'UNKNOWN').toUpperCase(),
                confidence: mDet?.confidence || 0,
                durationSec: mDet?.durationSec || 0,
              });
            }

            // Derive overall compliance
            const hasMissing = items.some((it) => it.status === 'MISSING');
            const hasUnknown = items.some((it) => it.status === 'UNKNOWN');
            const overallComp = d.overallCompliance
              ? d.overallCompliance.toUpperCase()
              : hasMissing
              ? 'NON-COMPLIANT'
              : hasUnknown
              ? 'UNKNOWN'
              : 'COMPLIANT';

            const maxDurationSec = d.complianceDurationSec || (hasMissing ? Math.max(0, ...items.map((i) => i.durationSec || 0)) : 0);
            const personConf = d.personConfidence !== undefined ? d.personConfidence : (d.confidence || 0.85);

            const cardData: WorkerSafetyCardData = {
              trackId: d.trackId || 'TRACK-01',
              employeeId: d.employeeId,
              employeeName: d.employeeName,
              identityStatus: d.identityStatus,
              personConfidence: personConf,
              overallCompliance: overallComp,
              complianceDurationSec: maxDurationSec,
              temporalState: d.temporalState,
              isBreach,
              breachZoneName: insideActiveZone?.name,
              items,
            };

            let boxColor = (overallComp === 'NON-COMPLIANT' || isBreach)
              ? '#EF4444'
              : overallComp === 'COMPLIANT'
              ? '#10B981'
              : '#F59E0B';

            if (isLoneWorkerZone && matchedLoneWorkerState) {
              if (matchedLoneWorkerState.state === 'INCIDENT') boxColor = '#EF4444';
              else if (matchedLoneWorkerState.state === 'CHECK_IN_REQUIRED') boxColor = '#F97316';
              else if (matchedLoneWorkerState.state === 'WARNING') boxColor = '#F59E0B';
              else boxColor = '#06B6D4';
            }

            // Person Bounding Box
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.fillStyle = (overallComp === 'NON-COMPLIANT' || isBreach)
              ? 'rgba(239, 68, 68, 0.12)'
              : overallComp === 'COMPLIANT'
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(245, 158, 11, 0.08)';
            ctx.fillRect(dx, dy, dw, dh);

            // Top Mini-Tag attached to Bounding Box
            const confPct = Math.round(personConf * 100);
            const isConfirmed = d.identityStatus === 'CONFIRMED' && d.employeeName;
            let idLabel = isConfirmed
              ? `${d.trackId} • ${d.employeeName} (${confPct}%)`
              : `${d.trackId || 'TRACK'} (${confPct}%)`;

            if (isLoneWorkerZone && matchedLoneWorkerState) {
              const lwStatus = matchedLoneWorkerState.state;
              if (lwStatus === 'INCIDENT') {
                idLabel = `${d.trackId} • 🚨 LONE WORKER INCIDENT (${formatDuration(matchedLoneWorkerState.durationSec)})`;
              } else if (lwStatus === 'CHECK_IN_REQUIRED') {
                idLabel = `${d.trackId} • ⚠️ CHECK-IN REQUIRED (${formatDuration(matchedLoneWorkerState.durationSec)})`;
              } else if (lwStatus === 'WARNING') {
                idLabel = `${d.trackId} • ⚠️ LONE WORKER WARNING (${formatDuration(matchedLoneWorkerState.durationSec)})`;
              } else {
                idLabel = `${d.trackId} • LONE WORKER ZONE (${formatDuration(matchedLoneWorkerState.durationSec)})`;
              }
            } else if (isBreach && insideActiveZone) {
              idLabel = `${d.trackId} • ⚠️ RESTRICTED ZONE BREACH`;
            }

            ctx.fillStyle = boxColor;
            const tagW = Math.min(280, idLabel.length * 7.2 + 16);
            ctx.fillRect(dx, dy - 20, tagW, 20);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9.5px "Roboto Mono", monospace';
            ctx.fillText(idLabel, dx + 6, dy - 6);

            // Dedicated High-Density Worker PPE Compliance Card
            drawWorkerSafetyCard(ctx, cardData, dx, dy, dw, dh, w, h);
          });
        } else if (webcamActive && liveTracks.length > 0) {
          // Render ByteTrack tracked workers for active physical webcam
          liveTracks.forEach((track) => {
            const bbox = track.bbox;
            if (!bbox || bbox.length < 4) return;
            const dy = (bbox[0] / 100) * h;
            const dx = (bbox[1] / 100) * w;
            const dh = ((bbox[2] - bbox[0]) / 100) * h;
            const dw = ((bbox[3] - bbox[1]) / 100) * w;

            const items: PPECardItem[] = [
              {
                name: 'Helmet',
                status: (track.ppeDetails?.helmet?.status || track.ppeState?.helmet || 'UNKNOWN').toUpperCase(),
                confidence: track.ppeDetails?.helmet?.confidence || 0,
                durationSec: track.ppeDetails?.helmet?.durationSec || 0,
              },
              {
                name: 'Safety Vest',
                status: (track.ppeDetails?.vest?.status || track.ppeState?.vest || 'UNKNOWN').toUpperCase(),
                confidence: track.ppeDetails?.vest?.confidence || 0,
                durationSec: track.ppeDetails?.vest?.durationSec || 0,
              },
              {
                name: 'Gloves',
                status: (track.ppeDetails?.gloves?.status || track.ppeState?.gloves || 'UNKNOWN').toUpperCase(),
                confidence: track.ppeDetails?.gloves?.confidence || 0,
                durationSec: track.ppeDetails?.gloves?.durationSec || 0,
              },
              {
                name: 'Safety Shoes',
                status: (track.ppeDetails?.shoes?.status || track.ppeState?.shoes || 'UNKNOWN').toUpperCase(),
                confidence: track.ppeDetails?.shoes?.confidence || 0,
                durationSec: track.ppeDetails?.shoes?.durationSec || 0,
              },
              {
                name: 'Eye Protect',
                status: (track.ppeDetails?.glasses?.status || track.ppeState?.glasses || 'UNKNOWN').toUpperCase(),
                confidence: track.ppeDetails?.glasses?.confidence || 0,
                durationSec: track.ppeDetails?.glasses?.durationSec || 0,
              },
            ];

            const hasMissing = items.some((it) => it.status === 'MISSING');
            const hasUnknown = items.some((it) => it.status === 'UNKNOWN');
            const overallComp = track.overallCompliance
              ? track.overallCompliance.toUpperCase()
              : hasMissing
              ? 'NON-COMPLIANT'
              : hasUnknown
              ? 'UNKNOWN'
              : 'COMPLIANT';

            const maxDurationSec = track.complianceDurationSec || (hasMissing ? Math.max(0, ...items.map((i) => i.durationSec || 0)) : 0);
            const personConf = track.personConfidence !== undefined ? track.personConfidence : 0.92;

            const cardData: WorkerSafetyCardData = {
              trackId: track.trackId || 'TRACK-01',
              employeeId: track.employeeId,
              employeeName: track.employeeName,
              identityStatus: track.identityStatus,
              personConfidence: personConf,
              overallCompliance: overallComp,
              complianceDurationSec: maxDurationSec,
              temporalState: track.temporalState,
              isBreach: false,
              items,
            };

            const boxColor = overallComp === 'NON-COMPLIANT'
              ? '#EF4444'
              : overallComp === 'COMPLIANT'
              ? '#10B981'
              : '#F59E0B';

            // Person Bounding Box
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.fillStyle = overallComp === 'NON-COMPLIANT'
              ? 'rgba(239, 68, 68, 0.12)'
              : overallComp === 'COMPLIANT'
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(245, 158, 11, 0.08)';
            ctx.fillRect(dx, dy, dw, dh);

            // Top Mini-Tag attached to Bounding Box
            const confPct = Math.round(personConf * 100);
            const isConfirmed = track.identityStatus === 'CONFIRMED' && track.employeeName;
            const idLabel = isConfirmed
              ? `${track.trackId} • ${track.employeeName} (${confPct}%)`
              : `${track.trackId || 'TRACK'} (${confPct}%)`;

            ctx.fillStyle = boxColor;
            const tagW = Math.min(260, idLabel.length * 7.2 + 16);
            ctx.fillRect(dx, dy - 20, tagW, 20);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9.5px "Roboto Mono", monospace';
            ctx.fillText(idLabel, dx + 6, dy - 6);

            // Dedicated High-Density Worker PPE Compliance Card
            drawWorkerSafetyCard(ctx, cardData, dx, dy, dw, dh, w, h);
          });
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [status, effectiveStatus, showBoundingBoxes, webcamActive, liveDetections, liveTracks, detections, aiStatus, realDetectionsPayload, zones]);

  const takeSnapshot = () => {
    const target = webcamActive ? videoRef.current : imgRef.current;
    if (!target) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = (target as any).videoWidth || (target as any).naturalWidth || 1280;
    tempCanvas.height = (target as any).videoHeight || (target as any).naturalHeight || 720;
    const ctx = tempCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(target as any, 0, 0, tempCanvas.width, tempCanvas.height);
      const dataUrl = tempCanvas.toDataURL('image/jpeg');
      if (onSnapshot) {
        onSnapshot(dataUrl);
      }
    }
  };

  const handleBayHorn = () => {
    setHornActive(true);
    setTimeout(() => setHornActive(false), 2000);
  };

  const hasActiveStream = webcamActive || (effectiveStatus === 'LIVE');

  // Track incidents that belong to the current camera session (Phase 12.3.1 Gate 7)
  useEffect(() => {
    if (hasActiveStream && activeIncidents && activeIncidents.length > 0) {
      setSessionIncidentIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        activeIncidents.forEach((inc) => {
          const id = (inc as any).id || (inc as any)._id;
          if (id && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [hasActiveStream, activeIncidents]);

  // Session banner incidents:
  // Visible if currently live OR if created/observed in current session when offline
  const sessionBannerIncidents = (activeIncidents || []).filter((inc) => {
    const id = (inc as any).id || (inc as any)._id;
    if (!id) return false;
    if (hasActiveStream) {
      return true;
    }
    return sessionIncidentIds.has(id);
  });

  return (
    <div
      onClick={onSelect}
      className={`relative bg-[#101318] rounded-xl overflow-hidden border transition-all ${
        isPrimary
          ? 'border-white/15 shadow-2xl ring-1 ring-white/5'
          : 'border-white/5 hover:border-white/20 cursor-pointer'
      } ${effectiveStatus === 'OFFLINE' || status === 'ERROR' ? 'border-red-900/30' : ''}`}
    >
      {/* Top Stream Header Overlay */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/95 via-black/60 to-transparent p-2.5 z-30 flex items-center justify-between text-[11px] font-mono select-none gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              effectiveStatus === 'LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : effectiveStatus === 'CONNECTING' || effectiveStatus === 'RECONNECTING'
                ? 'bg-amber-400 animate-spin'
                : effectiveStatus === 'DISABLED'
                ? 'bg-slate-600'
                : 'bg-red-500'
            }`}
          />
          <span className="font-bold text-white tracking-wide truncate max-w-[130px] sm:max-w-[200px]" title={`${camera.code}: ${camera.name}`}>
            {camera.code}: {camera.name.toUpperCase()}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-white/5 border border-white/10 text-slate-300 flex-shrink-0">
            {webcamActive ? 'WEBCAM' : (camera.protocol || camera.streamType || (camera.streamUrl?.startsWith('rtsp://') ? 'RTSP' : 'STREAM'))}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border flex-shrink-0 ${getStatusBadge(effectiveStatus)}`}>
            {effectiveStatus.replace('_', ' ')}
          </span>
          {webcamActive && (
            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] px-2 py-0.5 rounded font-bold flex-shrink-0">
              WEBCAM
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[10px] flex-shrink-0">
          <span className="text-emerald-400 font-bold">
            FPS: {displayFps}
          </span>
          <span className="bg-white/5 px-2 py-0.5 rounded text-white border border-white/10">
            AI: {displayLatency}
          </span>
          <span className="hidden md:inline bg-white/5 px-2 py-0.5 rounded text-slate-300 border border-white/10">
            AGE: {displayFrameAge}
          </span>
          <span className="hidden lg:inline bg-white/5 px-2 py-0.5 rounded text-slate-400 border border-white/10">
            LAST: {displayLastSeen}
          </span>
          {onConfigureZones && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfigureZones(camera);
              }}
              className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold transition"
              title="Configure Restricted Zones on this Camera"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>ZONES ({zones.length})</span>
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullscreen();
              }}
              className="p-1 hover:text-white rounded"
              title="Expand Camera View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Kebab Action Menu ⋮ */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:text-white hover:bg-white/10 rounded transition text-slate-300"
              title="Camera Management Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-7 w-48 bg-[#141720] border border-white/15 rounded-xl shadow-2xl py-1 z-50 text-xs font-mono select-none"
              >
                {onEditCamera && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onEditCamera(camera);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-slate-200 text-left transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Edit Settings</span>
                  </button>
                )}

                <button
                  onClick={handleTestConnection}
                  disabled={isProbing}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-slate-200 text-left transition disabled:opacity-50"
                >
                  <Activity className={`w-3.5 h-3.5 text-emerald-400 ${isProbing ? 'animate-spin' : ''}`} />
                  <span>{isProbing ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <button
                  onClick={handleReconnect}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-slate-200 text-left transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reconnect</span>
                </button>

                <button
                  onClick={handleToggleEnable}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-slate-200 text-left transition"
                >
                  <Power className={`w-3.5 h-3.5 ${camera.enabled !== false ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <span>{camera.enabled !== false ? 'Disable Camera' : 'Enable Camera'}</span>
                </button>

                <div className="border-t border-white/10 my-1" />

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-red-950/40 text-red-400 text-left transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Camera</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Incident Alert Banner — Only for active live streaming sessions or current-session incidents */}
      {sessionBannerIncidents && sessionBannerIncidents.length > 0 && (
        <div className="absolute top-11 left-3 right-3 z-30 flex items-center justify-between bg-red-950/95 border border-red-500/80 px-3 py-1.5 rounded-lg text-xs font-mono shadow-xl backdrop-blur-md animate-pulse">
          <div className="flex items-center gap-2 text-red-400 font-bold truncate">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span>⚠ ACTIVE INCIDENT ({sessionBannerIncidents.length})</span>
            <span className="text-white text-[11px] font-normal truncate max-w-[180px]">
              {sessionBannerIncidents[0].incidentType || sessionBannerIncidents[0].violationType?.replace(/_/g, ' ') || 'Violation'}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenIncident) onOpenIncident(sessionBannerIncidents[0]);
            }}
            className="bg-red-600 hover:bg-red-500 text-white font-bold px-2.5 py-1 rounded text-[10px] tracking-wider transition uppercase flex-shrink-0"
          >
            OPEN INCIDENT
          </button>
        </div>
      )}

      {/* Connection Probe Feedback Banner */}
      {probeMessage && (
        <div className={`absolute top-11 left-3 right-3 z-30 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono shadow-xl backdrop-blur-md border ${
          probeMessage.reachable ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-300' : 'bg-red-950/95 border-red-500/80 text-red-300'
        }`}>
          <div className="flex items-center gap-2 truncate">
            {probeMessage.reachable ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
            <span className="text-[11px] truncate">{probeMessage.text}</span>
          </div>
          <button onClick={() => setProbeMessage(null)} className="text-slate-400 hover:text-white text-xs ml-2 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Remove Camera Modal / Confirmation Popup */}
      {showDeleteConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-4 font-mono select-none"
        >
          <div className="bg-[#141720] border border-red-500/40 rounded-2xl p-5 max-w-sm text-center shadow-2xl">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3 animate-pulse" />
            <h4 className="text-sm font-bold text-white mb-1.5">
              REMOVE CAMERA {camera.code}?
            </h4>
            <p className="text-xs text-slate-300 mb-2 font-bold">
              {camera.name} ({camera.zone})
            </p>
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-2.5 mb-4 text-[11px] text-slate-300 text-left space-y-1">
              <p className="text-amber-300 font-semibold">⚠ Audit Retention Notice:</p>
              <p className="text-slate-400">
                This camera will be unregistered from active surveillance. Historical incidents, safety logs, and forensic evidence recorded by this camera remain permanently preserved in MongoDB.
              </p>
            </div>
            <div className="flex gap-2 justify-center text-xs">
              <button
                onClick={handleDeleteCamera}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition disabled:opacity-50"
              >
                {isDeleting ? 'Removing...' : 'Confirm Removal'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
        {/* Real Live Video / Feed Stream */}
        {hasActiveStream && (
          <>
            {webcamActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                ref={imgRef}
                src={`/api/cameras/${camera.code}/live-feed`}
                alt={`${camera.code} Live Feed`}
                className="w-full h-full object-cover select-none"
                loading="eager"
                onError={() => setImgStreamError(true)}
                onLoad={() => setImgStreamError(false)}
              />
            )}
          </>
        )}

        {/* Real Canvas Bounding Box Overlay */}
        <canvas
          ref={canvasRef}
          width={isPrimary ? 1280 : 640}
          height={isPrimary ? 720 : 360}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-20 ${
            hasActiveStream ? 'block' : 'hidden'
          }`}
        />

        {/* State: Camera Offline, Standby, or Disabled (Section 3, 10, 17, 18) */}
        {!hasActiveStream && (effectiveStatus === 'OFFLINE' || effectiveStatus === 'DISABLED' || effectiveStatus === 'NOT_CONFIGURED') && (
          <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full bg-[#0a0c10] select-none font-mono">
            <div className="w-12 h-12 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center mb-3 text-slate-400">
              <CameraOff className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-300 tracking-wider uppercase mb-1">
              {effectiveStatus === 'DISABLED'
                ? 'CAMERA DISABLED'
                : effectiveStatus === 'NOT_CONFIGURED'
                ? 'CAMERA NOT CONFIGURED'
                : (camera.code === 'CAM-4' || camera.id === 'CAM-4' || camera.name?.includes('Furnace'))
                ? 'STANDBY — physical CCTV validation unavailable'
                : 'CAMERA OFFLINE'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mb-1.5">
              No active stream configured for this camera.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-md mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>NO ACTIVE LIVE INCIDENT</span>
            </div>
            {activeIncidents && activeIncidents.length > 0 && (
              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                <span>Historical unresolved:</span>
                <span className="text-slate-400 font-semibold">{activeIncidents.length} record(s)</span>
                <span className="text-slate-600">(Audit Log)</span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1">
              Last frame: {displayLastSeen}
            </p>
          </div>
        )}

        {/* State: Camera Connecting / Reconnecting */}
        {!hasActiveStream && (effectiveStatus === 'CONNECTING' || effectiveStatus === 'RECONNECTING' || status === 'LOADING') && (
          <div className="flex flex-col items-center justify-center p-6 text-center font-mono w-full h-full bg-[#0a0c10]">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
            <p className="text-xs font-bold text-amber-400 tracking-wider uppercase">
              CAMERA CONNECTING...
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Establishing secure stream pipeline</p>
          </div>
        )}

        {/* State: Hardware or Permission Error */}
        {status === 'ERROR' && (
          <div className="flex flex-col items-center justify-center p-6 text-center font-mono w-full h-full bg-red-950/20">
            <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-xs font-bold text-white tracking-wide uppercase">
              CAMERA INPUT ERROR
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm my-2">
              {webcamError || 'Unable to establish video stream. Hardware link interrupted.'}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPermDialog(true);
                }}
                className="px-3 py-1.5 bg-emerald-500 text-black font-bold rounded-xl text-xs"
              >
                Retry Webcam
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus('OFFLINE');
                  setWebcamError(null);
                }}
                className="px-3 py-1.5 bg-white/10 text-white rounded-xl text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Bay Acoustic Horn Active Overlay */}
        {hornActive && (
          <div className="absolute inset-0 bg-red-600/40 border-4 border-red-500 flex items-center justify-center z-40 animate-pulse select-none">
            <div className="bg-[#101318] border border-red-500 px-6 py-3 rounded-2xl text-center shadow-2xl">
              <p className="text-sm font-bold text-red-400 font-mono tracking-wider">
                BAY ACOUSTIC HORN ACTIVATED
              </p>
              <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                Acoustic Alert Broadcast to {camera.zone}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Permission Explanation Modal */}
      {showPermDialog && (
        <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-[#141720] border border-emerald-500/40 rounded-2xl p-5 max-w-sm text-center font-mono shadow-2xl">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white mb-1.5">
              ALLOW LOCAL CAMERA ACCESS
            </h4>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              SafeVision AI will connect directly to your local webcam for real-time PPE & hazard detection. Video frames are processed securely on your machine.
            </p>
            <div className="flex gap-2 justify-center text-xs">
              <button
                onClick={requestWebcamAccess}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition"
              >
                Allow Camera
              </button>
              <button
                onClick={() => setShowPermDialog(false)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Command Bar */}
      {isPrimary && (
        <div className="bg-[#0e1015] border-t border-white/5 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 text-xs font-mono select-none">
          <div className="flex items-center gap-2">
            {!webcamActive ? (
              <button
                onClick={() => setShowPermDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-[11px] font-bold transition"
              >
                <Video className="w-3.5 h-3.5" />
                <span>USE WEBCAM</span>
              </button>
            ) : (
              <button
                onClick={stopWebcam}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-950/30 hover:bg-red-950/50 border border-red-900/50 text-red-400 rounded-lg text-[11px] font-bold transition"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>STOP WEBCAM</span>
              </button>
            )}

            {hasActiveStream && (
              <button
                onClick={takeSnapshot}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg text-[11px] transition"
              >
                <CameraIcon className="w-3.5 h-3.5" />
                <span>SNAP</span>
              </button>
            )}

            {onConfigureZones && (
              <button
                onClick={() => onConfigureZones(camera)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-[11px] font-bold transition"
                title="Configure Restricted Zones on this Camera"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>GEOFENCE ({zones.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              <input
                type="checkbox"
                checked={showBoundingBoxes}
                onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                className="rounded accent-emerald-500 w-3.5 h-3.5"
              />
              <span>CV OVERLAY</span>
            </label>

            <button
              onClick={handleBayHorn}
              className="flex items-center gap-1 px-3 py-1 bg-red-950/30 hover:bg-red-950/50 border border-red-900/60 text-red-400 font-bold rounded-lg text-[11px] transition"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>BAY HORN</span>
            </button>
          </div>
        </div>
      )}

      {/* Universal Real Pipeline Telemetry Status Bar */}
      <div className="bg-[#0b0d12] border-t border-white/5 px-3 py-1.5 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400 select-none">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-semibold truncate max-w-[130px]">
            {camera.siteId || 'SITE-01'} • {camera.zone}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">ID: {camera.code}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>FPS: <strong className="text-emerald-400 font-mono">{displayFps}</strong></span>
          <span className="text-slate-600">|</span>
          <span>AGE: <strong className="text-slate-200 font-mono">{displayFrameAge}</strong></span>
          <span className="text-slate-600">|</span>
          <span>LAT: <strong className="text-slate-200 font-mono">{displayLatency}</strong></span>
          <span className="text-slate-600">|</span>
          <span>SEEN: <strong className="text-slate-300 font-mono">{displayLastSeen}</strong></span>
        </div>
      </div>
    </div>
  );
};
