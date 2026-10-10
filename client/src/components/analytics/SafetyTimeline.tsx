import React, { useState } from 'react';
import { Clock, ShieldAlert, CheckCircle, AlertTriangle, UserCheck, Filter } from 'lucide-react';
import { Incident } from '../../types';

interface SafetyTimelineProps {
  incidents: Incident[];
  onSelectIncident?: (incident: Incident) => void;
}

export const SafetyTimeline: React.FC<SafetyTimelineProps> = ({ incidents, onSelectIncident }) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high'>('all');

  const filtered = incidents.filter((inc) => {
    if (filterSeverity === 'all') return true;
    return inc.severity === filterSeverity;
  });

  return (
    <div className="hud-panel p-5 rounded-lg border border-[#2E2E2E]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-safe" />
          <h3 className="font-bold text-sm tracking-wide text-gray-200">FACILITY SAFETY TIMELINE</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-2.5 py-1 rounded text-[11px] ${
              filterSeverity === 'all' ? 'bg-safe/20 text-safe border border-safe/40' : 'text-gray-400 hover:text-white'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setFilterSeverity('critical')}
            className={`px-2.5 py-1 rounded text-[11px] ${
              filterSeverity === 'critical' ? 'bg-critical/20 text-critical border border-critical/40' : 'text-gray-400 hover:text-white'
            }`}
          >
            CRITICAL ONLY
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-500 font-mono text-xs">
          No timeline events recorded for selected filter.
        </div>
      ) : (
        <div className="relative pl-6 border-l-2 border-[#2A2A2A] space-y-6">
          {filtered.slice(0, 8).map((inc) => {
            const isCrit = inc.severity === 'critical';
            const isResolved = inc.status === 'RESOLVED';
            const timeStr = new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div
                key={inc.id}
                onClick={() => onSelectIncident && onSelectIncident(inc)}
                className="relative group cursor-pointer"
              >
                {/* Timeline node icon */}
                <div
                  className={`absolute -left-[31px] top-0.5 w-5 h-5 rounded-full flex items-center justify-center border ${
                    isResolved
                      ? 'bg-[#18281E] border-safe text-safe'
                      : isCrit
                      ? 'bg-[#2A1012] border-critical text-critical'
                      : 'bg-[#282215] border-warning text-warning'
                  }`}
                >
                  {isResolved ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : isCrit ? (
                    <ShieldAlert className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                </div>

                <div className="bg-[#181818] p-3 rounded border border-[#282828] group-hover:border-gray-500 transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-gray-200">
                      {inc.incidentId} • {inc.violationType.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="font-mono text-[10px] text-gray-400">{timeStr}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {inc.workerName} in <span className="text-gray-300 font-semibold">{inc.zone}</span> ({inc.cameraId})
                  </p>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isCrit
                          ? 'bg-critical/20 text-critical border border-critical/30'
                          : 'bg-warning/20 text-warning border border-warning/30'
                      }`}
                    >
                      {inc.severity.toUpperCase()}
                    </span>
                    <span className="text-gray-400">
                      STATUS: <span className="text-safe font-bold">{inc.status}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
