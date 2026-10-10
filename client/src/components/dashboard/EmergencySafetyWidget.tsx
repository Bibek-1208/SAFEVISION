import React, { useState, useEffect } from 'react';
import {
  DoorOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Camera as CameraIcon,
  ShieldAlert,
  Flame,
  ArrowRightCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { EmergencyZoneState } from '../../types';
import { api } from '../../services/api';
import { useSocket } from '../../context/SocketContext';

interface EmergencySafetyWidgetProps {
  onSelectCamera?: (cameraId: string) => void;
  onOpenEditor?: () => void;
}

export const EmergencySafetyWidget: React.FC<EmergencySafetyWidgetProps> = ({
  onSelectCamera,
  onOpenEditor,
}) => {
  const { socket } = useSocket();
  const [data, setData] = useState<{
    summary: {
      totalConfigured: number;
      clearCount: number;
      candidateCount: number;
      blockedCount: number;
      offlineCount: number;
    };
    states: EmergencyZoneState[];
  }>({
    summary: {
      totalConfigured: 0,
      clearCount: 0,
      candidateCount: 0,
      blockedCount: 0,
      offlineCount: 0,
    },
    states: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchStates = async () => {
    try {
      const res = await api.getEmergencyZoneStates();
      if (res && res.summary) {
        setData(res);
        setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.debug('[EmergencySafetyWidget] Failed to fetch states:', err);
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
      socket.on('emergency_zone.created', handleUpdate);
      socket.on('emergency_zone.updated', handleUpdate);
      socket.on('emergency_zone.toggled', handleUpdate);
      socket.on('emergency_zone.deleted', handleUpdate);
      socket.on('emergency_route.blocked', handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('emergency_zone.created', handleUpdate);
        socket.off('emergency_zone.updated', handleUpdate);
        socket.off('emergency_zone.toggled', handleUpdate);
        socket.off('emergency_zone.deleted', handleUpdate);
        socket.off('emergency_route.blocked', handleUpdate);
      }
    };
  }, [socket]);

  const { summary, states } = data;

  const getStateBadge = (state: EmergencyZoneState['state']) => {
    switch (state) {
      case 'BLOCKED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
            BLOCKED
          </span>
        );
      case 'CANDIDATE_BLOCKAGE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            CANDIDATE
          </span>
        );
      case 'CLEAR':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            CLEAR
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

  return (
    <div className="bg-[#141720] border border-white/10 rounded-xl overflow-hidden p-4 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <DoorOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono text-white tracking-wider uppercase flex items-center gap-2">
              <span>EMERGENCY SAFETY</span>
              {summary.blockedCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Live Egress & Escape Route Safety Monitoring (Phase 9.2)
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
            title="Refresh Emergency States"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Counters (Section 13) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">CONFIGURED AREAS</span>
          <span className="text-sm font-bold text-white">{summary.totalConfigured}</span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">CLEAR</span>
          <span className="text-sm font-bold text-emerald-400">{summary.clearCount}</span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">CANDIDATE</span>
          <span className="text-sm font-bold text-amber-400">{summary.candidateCount}</span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5">
          <span className="text-[10px] text-slate-500 block">BLOCKED</span>
          <span className={`text-sm font-bold ${summary.blockedCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
            {summary.blockedCount}
          </span>
        </div>
        <div className="bg-[#0e1017] p-2.5 rounded-lg border border-white/5 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-slate-500 block">OFFLINE</span>
          <span className="text-sm font-bold text-slate-400">{summary.offlineCount}</span>
        </div>
      </div>

      {/* Emergency Area Table */}
      {summary.totalConfigured === 0 ? (
        <div className="py-6 px-4 bg-[#0e1017] rounded-lg border border-dashed border-white/10 text-center font-mono space-y-2">
          <DoorOpen className="w-6 h-6 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">
            NO EMERGENCY AREAS CONFIGURED
          </p>
          <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
            Designate emergency exits, escape corridors and fire equipment perimeters in Restricted Zones.
          </p>
          {onOpenEditor && (
            <button
              onClick={onOpenEditor}
              className="mt-2 px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-xs transition border border-white/10"
            >
              Configure Emergency Routes
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0e1017] text-slate-400 text-[10px] uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="py-2 px-3">Area</th>
                <th className="py-2 px-2">Camera</th>
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">State</th>
                <th className="py-2 px-2">Duration</th>
                <th className="py-2 px-2">Risk</th>
                <th className="py-2 px-2">Last Update</th>
                <th className="py-2 px-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#0a0c10]">
              {states.map((z) => {
                const timeStr = z.lastUpdate
                  ? new Date(z.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'N/A';
                return (
                  <tr key={z.zoneId} className="hover:bg-white/[0.02] transition">
                    <td className="py-2 px-3 font-semibold text-white">
                      {z.name}
                    </td>
                    <td className="py-2 px-2 text-emerald-400">
                      {z.cameraId}
                    </td>
                    <td className="py-2 px-2 text-[10px] text-slate-300">
                      {z.zoneType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 px-2">
                      {getStateBadge(z.state)}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {z.durationSec > 0 ? `${z.durationSec.toFixed(1)}s` : '0.0s'}
                    </td>
                    <td className="py-2 px-2">
                      {getRiskBadge(z.riskLevel)}
                    </td>
                    <td className="py-2 px-2 text-[10px] text-slate-500">
                      {timeStr}
                    </td>
                    <td className="py-2 px-2 text-right">
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
