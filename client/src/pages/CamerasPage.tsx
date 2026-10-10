import React, { useState, useEffect } from 'react';
import {
  Camera as CameraIcon,
  Upload,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Cpu,
  Video,
  Grid,
  Maximize2,
  Plus,
  LayoutGrid,
  CameraOff,
  ShieldAlert,
} from 'lucide-react';
import { CameraFeedCard } from '../components/camera/CameraFeedCard';
import { MediaUploadModal } from '../components/camera/MediaUploadModal';
import { AddIpCameraModal } from '../components/camera/AddIpCameraModal';
import { EditCameraModal } from '../components/camera/EditCameraModal';
import { ZoneEditorModal } from '../components/camera/ZoneEditorModal';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { ExplainabilityDrawer } from '../components/incident/ExplainabilityDrawer';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Camera, Incident } from '../types';

type MatrixMode = 1 | 2 | 4 | 8 | 16;

export const CamerasPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canManageCameras = Boolean(user?.role === 'ADMIN' || user?.role === 'SAFETY_OFFICER' || hasPermission('camera:manage'));
  const canManageZones = Boolean(user?.role === 'ADMIN' || user?.role === 'SAFETY_OFFICER' || user?.role === 'PLANT_MANAGER' || hasPermission('zone:manage'));

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [primaryCamera, setPrimaryCamera] = useState<Camera | null>(null);
  const [selectedZone, setSelectedZone] = useState('ALL');
  const [matrixMode, setMatrixMode] = useState<MatrixMode>(4);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddIpModal, setShowAddIpModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [zoneEditorCamera, setZoneEditorCamera] = useState<Camera | null>(null);
  const [fullscreenCamera, setFullscreenCamera] = useState<Camera | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeIncidentsByCamera, setActiveIncidentsByCamera] = useState<Record<string, Incident[]>>({});
  const [activeUploadContext, setActiveUploadContext] = useState<{ zone: string; cameraId: string }>({
    zone: 'Unassigned Zone',
    cameraId: 'UPLOADED_MEDIA',
  });

  const { socket } = useSocket();

  // AI Health State
  const [aiHealth, setAiHealth] = useState<{
    connected: boolean;
    engineName?: string;
    statusText?: string;
  }>({ connected: false });

  const fetchCameras = async () => {
    try {
      const res = await api.getCameras();
      const camList = Array.isArray(res?.cameras) ? res.cameras : [];
      setCameras(camList);
      if (camList.length > 0) {
        setPrimaryCamera((prev) => prev && camList.some((c: any) => c.code === prev.code) ? prev : camList[0]);
      } else {
        setPrimaryCamera(null);
      }
    } catch (err) {
      console.error('[CamerasPage] Failed to fetch cameras:', err);
      setCameras([]);
      setPrimaryCamera(null);
    }
  };

  const fetchActiveIncidents = async () => {
    try {
      const res = await api.getIncidents({ limit: 100 });
      const list = res?.incidents || [];
      const map: Record<string, Incident[]> = {};
      list.forEach((inc: Incident) => {
        const isAct = !['RESOLVED', 'FALSE_POSITIVE', 'CLOSED'].includes(inc.status?.toUpperCase());
        if (isAct && inc.cameraId) {
          const codeKey = inc.cameraId.toUpperCase();
          if (!map[codeKey]) map[codeKey] = [];
          map[codeKey].push(inc);
        }
      });
      setActiveIncidentsByCamera(map);
    } catch (err) {
      console.error('[CamerasPage] Failed to fetch active incidents:', err);
    }
  };

  const checkAiHealth = async () => {
    try {
      const res = await fetch('/api/detection/health');
      if (res.ok) {
        const data = await res.json();
        const engine = data.aiEngine || {};
        const isUnconfigured = engine.model_status === 'unconfigured';
        setAiHealth({
          connected: Boolean(data.connected),
          engineName: isUnconfigured
            ? 'OpenCV Baseline (Weights Unconfigured)'
            : (engine.model_name || engine.ai_engine || 'Industrial CV'),
          statusText: isUnconfigured ? 'UNCONFIGURED' : (data.connected ? 'ACTIVE' : 'OFFLINE'),
        });
      } else {
        setAiHealth({ connected: false, statusText: 'OFFLINE' });
      }
    } catch (_) {
      setAiHealth({ connected: false, statusText: 'OFFLINE' });
    }
  };

  useEffect(() => {
    fetchCameras();
    fetchActiveIncidents();
    checkAiHealth();
    const interval = setInterval(checkAiHealth, 15000);

    const handleCamerasUpdated = () => {
      fetchCameras();
    };
    window.addEventListener('safevision:cameras-updated', handleCamerasUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('safevision:cameras-updated', handleCamerasUpdated);
    };
  }, []);

  // Real-time Socket.IO Sync for Camera Registry & Incidents
  useEffect(() => {
    if (!socket) return;

    const onCameraCreated = (newCam: Camera) => {
      setCameras((prev) => {
        if (prev.some((c) => c.code === newCam.code || c.id === newCam.id)) return prev;
        return [...prev, newCam];
      });
    };

    const onCameraUpdated = (updatedCam: Camera) => {
      setCameras((prev) =>
        prev.map((c) => (c.code === updatedCam.code || c.id === updatedCam.id ? { ...c, ...updatedCam } : c))
      );
      setPrimaryCamera((prev) =>
        prev && (prev.code === updatedCam.code || prev.id === updatedCam.id) ? { ...prev, ...updatedCam } : prev
      );
    };

    const onCameraDeleted = (data: any) => {
      const code = typeof data === 'string' ? data : data?.code || data?.cameraId;
      if (!code) return;
      setCameras((prev) => prev.filter((c) => c.code !== code && c.id !== code));
      setPrimaryCamera((prev) => (prev && (prev.code === code || prev.id === code) ? null : prev));
    };

    const onIncidentRefresh = () => {
      fetchActiveIncidents();
    };

    socket.on('camera.created', onCameraCreated);
    socket.on('camera.updated', onCameraUpdated);
    socket.on('camera.deleted', onCameraDeleted);
    socket.on('incident.created', onIncidentRefresh);
    socket.on('incident.updated', onIncidentRefresh);
    socket.on('incident:new', onIncidentRefresh);

    return () => {
      socket.off('camera.created', onCameraCreated);
      socket.off('camera.updated', onCameraUpdated);
      socket.off('camera.deleted', onCameraDeleted);
      socket.off('incident.created', onIncidentRefresh);
      socket.off('incident.updated', onIncidentRefresh);
      socket.off('incident:new', onIncidentRefresh);
    };
  }, [socket]);

  const handleCameraAdded = (newCam: Camera) => {
    setCameras((prev) => [...prev, newCam]);
    setPrimaryCamera(newCam);
  };

  const handleOpenUpload = (cam?: Camera) => {
    if (cam) {
      setActiveUploadContext({ zone: cam.zone || 'General Inspection', cameraId: cam.code || 'UPLOADED_MEDIA' });
    } else if (primaryCamera) {
      setActiveUploadContext({ zone: primaryCamera.zone || 'General Inspection', cameraId: primaryCamera.code || 'UPLOADED_MEDIA' });
    } else {
      setActiveUploadContext({ zone: 'General Inspection', cameraId: 'UPLOADED_MEDIA' });
    }
    setShowUploadModal(true);
  };

  const availableZones = Array.from(new Set(cameras.map((c) => c.zone).filter(Boolean)));

  const filteredCameras = (cameras || []).filter((cam) => {
    if (selectedZone === 'ALL') return true;
    return (cam.zone || '').toLowerCase().includes(selectedZone.toLowerCase());
  });

  // Determine grid columns based on matrix mode
  const getMatrixGridClass = () => {
    switch (matrixMode) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 md:grid-cols-2';
      case 4:
        return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
      case 8:
        return 'grid-cols-2 md:grid-cols-4';
      case 16:
        return 'grid-cols-2 md:grid-cols-4 xl:grid-cols-4';
      default:
        return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
    }
  };

  return (
    <div className="space-y-5 max-w-[1920px] mx-auto text-slate-100 select-none pb-12">
      {/* Header & Mission Bar */}
      <div className="bg-[#141720] border border-white/10 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CameraIcon className="w-5 h-5" />
            </div>
            <h1 className="text-base font-bold font-mono text-white tracking-wide">
              CCTV SURVEILLANCE FLEET & NEURAL STREAM MATRIX
            </h1>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 font-bold">
              {cameras.length} {cameras.length === 1 ? 'CAMERA CONFIGURED' : 'CAMERAS CONFIGURED'}
            </span>
            {aiHealth.connected ? (
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AI ENGINE ONLINE ({aiHealth.engineName})
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-950/40 text-red-400 border border-red-900/60 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                AI MODEL OFFLINE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Zero simulation mode. Connect browser webcam, upload video recordings, or link industrial IP/RTSP streams.
          </p>
        </div>

        {/* Real Input Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleOpenUpload()}
            className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono text-white transition active:scale-95 shadow-sm"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Upload Media Analysis</span>
          </button>

          {canManageCameras && (
            <button
              onClick={() => setShowAddIpModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs font-mono transition active:scale-95 shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Attach IP / CCTV Stream</span>
            </button>
          )}

          {canManageZones && (
            <button
              onClick={() => setZoneEditorCamera(primaryCamera || cameras[0] || null)}
              disabled={cameras.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-mono font-bold transition active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title="Configure polygonal restricted zones on camera feeds"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Configure Zones</span>
            </button>
          )}

          <button
            onClick={fetchCameras}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition"
            title="Refresh camera registry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* If No Cameras Configured */}
      {cameras.length === 0 ? (
        <div className="bg-[#141720] border border-white/10 p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 shadow-xl">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-400">
            <CameraOff className="w-10 h-10 text-slate-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold font-mono text-white tracking-wide">
              No cameras configured
            </h2>
            <p className="text-xs text-slate-400 font-mono max-w-md">
              {canManageCameras
                ? 'There are currently no active CCTV or RTSP cameras registered in the system. Attach an industrial IP camera or local stream to begin live inference monitoring.'
                : 'No active camera feeds are currently assigned or active in your authorized supervision zones.'}
            </p>
          </div>
          {canManageCameras && (
            <button
              onClick={() => setShowAddIpModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs font-mono transition active:scale-95 shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Attach IP / CCTV Stream</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Primary Hero Camera Viewport (If Single Focus Mode) */}
          {primaryCamera && matrixMode === 1 && (
            <div className="bg-[#141720] p-4 rounded-2xl border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs font-bold text-white tracking-wide">
                    PRIMARY VIEWPORT: {primaryCamera.code} — {primaryCamera.name} ({primaryCamera.zone})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFullscreenCamera(primaryCamera)}
                    className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white px-2 py-1 bg-white/5 rounded-lg border border-white/10"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Fullscreen</span>
                  </button>
                </div>
              </div>
              <CameraFeedCard
                key={primaryCamera.id}
                camera={primaryCamera}
                isPrimary={true}
                activeIncidents={activeIncidentsByCamera[(primaryCamera.code || '').toUpperCase()] || activeIncidentsByCamera[(primaryCamera.id || '').toUpperCase()] || []}
                onRealIncidentDetected={(inc) => setSelectedIncident(inc)}
                onOpenIncident={(inc) => setSelectedIncident(inc)}
                onRequestUpload={(cam) => handleOpenUpload(cam)}
                onRequestAddIp={canManageCameras ? () => setShowAddIpModal(true) : undefined}
                onToggleFullscreen={() => setFullscreenCamera(primaryCamera)}
                onConfigureZones={canManageZones ? (cam) => setZoneEditorCamera(cam) : undefined}
                onEditCamera={canManageCameras ? (cam) => setEditingCamera(cam) : undefined}
                onCameraDeleted={canManageCameras ? (code) => {
                  setCameras((prev) => prev.filter((c) => c.code !== code));
                  if (primaryCamera?.code === code) setPrimaryCamera(null);
                } : undefined}
                onCameraUpdated={(updated) => {
                  setCameras((prev) => prev.map((c) => (c.code === updated.code ? { ...c, ...updated } : c)));
                  setPrimaryCamera((prev) => (prev?.code === updated.code ? { ...prev, ...updated } : prev));
                }}
              />
            </div>
          )}

          {/* Matrix Controls & Zone Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#141720] p-3.5 rounded-xl border border-white/10 text-xs font-mono">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-400 font-bold">
                <Filter className="w-3.5 h-3.5" />
                <span>FILTER ZONE:</span>
              </div>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-1 text-white outline-none"
              >
                <option value="ALL">All Hazard Zones ({cameras.length})</option>
                {availableZones.map((z: any) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>

            {/* Matrix View Selector (1, 2, 4, 8, 16) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">
                MATRIX GRID:
              </span>
              {([1, 2, 4, 8, 16] as MatrixMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMatrixMode(mode)}
                  className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold transition ${
                    matrixMode === mode
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-[#101318] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 1 ? '1 Focus' : `${mode} Grid`}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Grid (Matrix view) */}
          {matrixMode > 1 && (
            <div className={`grid ${getMatrixGridClass()} gap-4`}>
              {filteredCameras.slice(0, matrixMode).map((cam) => (
                <ErrorBoundary key={cam.id} fallbackTitle={`Stream failure in ${cam.code}`}>
                  <CameraFeedCard
                    camera={cam}
                    isPrimary={matrixMode <= 2}
                    activeIncidents={activeIncidentsByCamera[(cam.code || '').toUpperCase()] || activeIncidentsByCamera[(cam.id || '').toUpperCase()] || []}
                    onSelect={() => setPrimaryCamera(cam)}
                    onRealIncidentDetected={(inc) => setSelectedIncident(inc)}
                    onOpenIncident={(inc) => setSelectedIncident(inc)}
                    onRequestUpload={(c) => handleOpenUpload(c)}
                    onRequestAddIp={canManageCameras ? () => setShowAddIpModal(true) : undefined}
                    onToggleFullscreen={() => setFullscreenCamera(cam)}
                    onConfigureZones={canManageZones ? (c) => setZoneEditorCamera(c) : undefined}
                    onEditCamera={canManageCameras ? (c) => setEditingCamera(c) : undefined}
                    onCameraDeleted={canManageCameras ? (code) => {
                      setCameras((prev) => prev.filter((c) => c.code !== code));
                      if (primaryCamera?.code === code) setPrimaryCamera(null);
                    } : undefined}
                    onCameraUpdated={(updated) => {
                      setCameras((prev) => prev.map((c) => (c.code === updated.code ? { ...c, ...updated } : c)));
                      setPrimaryCamera((prev) => (prev?.code === updated.code ? { ...prev, ...updated } : prev));
                    }}
                  />
                </ErrorBoundary>
              ))}
            </div>
          )}
        </>
      )}

      {/* Fullscreen Camera Modal View */}
      {fullscreenCamera && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="font-mono text-sm font-bold text-white tracking-wide">
                FULLSCREEN SURVEILLANCE FEED — {fullscreenCamera.code}: {fullscreenCamera.name} ({fullscreenCamera.zone})
              </h2>
            </div>
            <button
              onClick={() => setFullscreenCamera(null)}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-xl transition"
            >
              Exit Fullscreen (Esc)
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="w-full max-w-6xl aspect-video">
              <CameraFeedCard
                key={`fullscreen-${fullscreenCamera.id}`}
                camera={fullscreenCamera}
                isPrimary={true}
                activeIncidents={activeIncidentsByCamera[(fullscreenCamera.code || '').toUpperCase()] || activeIncidentsByCamera[(fullscreenCamera.id || '').toUpperCase()] || []}
                onRealIncidentDetected={(inc) => setSelectedIncident(inc)}
                onOpenIncident={(inc) => setSelectedIncident(inc)}
                onRequestUpload={(c) => handleOpenUpload(c)}
                onRequestAddIp={canManageCameras ? () => setShowAddIpModal(true) : undefined}
                onConfigureZones={canManageZones ? (c) => setZoneEditorCamera(c) : undefined}
                onEditCamera={canManageCameras ? (c) => setEditingCamera(c) : undefined}
                onCameraDeleted={canManageCameras ? (code) => {
                  setCameras((prev) => prev.filter((c) => c.code !== code));
                  setFullscreenCamera(null);
                  if (primaryCamera?.code === code) setPrimaryCamera(null);
                } : undefined}
                onCameraUpdated={(updated) => {
                  setCameras((prev) => prev.map((c) => (c.code === updated.code ? { ...c, ...updated } : c)));
                  setFullscreenCamera((prev) => (prev?.code === updated.code ? { ...prev, ...updated } : prev));
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Media Analysis Modal */}
      <MediaUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        zone={activeUploadContext.zone}
        cameraId={activeUploadContext.cameraId}
        onAnalysisComplete={(res) => {
          if (res.createdIncidents && res.createdIncidents.length > 0) {
            setSelectedIncident(res.createdIncidents[0]);
          }
        }}
      />

      {/* Add IP Camera Modal */}
      <AddIpCameraModal
        isOpen={showAddIpModal}
        onClose={() => setShowAddIpModal(false)}
        onCameraAdded={handleCameraAdded}
      />

      {/* Edit Camera Modal */}
      {editingCamera && (
        <EditCameraModal
          isOpen={Boolean(editingCamera)}
          camera={editingCamera}
          onClose={() => setEditingCamera(null)}
          onSaved={(updated) => {
            setCameras((prev) => prev.map((c) => (c.code === updated.code ? { ...c, ...updated } : c)));
            if (primaryCamera?.code === updated.code) {
              setPrimaryCamera((prev) => (prev ? { ...prev, ...updated } : null));
            }
            setEditingCamera(null);
            fetchCameras();
          }}
          zones={availableZones}
        />
      )}

      {/* Zone Editor Modal */}
      {zoneEditorCamera && (
        <ZoneEditorModal
          isOpen={Boolean(zoneEditorCamera)}
          onClose={() => setZoneEditorCamera(null)}
          onSaved={() => {
            setZoneEditorCamera(null);
            fetchCameras();
          }}
          defaultCameraId={zoneEditorCamera.code}
          cameras={cameras}
        />
      )}

      {/* Explainability Drawer */}
      <ExplainabilityDrawer
        incident={selectedIncident}
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
};
