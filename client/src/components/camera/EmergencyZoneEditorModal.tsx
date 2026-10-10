import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  Clock,
  RotateCcw,
  Undo2,
  Save,
  Camera as CameraIcon,
  Crosshair,
  Info,
  Layers,
  ShieldAlert,
  Flame,
  DoorOpen,
  ArrowRightCircle,
  HelpCircle,
} from 'lucide-react';
import { Camera, Site, EmergencyZone, EmergencyZoneType, Point2D } from '../../types';
import { api } from '../../services/api';

interface EmergencyZoneEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (zone: EmergencyZone) => void;
  initialZone?: EmergencyZone | null;
  defaultCameraId?: string;
  cameras: Camera[];
  sites?: Site[];
}

const EMERGENCY_AREA_TYPES: Array<{
  type: EmergencyZoneType;
  label: string;
  desc: string;
  icon: any;
}> = [
  {
    type: 'EMERGENCY_EXIT',
    label: 'Emergency Exit',
    desc: 'Fire doors, emergency egress paths and designated evacuation exits.',
    icon: DoorOpen,
  },
  {
    type: 'ESCAPE_ROUTE',
    label: 'Escape Route',
    desc: 'Primary arterial escape corridors, stairs and safe walkways.',
    icon: ArrowRightCircle,
  },
  {
    type: 'FIRE_EXTINGUISHER_ACCESS',
    label: 'Fire Extinguisher Access',
    desc: 'Safety clearance perimeter around fire extinguishers and hose reels.',
    icon: Flame,
  },
  {
    type: 'EMERGENCY_PANEL_ACCESS',
    label: 'Emergency Panel Access',
    desc: 'Clear passage to electrical isolation switches and emergency shutoffs.',
    icon: ShieldAlert,
  },
  {
    type: 'EVACUATION_PATH',
    label: 'Evacuation Path',
    desc: 'Plant-wide muster point pathways and emergency transit lanes.',
    icon: ArrowRightCircle,
  },
];

export const EmergencyZoneEditorModal: React.FC<EmergencyZoneEditorModalProps> = ({
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
  const [zoneType, setZoneType] = useState<EmergencyZoneType>(initialZone?.zoneType || 'EMERGENCY_EXIT');
  const [riskLevel, setRiskLevel] = useState<EmergencyZone['riskLevel']>(initialZone?.riskLevel || 'HIGH');
  const [enabled, setEnabled] = useState<boolean>(initialZone?.enabled !== undefined ? initialZone.enabled : true);
  const [temporalThresholdMs, setTemporalThresholdMs] = useState<number>(
    initialZone?.temporalThresholdMs || 3000
  );
  const [allowedObjectClasses, setAllowedObjectClasses] = useState<string[]>(
    initialZone?.allowedObjectClasses || ['person', 'tool']
  );

  // Polygon Drawing State
  const [points, setPoints] = useState<Point2D[]>(initialZone?.polygon || []);
  const [isPolygonClosed, setIsPolygonClosed] = useState<boolean>(
    Boolean(initialZone?.polygon?.length && initialZone.polygon.length >= 3)
  );
  const [mousePos, setMousePos] = useState<Point2D | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stream & Viewport State
  const [streamState, setStreamState] = useState<'LOADING' | 'LIVE' | 'OFFLINE' | 'ERROR' | 'NO_CAMERA'>('LOADING');
  const [streamErrorReason, setStreamErrorReason] = useState<string>('');
  const [videoDims, setVideoDims] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [streamRetryCount, setStreamRetryCount] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Selected camera
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
      setTemporalThresholdMs(initialZone.temporalThresholdMs || 3000);
      setAllowedObjectClasses(initialZone.allowedObjectClasses || ['person', 'tool']);
      setPoints(initialZone.polygon || []);
      setIsPolygonClosed(Boolean(initialZone.polygon && initialZone.polygon.length >= 3));
    } else {
      setName('');
      setDescription('');
      setPoints([]);
      setIsPolygonClosed(false);
      setTemporalThresholdMs(3000);
      setAllowedObjectClasses(['person', 'tool']);
      if (defaultCameraId) setCameraId(defaultCameraId);
    }
    setErrorMessage(null);
    setStreamState('LOADING');
  }, [initialZone, defaultCameraId, isOpen]);

  // Compute visible video rectangle
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
      dispH = cH;
      dispW = cH * vAspect;
      offsetX = (cW - dispW) / 2;
      offsetY = 0;
    } else {
      dispW = cW;
      dispH = cW / vAspect;
      offsetX = 0;
      offsetY = (cH - dispH) / 2;
    }

    return { x: offsetX, y: offsetY, width: dispW, height: dispH };
  }, [videoDims]);

  // Convert mouse event coordinates to normalized [0, 1]
  const getNormalizedPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const vRect = getVisibleVideoRect();
    if (vRect.width <= 0 || vRect.height <= 0) return null;

    if (
      clickX < vRect.x ||
      clickX > vRect.x + vRect.width ||
      clickY < vRect.y ||
      clickY > vRect.y + vRect.height
    ) {
      return null;
    }

    const normX = Math.max(0, Math.min(1, (clickX - vRect.x) / vRect.width));
    const normY = Math.max(0, Math.min(1, (clickY - vRect.y) / vRect.height));

    return {
      x: Math.round(normX * 1000) / 1000,
      y: Math.round(normY * 1000) / 1000,
    };
  }, [getVisibleVideoRect]);

  // Canvas redraw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const vRect = getVisibleVideoRect();
    if (vRect.width <= 0 || vRect.height <= 0) return;

    // Draw letterbox margins
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    if (vRect.x > 0) {
      ctx.fillRect(0, 0, vRect.x, h);
      ctx.fillRect(vRect.x + vRect.width, 0, w - (vRect.x + vRect.width), h);
    }
    if (vRect.y > 0) {
      ctx.fillRect(0, 0, w, vRect.y);
      ctx.fillRect(0, vRect.y + vRect.height, w, h - (vRect.y + vRect.height));
    }

    // Border around active video frame
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vRect.x, vRect.y, vRect.width, vRect.height);

    if (points.length === 0) return;

    const toScreen = (pt: Point2D) => ({
      x: vRect.x + pt.x * vRect.width,
      y: vRect.y + pt.y * vRect.height,
    });

    const screenPoints = points.map(toScreen);

    // Draw polygon edges
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }

    if (isPolygonClosed) {
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.20)';
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      if (mousePos) {
        const mouseScreen = toScreen(mousePos);
        ctx.beginPath();
        const lastPt = screenPoints[screenPoints.length - 1];
        ctx.moveTo(lastPt.x, lastPt.y);
        ctx.lineTo(mouseScreen.x, mouseScreen.y);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Draw vertex handles
    screenPoints.forEach((pt, index) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, index === 0 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 && !isPolygonClosed ? '#10B981' : '#EF4444';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Vertex Index Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px "Roboto Mono", monospace';
      ctx.fillText(`${index + 1}`, pt.x + 8, pt.y - 8);
    });
  }, [points, isPolygonClosed, mousePos, getVisibleVideoRect, videoDims]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPolygonClosed) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (points.length >= 2) {
      const vRect = getVisibleVideoRect();
      const firstPt = points[0];
      const clickX = vRect.x + pt.x * vRect.width;
      const clickY = vRect.y + pt.y * vRect.height;
      const firstScreenX = vRect.x + firstPt.x * vRect.width;
      const firstScreenY = vRect.y + firstPt.y * vRect.height;

      const dist = Math.hypot(clickX - firstScreenX, clickY - firstScreenY);
      if (dist < 15 && points.length >= 3) {
        setIsPolygonClosed(true);
        setMousePos(null);
        return;
      }
    }

    setPoints((prev) => [...prev, pt]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPolygonClosed) return;
    const pt = getNormalizedPoint(e);
    setMousePos(pt);
  };

  const handleUndo = () => {
    if (isPolygonClosed) {
      setIsPolygonClosed(false);
    } else {
      setPoints((prev) => prev.slice(0, -1));
    }
  };

  const handleReset = () => {
    setPoints([]);
    setIsPolygonClosed(false);
    setMousePos(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMessage('Emergency area name is required.');
      return;
    }
    if (points.length < 3) {
      setErrorMessage('At least 3 polygon points are required to define an emergency area.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const payload: Partial<EmergencyZone> = {
      siteId,
      cameraId,
      name: name.trim(),
      description: description.trim(),
      zoneType,
      polygon: points,
      enabled,
      riskLevel,
      temporalThresholdMs,
      allowedObjectClasses,
    };

    try {
      let saved: EmergencyZone;
      if (initialZone && initialZone.zoneId) {
        const res = await api.updateEmergencyZone(initialZone.zoneId, payload);
        saved = res.zone;
      } else {
        const res = await api.createEmergencyZone(payload);
        saved = res.zone;
      }
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save emergency area.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#12151d] border border-white/10 rounded-2xl max-w-5xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0e1017] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <DoorOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {initialZone ? 'Edit Emergency Safety Area' : 'Configure New Emergency Safety Area'}
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                CAMERA: <span className="text-emerald-400 font-bold">{selectedCamera?.code || cameraId}</span> •{' '}
                TYPE: <span className="text-amber-400">{zoneType.replace(/_/g, ' ')}</span> •{' '}
                POLYGON: <span className="text-blue-400">{points.length} vertices</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-white/10">
          {/* Left: Real Video & Polygon Canvas */}
          <div className="lg:col-span-7 p-4 bg-[#0a0c10] flex flex-col justify-between">
            <div>
              <div
                ref={containerRef}
                className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center select-none"
              >
                {/* Real Camera Snapshot / Stream */}
                {selectedCamera?.streamUrl && (
                  <img
                    src={selectedCamera.streamUrl}
                    alt={`Live feed from ${selectedCamera.code}`}
                    className="w-full h-full object-contain pointer-events-none"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setVideoDims({ width: img.naturalWidth, height: img.naturalHeight });
                      }
                      setStreamState('LIVE');
                    }}
                    onError={() => {
                      setStreamState('OFFLINE');
                    }}
                  />
                )}

                {/* Interactive Polygon Canvas */}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  className="absolute inset-0 w-full h-full cursor-crosshair z-20"
                />

                {/* Status Indicator Overlays */}
                <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 pointer-events-none">
                  <div className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{selectedCamera?.code || cameraId}</span>
                  </div>
                  <div className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-slate-300">
                    {points.length} pts {isPolygonClosed ? '(Closed)' : '(Drawing...)'}
                  </div>
                </div>
              </div>

              {/* Drawing Controls */}
              <div className="mt-3 flex items-center justify-between text-xs font-mono">
                <div className="text-slate-400 text-[11px]">
                  {points.length < 3 ? (
                    <span className="text-amber-400">Click on video to add at least 3 points.</span>
                  ) : !isPolygonClosed ? (
                    <span className="text-emerald-400">Click first point (green) to close polygon.</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">✓ Enclosed emergency perimeter defined.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUndo}
                    disabled={points.length === 0}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded border border-white/10 text-[11px] disabled:opacity-40 transition flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={points.length === 0}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-rose-400 rounded border border-white/10 text-[11px] disabled:opacity-40 transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Breadcrumb info */}
            <div className="mt-4 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>CAMERA: <strong className="text-white">{selectedCamera?.code || cameraId}</strong></span>
              <span>AREA: <strong className="text-amber-300">{name || 'Unnamed'}</strong></span>
              <span>VERTICES: <strong className="text-emerald-400">{points.length}</strong></span>
            </div>
          </div>

          {/* Right: Emergency Area Configuration Form */}
          <div className="lg:col-span-5 p-5 space-y-4 bg-[#12151d] overflow-y-auto">
            {/* Camera Scoping */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                Parent Camera (Owner)
              </label>
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.code || c.id}>
                    {c.code} — {c.name} ({c.zone})
                  </option>
                ))}
              </select>
            </div>

            {/* Area Type */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                Emergency Safety Area Type
              </label>
              <div className="grid grid-cols-1 gap-2">
                {EMERGENCY_AREA_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = zoneType === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setZoneType(t.type)}
                      className={`p-2 rounded-lg border text-left flex items-start gap-2.5 transition ${
                        isSelected
                          ? 'bg-red-500/15 border-red-500/50 text-white'
                          : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-red-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="text-xs font-bold font-mono">{t.label}</div>
                        <div className="text-[10px] text-slate-400 leading-tight">{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Area Name & Description */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Area Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. West Main Exit Gate, FE-4 Clearance"
                  className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Operational details and EHS notes..."
                  className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Risk Level & Temporal Persistence */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Risk Level
                </label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as any)}
                  className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                >
                  <option value="LOW">LOW</option>
                  <option value="MODERATE">MODERATE</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Blockage Threshold
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={temporalThresholdMs}
                    onChange={(e) => setTemporalThresholdMs(Number(e.target.value))}
                    className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  />
                  <span className="text-[11px] font-mono text-slate-400">ms</span>
                </div>
              </div>
            </div>

            {/* Applicable Object Classes (Model Taxonomy Grounded - Section 6) */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                Monitored Obstruction Classes
              </label>
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-2">
                <label className="flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedObjectClasses.includes('person')}
                    onChange={(e) => {
                      if (e.target.checked) setAllowedObjectClasses((prev) => [...prev, 'person']);
                      else setAllowedObjectClasses((prev) => prev.filter((c) => c !== 'person'));
                    }}
                    className="rounded text-red-500"
                  />
                  <span>person</span>
                  <span className="text-[10px] text-emerald-400 font-bold ml-auto">[Supported by Model]</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedObjectClasses.includes('tool')}
                    onChange={(e) => {
                      if (e.target.checked) setAllowedObjectClasses((prev) => [...prev, 'tool']);
                      else setAllowedObjectClasses((prev) => prev.filter((c) => c !== 'tool'));
                    }}
                    className="rounded text-red-500"
                  />
                  <span>tool</span>
                  <span className="text-[10px] text-emerald-400 font-bold ml-auto">[Supported by Model]</span>
                </label>

                <div className="pt-1.5 border-t border-white/5 text-[10px] font-mono text-slate-500 leading-tight">
                  <Info className="w-3 h-3 inline mr-1 text-slate-400" />
                  Model SH17 taxonomy supports 17 classes. Unverifiable classes (boxes, pallets) are rejected to prevent fake alerts.
                </div>
              </div>
            </div>

            {/* Enabled Switch */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/10">
              <div>
                <span className="text-xs font-mono font-bold text-white block">Zone Monitoring Active</span>
                <span className="text-[10px] font-mono text-slate-400">Evaluate CCTV frames for obstruction</span>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-red-500"
              />
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono">
                {errorMessage}
              </div>
            )}

            {/* Save Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-mono transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-900/30 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Emergency Area'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
