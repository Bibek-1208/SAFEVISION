import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { Cpu, ShieldCheck, Activity, Radio, AlertCircle } from 'lucide-react';
import { Zone } from '../../types';
import { api } from '../../services/api';
import { useSite } from '../../context/SiteContext';

interface BottomTelemetryRowProps {
  zones: Zone[];
  cameras?: any[];
  complianceData?: any[];
  systemHealth?: any;
}

export const BottomTelemetryRow: React.FC<BottomTelemetryRowProps> = ({
  zones,
  cameras,
  complianceData,
  systemHealth,
}) => {
  const { currentSite } = useSite();
  const [activeShift, setActiveShift] = useState<{ name: string; startTime: string; endTime: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchShift = async () => {
      try {
        const res = await api.getCurrentShift();
        if (isMounted) {
          if (res?.activeShift) {
            setActiveShift({
              name: res.activeShift.name,
              startTime: res.activeShift.startTime,
              endTime: res.activeShift.endTime,
            });
          } else {
            setActiveShift(null);
          }
        }
      } catch (_) {
        // Fallback
      }
    };
    fetchShift();
    const interval = setInterval(fetchShift, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const chartData = complianceData && complianceData.length > 0 ? complianceData : [];
  const currentCompliance = chartData.length > 0 ? chartData[chartData.length - 1].compliance : null;

  const liveCamerasCount = cameras ? cameras.filter((c: any) => c.status === 'LIVE').length : 0;
  const totalCamerasCount = cameras ? cameras.length : 0;
  const critZones = (zones || []).filter((z) => z.dangerLevel === 'critical');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3">
      {/* 1. 24-Hour Compliance Velocity Chart */}
      <div className="lg:col-span-5 hud-panel rounded-lg p-3 border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-safe" />
            <h4 className="text-xs font-mono font-bold text-gray-200">
              24-HR COMPLIANCE & INCIDENT VELOCITY
            </h4>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            {activeShift ? `SHIFT CHANGE: ${activeShift.endTime}` : 'NO ACTIVE SHIFT'}
          </span>
        </div>

        <div className="h-36 w-full">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs font-mono text-gray-500">
              Not enough data for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="compGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34D399" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke="#6B7280"
                  fontSize={9}
                  tickLine={false}
                  fontFamily="Roboto Mono"
                />
                <YAxis
                  domain={[80, 100]}
                  stroke="#6B7280"
                  fontSize={9}
                  tickLine={false}
                  fontFamily="Roboto Mono"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'Roboto Mono',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="compliance"
                  stroke="#34D399"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#compGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-gray-400 border-t border-[#242424]">
          <span>
            {activeShift ? `${activeShift.startTime} [SHIFT START]` : 'NO ACTIVE SHIFT'}
          </span>
          <span className="text-safe font-bold">
            CURRENT: {currentCompliance !== null ? `${currentCompliance.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>

      {/* 2. Zone Safety & Risk Index */}
      <div className="lg:col-span-4 hud-panel rounded-lg p-3 border border-[#2B2B2B] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-warning" />
            <h4 className="text-xs font-mono font-bold text-gray-200">
              ZONE SAFETY & RISK INDEX
            </h4>
          </div>
          <span className="text-[10px] font-mono text-safe font-bold bg-safe/10 px-1 rounded">
            {zones && zones.length > 0 ? `${zones.length} ZONES REGISTERED` : 'NO ZONES CONFIGURED'}
          </span>
        </div>

        <div className="space-y-2.5 my-auto">
          {(zones || []).slice(0, 4).map((zone) => {
            const hasRate = zone.complianceRate !== null && zone.complianceRate !== undefined;
            const rate = zone.complianceRate ?? 0;
            const isCrit = hasRate && rate < 85;
            const isWarn = hasRate && rate >= 85 && rate < 92;
            const barColor = !hasRate ? 'bg-gray-600' : isCrit ? 'bg-critical' : isWarn ? 'bg-warning' : 'bg-safe';
            const badgeText = !hasRate ? 'NO DATA' : isCrit ? 'CRIT' : isWarn ? 'WARN' : 'SAFE';
            const badgeColor = !hasRate
              ? 'text-gray-400 bg-gray-800'
              : isCrit
              ? 'text-critical bg-critical/20'
              : isWarn
              ? 'text-warning bg-warning/20'
              : 'text-safe bg-safe/20';

            return (
              <div key={zone.id} className="text-xs font-mono">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300 font-medium truncate max-w-[160px]">
                    {zone.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {hasRate ? `${zone.complianceRate}%` : '—'}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${badgeColor}`}>
                      {badgeText}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`${barColor} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${hasRate ? rate : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[9px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-[#242424]">
          <span>OVERALL RISK STATUS:</span>
          <span className={critZones.length > 0 ? 'text-critical font-bold' : 'text-safe font-bold'}>
            {critZones.length > 0 ? `CRITICAL [${critZones[0].name.toUpperCase()}]` : 'NORMAL OBSERVATION'}
          </span>
        </div>
      </div>

      {/* 3. AI System Integrity & Diagnostics */}
      <div className="lg:col-span-3 hud-panel rounded-lg p-3 border border-[#2B2B2B] flex flex-col justify-between text-xs font-mono">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#242424]">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-safe" />
            <span className="font-bold text-gray-200">AI SYSTEM INTEGRITY</span>
          </div>
          <span
            className={`font-bold text-[10px] ${
              systemHealth?.status === 'DEGRADED' || systemHealth?.dbStatus === 'DATABASE OFFLINE'
                ? 'text-critical'
                : 'text-safe'
            }`}
          >
            {systemHealth?.status || (systemHealth?.dbStatus === 'DATABASE OFFLINE' ? 'DEGRADED' : 'ONLINE')}
          </span>
        </div>

        <div className="space-y-2 py-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-400">INFERENCE CORE:</span>
            <span
              className="text-white font-bold truncate max-w-[150px]"
              title={systemHealth?.components?.ai?.engine || systemHealth?.aiEngine || 'SafeVision-Industrial-YOLOv8'}
            >
              {systemHealth?.components?.ai?.engine || systemHealth?.aiEngine || 'SafeVision-Industrial-YOLOv8'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">RTSP SYNC:</span>
            <span className={liveCamerasCount > 0 ? 'text-safe font-bold' : 'text-warning font-bold'}>
              {totalCamerasCount > 0 ? `${liveCamerasCount} / ${totalCamerasCount} STREAMS LIVE` : '0 STREAMS'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">PIPELINE LATENCY:</span>
            <span className="text-gray-200 font-bold">
              {systemHealth?.latencyMs ? `${systemHealth.latencyMs}ms [E2E]` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">DATABASE STATUS:</span>
            <span
              className={`font-bold ${
                systemHealth?.dbStatus === 'DATABASE OFFLINE' ? 'text-critical' : 'text-gray-200'
              }`}
            >
              {systemHealth?.dbStatus || (systemHealth?.components?.database?.status === 'CONNECTED' ? 'HEALTHY' : 'DATABASE OFFLINE')}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-[#242424] flex items-center justify-between text-[9px] text-gray-500">
          <span
            className={`flex items-center gap-1 font-bold ${
              systemHealth?.dbStatus === 'DATABASE OFFLINE' ? 'text-critical' : 'text-safe'
            }`}
          >
            {systemHealth?.dbStatus === 'DATABASE OFFLINE' ? (
              <>
                <AlertCircle className="w-3 h-3 text-critical" />
                DATABASE OFFLINE
              </>
            ) : (
              <>
                <ShieldCheck className="w-3 h-3 text-safe" />
                SYSTEM ACTIVE
              </>
            )}
          </span>
          <span>{currentSite?.code || 'SITE-01'}</span>
        </div>
      </div>
    </div>
  );
};
