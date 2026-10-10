import React, { useState, useEffect } from 'react';
import {
  User,
  AlertTriangle,
  Clock,
  Camera as CameraIcon,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Eye,
  CheckSquare,
} from 'lucide-react';
import { LoneWorkerState } from '../../types';
import { api } from '../../services/api';
import { useSocket } from '../../context/SocketContext';

interface LoneWorkerWidgetProps {
  onSelectCamera?: (cameraId: string) => void;
  onOpenEditor?: () => void;
}

export const LoneWorkerWidget: React.FC<LoneWorkerWidgetProps> = ({
  onSelectCamera,
  onOpenEditor,
}) => {
  const { socket } = useSocket();
  const [data, setData] = useState<{
    summary: {
      totalConfigured: number;
      activeIsolatedCount: number;
      warningCount: number;
      checkInRequiredCount: number;
      openIncidentsCount: number;
      safeCount: number;
      offlineCount: number;
    };
    states: LoneWorkerState[];
  }>({
    summary: {
      totalConfigured: 0,
      activeIsolatedCount: 0,
      warningCount: 0,
      checkInRequiredCount: 0,
      openIncidentsCount: 0,
      safeCount: 0,
      offlineCount: 0,
    },
    states: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [submittingCheckInZoneId, setSubmittingCheckInZoneId] = useState<string | null>(null);

  const fetchStates = async () => {
    try {
      const res = await api.getLoneWorkerStates();
      if (res && res.summary) {
        setData(res);
        setLastRefresh(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    } catch (err) {
      console.debug('[LoneWorkerWidget] Failed to fetch states:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStates();

    const interval = setInterval(fetchStates, 3000); // 3s polling for real telemetry sync

    const handleUpdate = () => {
      fetchStates();
    };

    if (socket) {
      socket.on('zone:created', handleUpdate);
      socket.on('zone:updated', handleUpdate);
      socket.on('zone:toggled', handleUpdate);
      socket.on('zone:deleted', handleUpdate);
      socket.on('lone_worker.warning', handleUpdate);
      socket.on('lone_worker.checkin_required', handleUpdate);
      socket.on('lone_worker.incident_created', handleUpdate);
      socket.on('lone_worker.resolved', handleUpdate);
      socket.on('lone_worker.checked_in', handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('zone:created', handleUpdate);
        socket.off('zone:updated', handleUpdate);
        socket.off('zone:toggled', handleUpdate);
        socket.off('zone:deleted', handleUpdate);
        socket.off('lone_worker.warning', handleUpdate);
        socket.off('lone_worker.checkin_required', handleUpdate);
        socket.off('lone_worker.incident_created', handleUpdate);
        socket.off('lone_worker.resolved', handleUpdate);
        socket.off('lone_worker.checked_in', handleUpdate);
      }
    };
  }, [socket]);

  const handleCheckIn = async (zone: LoneWorkerState) => {
    setSubmittingCheckInZoneId(zone.zoneId);
    try {
      await api.submitLoneWorkerCheckIn(
        zone.zoneId,
        zone.activeTrackId,
        'Operator verified worker safety via dashboard'
      );
      await fetchStates();
    } catch (err: any) {
      alert(`Check-in failed: ${err.message || 'Error recording check-in'}`);
    } finally {
      setSubmittingCheckInZoneId(null);
    }
  };

  const { summary, states } = data;

  const getStateBadge = (state: LoneWorkerState['state']) => {
    switch (state) {
      case 'INCIDENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
            INCIDENT
          </span>
        );
      case 'CHECK_IN_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse">
            CHECK-IN REQ
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            WARNING
          </span>
        );
      case 'ISOLATED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            ISOLATED
          </span>
        );
      case 'INSIDE_CANDIDATE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
            CANDIDATE
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            RESOLVED
          </span>
        );
      case 'CLEAR':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            SAFE
          </span>
        );
      case 'DISABLED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10">
            DISABLED
          </span>
        );
      case 'CAMERA_OFFLINE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-700/40 text-slate-400 border border-slate-600/40">
            OFFLINE
          </span>
        );
      case 'AI_INFERENCE_UNAVAILABLE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
            AI UNAVAILABLE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10">
            {state}
          </span>
        );
    }
  };

  const getRiskBadge = (risk: string) => {
    const norm = (risk || 'HIGH').toUpperCase();
    if (norm === 'CRITICAL') {
      return <span className="text-[10px] font-mono font-bold text-rose-400">CRITICAL</span>;
    }
    if (norm === 'HIGH') {
      return <span className="text-[10px] font-mono font-bold text-amber-400">HIGH</span>;
    }
    if (norm === 'MODERATE') {
      return <span className="text-[10px] font-mono font-bold text-yellow-400">MODERATE</span>;
    }
    return <span className="text-[10px] font-mono text-emerald-400">LOW</span>;
  };

  const formatSec = (s: number) => {
    if (!s || s <= 0) return '0s';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs.toFixed(0)}s`;
  };

  return (
    <div className="bg-[#141720] border border-white/10 rounded-xl overflow-hidden p-4 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono text-white tracking-wider uppercase flex items-center gap-2">
              <span>LONE WORKER MONITORING</span>
              {(summary.warningCount > 0 || summary.checkInRequiredCount > 0 || summary.openIncidentsCount > 0) && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              )}
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Live Isolation & Safety Timer Engine (Phase 9.3)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
              Updated: {lastRefresh}
            </span>
          )}
          <button
            onClick={fetchStates}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition"
            title="Refresh Lone Worker States"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Counters (Section 23) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">CONFIGURED ZONES</span>
          <span className="text-sm font-bold text-white">{summary.totalConfigured}</span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">ACTIVE ISOLATED</span>
          <span className={`text-sm font-bold ${summary.activeIsolatedCount > 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
            {summary.activeIsolatedCount}
          </span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">WARNINGS</span>
          <span className={`text-sm font-bold ${summary.warningCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
            {summary.warningCount}
          </span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">CHECK-INS REQ</span>
          <span className={`text-sm font-bold ${summary.checkInRequiredCount > 0 ? 'text-orange-400 animate-pulse' : 'text-slate-400'}`}>
            {summary.checkInRequiredCount}
          </span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-slate-500 block">OPEN INCIDENTS</span>
          <span className={`text-sm font-bold ${summary.openIncidentsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
            {summary.openIncidentsCount}
          </span>
        </div>
      </div>

      {/* Lone Worker Zone Table */}
      {summary.totalConfigured === 0 ? (
        <div className="py-6 px-4 bg-[#0e1017] rounded-lg border border-dashed border-white/10 text-center font-mono space-y-2">
          <User className="w-6 h-6 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">
            NO LONE WORKER ZONES CONFIGURED
          </p>
          <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
            Designate isolated areas, pump houses, machine rooms, and hazardous vaults in Zone Editor.
          </p>
          {onOpenEditor && (
            <button
              onClick={onOpenEditor}
              className="mt-2 px-3 py-1 bg-white/5 hover:bg-white/10 text-cyan-300 rounded text-xs transition border border-white/10"
            >
              Configure Lone Worker Zones
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0e1017] text-slate-400 text-[10px] uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="py-2 px-3">Zone</th>
                <th className="py-2 px-2">Camera</th>
                <th className="py-2 px-2">Worker Track</th>
                <th className="py-2 px-2">Workers</th>
                <th className="py-2 px-2">State</th>
                <th className="py-2 px-2">Duration / Limit</th>
                <th className="py-2 px-2">Risk</th>
                <th className="py-2 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#0a0c10]">
              {states.map((z) => {
                const isCheckInCandidate =
                  z.checkInRequired &&
                  (z.state === 'CHECK_IN_REQUIRED' || z.state === 'WARNING' || z.state === 'ISOLATED');

                return (
                  <tr key={z.zoneId} className="hover:bg-white/[0.02] transition">
                    <td className="py-2 px-3 font-semibold text-white">
                      {z.name}
                    </td>
                    <td className="py-2 px-2 text-cyan-400 font-semibold">
                      {z.cameraId}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {z.activeTrackId ? (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 font-mono text-[10px]">
                          #{z.activeTrackId}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-300 text-[11px]">
                      <span className={z.workerCount < z.minimumWorkers && z.workerCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {z.workerCount}
                      </span>
                      <span className="text-slate-600"> / {z.minimumWorkers} min</span>
                    </td>
                    <td className="py-2 px-2">
                      {getStateBadge(z.state)}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      <span className={z.durationSec >= z.warningThresholdSec ? 'text-amber-400 font-bold' : ''}>
                        {formatSec(z.durationSec)}
                      </span>
                      <span className="text-slate-600 text-[10px]"> / {formatSec(z.isolationThresholdSec)}</span>
                    </td>
                    <td className="py-2 px-2">
                      {getRiskBadge(z.riskLevel)}
                    </td>
                    <td className="py-2 px-2 text-right space-x-1.5">
                      {isCheckInCandidate && (
                        <button
                          onClick={() => handleCheckIn(z)}
                          disabled={submittingCheckInZoneId === z.zoneId}
                          className="px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 hover:text-orange-200 rounded text-[10px] border border-orange-500/40 transition inline-flex items-center gap-1 disabled:opacity-40"
                          title="Verify and check in isolated worker"
                        >
                          <CheckSquare className="w-3 h-3" />
                          <span>CHECK-IN</span>
                        </button>
                      )}
                      {onSelectCamera && (
                        <button
                          onClick={() => onSelectCamera(z.cameraId)}
                          className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded text-[10px] border border-white/10 transition inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>VIEW</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
