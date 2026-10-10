import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  Clock,
  User,
  MapPin,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Incident } from '../../types';
import { IncidentProofModal } from './IncidentProofModal';

interface IncidentTriagePanelProps {
  incidents: Incident[];
  onIncidentUpdated: () => void;
  onSelectIncident?: (incident: Incident) => void;
}

export const IncidentTriagePanel: React.FC<IncidentTriagePanelProps> = ({
  incidents,
  onIncidentUpdated,
  onSelectIncident,
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNINGS'>('ALL');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE');
  const criticalList = activeIncidents.filter((i) => i.severity === 'critical');
  const warningList = activeIncidents.filter((i) => i.severity === 'high' || i.severity === 'medium');

  const displayedList =
    filter === 'CRITICAL'
      ? criticalList
      : filter === 'WARNINGS'
      ? warningList
      : activeIncidents.length > 0
      ? activeIncidents
      : incidents.slice(0, 5);

  const formatElapsed = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  };

  return (
    <div className="hud-panel rounded-lg flex flex-col h-full overflow-hidden border border-[#2B2B2B]">
      {/* Triage Header */}
      <div className="p-3 bg-[#181818] border-b border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-critical text-base animate-pulse">✱</span>
          <h3 className="text-xs font-extrabold font-mono tracking-wider text-white">
            INCIDENT TRIAGE
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold bg-critical/20 text-critical px-2 py-0.5 rounded border border-critical/30">
          {activeIncidents.length} QUEUED
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-[#262626] bg-[#141414] text-[11px] font-mono">
        <button
          onClick={() => setFilter('ALL')}
          className={`flex-1 py-2 font-bold transition text-center ${
            filter === 'ALL'
              ? 'text-white border-b-2 border-safe bg-[#1E1E1E]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          ALL ({activeIncidents.length})
        </button>
        <button
          onClick={() => setFilter('CRITICAL')}
          className={`flex-1 py-2 font-bold transition text-center ${
            filter === 'CRITICAL'
              ? 'text-critical border-b-2 border-critical bg-[#1E1E1E]'
              : 'text-gray-400 hover:text-critical'
          }`}
        >
          CRITICAL ({criticalList.length})
        </button>
        <button
          onClick={() => setFilter('WARNINGS')}
          className={`flex-1 py-2 font-bold transition text-center ${
            filter === 'WARNINGS'
              ? 'text-warning border-b-2 border-warning bg-[#1E1E1E]'
              : 'text-gray-400 hover:text-warning'
          }`}
        >
          WARNINGS ({warningList.length})
        </button>
      </div>

      {/* Incident Cards Queue */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2.5 divide-y divide-[#222]">
        {displayedList.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs font-mono">
            <CheckCircle2 className="w-8 h-8 text-safe mx-auto mb-2 opacity-80" />
            <p className="text-gray-300 font-bold">ALL ZONES COMPLIANT</p>
            <p className="text-[10px] text-gray-500">No active triage incidents queued</p>
          </div>
        ) : (
          displayedList.map((inc) => {
            const isCrit = inc.severity === 'critical';
            return (
              <div
                key={inc.id}
                onClick={() => setSelectedIncident(inc)}
                className="pt-2.5 first:pt-0 group cursor-pointer"
              >
                <div
                  className={`p-3 rounded-lg border transition-all ${
                    isCrit
                      ? 'bg-[#1C1214] border-critical/40 hover:border-critical group-hover:shadow-glow-critical'
                      : 'bg-[#1C1914] border-warning/40 hover:border-warning'
                  }`}
                >
                  {/* Top Bar: Severity Badge + Incident ID + Proof Badge + Timestamp */}
                  <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded ${
                          isCrit
                            ? 'bg-critical text-white'
                            : 'bg-warning text-black font-bold'
                        }`}
                      >
                        {inc.severity.toUpperCase()}
                      </span>
                      <span className="text-gray-200 font-bold">{inc.incidentId}</span>
                      {inc.evidence?.captured === true || (Boolean(inc.evidenceImage) && inc.evidence?.captured !== false) ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          VISUAL PROOF
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full border border-gray-400"></span>
                          TELEMETRY ONLY
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatElapsed(inc.timestamp)}</span>
                    </div>
                  </div>

                  {/* Worker & Violation Description */}
                  <div className="mb-2">
                    <h4 className="text-xs font-bold text-white group-hover:text-safe transition flex items-center gap-1">
                      <span>{inc.workerName}</span>
                      <span className="text-[10px] text-gray-400 font-mono font-normal">
                        [{inc.workerId}]
                      </span>
                    </h4>
                    <p className="text-[11px] text-gray-300 leading-tight mt-0.5">
                      {inc.violationType === 'missing_vest'
                        ? 'No Hi-Vis Vest inside Overhead Crane 7 Radius'
                        : inc.violationType === 'restricted_zone'
                        ? 'Zone Entry without Gas Detector Clearance'
                        : inc.violationType === 'no_gloves'
                        ? 'Missing Fire-Retardant Gloves within 10m Pouring'
                        : inc.whyFlagged[0]}
                    </p>
                  </div>

                  {/* Camera & Neural Confidence Strip */}
                  <div className="text-[10px] font-mono text-gray-400 flex items-center justify-between mb-2.5 bg-[#141414] px-2 py-1 rounded border border-[#262626]">
                    <span>{inc.cameraId} • {inc.zone}</span>
                    <span className="text-safe font-bold">
                      {(inc.confidence * 100).toFixed(1)}% [YOLO]
                    </span>
                  </div>

                  {/* Protocol Recommended Action */}
                  <div className="text-[10px] font-mono text-gray-400 mb-2.5 flex items-center gap-1">
                    <span className="text-warning">PROTOCOL:</span>
                    <span className="truncate text-gray-300">
                      {inc.recommendedAction}
                    </span>
                  </div>

                  {/* Steward Status If Dispatched */}
                  {inc.stewardName && inc.stewardName !== 'Unassigned' && (
                    <div className="mb-2 px-2 py-1 rounded bg-orange-950/40 border border-orange-700/50 text-[10px] font-mono text-orange-300 flex items-center justify-between">
                      <span>STEWARD DISPATCHED:</span>
                      <span className="font-bold text-white">{inc.stewardName}</span>
                    </div>
                  )}

                  {/* Quick Action Button Grid */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIncident(inc);
                      }}
                      className="py-1.5 px-2 rounded font-mono text-[10px] font-bold transition flex items-center justify-center gap-1 bg-[#F472B6]/20 hover:bg-[#F472B6]/30 text-[#F472B6] border border-[#F472B6]/40"
                    >
                      <Send className="w-3 h-3" />
                      DISPATCH
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIncident(inc);
                      }}
                      className="py-1.5 px-2 rounded font-mono text-[10px] font-bold bg-[#262626] hover:bg-[#333] text-gray-200 border border-[#3A3A3A] transition flex items-center justify-center"
                    >
                      ACKNOWLEDGE
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Audit Log Link */}
      <div className="p-2.5 bg-[#161616] border-t border-[#262626] text-right">
        <button
          onClick={() => navigate('/incidents')}
          className="text-[11px] font-mono text-safe hover:text-safe-light flex items-center justify-end gap-1 font-bold w-full transition"
        >
          <span>FULL AUDIT LOG</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Proof Modal when clicked */}
      <IncidentProofModal
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onUpdated={onIncidentUpdated}
      />
    </div>
  );
};
