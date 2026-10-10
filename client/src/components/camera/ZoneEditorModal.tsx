import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Shield,
  AlertTriangle,
  Clock,
  HardHat,
  Users,
  Check,
  RotateCcw,
  Undo2,
  Save,
  Camera as CameraIcon,
  Crosshair,
  Info,
  Layers,
} from 'lucide-react';
import { Camera, Site, RestrictedZone, Point2D } from '../../types';
import { api } from '../../services/api';

interface ZoneEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (zone: RestrictedZone) => void;
  initialZone?: RestrictedZone | null;
  defaultCameraId?: string;
  cameras: Camera[];
  sites?: Site[];
}

export const ZoneEditorModal: React.FC<ZoneEditorModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialZone = null,
  defaultCameraId,
  cameras = [],
  sites = [],
}) => {
  const [siteId, setSiteId] = useState<string>(initialZone?.siteId || sites[0]?.id || 'site-rsp-1');
  const [cameraId, setCameraId] = useState<string>(
    initialZone?.cameraId || defaultCameraId || cameras[0]?.code || 'CAM-01'
  );
  const [name, setName] = useState<string>(initialZone?.name || '');
  const [description, setDescription] = useState<string>(initialZone?.description || '');
  const [zoneType, setZoneType] = useState<RestrictedZone['zoneType']>(initialZone?.zoneType || 'RESTRICTED');
  const [riskLevel, setRiskLevel] = useState<RestrictedZone['riskLevel']>(initialZone?.riskLevel || 'HIGH');
  const [enabled, setEnabled] = useState<boolean>(initialZone?.enabled !== undefined ? initialZone.enabled : true);

  // Authorization State
  const [allowedRoles, setAllowedRoles] = useState<string[]>(initialZone?.allowedRoles || ['ADMIN', 'SAFETY_OFFICER']);
  const [allowedEmployeesInput, setAllowedEmployeesInput] = useState<string>(
    (initialZone?.allowedEmployees || []).join(', ')
  );
  const [allowedDeptsInput, setAllowedDeptsInput] = useState<string>(
    (initialZone?.allowedDepartments || []).join(', ')
  );
  const [unknownIdentityPolicy, setUnknownIdentityPolicy] = useState<RestrictedZone['unknownIdentityPolicy']>(
    initialZone?.unknownIdentityPolicy || 'FLAG_UNKNOWN'
  );

  // Schedule State
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(initialZone?.schedule?.enabled || false);
  const [startTime, setStartTime] = useState<string>(initialZone?.schedule?.startTime || '22:00');
  const [endTime, setEndTime] = useState<string>(initialZone?.schedule?.endTime || '06:00');
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialZone?.schedule?.days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  );

  // Required PPE
  const [requiredPPE, setRequiredPPE] = useState<string[]>(
    initialZone?.requiredPPE || ['helmet', 'safety-vest']
  );

  // Lone Worker / Isolation State (Phase 9.3)
  const [minimumWorkers, setMinimumWorkers] = useState<number>(
    initialZone?.minimumWorkers !== undefined ? initialZone.minimumWorkers : 2
  );
  const [isolationThresholdSec, setIsolationThresholdSec] = useState<number>(
    initialZone?.isolationThresholdSec !== undefined ? initialZone.isolationThresholdSec : 120
  );
  const [warningThresholdSec, setWarningThresholdSec] = useState<number>(
    initialZone?.warningThresholdSec !== undefined ? initialZone.warningThresholdSec : 90
  );
  const [checkInRequired, setCheckInRequired] = useState<boolean>(
    initialZone?.checkInRequired === true
  );
  const [checkInTimeoutSec, setCheckInTimeoutSec] = useState<number>(
    initialZone?.checkInTimeoutSec !== undefined ? initialZone.checkInTimeoutSec : 30
  );
  const [authorizedWorkerPolicy, setAuthorizedWorkerPolicy] = useState<string>(
    initialZone?.authorizedWorkerPolicy || 'TRACK_ONLY'
  );

  // Polygon Drawing State
  const [points, setPoints] = useState<Point2D[]>(initialZone?.polygon || []);
  const [isPolygonClosed, setIsPolygonClosed] = useState<boolean>(Boolean(initialZone?.polygon?.length && initialZone.polygon.length >= 3));
  const [mousePos, setMousePos] = useState<Point2D | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stream & Viewport State (Phase 9.1.2)
  const [streamState, setStreamState] = useState<'LOADING' | 'LIVE' | 'OFFLINE' | 'ERROR' | 'NO_CAMERA'>('LOADING');
  const [streamErrorReason, setStreamErrorReason] = useState<string>('');
  const [videoDims, setVideoDims] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [streamRetryCount, setStreamRetryCount] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Canonical camera resolution (supports _id, id, code, and name)
  const selectedCamera =
    cameras.find(
      (c) =>
        c.code?.toLowerCase() === cameraId.toLowerCase() ||
        c.id?.toLowerCase() === cameraId.toLowerCase() ||
        (c as any)._id?.toLowerCase() === cameraId.toLowerCase() ||
        (c.name && c.name.toLowerCase() === cameraId.toLowerCase())
    ) || cameras[0];

  useEffect(() => {
    if (initialZone) {
      setSiteId(initialZone.siteId);
      setCameraId(initialZone.cameraId);
      setName(initialZone.name);
      setDescription(initialZone.description || '');
      setZoneType(initialZone.zoneType);
      setRiskLevel(initialZone.riskLevel);
      setEnabled(initialZone.enabled !== false);
      setAllowedRoles(initialZone.allowedRoles || []);
      setAllowedEmployeesInput((initialZone.allowedEmployees || []).join(', '));
      setAllowedDeptsInput((initialZone.allowedDepartments || []).join(', '));
      setUnknownIdentityPolicy(initialZone.unknownIdentityPolicy || 'FLAG_UNKNOWN');
      setScheduleEnabled(Boolean(initialZone.schedule?.enabled));
      setStartTime(initialZone.schedule?.startTime || '22:00');
      setEndTime(initialZone.schedule?.endTime || '06:00');
      setSelectedDays(initialZone.schedule?.days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
      setRequiredPPE(initialZone.requiredPPE || []);
      setMinimumWorkers(initialZone.minimumWorkers !== undefined ? initialZone.minimumWorkers : 2);
      setIsolationThresholdSec(initialZone.isolationThresholdSec !== undefined ? initialZone.isolationThresholdSec : 120);
      setWarningThresholdSec(initialZone.warningThresholdSec !== undefined ? initialZone.warningThresholdSec : 90);
      setCheckInRequired(initialZone.checkInRequired === true);
      setCheckInTimeoutSec(initialZone.checkInTimeoutSec !== undefined ? initialZone.checkInTimeoutSec : 30);
      setAuthorizedWorkerPolicy(initialZone.authorizedWorkerPolicy || 'TRACK_ONLY');
      setPoints(initialZone.polygon || []);
      setIsPolygonClosed(Boolean(initialZone.polygon && initialZone.polygon.length >= 3));
    } else {
      setName('');
      setDescription('');
      setPoints([]);
      setIsPolygonClosed(false);
      setMinimumWorkers(2);
      setIsolationThresholdSec(120);
      setWarningThresholdSec(90);
      setCheckInRequired(false);
      setCheckInTimeoutSec(30);
      setAuthorizedWorkerPolicy('TRACK_ONLY');
      if (defaultCameraId) setCameraId(defaultCameraId);
    }
    setErrorMessage(null);
    setStreamState('LOADING');
  }, [initialZone, defaultCameraId, isOpen]);

  // Compute exact visible video bounds inside letterboxed container
  const getVisibleVideoRect = useCallback((): { x: number; y: number; width: number; height: number } => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0, width: 640, height: 360 };
    const cW = container.clientWidth || 640;
    const cH = container.clientHeight || 360;

    const vW = videoDims.width || 1920;
    const vH = videoDims.height || 1080;
    const vAspect = vW / vH;
    const cAspect = cW / cH;

    let dispW = cW;
    let dispH = cH;
    let offsetX = 0;
    let offsetY = 0;

    if (cAspect > vAspect) {
      // Container is wider than 16:9 video -> letterboxed on left and right
      dispH = cH;
      dispW = cH * vAspect;
      offsetX = (cW - dispW) / 2;
      offsetY = 0;
    } else {
      // Container is taller than video -> letterboxed on top and bottom
      dispW = cW;
      dispH = cW / vAspect;
      offsetX = 0;
      offsetY = (cH - dispH) / 2;
    }

    return { x: offsetX, y: offsetY, width: dispW, height: dispH };
  }, [videoDims]);

  // Convert mouse event coordinates to normalized [0, 1] relative strictly to the visible video content
  const getNormalizedPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const vRect = getVisibleVideoRect();
    if (vRect.width <= 0 || vRect.height <= 0) return null;

    // Ignore clicks in the letterbox padding bars
    if (
      clickX < vRect.x ||
      clickX > vRect.x + vRect.width ||
      clickY < vRect.y ||
      clickY > vRect.y + vRect.height
    ) {
      return null;
    }

    const normX = (clickX - vRect.x) / vRect.width;
    const normY = (clickY - vRect.y) / vRect.height;

    return {
      x: Math.round(Math.max(0, Math.min(1, normX)) * 10000) / 10000,
      y: Math.round(Math.max(0, Math.min(1, normY)) * 10000) / 10000,
    };
  }, [getVisibleVideoRect]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPolygonClosed) return;

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    // Check if clicking near the first point to close polygon
    if (points.length >= 3) {
      const first = points[0];
      const dist = Math.hypot(pt.x - first.x, pt.y - first.y);
      if (dist < 0.04) {
        setIsPolygonClosed(true);
        return;
      }
    }

    setPoints((prev) => [...prev, pt]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPolygonClosed) {
      setMousePos(null);
      return;
    }
    const pt = getNormalizedPoint(e);
    setMousePos(pt);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  const handleUndoPoint = () => {
    if (isPolygonClosed) {
      setIsPolygonClosed(false);
    } else if (points.length > 0) {
      setPoints((prev) => prev.slice(0, -1));
    }
  };

  const handleResetPoints = () => {
    setPoints([]);
    setIsPolygonClosed(false);
    setMousePos(null);
  };

  const handleClosePolygon = () => {
    if (points.length >= 3) {
      setIsPolygonClosed(true);
    }
  };

  // Canvas Rendering (strict alignment with visible video content)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (points.length === 0) return;

    const vRect = getVisibleVideoRect();
    const toCanvasX = (nx: number) => vRect.x + nx * vRect.width;
    const toCanvasY = (ny: number) => vRect.y + ny * vRect.height;

    const themeColors: Record<string, { stroke: string; fill: string; dot: string }> = {
      EMERGENCY: { stroke: '#EF4444', fill: 'rgba(239, 68, 68, 0.25)', dot: '#F87171' },
      HIGH_RISK: { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.20)', dot: '#FBBF24' },
      RESTRICTED: { stroke: '#3B82F6', fill: 'rgba(59, 130, 246, 0.20)', dot: '#60A5FA' },
      AUTHORIZED_ONLY: { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.20)', dot: '#34D399' },
      LONE_WORKER_ZONE: { stroke: '#06B6D4', fill: 'rgba(6, 182, 212, 0.20)', dot: '#22D3EE' },
    };

    const colors = themeColors[zoneType] || themeColors.RESTRICTED;

    ctx.beginPath();
    ctx.moveTo(toCanvasX(points[0].x), toCanvasY(points[0].y));

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toCanvasX(points[i].x), toCanvasY(points[i].y));
    }

    if (isPolygonClosed) {
      ctx.closePath();
      ctx.fillStyle = colors.fill;
      ctx.fill();
    } else if (mousePos && points.length > 0) {
      ctx.lineTo(toCanvasX(mousePos.x), toCanvasY(mousePos.y));
    }

    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(isPolygonClosed ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw vertex handles
    points.forEach((pt, idx) => {
      const px = toCanvasX(pt.x);
      const py = toCanvasY(pt.y);

      ctx.beginPath();
      ctx.arc(px, py, idx === 0 && !isPolygonClosed && points.length >= 3 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 && !isPolygonClosed && points.length >= 3 ? '#10B981' : colors.dot;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Vertex Index label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`P${idx + 1}`, px + 8, py - 4);
    });

    // Draw zone label tag when completed
    if (isPolygonClosed && points.length >= 3) {
      const topPoint = points.reduce((prev, curr) => (curr.y < prev.y ? curr : prev), points[0]);
      const tagX = toCanvasX(topPoint.x);
      const tagY = Math.max(22, toCanvasY(topPoint.y) - 8);

      const label = `${name.toUpperCase() || 'RESTRICTED ZONE'} [${zoneType}]`;
      ctx.font = 'bold 10px monospace';
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(tagX - 4, tagY - 14, textWidth + 12, 18);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX - 4, tagY - 14, textWidth + 12, 18);

      ctx.fillStyle = colors.stroke;
      ctx.fillText(label, tagX + 2, tagY - 1);
    }
  }, [points, isPolygonClosed, mousePos, zoneType, name, getVisibleVideoRect]);

  // Adjust canvas pixel resolution to container size
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (container && canvas) {
        canvas.width = container.clientWidth || 640;
        canvas.height = container.clientHeight || 360;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  const handleSave = async () => {
    setErrorMessage(null);

    // Validation
    if (!name.trim()) {
      setErrorMessage('Zone name is required.');
      return;
    }

    if (!isPolygonClosed || points.length < 3) {
      setErrorMessage('Please draw and complete an enclosed polygon with at least 3 points.');
      return;
    }

    if (!cameraId) {
      setErrorMessage('Please select a camera associated with this geofence.');
      return;
    }

    setIsSaving(true);

    try {
      const parsedEmployees = allowedEmployeesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedDepts = allowedDeptsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const zonePayload: Partial<RestrictedZone> = {
        name: name.trim(),
        description: description.trim(),
        siteId,
        cameraId,
        zoneType,
        riskLevel,
        polygon: points,
        enabled,
        allowedRoles,
        allowedEmployees: parsedEmployees,
        allowedDepartments: parsedDepts,
        unknownIdentityPolicy,
        schedule: {
          enabled: scheduleEnabled,
          startTime: scheduleEnabled ? startTime : '',
          endTime: scheduleEnabled ? endTime : '',
          days: scheduleEnabled ? selectedDays : [],
        },
        requiredPPE,
        minimumWorkers: Number(minimumWorkers) || 2,
        isolationThresholdSec: Number(isolationThresholdSec) || 120,
        warningThresholdSec: Number(warningThresholdSec) || 90,
        checkInRequired: Boolean(checkInRequired),
        checkInTimeoutSec: Number(checkInTimeoutSec) || 30,
        authorizedWorkerPolicy,
      };

      let saved: RestrictedZone;
      if (initialZone && (initialZone.zoneId || initialZone.id)) {
        const idToUpdate = initialZone.zoneId || initialZone.id;
        const res = await api.updateRestrictedZone(idToUpdate, {
          ...zonePayload,
          version: initialZone.version,
        });
        saved = res.zone;
      } else {
        const res = await api.createRestrictedZone(zonePayload);
        saved = res.zone;
      }

      onSaved(saved);
      onClose();
    } catch (err: any) {
      console.error('[ZoneEditorModal] Save failed:', err);
      setErrorMessage(err.message || 'Failed to save restricted zone.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleRole = (r: string) => {
    setAllowedRoles((prev) =>
      prev.includes(r) ? prev.filter((role) => role !== r) : [...prev, r]
    );
  };

  const togglePPE = (item: string) => {
    setRequiredPPE((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#12161F] border border-white/15 rounded-2xl shadow-2xl overflow-hidden font-sans text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161B26]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                {initialZone ? 'EDIT DYNAMIC RESTRICTED ZONE' : 'CREATE DYNAMIC RESTRICTED ZONE'}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  CAMERA-SPECIFIC GEOFENCE
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Define polygonal coordinates on camera view with authoritative authorization and temporal rules.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          {/* Left Column: Interactive Camera Coordinate Editor (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CameraIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-white">
                  CAMERA VIEW COORDINATE SPACE: {selectedCamera?.code || cameraId}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Points: <strong className="text-emerald-400">{points.length}</strong> |{' '}
                {isPolygonClosed ? (
                  <span className="text-emerald-400 font-bold">POLYGON ENCLOSED</span>
                ) : points.length >= 3 ? (
                  <span className="text-amber-400">CLICK FIRST POINT TO CLOSE</span>
                ) : (
                  <span className="text-slate-400">CLICK TO ADD POINTS</span>
                )}
              </span>
            </div>

            {/* Canvas Container over Live Camera View */}
            <div
              ref={containerRef}
              className="relative w-full aspect-video bg-[#0A0D13] rounded-xl border border-white/10 overflow-hidden shadow-inner flex items-center justify-center"
            >
              {/* Camera Background Live Video Feed (object-contain with letterboxing compensation) */}
              {selectedCamera ? (
                <img
                  key={`${selectedCamera.code || cameraId}-${streamRetryCount}`}
                  src={`/api/cameras/${selectedCamera.code || cameraId}/live-feed`}
                  alt={`${selectedCamera.code || cameraId} Live Stream`}
                  className={`w-full h-full object-contain select-none pointer-events-none transition-opacity duration-200 ${
                    streamState === 'LIVE' ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setVideoDims({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                    setStreamState('LIVE');
                    setStreamErrorReason('');
                  }}
                  onError={() => {
                    setStreamState('OFFLINE');
                    setStreamErrorReason('Camera stream offline or unreachable.');
                  }}
                />
              ) : null}

              {/* State: LOADING CAMERA */}
              {streamState === 'LOADING' && selectedCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center font-mono bg-[#0A0D13]/95 z-20">
                  <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    LOADING CAMERA STREAM...
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    {selectedCamera.name || cameraId} • Establishing authenticated CCTV feed
                  </span>
                </div>
              )}

              {/* State: CAMERA OFFLINE */}
              {streamState === 'OFFLINE' && selectedCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center font-mono bg-[#0A0D13] z-20">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-2">
                    <CameraIcon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    CAMERA OFFLINE
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 max-w-sm">
                    {streamErrorReason || 'Camera hardware stream is offline or disconnected.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStreamState('LOADING');
                      setStreamRetryCount((c) => c + 1);
                    }}
                    className="mt-3 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition"
                  >
                    Retry Stream
                  </button>
                </div>
              )}

              {/* State: NO CAMERA CONFIGURED */}
              {!selectedCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center font-mono bg-[#0A0D13] z-20">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    NO CAMERA CONFIGURED
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Please select a configured surveillance camera from the dropdown above.
                  </span>
                </div>
              )}

              {/* LIVE Camera Watermark Badge */}
              {streamState === 'LIVE' && selectedCamera && (
                <div className="absolute top-2 right-2 z-20 bg-black/80 backdrop-blur-sm border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 shadow">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>LIVE • {videoDims.width}×{videoDims.height}</span>
                </div>
              )}

              {/* Real interactive drawing canvas */}
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="absolute inset-0 z-10 w-full h-full cursor-crosshair"
              />

              {/* Floating Guidance Badge */}
              <div className="absolute bottom-2 left-2 z-20 bg-black/75 border border-white/10 rounded px-2.5 py-1 text-[10px] font-mono text-slate-300 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                {isPolygonClosed
                  ? 'Polygon complete. Ready to save.'
                  : points.length < 3
                  ? `Click on camera view to plot perimeter (minimum 3 points, currently ${points.length}).`
                  : 'Click on green starting point or click [Finish Polygon] below.'}
              </div>
            </div>

            {/* Drawing Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClosePolygon}
                  disabled={points.length < 3 || isPolygonClosed}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                    points.length >= 3 && !isPolygonClosed
                      ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Finish Polygon
                </button>
                <button
                  type="button"
                  onClick={handleUndoPoint}
                  disabled={points.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo Point
                </button>
                <button
                  type="button"
                  onClick={handleResetPoints}
                  disabled={points.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              {mousePos && (
                <div className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  X: {(mousePos.x * 100).toFixed(1)}% | Y: {(mousePos.y * 100).toFixed(1)}%
                </div>
              )}
            </div>

            {/* Vertices Coordinate Preview */}
            {points.length > 0 && (
              <div className="p-3 bg-[#0E1118] rounded-xl border border-white/5 text-[11px] font-mono text-slate-400 max-h-24 overflow-y-auto">
                <span className="text-slate-500 font-bold block mb-1">NORMALIZED VERTICES:</span>
                <div className="flex flex-wrap gap-2">
                  {points.map((pt, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                      P{i + 1}: ({pt.x.toFixed(4)}, {pt.y.toFixed(4)})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Configuration & Authorization (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Target Camera & Site */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">CAMERA</label>
                <select
                  value={cameraId}
                  onChange={(e) => setCameraId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-emerald-500 outline-none"
                >
                  {cameras.map((c) => (
                    <option key={c.code || c.id} value={c.code || c.id} className="bg-[#12161F]">
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">ZONE TYPE</label>
                <select
                  value={zoneType}
                  onChange={(e) => setZoneType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-emerald-500 outline-none"
                >
                  <option value="RESTRICTED" className="bg-[#12161F]">RESTRICTED</option>
                  <option value="HIGH_RISK" className="bg-[#12161F]">HIGH_RISK</option>
                  <option value="EMERGENCY" className="bg-[#12161F]">EMERGENCY</option>
                  <option value="AUTHORIZED_ONLY" className="bg-[#12161F]">AUTHORIZED_ONLY</option>
                  <option value="LONE_WORKER_ZONE" className="bg-[#12161F]">LONE_WORKER_ZONE (Phase 9.3)</option>
                </select>
              </div>
            </div>

            {/* Zone Name & Risk Level */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-mono text-slate-400 block mb-1">ZONE NAME *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Machine Room A / Isolated Chemical Vault"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-slate-600 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">RISK LEVEL</label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-emerald-500 outline-none"
                >
                  <option value="CRITICAL" className="bg-[#12161F]">CRITICAL</option>
                  <option value="HIGH" className="bg-[#12161F]">HIGH</option>
                  <option value="MODERATE" className="bg-[#12161F]">MODERATE</option>
                  <option value="LOW" className="bg-[#12161F]">LOW</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-mono text-slate-400 block mb-1">DESCRIPTION (OPTIONAL)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="High-heat corridor or solitary work zone requiring isolation safety..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Lone Worker Isolation Monitoring Configuration (Phase 9.3) */}
            {zoneType === 'LONE_WORKER_ZONE' && (
              <div className="p-3.5 bg-cyan-950/20 rounded-xl border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    LONE WORKER SAFETY PARAMETERS
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    PHASE 9.3
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      MINIMUM WORKERS REQUIRED
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={minimumWorkers}
                      onChange={(e) => setMinimumWorkers(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-cyan-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">Isolated if count &lt; minimum</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      ISOLATION THRESHOLD (SEC)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={3600}
                      value={isolationThresholdSec}
                      onChange={(e) => setIsolationThresholdSec(Math.max(5, parseInt(e.target.value) || 120))}
                      className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-cyan-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">Incident triggered at duration</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      WARNING THRESHOLD (SEC)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={3500}
                      value={warningThresholdSec}
                      onChange={(e) => setWarningThresholdSec(Math.max(1, parseInt(e.target.value) || 90))}
                      className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-cyan-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">Early warning threshold</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      CHECK-IN TIMEOUT (SEC)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={checkInTimeoutSec}
                      onChange={(e) => setCheckInTimeoutSec(Math.max(5, parseInt(e.target.value) || 30))}
                      disabled={!checkInRequired}
                      className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-cyan-500 outline-none disabled:opacity-40"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">Operator check-in grace period</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <label className="text-[11px] font-mono text-slate-300 cursor-pointer flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checkInRequired}
                      onChange={(e) => setCheckInRequired(e.target.checked)}
                      className="rounded bg-white/10 border-white/20 text-cyan-500 focus:ring-0"
                    />
                    <span>Require Worker Check-In before Incident Escalation</span>
                  </label>
                </div>
              </div>
            )}

            {/* Authorization Section */}
            <div className="p-3.5 bg-white/5 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  ACCESS AUTHORIZATION
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-mono text-slate-400 cursor-pointer flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="rounded bg-white/10 border-white/20 text-emerald-500 focus:ring-0"
                    />
                    Zone Enabled
                  </label>
                </div>
              </div>

              {/* Allowed Roles */}
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">ALLOWED ROLES</label>
                <div className="flex flex-wrap gap-1.5">
                  {['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE'].map((r) => {
                    const isSelected = allowedRoles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRole(r)}
                        className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                            : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Employee IDs */}
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  ALLOWED EMPLOYEE IDS (COMMA-SEPARATED)
                </label>
                <input
                  type="text"
                  value={allowedEmployeesInput}
                  onChange={(e) => setAllowedEmployeesInput(e.target.value)}
                  placeholder="e.g. EMP-1024, EMP-2048"
                  className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs placeholder-slate-600 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Unknown Identity Policy */}
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  UNKNOWN IDENTITY POLICY
                </label>
                <select
                  value={unknownIdentityPolicy}
                  onChange={(e) => setUnknownIdentityPolicy(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs font-mono focus:border-emerald-500 outline-none"
                >
                  <option value="FLAG_UNKNOWN" className="bg-[#12161F]">
                    FLAG_UNKNOWN (Flag potential unauthorized candidate)
                  </option>
                  <option value="DENY" className="bg-[#12161F]">
                    DENY (Treat unconfirmed identity as unauthorized breach)
                  </option>
                  <option value="ALLOW" className="bg-[#12161F]">
                    ALLOW (Permit unidentified workers unless missing PPE)
                  </option>
                </select>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="p-3.5 bg-white/5 rounded-xl border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  TEMPORAL ENFORCEMENT SCHEDULE
                </span>
                <label className="text-[11px] font-mono text-slate-400 cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="rounded bg-white/10 border-white/20 text-emerald-500 focus:ring-0"
                  />
                  Active Schedule
                </label>
              </div>

              {scheduleEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block mb-0.5">START TIME</span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-xs font-mono outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block mb-0.5">END TIME</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-xs font-mono outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => {
                      const sel = selectedDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            sel
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                              : 'bg-white/5 text-slate-400 border-white/10'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Required PPE Section */}
            <div className="p-3.5 bg-white/5 rounded-xl border border-white/10 space-y-2">
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <HardHat className="w-3.5 h-3.5 text-blue-400" />
                MANDATORY ZONE PPE
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'helmet', label: 'Helmet / Hard Hat' },
                  { id: 'safety-vest', label: 'Safety Vest' },
                  { id: 'gloves', label: 'Safety Gloves' },
                  { id: 'shoes', label: 'Safety Shoes / Boots' },
                  { id: 'glasses', label: 'Safety Glasses / Goggles' },
                  { id: 'face-mask', label: 'Face Mask' },
                  { id: 'face-guard', label: 'Face Guard / Shield' },
                  { id: 'ear-mufs', label: 'Ear Protection' },
                ].map((item) => {
                  const checked = requiredPPE.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => togglePPE(item.id)}
                      className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
                        checked
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${checked ? 'bg-blue-400' : 'bg-slate-600'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#161B26]">
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            MongoDB Authoritative • Real-Time Socket.IO Synchronization
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Restricted Zone
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
