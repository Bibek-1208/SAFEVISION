import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Camera,
  Radio,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Volume2,
  Clock,
  HardDrive,
  Lock,
  Layers
} from 'lucide-react';
import { api } from '../services/api';
import { safetyAudio } from '../services/SafetyAudioService';

export const SystemHealthPage: React.FC = () => {
  const [health, setHealth] = useState<any | null>(null);
  const [dbHealth, setDbHealth] = useState<any | null>(null);
  const [aiHealth, setAiHealth] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProbingCameras, setIsProbingCameras] = useState(false);
  const [auditVerification, setAuditVerification] = useState<any | null>(null);
  const [isVerifyingAudit, setIsVerifyingAudit] = useState(false);
  const [audioArmed, setAudioArmed] = useState(safetyAudio.isArmed());
  const [audioFeedback, setAudioFeedback] = useState<string | null>(null);

  const fetchAllHealth = async () => {
    setIsLoading(true);
    try {
      const [h, db, ai] = await Promise.allSettled([
        api.getHealth(),
        api.getDatabaseHealth(),
        api.getAiHealth(),
      ]);

      if (h.status === 'fulfilled') setHealth(h.value);
      if (db.status === 'fulfilled') setDbHealth(db.value);
      if (ai.status === 'fulfilled') setAiHealth(ai.value);
    } catch (err) {
      console.error('Failed to query system health', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllHealth();
    const interval = setInterval(fetchAllHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleVerifyAudit = async () => {
    setIsVerifyingAudit(true);
    try {
      const res = await api.verifyAuditLogs();
      setAuditVerification(res);
    } catch (err: any) {
      setAuditVerification({
        verified: false,
        reason: err.message || 'Audit verification endpoint failed',
      });
    } finally {
      setIsVerifyingAudit(false);
    }
  };

  const handleRefreshCameras = async () => {
    setIsProbingCameras(true);
    try {
      await api.refreshCameras();
      await fetchAllHealth();
    } catch (err) {
      console.error('Camera probe failed', err);
    } finally {
      setIsProbingCameras(false);
    }
  };

  const handleTestAudio = async () => {
    setAudioFeedback('Playing 0.8s acoustic test tone...');
    await safetyAudio.testSiren();
    setAudioArmed(safetyAudio.isArmed());
    setTimeout(() => setAudioFeedback(null), 2500);
  };

  const handleToggleAudio = async () => {
    if (safetyAudio.isArmed()) {
      safetyAudio.disarm();
      setAudioArmed(false);
      setAudioFeedback('Safety audio muted / disarmed.');
    } else {
      const ok = await safetyAudio.arm();
      setAudioArmed(ok);
      setAudioFeedback(ok ? 'Safety audio siren ARMED successfully!' : 'Could not initialize Web Audio.');
    }
    setTimeout(() => setAudioFeedback(null), 3000);
  };

  const isHealthy = health?.status === 'HEALTHY';

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
              isHealthy
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                  isHealthy
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                STATUS: {health?.status || (isLoading ? 'PROBING...' : 'DEGRADED')}
              </span>
              <span className="text-xs font-mono text-slate-400">COMMAND CORE DIAGNOSTICS</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Operational Diagnostics & Truth Telemetry</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAllHealth}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH METRICS
          </button>
        </div>
      </div>

      {/* Degraded Reason Banner if any */}
      {health?.degradedReasons && health.degradedReasons.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-400 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span>HONEST OPERATIONAL STATUS NOTICE (DEGRADED)</span>
          </div>
          {health.degradedReasons.map((reason: string, i: number) => (
            <p key={i} className="pl-6 text-slate-300">
              • {reason}
            </p>
          ))}
        </div>
      )}

      {/* Grid of Diagnostics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 1. AI Vision Inference Microservice */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-white text-sm">AI Computer Vision Service</h3>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                aiHealth?.status === 'ONLINE'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
            >
              {aiHealth?.status || 'OFFLINE'}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono bg-[#0e1017] p-3 rounded-xl border border-white/5">
            <div className="flex justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <span className="text-white">{aiHealth?.url || 'http://localhost:8000'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Measured Latency:</span>
              <span className="text-amber-400">{aiHealth?.latencyMs !== null ? `${aiHealth?.latencyMs} ms` : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pipeline / Engine:</span>
              <span className="text-slate-200 text-right max-w-[170px] truncate" title={aiHealth?.telemetry?.ai_engine}>
                {aiHealth?.telemetry?.ai_engine || (aiHealth?.status === 'ONLINE' ? 'Diagnostic AI Vision' : 'UNAVAILABLE')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Model Weights:</span>
              <span className="text-amber-300">{aiHealth?.telemetry?.model_name || (aiHealth?.status === 'ONLINE' ? 'None (Unconfigured)' : 'UNAVAILABLE')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Configuration:</span>
              <span className="text-slate-300">{aiHealth?.telemetry?.model_status || (aiHealth?.status === 'ONLINE' ? 'unconfigured' : 'OFFLINE')}</span>
            </div>
          </div>
        </div>

        {/* 2. Database & Data Store */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">Industrial Persistence Layer</h3>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                dbHealth?.connected
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}
            >
              {dbHealth?.connected ? 'MONGODB NATIVE' : 'DATABASE OFFLINE'}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono bg-[#0e1017] p-3 rounded-xl border border-white/5">
            <div className="flex justify-between">
              <span className="text-slate-400">Operational Mode:</span>
              <span className="text-slate-200">{dbHealth?.mode || (dbHealth?.connected ? 'MongoDB Native' : 'DATABASE OFFLINE')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Registered Users:</span>
              <span className="text-white font-bold">{dbHealth?.counts?.users ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Logged Incidents:</span>
              <span className="text-rose-400 font-bold">{dbHealth?.counts?.incidents ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Active Shift Rotas:</span>
              <span className="text-white">{dbHealth?.counts?.shifts ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Workforce Records:</span>
              <span className="text-blue-400">{dbHealth?.counts?.employees ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Statutory Rules:</span>
              <span className="text-white">{dbHealth?.counts?.safetyRules ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* 3. Camera Infrastructure Matrix */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Camera className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-white text-sm">Camera Surveillance Ingestion</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
              {health?.components?.cameras?.live || 0} / {health?.components?.cameras?.total || 0} LIVE
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono bg-[#0e1017] p-3 rounded-xl border border-white/5">
            <div className="flex justify-between">
              <span className="text-slate-400">Total Configured Feeds:</span>
              <span className="text-white">{health?.components?.cameras?.total ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Active Live Streams:</span>
              <span className="text-emerald-400 font-bold">{health?.components?.cameras?.live ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Offline Feeds:</span>
              <span className="text-rose-400 font-bold">{health?.components?.cameras?.offline ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Input Protocols:</span>
              <span className="text-slate-300">Webcam / RTSP / MP4</span>
            </div>
          </div>

          <button
            onClick={handleRefreshCameras}
            disabled={isProbingCameras}
            className="w-full py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-mono font-bold border border-purple-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProbingCameras ? 'animate-spin' : ''}`} />
            {isProbingCameras ? 'PROBING NETWORK CAMERAS...' : 'PROBE NETWORK CAMERAS'}
          </button>
        </div>

        {/* 4. Cryptographic Audit Log Integrity */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white text-sm">SHA-256 Audit Integrity</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
              BLOCKCHAIN-CHAINED
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Each administrative and incident action is cryptographically signed with SHA-256 and chained to the previous hash.
          </p>

          {auditVerification && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                auditVerification.verified
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {auditVerification.verified ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{auditVerification.verified ? 'CHAIN VERIFIED (100% UNTAMPERED)' : 'TAMPERING DETECTED!'}</span>
              </div>
              <p>Total Chained Records: {auditVerification.totalLogs}</p>
              {auditVerification.tamperedAt && <p className="text-rose-400">Broken at: {auditVerification.tamperedAt}</p>}
            </div>
          )}

          <button
            onClick={handleVerifyAudit}
            disabled={isVerifyingAudit}
            className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isVerifyingAudit ? 'animate-spin' : ''}`} />
            {isVerifyingAudit ? 'COMPUTING HASH CHAIN...' : 'VERIFY AUDIT LOG INTEGRITY'}
          </button>
        </div>

        {/* 5. Acoustic Safety Audio Siren */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-5 h-5 text-rose-400" />
              <h3 className="font-bold text-white text-sm">Industrial Acoustic Siren</h3>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                audioArmed
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-white/10'
              }`}
            >
              {audioArmed ? 'ARMED' : 'MUTED'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Synthesizes real-time acoustic alarms via browser Web Audio API upon critical PPE or fire violations.
          </p>

          {audioFeedback && (
            <p className="text-xs font-mono text-emerald-300 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              {audioFeedback}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleToggleAudio}
              className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-colors ${
                audioArmed
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                  : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500'
              }`}
            >
              {audioArmed ? 'MUTE SIREN' : 'ARM SIREN'}
            </button>
            <button
              onClick={handleTestAudio}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono font-bold border border-white/10 transition-colors"
            >
              TEST PULSE (0.8s)
            </button>
          </div>
        </div>

        {/* 6. Command Core Process Telemetry */}
        <div className="p-5 rounded-2xl bg-[#12151b] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Radio className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white text-sm">Command Core Runtime</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
              SOCKET.IO V4.8
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono bg-[#0e1017] p-3 rounded-xl border border-white/5">
            <div className="flex justify-between">
              <span className="text-slate-400">Process Uptime:</span>
              <span className="text-white">{health?.uptimeSeconds ? `${health.uptimeSeconds}s` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Memory Heap:</span>
              <span className="text-slate-200">{health?.components?.process?.memoryUsageMB ? `${health.components.process.memoryUsageMB} MB` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Node Engine:</span>
              <span className="text-slate-300">{health?.components?.process?.nodeVersion || 'v20+'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">WebSocket Transport:</span>
              <span className="text-emerald-400">ACTIVE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
