import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  TrendingUp,
  Cpu,
  Eye,
  Info,
  Building,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import {
  Incident,
  SafetySummary,
  ZoneHeatmapData,
  NearMiss,
  ObservedPatternsReport,
  IncidentTimelineEvent,
  IncidentEvidenceTimelineEntry,
} from '../../types';
import { useSocket } from '../../context/SocketContext';

interface SafetyIntelligencePanelProps {
  onSelectIncident?: (incident: Incident) => void;
  activeIncidents: Incident[];
}

export const SafetyIntelligencePanel: React.FC<SafetyIntelligencePanelProps> = ({
  onSelectIncident,
  activeIncidents,
}) => {
  const { socket } = useSocket();
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [heatmap, setHeatmap] = useState<ZoneHeatmapData[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [nearMisses, setNearMisses] = useState<NearMiss[]>([]);
  const [patternsReport, setPatternsReport] = useState<ObservedPatternsReport | null>(null);
  const [selectedActiveIncident, setSelectedActiveIncident] = useState<Incident | null>(null);
  const [incidentTimeline, setIncidentTimeline] = useState<Array<IncidentEvidenceTimelineEntry | IncidentTimelineEvent>>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSafetyData = async () => {
    try {
      const [sumRes, heatRes, nmRes, trendsRes] = await Promise.all([
        api.getSafetySummary().catch(() => null),
        api.getZoneHeatmap(timeRange).catch(() => ({ timeRange, zones: [] })),
        api.getNearMisses().catch(() => ({ total: 0, nearMisses: [] })),
        api.getRiskTrends().catch(() => null),
      ]);

      if (sumRes) setSummary(sumRes);
      if (heatRes?.zones) setHeatmap(heatRes.zones);
      if (nmRes?.nearMisses) setNearMisses(nmRes.nearMisses);
      if (trendsRes) setPatternsReport(trendsRes);
    } catch (err) {
      console.error('[SafetyIntelligence] Failed to fetch safety intelligence data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSafetyData();
  }, [timeRange]);

  // Listen to realtime socket events for live sync without manual page reload
  useEffect(() => {
    if (!socket) return;

    const handleSync = () => {
      fetchSafetyData();
    };

    socket.on('policy.updated', handleSync);
    socket.on('incident.created', handleSync);
    socket.on('incident.resolved', handleSync);
    socket.on('incident.acknowledged', handleSync);
    socket.on('near_miss.created', handleSync);
    socket.on('incident.escalated', handleSync);

    return () => {
      socket.off('policy.updated', handleSync);
      socket.off('incident.created', handleSync);
      socket.off('incident.resolved', handleSync);
      socket.off('incident.acknowledged', handleSync);
      socket.off('near_miss.created', handleSync);
      socket.off('incident.escalated', handleSync);
    };
  }, [socket, timeRange]);

  // Default active incident selection to first critical or high incident
  useEffect(() => {
    if (!selectedActiveIncident && activeIncidents.length > 0) {
      const topIncident =
        activeIncidents.find((i) => i.severity === 'critical') ||
        activeIncidents.find((i) => i.severity === 'high') ||
        activeIncidents[0];
      setSelectedActiveIncident(topIncident || null);
    }
  }, [activeIncidents, selectedActiveIncident]);

  // Fetch timeline whenever active incident selection changes
  useEffect(() => {
    if (selectedActiveIncident?.incidentId) {
      setLoadingTimeline(true);
      api
        .getIncidentTimeline(selectedActiveIncident.incidentId)
        .then((res) => {
          setIncidentTimeline(res.timeline || []);
        })
        .catch(() => {
          setIncidentTimeline(selectedActiveIncident.timeline || []);
        })
        .finally(() => setLoadingTimeline(false));
    } else {
      setIncidentTimeline([]);
    }
  }, [selectedActiveIncident]);

  const getRiskBadgeColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-critical/20 text-critical border-critical/40';
      case 'HIGH':
        return 'bg-warning/20 text-warning border-warning/40';
      case 'MODERATE':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'LOW':
        return 'bg-safe/20 text-safe border-safe/40';
      default:
        return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  };

  return (
    <div className="space-y-3 font-mono">
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between bg-[#181818] border border-[#2a2a2a] px-4 py-2.5 rounded-lg">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-safe" />
          <h2 className="text-sm font-bold tracking-wider text-white uppercase">
            SAFETY INTELLIGENCE LAYER — PHASE 7
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-safe/10 text-safe border border-safe/30 font-semibold">
            CONTEXT → RISK → SEVERITY → NEAR-MISS → EXPLANATION → RESPONSE
          </span>
        </div>
        <button
          onClick={fetchSafetyData}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded bg-[#222] border border-[#333] transition"
          title="Refresh Safety Intelligence telemetry"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>SYNC</span>
        </button>
      </div>

      {/* 1. CURRENT SAFETY STATUS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
        {/* Overall Observed Risk */}
        <div className="bg-[#181818] border border-[#2a2a2a] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] uppercase tracking-wider">Observed Risk</span>
            <Activity className="w-4 h-4 text-safe" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {summary ? summary.overallRiskScore : '--'}
              </span>
              <span className="text-xs text-gray-500">/ 100</span>
            </div>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold border inline-block w-fit ${getRiskBadgeColor(
              summary?.overallRiskLevel || 'LOW'
            )}`}
          >
            {summary?.overallRiskLevel || 'NORMAL'}
          </span>
        </div>

        {/* Active Critical Incidents */}
        <div className="bg-[#181818] border border-[#2a2a2a] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] uppercase tracking-wider">Active Critical</span>
            <Flame className="w-4 h-4 text-critical" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold text-critical">
              {summary ? summary.activeCriticalCount : activeIncidents.filter((i) => i.severity === 'critical').length}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">Immediate containment required</span>
        </div>

        {/* Active High Incidents */}
        <div className="bg-[#181818] border border-[#2a2a2a] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] uppercase tracking-wider">Active High</span>
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold text-warning">
              {summary ? summary.activeHighCount : activeIncidents.filter((i) => i.severity === 'high').length}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">Supervisor dispatched</span>
        </div>

        {/* Compound Near-Misses */}
        <div className="bg-[#181818] border border-[#2a2a2a] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] uppercase tracking-wider">Near-Misses</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold text-amber-400">
              {summary ? summary.activeNearMissCount : nearMisses.length}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">Compound hazards flagged</span>
        </div>

        {/* Zones Requiring Attention */}
        <div className="bg-[#181818] border border-[#2a2a2a] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] uppercase tracking-wider">Zones At Risk</span>
            <Building className="w-4 h-4 text-sky-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold text-sky-400">
              {summary?.zonesRequiringAttention ? summary.zonesRequiringAttention.length : 0}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 truncate">
            {summary?.zonesRequiringAttention && summary.zonesRequiringAttention.length > 0
              ? summary.zonesRequiringAttention.join(', ')
              : 'All zones compliant'}
          </span>
        </div>
      </div>

      {/* 2. ZONE SAFETY: DATA-DRIVEN HEATMAP */}
      <div className="bg-[#181818] border border-[#2a2a2a] p-3.5 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262626] pb-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-safe" />
            <h3 className="text-xs font-bold text-white tracking-wider uppercase">
              DATA-DRIVEN SAFETY HEATMAP (ZONE RISK & COMPLIANCE)
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 text-[11px] mr-1">Time Horizon:</span>
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition ${
                  timeRange === r
                    ? 'bg-safe text-black border-safe'
                    : 'bg-[#222] text-gray-300 border-[#333] hover:border-gray-500'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {heatmap.map((z) => (
            <div
              key={z.zoneId}
              className="bg-[#141414] border border-[#262626] p-3 rounded-lg hover:border-[#383838] transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">{z.zoneName}</h4>
                  <span className="text-[10px] text-gray-400">{z.zoneId}</span>
                </div>
                {z.status === 'NO DATA' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                    NO DATA
                  </span>
                ) : (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getRiskBadgeColor(
                      z.riskLevel
                    )}`}
                  >
                    RISK: {z.riskScore}/100 ({z.riskLevel})
                  </span>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-1 py-1.5 border-y border-[#202020] text-[11px]">
                <div>
                  <span className="text-gray-500 block text-[10px]">INCIDENTS</span>
                  <span className="font-bold text-gray-200">{z.incidentCount}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">NEAR-MISSES</span>
                  <span className="font-bold text-amber-400">{z.nearMissCount}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">CAMERAS</span>
                  <span className="font-bold text-gray-200">{z.cameraStatus}</span>
                </div>
              </div>

              {/* Required PPE tags */}
              <div>
                <span className="text-gray-500 text-[10px] block mb-1">MANDATED PPE POLICY:</span>
                <div className="flex flex-wrap gap-1">
                  {z.requiredPPE && z.requiredPPE.length > 0 ? (
                    z.requiredPPE.map((ppe, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-[#202020] text-gray-300 border border-[#303030]"
                      >
                        {ppe}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-500">None specified</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. ACTIVE INCIDENT DEEP DIVE, EXPLAINABLE AI & TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Active Incident Details & Explainable AI */}
        <div className="lg:col-span-7 bg-[#181818] border border-[#2a2a2a] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between border-b border-[#262626] pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-warning" />
              <h3 className="text-xs font-bold text-white tracking-wider uppercase">
                AUTHORITATIVE INCIDENT EXPLAINABILITY (XAI)
              </h3>
            </div>
            {selectedActiveIncident && (
              <span className="text-[10px] font-mono text-gray-400">
                ID: {selectedActiveIncident.incidentId}
              </span>
            )}
          </div>

          {selectedActiveIncident ? (
            <div className="space-y-3">
              {/* Incident Header Information */}
              <div className="bg-[#141414] p-3 rounded-lg border border-[#222] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase">
                    {selectedActiveIncident.violationType.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getRiskBadgeColor(
                        selectedActiveIncident.riskLevel || 'HIGH'
                      )}`}
                    >
                      RISK {selectedActiveIncident.riskScore}/100 ({selectedActiveIncident.riskLevel || 'HIGH'})
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        selectedActiveIncident.severity === 'critical'
                          ? 'bg-critical/20 text-critical border border-critical/40'
                          : 'bg-warning/20 text-warning border border-warning/40'
                      }`}
                    >
                      {selectedActiveIncident.severity}
                    </span>
                  </div>
                </div>

                {/* Worker Identity & Context */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-[#202020]">
                  <div>
                    <span className="text-gray-500 block text-[10px]">TRACK ID:</span>
                    <span className="font-bold text-gray-200">
                      {selectedActiveIncident.trackId || 'TRACK-PRIMARY'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">WORKER IDENTITY:</span>
                    <span
                      className={`font-bold ${
                        selectedActiveIncident.identityStatus === 'CONFIRMED'
                          ? 'text-safe'
                          : 'text-amber-400'
                      }`}
                    >
                      {selectedActiveIncident.identityStatus === 'CONFIRMED'
                        ? selectedActiveIncident.employeeName || selectedActiveIncident.workerName
                        : 'IDENTITY UNCONFIRMED'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">LOCATION / CAM:</span>
                    <span className="text-gray-300">
                      {selectedActiveIncident.zone} ({selectedActiveIncident.cameraId})
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">ESCALATION:</span>
                    <span className="text-sky-400 font-bold">
                      {selectedActiveIncident.escalationStatus || 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Explainable AI Factors (Why this incident was created) */}
              <div className="space-y-1.5">
                <span className="text-gray-400 text-[11px] block font-bold">
                  WHY THIS INCIDENT WAS CREATED (FACTUAL SYSTEM CRITERIA):
                </span>
                <div className="space-y-1">
                  {(selectedActiveIncident.whyCreated || selectedActiveIncident.explanation || [
                    `Observed missing ${selectedActiveIncident.violationType.replace(/_/g, ' ')}`,
                    `AI confidence ${(selectedActiveIncident.confidence * 100).toFixed(1)}% exceeded detection threshold`,
                    `Zone policy requires mandated PPE protection`,
                    `Temporal validation verified continuous breach >= 3.0s`,
                  ]).map((point: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 bg-[#141414] px-2.5 py-1.5 rounded border border-[#222] text-[11px] text-gray-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-safe shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Contributing Factors Breakdown */}
              {selectedActiveIncident.riskFactors && selectedActiveIncident.riskFactors.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-gray-400 text-[11px] block font-bold">
                    CONTRIBUTING RISK FACTORS (0–100 BREAKDOWN):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {selectedActiveIncident.riskFactors.map((factor, idx) => (
                      <div
                        key={idx}
                        className="bg-[#141414] p-2 rounded border border-[#222] flex items-center justify-between text-[11px]"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-gray-200 block text-[10px]">
                            {factor.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-gray-500 text-[10px] truncate block">
                            {factor.details || factor.item || 'Calculated weight'}
                          </span>
                        </div>
                        <span className="font-bold text-amber-400 shrink-0">
                          +{factor.contribution}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#141414] p-6 rounded-lg text-center text-gray-500 text-xs">
              No active incidents requiring immediate attention. System operating in compliant state.
            </div>
          )}
        </div>

        {/* Incident Lifecycle Timeline */}
        <div className="lg:col-span-5 bg-[#181818] border border-[#2a2a2a] p-3.5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#262626] pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-safe" />
                <h3 className="text-xs font-bold text-white tracking-wider uppercase">
                  EVENT LIFECYCLE TIMELINE
                </h3>
              </div>
              <span className="text-[10px] text-gray-500">REAL SYSTEM EVENTS</span>
            </div>

            {loadingTimeline ? (
              <div className="text-center py-8 text-gray-500 text-xs">Loading event timeline...</div>
            ) : incidentTimeline.length > 0 ? (
              <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-[#2c2c2c]">
                {incidentTimeline.map((evt, idx) => (
                  <div key={idx} className="relative text-xs">
                    <span className="absolute -left-[14px] top-1 w-2 h-2 rounded-full bg-safe ring-2 ring-[#181818]" />
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-bold text-gray-200 text-[11px]">
                        {evt.eventType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                      {evt.description}
                    </p>
                    {evt.actor && (
                      <span className="text-[9px] text-gray-500 font-mono">
                        Actor: {typeof evt.actor === 'string' ? evt.actor : evt.actor.name || evt.actor.type || 'SYSTEM'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-xs">
                No timeline events recorded for this incident yet.
              </div>
            )}
          </div>

          {selectedActiveIncident && onSelectIncident && (
            <button
              onClick={() => onSelectIncident(selectedActiveIncident)}
              className="mt-3 w-full py-2 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-gray-200 text-xs rounded transition flex items-center justify-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-safe" />
              <span>INSPECT EVIDENCE & AUDIT TRAIL</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. OBSERVED SAFETY PATTERNS (NO PSEUDO-PREDICTIONS) */}
      <div className="bg-[#181818] border border-[#2a2a2a] p-3.5 rounded-lg space-y-2">
        <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
          <TrendingUp className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-bold text-white tracking-wider uppercase">
            STATISTICAL SAFETY OBSERVATIONS & RECURRENCE PATTERNS
          </h3>
        </div>

        {patternsReport?.status === 'INSUFFICIENT DATA' ? (
          <div className="bg-[#141414] p-3 rounded border border-[#222] text-xs text-gray-500 font-mono">
            INSUFFICIENT DATA: {patternsReport.message || 'Need at least 3 historical incidents in MongoDB to compute statistical recurrence patterns.'}
          </div>
        ) : patternsReport?.patterns && patternsReport.patterns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {patternsReport.patterns.map((pat, idx) => (
              <div
                key={idx}
                className="bg-[#141414] p-3 rounded border border-[#242424] text-xs text-gray-300 leading-relaxed flex items-start gap-2"
              >
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>{pat}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#141414] p-3 rounded border border-[#222] text-xs text-gray-500 font-mono">
            INSUFFICIENT DATA: No safety patterns recorded during current operating window.
          </div>
        )}
      </div>
    </div>
  );
};
