import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Video,
  Camera as CameraIcon,
  Volume2,
  VolumeX,
  AlertTriangle,
  Radio,
  Send,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Eye
} from 'lucide-react';
import { api } from '../../services/api';
import { CameraFeedCard } from '../../components/camera/CameraFeedCard';
import { IncidentTriagePanel } from '../../components/incidents/IncidentTriagePanel';
import { ExplainabilityDrawer } from '../../components/incident/ExplainabilityDrawer';
import { ReportHazardModal } from '../../components/hazard/ReportHazardModal';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Camera, Incident } from '../../types';

export const SafetyOfficerDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { liveIncidents, latestAlert, clearLatestAlert } = useSocket();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [primaryCamera, setPrimaryCamera] = useState<Camera | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [camsRes, incRes] = await Promise.all([
        api.getCameras(),
        api.getIncidents({ limit: 20 }),
      ]);
      const camList = Array.isArray(camsRes?.cameras) ? camsRes.cameras : [];
      const incList = Array.isArray(incRes?.incidents) ? incRes.incidents : [];
      setCameras(camList);
      setIncidents(incList);

      if (camList.length > 0) {
        setPrimaryCamera(camList[0]);
      }
    } catch (err) {
      console.error('Failed to load safety officer feeds:', err);
      setCameras([]);
      setIncidents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allIncidents = [
    ...(liveIncidents || []).filter((li) => !(incidents || []).some((i) => i.id === li.id)),
    ...(incidents || []),
  ];

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Officer Command Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Radio className="w-7 h-7 text-amber-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                TACTICAL SURVEILLANCE & RESPONSE
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                LIVE RTSP / WEBCAM INGEST
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Surveillance Command Room</h1>
            <p className="text-xs text-slate-400">
              Station Officer: <span className="text-white font-semibold">{user?.name}</span> • Rapid Dispatch Active
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono border transition-all ${
              soundEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-white/5 border-white/10 text-slate-500'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            SIREN {soundEnabled ? 'ARMED' : 'MUTED'}
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH FEEDS
          </button>
          <button
            onClick={() => setIsHazardModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            REPORT HAZARD
          </button>
        </div>
      </div>

      {/* Real-time Alert Banner if firing */}
      {latestAlert && latestAlert.status === 'DETECTED' && (
        <div className="p-4 rounded-xl bg-red-500/15 border-2 border-red-500 text-red-300 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <div>
              <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-widest">
                CRITICAL SAFETY BREACH IN PROGRESS
              </div>
              <div className="text-sm font-semibold text-white">
                {latestAlert.violationType.replace(/_/g, ' ')} detected in {latestAlert.zone}
              </div>
            </div>
          </div>
          <button
            onClick={clearLatestAlert}
            className="px-3 py-1 rounded bg-red-500 text-black font-bold text-xs"
          >
            Acknowledge Alert
          </button>
        </div>
      )}

      {/* Main Command Room: Live Camera Feed + Live Triage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Primary Camera & Grid Selector */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Primary Optical Ingest</h3>
                {primaryCamera && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                    {primaryCamera.code} • {primaryCamera.zone}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                INFERENCE RUNNING
              </span>
            </div>

            {primaryCamera ? (
              <CameraFeedCard camera={primaryCamera} />
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 text-xs font-mono">
                No active camera streams found.
              </div>
            )}

            {/* Camera Feed Thumbnail Strip */}
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(cameras || []).map((cam) => {
                const isSelected = primaryCamera?.id === cam.id;
                return (
                  <button
                    key={cam.id}
                    onClick={() => setPrimaryCamera(cam)}
                    className={`p-2 rounded-xl text-left font-mono text-[11px] border transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-bold ring-1 ring-amber-500/30'
                        : 'bg-[#0e1017] border-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="truncate">{cam.code}</div>
                    <div className="text-[9px] text-slate-500 truncate">{cam.zone}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Incident Triage & Quick Response */}
        <div className="space-y-4">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Tactical Triage Queue
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {allIncidents.filter((i) => i.status === 'DETECTED').length} UNRESOLVED
              </span>
            </div>

            <IncidentTriagePanel
              incidents={allIncidents}
              onIncidentUpdated={loadData}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          </div>
        </div>
      </div>

      {/* Explainability / False Positive Drawer */}
      {selectedIncident && (
        <ExplainabilityDrawer
          incident={selectedIncident}
          isOpen={!!selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}

      {/* Report Hazard Modal */}
      <ReportHazardModal
        isOpen={isHazardModalOpen}
        onClose={() => setIsHazardModalOpen(false)}
      />
    </div>
  );
};
