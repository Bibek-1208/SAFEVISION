import React, { useState, useEffect } from 'react';
import {
  Bell,
  MapPin,
  Camera as CameraIcon,
  Shield,
  User,
  AlertTriangle,
  CheckCircle,
  Send,
  Radio,
  Sliders,
  LogOut,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Incident, Camera, Zone } from '../types';
import { api } from '../services/api';
import { FalsePositiveModal } from '../components/incidents/FalsePositiveModal';

export const MobileFieldOpsPage: React.FC = () => {
  const { user } = useAuth();
  const { liveIncidents, latestAlert, updateLocalIncident, triggerSimulatedDetection } = useSocket();
  const [activeTab, setActiveTab] = useState<'alerts' | 'zones' | 'camera' | 'profile'>('alerts');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showFalsePositive, setShowFalsePositive] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [actionDone, setActionDone] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getCameras().then((res) => {
      if (mounted) {
        const cams = res.cameras || [];
        setCameras(cams);
        if (cams.length > 0) {
          setSelectedCamId(cams[0].id);
        }
      }
    }).catch(console.error);

    api.getZones().then((res) => {
      if (mounted) {
        setZones(res.zones || []);
      }
    }).catch(console.error);

    return () => { mounted = false; };
  }, []);

  const activeList = liveIncidents.filter((i: Incident) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE');
  const displayIncident = selectedIncident || (activeList.length > 0 ? activeList[0] : null);
  const currentCamera = cameras.find((c) => c.id === selectedCamId) || (cameras.length > 0 ? cameras[0] : null);

  const handleAction = (status: Incident['status']) => {
    if (!displayIncident) return;
    const updated = { ...displayIncident, status };
    if (status === 'RESOLVED') {
      updated.resolvedAt = new Date().toISOString();
      updated.resolvedBy = user?.name || 'Field Safety Steward';
    }
    updateLocalIncident(updated);
    setActionDone(`Action: ${status} Recorded`);
    setTimeout(() => {
      setActionDone(null);
      setSelectedIncident(null);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center p-0 sm:p-4 text-gray-100">
      {/* Mobile Device Simulation Frame */}
      <div className="w-full max-w-md bg-[#141414] border-0 sm:border-2 border-[#2E2E2E] sm:rounded-[36px] overflow-hidden shadow-2xl flex flex-col h-screen sm:h-[840px] relative select-none">
        {/* Mobile Status Bar */}
        <div className="bg-[#121212] px-6 pt-3 pb-2 flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-[#222]">
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-safe animate-pulse" />
            <span className="text-[10px] text-safe font-bold">ONLINE • FIELD PORTAL</span>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="bg-[#181818] p-3.5 border-b border-[#242424] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-safe/20 border border-safe/40 flex items-center justify-center text-safe">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold font-mono text-white uppercase">
                {user?.role?.replace('_', ' ') || 'FIELD OPS'}
              </h2>
              <p className="text-[9px] text-gray-400 font-mono">
                {user?.siteIds?.[0] ? `SITE: ${user.siteIds[0]}` : 'SAFEVISION SECURE DISPATCH'}
              </p>
            </div>
          </div>

          <button
            onClick={() => triggerSimulatedDetection()}
            className="flex items-center gap-1 px-2.5 py-1 bg-critical/20 border border-critical/50 text-critical text-[10px] font-mono font-bold rounded active:scale-95"
          >
            <Sparkles className="w-3 h-3" />
            <span>TEST ALERT</span>
          </button>
        </div>

        {/* Action Confirmation Banner */}
        {actionDone && (
          <div className="bg-safe/20 border-b border-safe text-safe text-xs font-mono font-bold p-2 text-center animate-pulse">
            {actionDone}
          </div>
        )}

        {/* Screen Views */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
          {/* 1. Alerts Screen */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {displayIncident ? (
                <div className="hud-panel rounded-2xl p-4 border-2 border-critical/60 bg-[#1C1213] shadow-glow-critical space-y-3">
                  {/* Alert Header Badge */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-critical text-white text-[11px] font-mono font-extrabold rounded-md flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {displayIncident.severity?.toUpperCase() || 'CRITICAL'}: {displayIncident.violationType.toUpperCase().replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {new Date(displayIncident.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Evidence Snapshot (Mobile View) */}
                  <div className="rounded-xl overflow-hidden border border-[#333] relative aspect-video bg-black flex items-center justify-center">
                    <div className="w-full h-full bg-gradient-to-br from-[#241712] via-[#2D1B15] to-[#120F0D] flex items-center justify-center relative">
                      <div className="scanline absolute inset-0 opacity-40" />
                      <div className="border-2 border-dashed border-critical w-28 h-36 rounded flex flex-col items-center justify-center bg-critical/20 p-2 text-center">
                        <span className="text-[9px] font-bold text-yellow-400 uppercase">
                          {displayIncident.workerName || 'UNIDENTIFIED'}
                        </span>
                        <span className="text-[10px] font-bold text-white mt-2 uppercase">
                          {displayIncident.violationType.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[9px] font-mono text-gray-300">
                        {displayIncident.cameraId || 'CAM-STREAM'}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-critical text-white font-bold px-2 py-0.5 rounded text-[9px] font-mono">
                        CONF: {(displayIncident.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Worker & Location Info */}
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-400">WORKER:</span>
                      <span className="text-white font-bold">
                        {displayIncident.workerName} {displayIncident.workerId ? `[${displayIncident.workerId}]` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ZONE:</span>
                      <span className="text-warning font-bold">{displayIncident.zone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">RISK SCORE:</span>
                      <span className="text-critical font-extrabold">{displayIncident.riskScore} / 100</span>
                    </div>
                    {displayIncident.source && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">PROVENANCE:</span>
                        <span className="text-slate-300 font-bold">{displayIncident.source}</span>
                      </div>
                    )}
                  </div>

                  {/* Explainable Factor Pill */}
                  {displayIncident.whyFlagged && displayIncident.whyFlagged.length > 0 && (
                    <div className="p-2 rounded bg-[#201416] border border-critical/30 text-[11px] text-gray-300">
                      <p className="font-bold text-critical text-[10px] uppercase font-mono">Why Flagged:</p>
                      <p className="line-clamp-2">{displayIncident.whyFlagged[0]}</p>
                    </div>
                  )}

                  {/* Glove-Friendly Giant Action Buttons (48px - 52px height) */}
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handleAction('ACKNOWLEDGED')}
                      className="w-full h-12 bg-[#252525] active:bg-[#333] border border-[#3A3A3A] text-warning text-xs font-mono font-bold rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      ACKNOWLEDGE INCIDENT
                    </button>

                    <button
                      onClick={() => handleAction('DISPATCHED')}
                      className="w-full h-12 bg-gradient-to-r from-orange-500 to-amber-600 active:from-orange-600 active:to-amber-700 text-white text-xs font-mono font-extrabold rounded-xl transition shadow-glow-warning flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      DISPATCH STEWARD
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAction('RESOLVED')}
                        className="h-11 bg-safe active:bg-safe-dark text-black text-xs font-mono font-extrabold rounded-xl transition flex items-center justify-center gap-1.5 shadow-glow-safe"
                      >
                        <CheckCircle className="w-4 h-4" />
                        RESOLVE
                      </button>

                      <button
                        onClick={() => setShowFalsePositive(true)}
                        className="h-11 bg-[#222] active:bg-[#2A2A2A] border border-[#333] text-gray-400 text-xs font-mono font-bold rounded-xl transition flex items-center justify-center"
                      >
                        FALSE POSITIVE
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center text-gray-400 font-mono space-y-2">
                  <CheckCircle className="w-12 h-12 text-safe mx-auto opacity-80" />
                  <p className="text-sm font-bold text-white">ALL ZONES SECURE</p>
                  <p className="text-xs text-gray-500">No active critical breach notifications.</p>
                </div>
              )}

              {/* Other Active Alerts in Queue */}
              {activeList.length > 1 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                    QUEUED INCIDENTS ({activeList.length})
                  </span>
                  {activeList.map((inc: Incident) => (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className="p-3 rounded-xl bg-[#1C1C1C] border border-[#2B2B2B] flex items-center justify-between active:bg-[#252525] cursor-pointer"
                    >
                      <div>
                        <p className="text-xs font-bold text-white capitalize">
                          {inc.violationType.replace('_', ' ')}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {inc.workerName} • {inc.zone}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-critical">
                        {inc.severity.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Zones Screen */}
          {activeTab === 'zones' && (
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-gray-300 block mb-2">
                PLANT HAZARD ZONES ({zones.length} CONFIGURED)
              </span>
              {zones.length === 0 ? (
                <div className="p-8 bg-[#181818] border border-[#2B2B2B] rounded-xl text-center text-xs font-mono text-gray-500">
                  NO CONFIGURED ZONES FOUND
                </div>
              ) : (
                zones.map((z) => {
                  const zoneAlerts = activeList.filter((i) => i.zone === z.name || i.zone === z.id);
                  const isCrit = zoneAlerts.some((i) => i.severity === 'critical');
                  const isWarn = zoneAlerts.length > 0;
                  return (
                    <div
                      key={z.id}
                      className="p-3.5 bg-[#181818] border border-[#2B2B2B] rounded-xl flex items-center justify-between active:bg-[#202020]"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isCrit
                                ? 'bg-critical animate-ping'
                                : isWarn
                                ? 'bg-warning'
                                : 'bg-safe'
                            }`}
                          />
                          <span className="text-xs font-bold font-mono text-white">{z.name}</span>
                        </div>
                        <p className="text-[10px] font-mono text-gray-400 pl-5">
                          PPE: {z.requiredPPE?.join(', ') || 'Standard'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded border ${
                          isCrit
                            ? 'bg-critical/20 text-critical border-critical/30'
                            : isWarn
                            ? 'bg-warning/20 text-warning border-warning/30'
                            : 'bg-safe/20 text-safe border-safe/30'
                        }`}
                      >
                        {zoneAlerts.length > 0 ? `${zoneAlerts.length} BREACH` : 'SECURE'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 3. Live Camera Screen */}
          {activeTab === 'camera' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-gray-300 font-bold">MOBILE CCTV INGESTION</span>
                <span
                  className={`font-bold ${
                    currentCamera?.status === 'LIVE' ? 'text-safe' : 'text-slate-400'
                  }`}
                >
                  {currentCamera ? currentCamera.status : 'NO CAMERA'}
                </span>
              </div>

              {/* Mobile Viewport */}
              <div className="rounded-xl overflow-hidden border border-[#333] relative aspect-video bg-black flex items-center justify-center">
                {currentCamera ? (
                  <div className="w-full h-full bg-gradient-to-tr from-[#121212] via-[#1a1c22] to-[#121212] flex flex-col items-center justify-center relative p-4 text-center">
                    <div className="scanline absolute inset-0 opacity-20 pointer-events-none" />
                    <CameraIcon className={`w-8 h-8 mb-2 ${currentCamera.status === 'LIVE' ? 'text-safe' : 'text-slate-500'}`} />
                    <span className="text-xs font-bold text-white font-mono">{currentCamera.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono mt-1">
                      {currentCamera.status === 'LIVE'
                        ? `ACTIVE STREAM • ${currentCamera.resolution || '1080p'} • ${currentCamera.fps || 0} FPS`
                        : `STATUS: ${currentCamera.status} • NO ACTIVE INGESTION`}
                    </span>
                    <div className="absolute top-2 left-2 bg-black/80 text-[9px] font-mono px-2 py-0.5 rounded text-white">
                      {currentCamera.id}: {currentCamera.zone || 'UNASSIGNED'}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs font-mono">NO CAMERAS CONFIGURED</div>
                )}
              </div>

              {/* Camera Selector Strip */}
              {cameras.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {cameras.map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => setSelectedCamId(cam.id)}
                      className={`py-2 text-[10px] font-mono font-bold rounded-lg border transition truncate px-1 ${
                        selectedCamId === cam.id
                          ? 'bg-safe text-black border-safe'
                          : 'bg-[#202020] border-[#333] text-gray-300'
                      }`}
                      title={cam.name}
                    >
                      {cam.id}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] font-mono text-gray-500 text-center">NO SURVEILLANCE FEEDS REGISTERED</p>
              )}
            </div>
          )}

          {/* 4. Profile Screen */}
          {activeTab === 'profile' && (
            <div className="space-y-4 text-center pt-4">
              <div className="w-20 h-20 rounded-full bg-safe/20 border-2 border-safe flex items-center justify-center text-safe font-mono font-extrabold text-2xl mx-auto shadow-glow-safe">
                {user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'OP'}
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-mono">{user?.name || 'FIELD OPERATOR'}</h3>
                <p className="text-xs text-gray-400 font-mono">
                  {user?.role?.replace('_', ' ') || 'Safety Officer'} • ID: {user?.id || '—'}
                </p>
                <p className="text-[11px] text-safe font-mono mt-1">{user?.email || 'Field Ops Unit'}</p>
              </div>

              <div className="space-y-2 pt-4 text-left text-xs font-mono">
                <div className="p-3 bg-[#181818] border border-[#2B2B2B] rounded-xl flex justify-between">
                  <span className="text-gray-400">ASSIGNED ZONES:</span>
                  <span className="text-white font-bold">
                    {user?.zoneIds && user.zoneIds.length > 0 ? user.zoneIds.join(', ') : 'ALL PLANT ZONES'}
                  </span>
                </div>
                <div className="p-3 bg-[#181818] border border-[#2B2B2B] rounded-xl flex justify-between">
                  <span className="text-gray-400">SHIFT ROTATION:</span>
                  <span className="text-white font-bold">{user?.shift || 'STANDARD ROTATION'}</span>
                </div>
                <div className="p-3 bg-[#181818] border border-[#2B2B2B] rounded-xl flex justify-between">
                  <span className="text-gray-400">EMERGENCY SOS LINK:</span>
                  <span className="text-safe font-bold">ARMED</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Glove-Friendly Bottom Tab Bar */}
        <div className="bg-[#121212] border-t border-[#262626] grid grid-cols-4 h-16 shrink-0 text-[10px] font-mono select-none">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'alerts' ? 'text-safe bg-[#181818]' : 'text-gray-400'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {activeList.length > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-critical text-white font-bold rounded-full flex items-center justify-center text-[8px] animate-bounce">
                  {activeList.length}
                </span>
              )}
            </div>
            <span>Alerts</span>
          </button>

          <button
            onClick={() => setActiveTab('zones')}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'zones' ? 'text-safe bg-[#181818]' : 'text-gray-400'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span>Zones</span>
          </button>

          <button
            onClick={() => setActiveTab('camera')}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'camera' ? 'text-safe bg-[#181818]' : 'text-gray-400'
            }`}
          >
            <CameraIcon className="w-5 h-5" />
            <span>Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'profile' ? 'text-safe bg-[#181818]' : 'text-gray-400'
            }`}
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </button>
        </div>
      </div>

      {/* Sub-modal: False positive */}
      {displayIncident && (
        <FalsePositiveModal
          incident={displayIncident}
          isOpen={showFalsePositive}
          onClose={() => setShowFalsePositive(false)}
          onSuccess={() => handleAction('FALSE_POSITIVE')}
        />
      )}
    </div>
  );
};

