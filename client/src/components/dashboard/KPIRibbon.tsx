import React from 'react';
import { Camera, Users, ShieldCheck, AlertOctagon, AlertTriangle, Award } from 'lucide-react';

interface KPIRibbonProps {
  camerasOnline: number;
  totalCameras: number;
  workersCount: number;
  complianceRate: number | null;
  criticalCount: number;
  warningCount: number;
  safetyIndex: number | null;
}

export const KPIRibbon: React.FC<KPIRibbonProps> = ({
  camerasOnline = 0,
  totalCameras = 0,
  workersCount = 0,
  complianceRate = null,
  criticalCount = 0,
  warningCount = 0,
  safetyIndex = null,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
      {/* 1. Cameras Online */}
      <div className="hud-panel p-3 rounded-lg border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>CAMERAS ONLINE</span>
          <Camera className="w-3.5 h-3.5 text-safe" />
        </div>
        <div className="my-1 flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold font-mono text-white">
            {camerasOnline}
          </span>
          <span className="text-xs text-gray-500 font-mono">/ {totalCameras}</span>
        </div>
        <div className="text-[9px] font-mono text-safe flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
          <span>ACTIVE TELEMETRY</span>
        </div>
      </div>

      {/* 2. Workers on Floor */}
      <div className="hud-panel p-3 rounded-lg border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>MONITORED WORKERS</span>
          <Users className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="my-1">
          <span className="text-xl font-extrabold font-mono text-white">
            {workersCount > 0 ? workersCount : '—'}
          </span>
        </div>
        <div className="text-[9px] font-mono text-gray-400 truncate">
          {workersCount > 0 ? 'ACTIVE SHIFT TELEMETRY' : 'Awaiting worker check-in'}
        </div>
      </div>

      {/* 3. Compliance Rate */}
      <div className="hud-panel p-3 rounded-lg border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>COMPLIANCE RATE</span>
          {complianceRate !== null && (
            <span className="text-[9px] font-mono font-bold bg-safe/20 text-safe px-1.5 py-0.2 rounded">
              {complianceRate >= 85 ? 'OPTIMAL' : 'BREACH'}
            </span>
          )}
        </div>
        <div className="my-1 flex items-baseline gap-1 text-safe">
          {complianceRate !== null ? (
            <span className="text-xl font-extrabold font-mono text-safe">
              {complianceRate.toFixed(1)}%
            </span>
          ) : (
            <span className="text-sm font-mono text-gray-500">No data available</span>
          )}
        </div>
        <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-safe h-full rounded-full transition-all duration-500"
            style={{ width: `${complianceRate || 0}%` }}
          />
        </div>
      </div>

      {/* 4. Critical Incidents */}
      <div className="hud-panel p-3 rounded-lg border border-critical/40 bg-[#1C1213] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-critical">
          <span>CRITICAL INCIDENTS</span>
          {criticalCount > 0 && (
            <span className="text-[9px] font-mono font-bold bg-critical text-white px-1.5 py-0.2 rounded">
              ACTION REQ
            </span>
          )}
        </div>
        <div className="my-1">
          <span className="text-xl font-extrabold font-mono text-critical">
            {criticalCount}
          </span>
          <span className="text-[10px] font-mono text-gray-400 ml-1.5">BREACHES ACTIVE</span>
        </div>
        <div className="text-[9px] font-mono text-critical font-bold flex items-center gap-1">
          <AlertOctagon className="w-3 h-3 animate-pulse" />
          <span>{criticalCount > 0 ? 'IMMEDIATE TRIAGE' : 'ALL ZONES CLEAR'}</span>
        </div>
      </div>

      {/* 5. Active Warnings */}
      <div className="hud-panel p-3 rounded-lg border border-warning/40 bg-[#1C1913] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-warning">
          <span>ACTIVE WARNINGS</span>
          <AlertTriangle className="w-3.5 h-3.5 text-warning" />
        </div>
        <div className="my-1">
          <span className="text-xl font-extrabold font-mono text-warning">
            {warningCount}
          </span>
          <span className="text-[10px] font-mono text-gray-400 ml-1.5">Pending Review</span>
        </div>
        <div className="text-[9px] font-mono text-gray-400">
          THERMAL & DWELL WATCH
        </div>
      </div>

      {/* 6. Safety Index */}
      <div className="hud-panel p-3 rounded-lg border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>SAFETY INDEX</span>
          <Award className="w-3.5 h-3.5 text-safe" />
        </div>
        <div className="my-1 flex items-center gap-2">
          {safetyIndex !== null ? (
            <>
              <div className="w-7 h-7 rounded-full border-2 border-safe flex items-center justify-center font-mono font-bold text-xs text-white">
                {safetyIndex}%
              </div>
              <span className="text-[10px] font-mono text-safe font-bold">
                {safetyIndex >= 80 ? 'TIER-A' : 'REVIEW'}
              </span>
            </>
          ) : (
            <span className="text-xs font-mono text-gray-500">No data</span>
          )}
        </div>
        <div className="text-[9px] font-mono text-gray-400">
          REAL-TIME AUDIT
        </div>
      </div>
    </div>
  );
};
