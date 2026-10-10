import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  Filter,
  Camera,
  ShieldAlert,
  Layers,
  Clock,
  CheckCircle2,
  MapPin,
  ArrowUpDown,
  ChevronRight,
  Crosshair,
  AlertTriangle,
  Eye,
  FileText,
  X,
  HelpCircle,
} from 'lucide-react';
import { api } from '../services/api';
import {
  SafetyTrendsResponse,
  ZoneComparisonResponse,
  ZoneComparisonItem,
  ShiftAnalysisResponse,
  ShiftAnalysisItem,
  SafetyHeatmapResponse,
  HeatmapCell,
  NearMissAnalyticsReport,
  NearMissRecentItem,
} from '../types';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('7 Days');
  const [trendsData, setTrendsData] = useState<SafetyTrendsResponse | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Phase 10.3: Zone Comparison states
  const [zoneComparisonData, setZoneComparisonData] = useState<ZoneComparisonResponse | null>(null);
  const [loadingZoneComp, setLoadingZoneComp] = useState(false);
  const [selectedZoneDetail, setSelectedZoneDetail] = useState<ZoneComparisonItem | null>(null);
  const [zoneSortBy, setZoneSortBy] = useState<'incidents' | 'critical' | 'high' | 'recent' | 'trend'>('incidents');

  // Phase 10.4: Shift Analysis states
  const [shiftAnalysisData, setShiftAnalysisData] = useState<ShiftAnalysisResponse | null>(null);
  const [loadingShiftAnalysis, setLoadingShiftAnalysis] = useState(false);
  const [selectedShift, setSelectedShift] = useState<'all' | 'Morning Shift' | 'Afternoon Shift' | 'Night Shift'>('all');

  // Phase 10.5: Safety Heatmap states
  const [heatmapData, setHeatmapData] = useState<SafetyHeatmapResponse | null>(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [heatmapCamera, setHeatmapCamera] = useState('all');
  const [heatmapZone, setHeatmapZone] = useState('all');
  const [heatmapShift, setHeatmapShift] = useState('all');
  const [heatmapSeverity, setHeatmapSeverity] = useState('all');
  const [heatmapViolation, setHeatmapViolation] = useState('all');
  const [heatmapTimeframe, setHeatmapTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  // Phase 10.6: Near-Miss Analytics states
  const [nearMissData, setNearMissData] = useState<NearMissAnalyticsReport | null>(null);
  const [loadingNearMiss, setLoadingNearMiss] = useState(false);
  const [nearMissTimeframe, setNearMissTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [nearMissCamera, setNearMissCamera] = useState('all');
  const [nearMissZone, setNearMissZone] = useState('all');
  const [nearMissShift, setNearMissShift] = useState('all');
  const [nearMissSeverity, setNearMissSeverity] = useState('all');
  const [nearMissType, setNearMissType] = useState('all');
  const [nearMissStatus, setNearMissStatus] = useState('all');
  const [selectedNearMiss, setSelectedNearMiss] = useState<NearMissRecentItem | null>(null);

  // Filters for Safety Trends & Zone Comparison
  const [selectedCamera, setSelectedCamera] = useState('all');
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedViolation, setSelectedViolation] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [activeTrendView, setActiveTrendView] = useState<
    'volume' | 'severity' | 'violation' | 'zone' | 'camera' | 'shift'
  >('volume');

  // Available filter options (loaded dynamically)
  const [availableCameras, setAvailableCameras] = useState<string[]>([]);
  const [availableZones, setAvailableZones] = useState<Array<{ id: string; name: string }>>([]);

  const { socket } = useSocket();

  const getTimeframeParam = useCallback((tr: string) => {
    if (tr === 'Today' || tr === '24h') return '24h';
    if (tr === '7 Days' || tr === '7D' || tr === '7d') return '7d';
    if (tr === '30 Days' || tr === '30D' || tr === '30d') return '30d';
    return 'all';
  }, []);

  const loadData = useCallback(() => {
    const timeframe = getTimeframeParam(timeRange);
    api.getAnalytics({ timeframe, cameraId: selectedCamera !== 'all' ? selectedCamera : undefined })
      .then(setData)
      .catch(console.error);
  }, [timeRange, selectedCamera, getTimeframeParam]);

  const loadTrends = useCallback(() => {
    setLoadingTrends(true);
    const timeframe = getTimeframeParam(timeRange);
    api.getTrends({
      timeframe,
      cameraId: selectedCamera !== 'all' ? selectedCamera : undefined,
      zoneId: selectedZone !== 'all' ? selectedZone : undefined,
      violationType: selectedViolation !== 'all' ? selectedViolation : undefined,
      severity: selectedSeverity !== 'all' ? selectedSeverity : undefined,
    })
      .then((res) => {
        setTrendsData(res);
      })
      .catch((err) => {
        console.error('Failed to load safety trends:', err);
      })
      .finally(() => {
        setLoadingTrends(false);
      });
  }, [timeRange, selectedCamera, selectedZone, selectedViolation, selectedSeverity, getTimeframeParam]);

  const loadZoneComparison = useCallback(() => {
    setLoadingZoneComp(true);
    const timeframe = getTimeframeParam(timeRange);
    api.getZoneComparison({
      timeframe,
      cameraId: selectedCamera !== 'all' ? selectedCamera : undefined,
      zoneId: selectedZone !== 'all' ? selectedZone : undefined,
      violationType: selectedViolation !== 'all' ? selectedViolation : undefined,
      severity: selectedSeverity !== 'all' ? selectedSeverity : undefined,
    })
      .then((res) => {
        setZoneComparisonData(res);
        setSelectedZoneDetail((prev) => {
          if (prev) {
            const updated = res.zones.find((z) => z.zoneId === prev.zoneId);
            return updated || res.zones[0] || null;
          }
          return res.zones[0] || null;
        });
      })
      .catch((err) => {
        console.error('Failed to load zone comparison:', err);
      })
      .finally(() => {
        setLoadingZoneComp(false);
      });
  }, [timeRange, selectedCamera, selectedZone, selectedViolation, selectedSeverity, getTimeframeParam]);

  const loadShiftAnalysis = useCallback(() => {
    setLoadingShiftAnalysis(true);
    const timeframe = getTimeframeParam(timeRange);
    api.getShiftAnalysis({
      timeframe,
      cameraId: selectedCamera !== 'all' ? selectedCamera : undefined,
      zoneId: selectedZone !== 'all' ? selectedZone : undefined,
      violationType: selectedViolation !== 'all' ? selectedViolation : undefined,
      severity: selectedSeverity !== 'all' ? selectedSeverity : undefined,
    })
      .then((res) => {
        setShiftAnalysisData(res);
      })
      .catch((err) => {
        console.error('Failed to load shift analysis:', err);
      })
      .finally(() => {
        setLoadingShiftAnalysis(false);
      });
  }, [timeRange, selectedCamera, selectedZone, selectedViolation, selectedSeverity, getTimeframeParam]);

  const loadHeatmap = useCallback(() => {
    setLoadingHeatmap(true);
    api.getSafetyHeatmap({
      timeframe: heatmapTimeframe,
      cameraId: heatmapCamera !== 'all' ? heatmapCamera : undefined,
      zoneId: heatmapZone !== 'all' ? heatmapZone : undefined,
      severity: heatmapSeverity !== 'all' ? heatmapSeverity : undefined,
      violationType: heatmapViolation !== 'all' ? heatmapViolation : undefined,
      shift: heatmapShift !== 'all' ? heatmapShift : undefined,
    })
      .then((res) => {
        setHeatmapData(res);
      })
      .catch((err) => {
        console.error('Failed to load safety heatmap:', err);
      })
      .finally(() => {
        setLoadingHeatmap(false);
      });
  }, [heatmapTimeframe, heatmapCamera, heatmapZone, heatmapSeverity, heatmapViolation, heatmapShift]);

  const loadNearMissAnalytics = useCallback(() => {
    setLoadingNearMiss(true);
    api.getNearMissAnalytics({
      timeframe: nearMissTimeframe,
      cameraId: nearMissCamera !== 'all' ? nearMissCamera : undefined,
      zoneId: nearMissZone !== 'all' ? nearMissZone : undefined,
      shift: nearMissShift !== 'all' ? nearMissShift : undefined,
      severity: nearMissSeverity !== 'all' ? nearMissSeverity : undefined,
      nearMissType: nearMissType !== 'all' ? nearMissType : undefined,
      status: nearMissStatus !== 'all' ? nearMissStatus : undefined,
    })
      .then((res) => {
        setNearMissData(res);
      })
      .catch((err) => {
        console.error('Failed to load near-miss analytics:', err);
      })
      .finally(() => {
        setLoadingNearMiss(false);
      });
  }, [nearMissTimeframe, nearMissCamera, nearMissZone, nearMissShift, nearMissSeverity, nearMissType, nearMissStatus]);

  // Initial load and filter options population
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  useEffect(() => {
    loadZoneComparison();
  }, [loadZoneComparison]);

  useEffect(() => {
    loadShiftAnalysis();
  }, [loadShiftAnalysis]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

  useEffect(() => {
    loadNearMissAnalytics();
  }, [loadNearMissAnalytics]);

  useEffect(() => {
    // Populate camera & zone filter lists from real database
    api.getCameras()
      .then((res) => {
        const camList = (res.cameras || []).map((c: any) => c.code || c.id || c.name);
        setAvailableCameras(Array.from(new Set(camList)));
      })
      .catch(() => {});

    api.getRestrictedZones()
      .then((res) => {
        const zList = (res.zones || []).map((z: any) => ({
          id: z.zoneId || z.id,
          name: z.name || z.zoneId || z.id,
        }));
        setAvailableZones(zList);
      })
      .catch(() => {});
  }, []);

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      loadData();
      loadTrends();
      loadZoneComparison();
      loadShiftAnalysis();
      loadHeatmap();
      loadNearMissAnalytics();
    };
    socket.on('analytics:summary_update', handleUpdate);
    socket.on('incident:new', handleUpdate);
    socket.on('near_miss.created', handleUpdate);
    return () => {
      socket.off('analytics:summary_update', handleUpdate);
      socket.off('incident:new', handleUpdate);
      socket.off('near_miss.created', handleUpdate);
    };
  }, [socket, loadData, loadTrends, loadZoneComparison, loadShiftAnalysis, loadHeatmap, loadNearMissAnalytics]);

  const sortedZones = React.useMemo(() => {
    if (!zoneComparisonData?.zones) return [];
    const list = [...zoneComparisonData.zones];
    switch (zoneSortBy) {
      case 'critical':
        return list.sort((a, b) => b.severity.critical - a.severity.critical || b.incidentCount - a.incidentCount);
      case 'high':
        return list.sort((a, b) => b.severity.high - a.severity.high || b.incidentCount - a.incidentCount);
      case 'recent':
        return list.sort((a, b) => {
          const ta = a.latestIncident ? new Date(a.latestIncident).getTime() : 0;
          const tb = b.latestIncident ? new Date(b.latestIncident).getTime() : 0;
          return tb - ta;
        });
      case 'trend':
        return list.sort((a, b) => b.trend.changeCount - a.trend.changeCount);
      case 'incidents':
      default:
        return list.sort((a, b) => b.incidentCount - a.incidentCount);
    }
  }, [zoneComparisonData, zoneSortBy]);

  const heatmapCellMap = React.useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    if (heatmapData?.cells) {
      for (const c of heatmapData.cells) {
        map.set(`${c.x}_${c.y}`, c);
      }
    }
    return map;
  }, [heatmapData]);

  if (!data) {
    return (
      <div className="p-12 text-center text-gray-400 font-mono">
        AGGREGATING NEURAL TELEMETRY & COMPLIANCE METRICS...
      </div>
    );
  }

  const complianceHourly = data.complianceHourly || [];
  const violationsByType = data.violationsByType || [];
  const violationsByZone = data.violationsByZone || [];
  const incidentsByShift = data.incidentsByShift || [];
  const kpis = data.kpis || {};
  const repeatViolations = data.repeatViolations || [];

  const directionSummary = trendsData?.directionSummary;

  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto text-gray-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#181818] border border-[#2B2B2B] p-4 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-safe" />
            <h1 className="text-base font-bold font-mono text-white">
              SAFETY COMPLIANCE & INCIDENT ANALYTICS
            </h1>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            Statistical regression, multi-camera velocities, and temporal hazard patterns
          </p>
        </div>

        <div className="flex items-center gap-2">
          {['Today', '7 Days', '30 Days', 'All'].map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                timeRange === t
                  ? 'bg-safe text-black'
                  : 'bg-[#222] text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="hud-panel p-4 rounded-lg border border-[#2B2B2B]">
          <span className="text-[10px] font-mono text-gray-400 block mb-1">
            AVERAGE RESOLUTION TIME
          </span>
          <div className="flex items-baseline gap-1.5 text-white font-mono">
            <span className="text-2xl font-extrabold">
              {kpis.averageResponseTimeMin !== null ? kpis.averageResponseTimeMin : '—'}
            </span>
            <span className="text-xs text-gray-400">minutes</span>
          </div>
          <span className="text-[10px] text-safe font-mono">Realtime Incident Dispatch</span>
        </div>

        <div className="hud-panel p-4 rounded-lg border border-[#2B2B2B]">
          <span className="text-[10px] font-mono text-gray-400 block mb-1">
            RESOLUTION RATE
          </span>
          <div className="flex items-baseline gap-1.5 text-white font-mono">
            <span className="text-2xl font-extrabold">
              {kpis.resolutionRatePercent !== null ? `${kpis.resolutionRatePercent}%` : '—'}
            </span>
          </div>
          <span className="text-[10px] text-safe font-mono">Verified Closed Incidents</span>
        </div>

        <div className="hud-panel p-4 rounded-lg border border-[#2B2B2B]">
          <span className="text-[10px] font-mono text-gray-400 block mb-1">
            ACTIVE CRITICAL ALERTS
          </span>
          <div className="flex items-baseline gap-1.5 text-critical font-mono">
            <span className="text-2xl font-extrabold">{kpis.activeCriticalCount ?? 0}</span>
            <span className="text-xs text-gray-400">unresolved</span>
          </div>
          <span className="text-[10px] text-critical font-mono">High-Risk Hazard Breaches</span>
        </div>

        <div className="hud-panel p-4 rounded-lg border border-[#2B2B2B]">
          <span className="text-[10px] font-mono text-gray-400 block mb-1">
            OVERALL COMPLIANCE SCORE
          </span>
          <div className="flex items-baseline gap-1.5 text-safe font-mono">
            <span className="text-2xl font-extrabold">
              {kpis.overallCompliance !== null ? `${kpis.overallCompliance}%` : '—'}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 font-mono">
            {kpis.overallCompliance !== null ? 'Configured Safety Rules' : 'Denominator Unavailable'}
          </span>
        </div>
      </div>

      {/* PHASE 10.2: COMPREHENSIVE SAFETY TRENDS SECTION */}
      <div className="hud-panel p-5 rounded-xl border border-[#2B2B2B] space-y-4">
        {/* Section Header & Direction Summary */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#2B2B2B]">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold font-mono text-white tracking-wide">
                HISTORICAL SAFETY TRENDS & TRAJECTORY ANALYSIS
              </h2>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Empirical incident velocity, violation trajectories, camera loads, and shift dynamics from MongoDB
            </p>
          </div>

          {/* Direction Summary Ribbon */}
          {directionSummary && (
            <div className="flex flex-wrap items-center gap-3 bg-[#1C1C1C] border border-[#333] px-3.5 py-2 rounded-lg text-xs font-mono">
              <div className="flex items-center gap-1.5">
                {directionSummary.direction === 'increase' ? (
                  <span className="flex items-center gap-1 text-critical font-bold">
                    <TrendingUp className="w-4 h-4 text-critical" />
                    INCREASE
                  </span>
                ) : directionSummary.direction === 'decrease' ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                    DECREASE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sky-400 font-bold">
                    <Activity className="w-4 h-4 text-sky-400" />
                    STABLE
                  </span>
                )}
              </div>

              <span className="text-gray-300">
                {directionSummary.statement}
              </span>

              <div className="hidden sm:flex items-center gap-2 border-l border-[#333] pl-3 text-[11px] text-gray-400">
                <span>Current: <strong className="text-white">{directionSummary.currentCount}</strong></span>
                <span>Prior: <strong className="text-white">{directionSummary.previousCount}</strong></span>
                {directionSummary.changePercent !== null && (
                  <span className={directionSummary.changeCount > 0 ? 'text-critical' : directionSummary.changeCount < 0 ? 'text-emerald-400' : 'text-gray-400'}>
                    ({directionSummary.changeCount >= 0 ? `+${directionSummary.changeCount}` : directionSummary.changeCount})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* View Switcher Tabs & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Trend Dimension Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#141414] p-1 rounded-lg border border-[#2B2B2B]">
            {[
              { id: 'volume', label: 'Incident Volume' },
              { id: 'severity', label: 'Severity Trends' },
              { id: 'violation', label: 'Violation Trajectory' },
              { id: 'zone', label: 'Zone Exposure' },
              { id: 'camera', label: 'Camera Velocity' },
              { id: 'shift', label: 'Shift Progression' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTrendView(tab.id as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition ${
                  activeTrendView === tab.id
                    ? 'bg-safe text-black font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-[#202020]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {/* Camera Filter */}
            <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#333] px-2 py-1 rounded-md">
              <Camera className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="bg-transparent text-gray-200 outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-[#1A1A1A]">All Cameras</option>
                {availableCameras.map((cam) => (
                  <option key={cam} value={cam} className="bg-[#1A1A1A]">{cam}</option>
                ))}
              </select>
            </div>

            {/* Zone Filter */}
            <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#333] px-2 py-1 rounded-md">
              <Layers className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-transparent text-gray-200 outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-[#1A1A1A]">All Zones</option>
                {availableZones.map((z) => (
                  <option key={z.id} value={z.id} className="bg-[#1A1A1A]">{z.name}</option>
                ))}
              </select>
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#333] px-2 py-1 rounded-md">
              <ShieldAlert className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="bg-transparent text-gray-200 outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-[#1A1A1A]">All Severities</option>
                <option value="critical" className="bg-[#1A1A1A]">Critical</option>
                <option value="high" className="bg-[#1A1A1A]">High</option>
                <option value="medium" className="bg-[#1A1A1A]">Medium</option>
                <option value="low" className="bg-[#1A1A1A]">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Chart Display */}
        <div className="h-72 w-full pt-2">
          {loadingTrends ? (
            <div className="flex items-center justify-center h-full text-xs font-mono text-gray-500">
              UPDATING SAFETY TREND AGGREGATION PIPELINE...
            </div>
          ) : !trendsData || trendsData.totalIncidents === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-xs font-mono text-gray-500 space-y-1">
              <p className="font-bold text-gray-400">No incidents recorded in this period.</p>
              <p className="text-[11px] text-gray-500">Filters applied: {selectedCamera !== 'all' ? `Camera ${selectedCamera}` : 'All Cameras'}, {selectedSeverity !== 'all' ? `Severity ${selectedSeverity}` : 'All Severities'}</p>
            </div>
          ) : activeTrendView === 'volume' ? (
            /* 1. Incident Volume Trend */
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendsData.incidentTrend}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                <Area type="monotone" dataKey="total" name="Total Incidents" stroke="#38BDF8" strokeWidth={2} fill="url(#volGrad)" />
                <Line type="monotone" dataKey="critical" name="Critical" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="high" name="High" stroke="#FBBF24" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="medium" name="Medium" stroke="#3B82F6" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="low" name="Low" stroke="#34D399" strokeWidth={1.5} dot={{ r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : activeTrendView === 'severity' ? (
            /* 2. Severity Breakdown Trend */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendsData.severityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                <Bar dataKey="critical" name="Critical" stackId="sev" fill="#EF4444" />
                <Bar dataKey="high" name="High" stackId="sev" fill="#FBBF24" />
                <Bar dataKey="medium" name="Medium" stackId="sev" fill="#3B82F6" />
                <Bar dataKey="low" name="Low" stackId="sev" fill="#34D399" />
              </BarChart>
            </ResponsiveContainer>
          ) : activeTrendView === 'violation' ? (
            /* 3. Violation Type Trajectory */
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsData.violationTrends.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                {(trendsData.violationTrends.types || []).map((vt) => (
                  <Line
                    key={vt.type}
                    type="monotone"
                    dataKey={vt.type}
                    name={vt.type.replace(/_/g, ' ').toUpperCase()}
                    stroke={vt.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : activeTrendView === 'zone' ? (
            /* 4. Zone Exposure Trend */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendsData.zoneTrends.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                {(trendsData.zoneTrends.zones || []).slice(0, 5).map((z, idx) => {
                  const ZONE_COLORS = ['#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6'];
                  return (
                    <Bar
                      key={z.zoneName}
                      dataKey={z.zoneName}
                      name={z.zoneName}
                      fill={ZONE_COLORS[idx % ZONE_COLORS.length]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          ) : activeTrendView === 'camera' ? (
            /* 5. Camera Velocity Trend */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendsData.cameraTrends.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                {(trendsData.cameraTrends.cameras || []).map((c, idx) => {
                  const CAM_COLORS = ['#38BDF8', '#F43F5E', '#A855F7', '#22C55E', '#EAB308'];
                  return (
                    <Bar
                      key={c.cameraId}
                      dataKey={c.cameraId}
                      name={c.cameraId}
                      fill={CAM_COLORS[idx % CAM_COLORS.length]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            /* 6. Shift Progression Trend */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendsData.shiftTrends.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }} />
                <Bar dataKey="morning" name="Morning Shift (06:00-14:00)" fill="#FBBF24" />
                <Bar dataKey="afternoon" name="Afternoon Shift (14:00-22:00)" fill="#EF4444" />
                <Bar dataKey="night" name="Night Shift (22:00-06:00)" fill="#818CF8" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Supplementary View Metadata Cards */}
        {trendsData && trendsData.totalIncidents > 0 && activeTrendView === 'shift' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {(trendsData.shiftTrends.shifts || []).map((s) => (
              <div key={s.shift} className="bg-[#181818] p-3 rounded-lg border border-[#282828] text-xs font-mono">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-white">{s.shift}</span>
                  <span className="text-safe font-bold">{s.count} Incidents</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>Hours: {s.hours} (IST)</span>
                  <span className="text-critical">{s.critical} Critical</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PHASE 10.3: ZONE RISK & SAFETY EXPOSURE COMPARISON */}
      <div className="hud-panel p-5 rounded-xl border border-[#2B2B2B] space-y-4">
        {/* Section Header & Summary Badges */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#2B2B2B]">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-safe" />
              <h2 className="text-sm font-bold font-mono text-white tracking-wide">
                ZONE SAFETY PERFORMANCE & EXPOSURE COMPARISON
              </h2>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Empirical risk distribution, severity ranking, and cross-zone trend trajectory from MongoDB
            </p>
          </div>

          {/* Zone Summary Metrics */}
          {zoneComparisonData && (
            <div className="flex flex-wrap items-center gap-3 bg-[#1C1C1C] border border-[#333] px-3.5 py-2 rounded-lg text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Monitored Zones:</span>
                <span className="text-white font-bold">{zoneComparisonData.summary.totalMonitoredZones}</span>
              </div>
              <div className="hidden sm:block border-l border-[#333] h-4" />
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Active Incident Zones:</span>
                <span className="text-amber-400 font-bold">{zoneComparisonData.summary.activeZonesWithIncidents}</span>
              </div>
              {zoneComparisonData.summary.highestIncidentZone && (
                <>
                  <div className="hidden sm:block border-l border-[#333] h-4" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Highest Exposure:</span>
                    <span className="text-critical font-bold">
                      {zoneComparisonData.summary.highestIncidentZone.zoneName} ({zoneComparisonData.summary.highestIncidentZone.count})
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sorting Controls & Zone View Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Column: Zone Ranking Table (xl:col-span-7) */}
          <div className="xl:col-span-7 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-mono font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-safe" />
                Zone Ranking & Incident Breakdown
              </h3>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-gray-400 text-[11px]">Sort By:</span>
                <select
                  value={zoneSortBy}
                  onChange={(e) => setZoneSortBy(e.target.value as any)}
                  className="bg-[#1C1C1C] border border-[#333] text-gray-200 px-2.5 py-1 rounded text-xs outline-none cursor-pointer"
                >
                  <option value="incidents">Total Incidents</option>
                  <option value="critical">Critical Severity</option>
                  <option value="high">High Severity</option>
                  <option value="recent">Recent Activity</option>
                  <option value="trend">Trend Velocity</option>
                </select>
              </div>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto rounded-lg border border-[#2B2B2B] bg-[#141414] max-h-96">
              {loadingZoneComp ? (
                <div className="p-8 text-center text-xs font-mono text-gray-500">
                  COMPUTING CROSS-ZONE RISK AGGREGATIONS...
                </div>
              ) : sortedZones.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-gray-500">
                  No monitored zone data available for the selected filters.
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#1A1A1A] text-gray-400 text-[10px] uppercase border-b border-[#282828] sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Rank</th>
                      <th className="p-2.5">Zone</th>
                      <th className="p-2.5 text-center">Incidents</th>
                      <th className="p-2.5 text-center">Critical</th>
                      <th className="p-2.5 text-center">High</th>
                      <th className="p-2.5 text-center">Med / Low</th>
                      <th className="p-2.5 text-center">Trend</th>
                      <th className="p-2.5">Cameras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {sortedZones.map((z, idx) => {
                      const isSelected = selectedZoneDetail?.zoneId === z.zoneId;
                      return (
                        <tr
                          key={z.zoneId}
                          onClick={() => setSelectedZoneDetail(z)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-[#222A22] border-l-2 border-safe' : 'hover:bg-[#1C1C1C]'
                          }`}
                        >
                          <td className="p-2.5 text-gray-500 font-bold">#{idx + 1}</td>
                          <td className="p-2.5 font-bold text-white">
                            <div>{z.zoneName}</div>
                            {z.zoneId !== z.zoneName && (
                              <div className="text-[10px] text-gray-500 font-normal">{z.zoneId}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-bold text-white">{z.incidentCount}</td>
                          <td className="p-2.5 text-center font-bold text-critical">
                            {z.severity.critical > 0 ? z.severity.critical : '—'}
                          </td>
                          <td className="p-2.5 text-center font-bold text-amber-400">
                            {z.severity.high > 0 ? z.severity.high : '—'}
                          </td>
                          <td className="p-2.5 text-center text-gray-400">
                            {z.severity.medium + z.severity.low > 0
                              ? `${z.severity.medium}/${z.severity.low}`
                              : '—'}
                          </td>
                          <td className="p-2.5 text-center">
                            {z.trend.direction === 'increase' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-critical/20 text-critical border border-critical/30">
                                <TrendingUp className="w-3 h-3" />
                                +{z.trend.changeCount}
                              </span>
                            ) : z.trend.direction === 'decrease' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <TrendingDown className="w-3 h-3" />
                                {z.trend.changeCount}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/30 text-gray-400 border border-slate-700/50">
                                <Activity className="w-3 h-3" />
                                STABLE
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-gray-400 text-[11px]">
                            {z.cameras.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {z.cameras.map((c) => (
                                  <span key={c} className="bg-[#242424] px-1.5 py-0.5 rounded text-[10px] text-gray-300">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column: Zone Detail Panel & Stacked Severity Comparison (xl:col-span-5) */}
          <div className="xl:col-span-5 space-y-4">
            {/* Top 5 Zones Severity Comparison Bar Chart */}
            <div className="bg-[#141414] p-4 rounded-lg border border-[#2B2B2B]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono font-bold text-gray-200 uppercase">
                  Top Monitored Zones — Severity Stack
                </h4>
                <span className="text-[10px] font-mono text-gray-400">Critical / High / Medium / Low</span>
              </div>
              <div className="h-44">
                {sortedZones.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs font-mono text-gray-500">
                    No data for severity comparison.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sortedZones.slice(0, 5).map((z) => ({
                        zone: z.zoneName.length > 12 ? `${z.zoneName.substring(0, 10)}..` : z.zoneName,
                        critical: z.severity.critical,
                        high: z.severity.high,
                        medium: z.severity.medium,
                        low: z.severity.low,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="zone" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                      <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E1E1E',
                          borderColor: '#333',
                          borderRadius: '6px',
                          fontFamily: 'Roboto Mono',
                          fontSize: '11px',
                        }}
                      />
                      <Bar dataKey="critical" name="Critical" stackId="z" fill="#EF4444" />
                      <Bar dataKey="high" name="High" stackId="z" fill="#FBBF24" />
                      <Bar dataKey="medium" name="Medium" stackId="z" fill="#3B82F6" />
                      <Bar dataKey="low" name="Low" stackId="z" fill="#34D399" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Selected Zone Deep Dive Card */}
            {selectedZoneDetail ? (
              <div className="bg-[#161616] p-4 rounded-lg border border-[#2B2B2B] space-y-3 font-mono text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] text-safe font-bold uppercase tracking-wider block">
                      ZONE FORENSIC DOSSIER
                    </span>
                    <h4 className="text-sm font-bold text-white">{selectedZoneDetail.zoneName}</h4>
                    <span className="text-[10px] text-gray-500">{selectedZoneDetail.zoneId}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block">TOTAL RECORDED</span>
                    <span className="text-lg font-extrabold text-white">{selectedZoneDetail.incidentCount}</span>
                  </div>
                </div>

                {/* Risk score badge & trend statement */}
                <div className="bg-[#1E1E1E] p-2.5 rounded border border-[#282828] space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-gray-400">Risk Severity Index:</span>
                    <span
                      className={`font-bold ${
                        selectedZoneDetail.riskLevel === 'CRITICAL'
                          ? 'text-critical'
                          : selectedZoneDetail.riskLevel === 'HIGH'
                          ? 'text-amber-400'
                          : selectedZoneDetail.riskLevel === 'MODERATE'
                          ? 'text-sky-400'
                          : 'text-safe'
                      }`}
                    >
                      {selectedZoneDetail.riskScore !== null ? `${selectedZoneDetail.riskScore}/100 (${selectedZoneDetail.riskLevel})` : 'NO DATA'}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    * Derived from recorded incident severity; does not represent accident probability.
                  </div>
                </div>

                {/* Severity Breakdown Grid */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                  <div className="bg-[#1C1C1C] p-1.5 rounded border border-[#282828]">
                    <span className="text-gray-400 block text-[9px]">CRITICAL</span>
                    <span className="font-bold text-critical">{selectedZoneDetail.severity.critical}</span>
                  </div>
                  <div className="bg-[#1C1C1C] p-1.5 rounded border border-[#282828]">
                    <span className="text-gray-400 block text-[9px]">HIGH</span>
                    <span className="font-bold text-amber-400">{selectedZoneDetail.severity.high}</span>
                  </div>
                  <div className="bg-[#1C1C1C] p-1.5 rounded border border-[#282828]">
                    <span className="text-gray-400 block text-[9px]">MEDIUM</span>
                    <span className="font-bold text-sky-400">{selectedZoneDetail.severity.medium}</span>
                  </div>
                  <div className="bg-[#1C1C1C] p-1.5 rounded border border-[#282828]">
                    <span className="text-gray-400 block text-[9px]">LOW</span>
                    <span className="font-bold text-emerald-400">{selectedZoneDetail.severity.low}</span>
                  </div>
                </div>

                {/* Violation Types Breakdown */}
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1">RECORDED INFRACTION BREAKDOWN</span>
                  {selectedZoneDetail.violationTypes.length === 0 ? (
                    <p className="text-[11px] text-gray-500">No violations recorded.</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedZoneDetail.violationTypes.slice(0, 4).map((vt) => (
                        <div key={vt.type} className="flex justify-between items-center bg-[#1A1A1A] px-2 py-1 rounded text-[11px]">
                          <span className="text-gray-300 capitalize">{vt.type.replace(/_/g, ' ')}</span>
                          <span className="font-bold text-white">{vt.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Associated Cameras & Latest Incident */}
                <div className="pt-1 border-t border-[#262626] text-[10px] text-gray-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Evidence Cameras:</span>
                    <span className="text-gray-200">
                      {selectedZoneDetail.cameras.length > 0 ? selectedZoneDetail.cameras.join(', ') : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latest Recorded Incident:</span>
                    <span className="text-gray-200">
                      {selectedZoneDetail.latestIncident ? new Date(selectedZoneDetail.latestIncident).toLocaleString() : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#141414] p-6 rounded-lg border border-[#2B2B2B] text-center text-xs font-mono text-gray-500">
                Select a zone row from the table to view detailed forensics.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phase 10.4: Operational Shift Safety Analysis Panel */}
      <div className="hud-panel p-5 rounded-xl border border-[#2B2B2B] space-y-4">
        {/* Section Header & Summary Badges */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#2B2B2B]">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-sky-400" />
              <h2 className="text-sm font-bold font-mono text-white tracking-wide">
                OPERATIONAL SHIFT SAFETY ANALYSIS (IST / UTC+05:30)
              </h2>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Persisted incident telemetry, cross-shift exposure comparison, and time-bracket distributions
            </p>
          </div>

          {/* Shift Summary Metrics */}
          {shiftAnalysisData && (
            <div className="flex flex-wrap items-center gap-3 bg-[#1C1C1C] border border-[#333] px-3.5 py-2 rounded-lg text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Total Shifts:</span>
                <span className="text-white font-bold">{shiftAnalysisData.summary.totalShiftsMonitored}</span>
              </div>
              {shiftAnalysisData.summary.highestIncidentShift && (
                <>
                  <div className="hidden sm:block border-l border-[#333] h-4" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Highest Volume:</span>
                    <span className="text-amber-400 font-bold">
                      {shiftAnalysisData.summary.highestIncidentShift.shift} ({shiftAnalysisData.summary.highestIncidentShift.incidentCount})
                    </span>
                  </div>
                </>
              )}
              {shiftAnalysisData.summary.highestCriticalShift && (
                <>
                  <div className="hidden sm:block border-l border-[#333] h-4" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Highest Critical:</span>
                    <span className="text-critical font-bold">
                      {shiftAnalysisData.summary.highestCriticalShift.shift} ({shiftAnalysisData.summary.highestCriticalShift.criticalCount})
                    </span>
                  </div>
                </>
              )}
              {shiftAnalysisData.summary.mostWorseningShift && (
                <>
                  <div className="hidden sm:block border-l border-[#333] h-4" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Worsening:</span>
                    <span className="text-rose-400 font-bold">
                      {shiftAnalysisData.summary.mostWorseningShift.shift} (+{shiftAnalysisData.summary.mostWorseningShift.changeCount})
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Shift Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-gray-400">Shift Focus:</span>
            {(['all', 'Morning Shift', 'Afternoon Shift', 'Night Shift'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSelectedShift(s)}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  selectedShift === s
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50 font-bold'
                    : 'bg-[#1C1C1C] text-gray-400 border border-[#333] hover:text-white'
                }`}
              >
                {s === 'all' ? 'All Shifts (Overview)' : s}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-mono text-gray-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Shift Boundaries: Morning (06-14h) | Afternoon (14-22h) | Night (22-06h)</span>
          </div>
        </div>

        {/* Component A: 3 Shift Comparison Cards */}
        {loadingShiftAnalysis ? (
          <div className="p-8 text-center text-xs font-mono text-gray-500">
            COMPUTING PERSISTED SHIFT ANALYTICS...
          </div>
        ) : !shiftAnalysisData || shiftAnalysisData.shifts.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-gray-500">
            No shift incident data available for the selected filters.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shiftAnalysisData.shifts.map((s) => {
                return (
                  <div
                    key={s.shift}
                    onClick={() => setSelectedShift(selectedShift === s.shift ? 'all' : s.shift)}
                    className={`cursor-pointer transition-all rounded-xl p-4 border bg-[#141414] hover:border-sky-500/50 space-y-3 ${
                      selectedShift === s.shift
                        ? 'border-sky-500 ring-1 ring-sky-500/30 bg-[#161B22]'
                        : 'border-[#2B2B2B]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold font-mono text-white">{s.shift}</h4>
                        <span className="text-[10px] font-mono text-gray-400">{s.hours} IST</span>
                      </div>
                      <span
                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                          s.riskLevel === 'CRITICAL'
                            ? 'text-critical bg-critical/10 border-critical/30'
                            : s.riskLevel === 'HIGH'
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                            : s.riskLevel === 'MODERATE'
                            ? 'text-sky-400 bg-sky-500/10 border-sky-500/30'
                            : s.riskLevel === 'LOW'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : 'text-gray-500 bg-gray-500/10 border-gray-500/30'
                        }`}
                      >
                        {s.riskLevel}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-mono">RECORDED INCIDENTS</span>
                        <span className="text-2xl font-bold font-mono text-white">{s.incidentCount}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 block font-mono">SEVERITY EXPOSURE</span>
                        <span className="text-base font-bold font-mono text-sky-400">
                          {s.exposureIndex !== null ? s.exposureIndex : '--'}
                          <span className="text-[10px] text-gray-500 font-normal">/100</span>
                        </span>
                      </div>
                    </div>

                    {/* Severity mini-grid */}
                    <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
                      <div className="bg-[#1C1C1C] p-1 rounded border border-[#252525]">
                        <span className="text-gray-500 block text-[8px]">CRIT</span>
                        <span className="font-bold text-critical">{s.criticalCount}</span>
                      </div>
                      <div className="bg-[#1C1C1C] p-1 rounded border border-[#252525]">
                        <span className="text-gray-500 block text-[8px]">HIGH</span>
                        <span className="font-bold text-amber-400">{s.highCount}</span>
                      </div>
                      <div className="bg-[#1C1C1C] p-1 rounded border border-[#252525]">
                        <span className="text-gray-500 block text-[8px]">MED</span>
                        <span className="font-bold text-sky-400">{s.mediumCount}</span>
                      </div>
                      <div className="bg-[#1C1C1C] p-1 rounded border border-[#252525]">
                        <span className="text-gray-500 block text-[8px]">LOW</span>
                        <span className="font-bold text-emerald-400">{s.lowCount}</span>
                      </div>
                    </div>

                    {/* Trend & Latest Activity */}
                    <div className="pt-2 border-t border-[#222] flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-1">
                        {s.trend.direction === 'increase' ? (
                          <TrendingUp className="w-3.5 h-3.5 text-critical" />
                        ) : s.trend.direction === 'decrease' ? (
                          <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Activity className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span
                          className={`capitalize font-bold ${
                            s.trend.direction === 'increase'
                              ? 'text-critical'
                              : s.trend.direction === 'decrease'
                              ? 'text-emerald-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {s.trend.direction}
                        </span>
                        <span className="text-gray-500">
                          ({s.trend.changeCount >= 0 ? `+${s.trend.changeCount}` : s.trend.changeCount}
                          {s.trend.changePercent !== null ? `, ${s.trend.changePercent}%` : ''})
                        </span>
                      </div>
                      <span className="text-gray-500">
                        {s.latestIncident ? new Date(s.latestIncident).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No Activity'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Component B & C: Shift Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Shift Severity Stacked Bar Chart (6 cols) */}
              <div className="lg:col-span-6 bg-[#141414] p-4 rounded-xl border border-[#2B2B2B]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-mono font-bold text-gray-200">
                    SHIFT SEVERITY EXPOSURE DISTRIBUTION
                  </h4>
                  <span className="text-[10px] font-mono text-gray-400">STACKED CRITICAL / HIGH / MED / LOW</span>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shiftAnalysisData.shifts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="shift" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                      <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', borderColor: '#333', fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                      <Bar dataKey="criticalCount" name="Critical" stackId="a" fill="#EF4444" />
                      <Bar dataKey="highCount" name="High" stackId="a" fill="#F59E0B" />
                      <Bar dataKey="mediumCount" name="Medium" stackId="a" fill="#38BDF8" />
                      <Bar dataKey="lowCount" name="Low" stackId="a" fill="#10B981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Shift Trend Timeline Trajectory (6 cols) */}
              <div className="lg:col-span-6 bg-[#141414] p-4 rounded-xl border border-[#2B2B2B]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-mono font-bold text-gray-200">
                    SHIFT ACTIVITY TIMELINE TRAJECTORY
                  </h4>
                  <span className="text-[10px] font-mono text-gray-400">CHRONOLOGICAL INCIDENT FREQUENCY</span>
                </div>
                <div className="h-56">
                  {shiftAnalysisData.timeline.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs font-mono text-gray-500">
                      No timeline data available for the selected observation window.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={shiftAnalysisData.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaMorn" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="areaAft" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="areaNight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#A855F7" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                        <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                        <Tooltip contentStyle={{ backgroundColor: '#141414', borderColor: '#333', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                        <Area type="monotone" dataKey="morning" name="Morning" stroke="#38BDF8" fill="url(#areaMorn)" />
                        <Area type="monotone" dataKey="afternoon" name="Afternoon" stroke="#F59E0B" fill="url(#areaAft)" />
                        <Area type="monotone" dataKey="night" name="Night" stroke="#A855F7" fill="url(#areaNight)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Component D, E, F: Selected Shift Forensic Detail */}
            {(() => {
              const activeShiftObj =
                selectedShift === 'all'
                  ? shiftAnalysisData.shifts[0]
                  : shiftAnalysisData.shifts.find((s) => s.shift === selectedShift) || shiftAnalysisData.shifts[0];

              return (
                <div className="bg-[#141414] p-4 rounded-xl border border-[#2B2B2B] space-y-3 font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#222]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">
                        {selectedShift === 'all' ? `All Shifts Forensic Focus (${activeShiftObj.shift} Snapshot)` : `${activeShiftObj.shift} Detailed Analysis`}
                      </h4>
                      <span className="text-[10px] text-gray-400">({activeShiftObj.hours} IST)</span>
                    </div>
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Compliance unavailable — observation denominator not available
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* D. Violation Breakdown */}
                    <div className="bg-[#181818] p-3 rounded-lg border border-[#252525] space-y-2">
                      <span className="text-[10px] font-bold text-gray-300 block uppercase tracking-wider">
                        Top Infractions ({activeShiftObj.violationTypes.length})
                      </span>
                      {activeShiftObj.violationTypes.length === 0 ? (
                        <p className="text-[11px] text-gray-500">No violations recorded for this shift.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeShiftObj.violationTypes.slice(0, 5).map((v) => (
                            <div key={v.type} className="flex justify-between items-center text-[11px] bg-[#1F1F1F] px-2 py-1 rounded">
                              <span className="text-gray-300 capitalize truncate max-w-[150px]">{v.type.replace(/_/g, ' ')}</span>
                              <span className="font-bold text-white">{v.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* E. Problematic Zones */}
                    <div className="bg-[#181818] p-3 rounded-lg border border-[#252525] space-y-2">
                      <span className="text-[10px] font-bold text-gray-300 block uppercase tracking-wider">
                        Active Incident Zones ({activeShiftObj.zones.length})
                      </span>
                      {activeShiftObj.zones.length === 0 ? (
                        <p className="text-[11px] text-gray-500">No zone incidents recorded for this shift.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeShiftObj.zones.slice(0, 5).map((z) => (
                            <div key={z.zoneId} className="flex justify-between items-center text-[11px] bg-[#1F1F1F] px-2 py-1 rounded">
                              <span className="text-gray-300 truncate max-w-[150px]">{z.zoneName}</span>
                              <span className="font-bold text-amber-400">{z.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* F. Camera Source Distribution */}
                    <div className="bg-[#181818] p-3 rounded-lg border border-[#252525] space-y-2">
                      <span className="text-[10px] font-bold text-gray-300 block uppercase tracking-wider">
                        Camera Sources ({activeShiftObj.cameras.length})
                      </span>
                      {activeShiftObj.cameras.length === 0 ? (
                        <p className="text-[11px] text-gray-500">No camera incidents recorded for this shift.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeShiftObj.cameras.slice(0, 5).map((c) => (
                            <div key={c.cameraId} className="flex justify-between items-center text-[11px] bg-[#1F1F1F] px-2 py-1 rounded">
                              <span className="text-gray-300">{c.cameraId}</span>
                              <span className="font-bold text-sky-400">{c.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* PHASE 10.5: SAFETY INCIDENT HEATMAP SECTION */}
      <div className="hud-panel p-5 rounded-xl border border-[#2B2B2B] space-y-4">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#2B2B2B]">
          <div>
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-rose-500" />
              <h2 className="text-sm font-bold font-mono text-white tracking-wide">
                SAFETY INCIDENT HEATMAP
              </h2>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Persisted Incident Density Heatmap across camera frames derived from historical bounding-box centroids
            </p>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1.5 bg-[#141414] p-1 rounded-lg border border-[#2B2B2B]">
            {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setHeatmapTimeframe(tf)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition uppercase ${
                  heatmapTimeframe === tf
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-3 bg-[#141414] rounded-lg border border-[#262626] font-mono text-xs">
          {/* Camera Filter */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">CAMERA</label>
            <select
              value={heatmapCamera}
              onChange={(e) => setHeatmapCamera(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#333] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            >
              <option value="all">All Cameras</option>
              {availableCameras.map((cam) => (
                <option key={cam} value={cam}>
                  {cam}
                </option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">SHIFT (IST +05:30)</label>
            <select
              value={heatmapShift}
              onChange={(e) => setHeatmapShift(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#333] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            >
              <option value="all">All Shifts</option>
              <option value="Morning Shift">Morning (06:00 - 14:00)</option>
              <option value="Afternoon Shift">Afternoon (14:00 - 22:00)</option>
              <option value="Night Shift">Night (22:00 - 06:00)</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">SEVERITY</label>
            <select
              value={heatmapSeverity}
              onChange={(e) => setHeatmapSeverity(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#333] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Violation Type Filter */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">VIOLATION TYPE</label>
            <select
              value={heatmapViolation}
              onChange={(e) => setHeatmapViolation(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#333] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            >
              <option value="all">All Violations</option>
              <option value="missing_helmet">Missing Helmet</option>
              <option value="missing_vest">Missing Vest</option>
              <option value="restricted_zone">Restricted Zone</option>
              <option value="worker_isolated">Lone Worker</option>
              <option value="emergency_route_blockage">Emergency Route Blockage</option>
              <option value="unverified_person_in_restricted_zone">Unverified Person</option>
            </select>
          </div>

          {/* Zone Filter */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">ZONE</label>
            <select
              value={heatmapZone}
              onChange={(e) => setHeatmapZone(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-[#333] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            >
              <option value="all">All Zones</option>
              {availableZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State or Main Visualization Frame */}
        {loadingHeatmap ? (
          <div className="p-12 text-center text-xs font-mono text-gray-500 bg-[#121212] rounded-xl border border-[#2B2B2B]">
            AGGREGATING PERSISTED SPATIAL CENTROIDS & DENSITY PROFILES...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Camera Frame Visualization */}
            <div className="relative bg-[#070A0F] border border-[#262E3B] rounded-xl p-3 overflow-hidden shadow-2xl">
              {/* Surveillance HUD Overlay Bar Top */}
              <div className="flex items-center justify-between text-[11px] font-mono pb-2 border-b border-[#1E2530] text-gray-400 mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-white font-bold tracking-wider">
                    {heatmapCamera !== 'all' ? `FEED: ${heatmapCamera}` : 'ALL CAMERAS (SPATIAL OVERLAY)'}
                  </span>
                  <span className="text-gray-500 text-[10px]">| PERSISTED EVIDENCE PROJECTION</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span>FRAME RESOLUTION: 20×20 GRID (400 CELLS)</span>
                  <span className="text-rose-400 font-bold">IST (UTC+05:30)</span>
                </div>
              </div>

              {/* 20x20 Heatmap Grid Container */}
              <div
                className="relative w-full rounded-lg overflow-hidden bg-[#0D121B] border border-[#1E293B]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(20, minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(20, minmax(0, 1fr))',
                  aspectRatio: '16/9',
                  maxHeight: '620px',
                }}
              >
                {/* 4 Corner Crosshairs */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-rose-500/60 pointer-events-none z-10" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-rose-500/60 pointer-events-none z-10" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-rose-500/60 pointer-events-none z-10" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-rose-500/60 pointer-events-none z-10" />

                {/* Center crosshair */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 opacity-30">
                  <div className="w-8 h-8 border border-dashed border-gray-400 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                  </div>
                </div>

                {/* 400 Grid Cells Rendered deterministically in row-major order: row 0..19, col 0..19 */}
                {Array.from({ length: 20 }).map((_, row) =>
                  Array.from({ length: 20 }).map((_, col) => {
                    const cell = heatmapCellMap.get(`${col}_${row}`);
                    const count = cell?.count || 0;
                    const density = cell?.density || 0;
                    const isHovered = hoveredCell?.x === col && hoveredCell?.y === row;

                    let bg = 'rgba(255, 255, 255, 0.015)';
                    if (density > 0) {
                      if (density >= 0.75) {
                        bg = `rgba(239, 68, 68, ${0.45 + density * 0.45})`;
                      } else if (density >= 0.45) {
                        bg = `rgba(245, 158, 11, ${0.4 + density * 0.4})`;
                      } else if (density >= 0.2) {
                        bg = `rgba(56, 189, 248, ${0.35 + density * 0.35})`;
                      } else {
                        bg = `rgba(99, 102, 241, ${0.28 + density * 0.3})`;
                      }
                    }

                    return (
                      <div
                        key={`${col}_${row}`}
                        onMouseEnter={() => cell && setHoveredCell(cell)}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`relative transition-all duration-150 border border-white/[0.04] cursor-pointer flex items-center justify-center ${
                          isHovered ? 'ring-2 ring-rose-400 z-20 scale-110 shadow-lg shadow-rose-500/40' : ''
                        }`}
                        style={{ backgroundColor: bg }}
                      >
                        {count > 0 && (
                          <span
                            className={`text-[8px] font-mono font-bold select-none pointer-events-none ${
                              density >= 0.6 ? 'text-white' : 'text-gray-300'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Zero-data overlay if no spatial data */}
                {(!heatmapData || heatmapData.spatialIncidentCount === 0) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 font-mono text-center p-4">
                    <ShieldAlert className="w-8 h-8 text-gray-500 mb-2" />
                    <p className="text-sm font-bold text-gray-300">
                      No spatial incident data available for this timeframe.
                    </p>
                    <p className="text-xs text-gray-500 mt-1 max-w-md">
                      Zero incidents matching the current filter set contain persisted bounding box evidence.
                    </p>
                  </div>
                )}
              </div>

              {/* Hovered Cell Detail HUD Tooltip */}
              <div className="mt-2 flex flex-wrap items-center justify-between bg-[#111722] px-3 py-2 rounded-lg border border-[#1E293B] text-xs font-mono">
                {hoveredCell ? (
                  <div className="flex flex-wrap items-center gap-4 text-gray-300">
                    <span className="text-rose-400 font-bold">
                      CELL [X: {hoveredCell.x}, Y: {hoveredCell.y}]
                    </span>
                    <span>
                      INCIDENTS: <strong className="text-white">{hoveredCell.count}</strong>
                    </span>
                    <span>
                      RELATIVE DENSITY:{' '}
                      <strong className="text-amber-400">{(hoveredCell.density * 100).toFixed(0)}%</strong> ({hoveredCell.density.toFixed(2)})
                    </span>
                    <span>
                      FRAME POSITION: X {hoveredCell.normXStart.toFixed(2)}–{hoveredCell.normXEnd.toFixed(2)}, Y {hoveredCell.normYStart.toFixed(2)}–{hoveredCell.normYEnd.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-gray-400 italic">
                      (Incident bounding-box center)
                    </span>
                  </div>
                ) : (
                  <div className="text-gray-400 flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 text-rose-500" />
                    <span>Hover over any grid cell to inspect incident evidence location & relative density</span>
                  </div>
                )}
                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                  <span>DENSITY SCALE:</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[9px]">LOW</span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 text-[9px]">MED</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 text-[9px]">HIGH</span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[9px]">PEAK</span>
                </div>
              </div>
            </div>

            {/* Evidence & Counting Truthfulness Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
              <div className="bg-[#141414] p-3 rounded-lg border border-[#282828] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 block">SPATIAL EVIDENCE INTEGRITY</span>
                  <span className="text-sm font-bold text-white">
                    {heatmapData?.spatialIncidentCount ?? 0} of {heatmapData?.totalIncidentCount ?? 0}
                  </span>
                  <span className="text-[10px] text-emerald-400 block mt-0.5">Valid spatial evidence</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block">EXCLUDED (NO BBOX)</span>
                  <span className="text-sm font-bold text-amber-400">{heatmapData?.excludedIncidentCount ?? 0}</span>
                </div>
              </div>

              <div className="bg-[#141414] p-3 rounded-lg border border-[#282828] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 block">PEAK HOTSPOT CONCENTRATION</span>
                  <span className="text-sm font-bold text-rose-400">
                    {heatmapData?.maxCellCount ?? 0} Incidents
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">Single cell maximum</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block">ACTIVE CELLS</span>
                  <span className="text-sm font-bold text-sky-400">{heatmapData?.cells.length ?? 0} / 400</span>
                </div>
              </div>

              <div className="bg-[#141414] p-3 rounded-lg border border-[#282828] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 block">PERIOD TRAJECTORY COMPARISON</span>
                  <span className="text-sm font-bold text-white capitalize flex items-center gap-1.5">
                    {heatmapData?.trend.direction === 'increase' ? (
                      <TrendingUp className="w-3.5 h-3.5 text-critical" />
                    ) : heatmapData?.trend.direction === 'decrease' ? (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    {heatmapData?.trend.direction ?? 'stable'}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5 truncate max-w-[200px]" title={heatmapData?.trend.statement}>
                    {heatmapData?.trend.statement ?? 'No comparative baseline'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block">DELTA</span>
                  <span className={`text-sm font-bold ${
                    (heatmapData?.trend.changeCount ?? 0) > 0 ? 'text-critical' : (heatmapData?.trend.changeCount ?? 0) < 0 ? 'text-emerald-400' : 'text-gray-400'
                  }`}>
                    {(heatmapData?.trend.changeCount ?? 0) >= 0 ? `+${heatmapData?.trend.changeCount ?? 0}` : heatmapData?.trend.changeCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Supplementary Cards: Top Hotspots & Zone Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono">
              {/* Top Spatial Hotspots */}
              <div className="lg:col-span-6 bg-[#141414] p-4 rounded-xl border border-[#2B2B2B] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                  <h3 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-rose-500" />
                    TOP SPATIAL HOTSPOTS (PERSISTED CONCENTRATIONS)
                  </h3>
                  <span className="text-[10px] text-gray-500">RANKED BY DENSITY</span>
                </div>

                {(!heatmapData?.topHotspots || heatmapData.topHotspots.length === 0) ? (
                  <p className="text-xs text-gray-500 py-6 text-center">No hotspot clusters detected.</p>
                ) : (
                  <div className="space-y-2">
                    {heatmapData.topHotspots.map((hs) => (
                      <div
                        key={hs.rank}
                        className="bg-[#1A1A1A] p-2.5 rounded-lg border border-[#282828] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center font-bold text-[10px]">
                            {hs.rank}
                          </span>
                          <div>
                            <span className="text-white font-bold block">{hs.label}</span>
                            <span className="text-[10px] text-gray-400">
                              Grid Cell: X {hs.cellX}, Y {hs.cellY}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-rose-400">{hs.count} Incidents</span>
                          <span className="text-[10px] text-gray-500 block">
                            Relative Density: {(hs.density * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zone Spatial Distribution */}
              <div className="lg:col-span-6 bg-[#141414] p-4 rounded-xl border border-[#2B2B2B] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                  <h3 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    ZONE SPATIAL EVIDENCE CONTEXT
                  </h3>
                  <span className="text-[10px] text-gray-500">CORRELATED PHYSICAL ZONES</span>
                </div>

                {(!heatmapData?.zoneContext || heatmapData.zoneContext.length === 0) ? (
                  <p className="text-xs text-gray-500 py-6 text-center">No zone spatial associations available.</p>
                ) : (
                  <div className="space-y-2">
                    {heatmapData.zoneContext.slice(0, 5).map((zc) => (
                      <div
                        key={zc.zoneId}
                        className="bg-[#1A1A1A] p-2.5 rounded-lg border border-[#282828] flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="text-white font-bold block truncate max-w-[220px]">
                            {zc.zoneName}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Spatial Incidents: <strong className="text-emerald-400">{zc.spatialCount}</strong> / {zc.totalCount}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-amber-400 font-bold">{zc.totalCount} Recorded</span>
                          <span className="text-[10px] text-gray-500 block">
                            {zc.totalCount > 0 ? `${Math.round((zc.spatialCount / zc.totalCount) * 100)}% with bbox` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PHASE 10.6: NEAR-MISS ANALYTICS (Strictly Persisted MongoDB Records)      */}
      {/* ========================================================================= */}
      <div className="bg-[#121212] p-5 rounded-xl border border-[#2B2B2B] shadow-xl space-y-4">
        {/* Header & Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-[#262626] gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h2 className="text-base font-mono font-bold text-white tracking-wide">
                NEAR-MISS ANALYTICS
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                PHASE 10.6
              </span>
            </div>
            <p className="text-xs font-mono text-gray-400 mt-1">
              HISTORICAL NEAR-MISS RECORDS &amp; SAFETY EVIDENCE ANALYTICS (IST UTC+05:30)
            </p>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-gray-400 text-[11px] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              TIMEFRAME:
            </span>
            <div className="flex bg-[#1E1E1E] p-0.5 rounded-lg border border-[#333]">
              {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setNearMissTimeframe(tf)}
                  className={`px-3 py-1 rounded text-xs transition-all uppercase ${
                    nearMissTimeframe === tf
                      ? 'bg-amber-500 text-black font-bold shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-[#181818] rounded-lg border border-[#2A2A2A] text-xs font-mono">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase">FILTERS:</span>
          </div>

          {/* Camera Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">CAMERA:</span>
            <select
              value={nearMissCamera}
              onChange={(e) => setNearMissCamera(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL CAMERAS</option>
              {availableCameras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Zone Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">ZONE:</span>
            <select
              value={nearMissZone}
              onChange={(e) => setNearMissZone(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL ZONES</option>
              {availableZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">SHIFT:</span>
            <select
              value={nearMissShift}
              onChange={(e) => setNearMissShift(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL SHIFTS</option>
              <option value="Morning Shift">MORNING (06:00-14:00)</option>
              <option value="Afternoon Shift">AFTERNOON (14:00-22:00)</option>
              <option value="Night Shift">NIGHT (22:00-06:00)</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">SEVERITY:</span>
            <select
              value={nearMissSeverity}
              onChange={(e) => setNearMissSeverity(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL SEVERITIES</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">TYPE:</span>
            <select
              value={nearMissType}
              onChange={(e) => setNearMissType(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL TYPES</option>
              {nearMissData?.byType.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">STATUS:</span>
            <select
              value={nearMissStatus}
              onChange={(e) => setNearMissStatus(e.target.value)}
              className="bg-[#242424] text-white px-2.5 py-1 rounded border border-[#383838] focus:border-amber-400 focus:outline-none"
            >
              <option value="all">ALL STATUSES</option>
              <option value="open">OPEN</option>
              <option value="resolved">RESOLVED</option>
              <option value="confirmed">CONFIRMED IDENTITY</option>
              <option value="unconfirmed">UNCONFIRMED IDENTITY</option>
            </select>
          </div>
        </div>

        {/* Loading Indicator */}
        {loadingNearMiss ? (
          <div className="p-12 text-center text-xs font-mono text-gray-500 bg-[#141414] rounded-xl border border-[#2B2B2B]">
            AGGREGATING PERSISTED NEAR-MISS RECORDS FROM MONGODB...
          </div>
        ) : nearMissData?.totalNearMisses === 0 ? (
          /* Honest Zero-Data / Filtered-Empty UI */
          <div className="p-12 text-center bg-[#151515] rounded-xl border border-[#282828] space-y-3 font-mono">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            {nearMissCamera !== 'all' ||
            nearMissZone !== 'all' ||
            nearMissShift !== 'all' ||
            nearMissSeverity !== 'all' ||
            nearMissType !== 'all' ||
            nearMissStatus !== 'all' ? (
              <>
                <h3 className="text-sm font-bold text-gray-200">
                  No near-miss records match the selected filters.
                </h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Adjust active filter parameters to inspect other cameras, zones, or operational shifts.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-gray-200">
                  No near-miss records have been persisted for the selected timeframe.
                </h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Near-miss analytics will populate when validated near-miss events are persisted.
                </p>
              </>
            )}
            <div className="pt-2 text-[10px] text-gray-500">
              SOURCE OF TRUTH: MONGODB REPLICA SET · ZERO FABRICATED EVENTS
            </div>
          </div>
        ) : (
          /* Active Analytics Layout */
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
              <div className="bg-[#181818] p-3.5 rounded-xl border border-[#262626]">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>TOTAL NEAR-MISSES</span>
                  <Activity className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {nearMissData?.totalNearMisses ?? 0}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Persisted records in selected window
                </div>
              </div>

              <div className="bg-[#181818] p-3.5 rounded-xl border border-[#262626]">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>PREVIOUS PERIOD</span>
                  <Clock className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {nearMissData?.previousPeriodNearMisses ?? 0}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Preceding equivalent period
                </div>
              </div>

              <div className="bg-[#181818] p-3.5 rounded-xl border border-[#262626]">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>TREND DIRECTION</span>
                  {nearMissData?.direction === 'increase' ? (
                    <TrendingUp className="w-4 h-4 text-critical" />
                  ) : nearMissData?.direction === 'decrease' ? (
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Activity className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-lg font-bold uppercase ${
                      nearMissData?.direction === 'increase'
                        ? 'text-critical'
                        : nearMissData?.direction === 'decrease'
                        ? 'text-emerald-400'
                        : 'text-gray-300'
                    }`}
                  >
                    {nearMissData?.direction ?? 'STABLE'}
                  </span>
                  {nearMissData?.changePercent !== null && nearMissData?.changePercent !== undefined && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                        nearMissData.changePercent > 0
                          ? 'bg-critical/20 text-critical border border-critical/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}
                    >
                      {nearMissData.changePercent > 0 ? `+${nearMissData.changePercent}%` : `${nearMissData.changePercent}%`}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {nearMissData?.previousPeriodNearMisses === 0 && (nearMissData?.totalNearMisses ?? 0) > 0
                    ? `Near-misses increased from 0 to ${nearMissData?.totalNearMisses}`
                    : 'Period-over-period variance'}
                </div>
              </div>

              <div className="bg-[#181818] p-3.5 rounded-xl border border-[#262626]">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>EVIDENCE COVERAGE</span>
                  <Camera className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {nearMissData?.recent ? `${nearMissData.recent.filter((r) => r.hasEvidence).length} / ${nearMissData.recent.length}` : '0 / 0'}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Logged forensic snapshots
                </div>
              </div>
            </div>

            {/* Timeline Chart */}
            <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                <h3 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  NEAR-MISS TREND TIMELINE
                </h3>
                <span className="text-[10px] text-gray-500">
                  {nearMissTimeframe === '24h' ? 'HOURLY INTERVALS' : 'DAILY INTERVALS'} (IST)
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={nearMissData?.timeline || []}>
                    <defs>
                      <linearGradient id="nmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis dataKey="timeLabel" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
                    <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#141414', borderColor: '#333', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="count" name="Near-Misses" stroke="#F59E0B" strokeWidth={2} fill="url(#nmGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Breakdown Charts Grid: Severity, Type, Zone, Camera */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
              {/* Severity Breakdown */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2">
                <h3 className="text-xs font-bold text-gray-200 pb-2 border-b border-[#222] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  BY SEVERITY
                </h3>
                {(!nearMissData?.bySeverity || nearMissData.bySeverity.length === 0) ? (
                  <p className="text-gray-500 py-6 text-center">No severity data</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {nearMissData.bySeverity.map((s) => (
                      <div key={s.severity} className="flex items-center justify-between bg-[#1D1D1D] p-2 rounded border border-[#2A2A2A]">
                        <span className={`font-bold ${
                          s.severity === 'CRITICAL' ? 'text-critical' :
                          s.severity === 'HIGH' ? 'text-warning' :
                          s.severity === 'MEDIUM' ? 'text-sky-400' : 'text-emerald-400'
                        }`}>
                          {s.severity}
                        </span>
                        <div className="text-right">
                          <span className="text-white font-bold">{s.count}</span>
                          {s.percentage !== null && (
                            <span className="text-[10px] text-gray-500 block">{s.percentage}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Type / Rule Breakdown */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2">
                <h3 className="text-xs font-bold text-gray-200 pb-2 border-b border-[#222] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  BY VIOLATION / RULE
                </h3>
                {(!nearMissData?.byType || nearMissData.byType.length === 0) ? (
                  <p className="text-gray-500 py-6 text-center">No type data</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {nearMissData.byType.map((t) => (
                      <div key={t.type} className="flex items-center justify-between bg-[#1D1D1D] p-2 rounded border border-[#2A2A2A]">
                        <span className="text-gray-300 truncate max-w-[140px] font-bold" title={t.type}>
                          {t.type}
                        </span>
                        <span className="text-amber-400 font-bold">{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zone Breakdown */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2">
                <h3 className="text-xs font-bold text-gray-200 pb-2 border-b border-[#222] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  BY ZONE
                </h3>
                {(!nearMissData?.byZone || nearMissData.byZone.length === 0) ? (
                  <p className="text-gray-500 py-6 text-center">No zone data</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {nearMissData.byZone.slice(0, 5).map((z) => (
                      <div key={z.zoneId} className="flex items-center justify-between bg-[#1D1D1D] p-2 rounded border border-[#2A2A2A]">
                        <span className="text-white truncate max-w-[140px] font-bold" title={z.zoneName}>
                          {z.zoneName}
                        </span>
                        <span className="text-emerald-400 font-bold">{z.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Camera Breakdown */}
              <div className="bg-[#161616] p-4 rounded-xl border border-[#262626] space-y-2">
                <h3 className="text-xs font-bold text-gray-200 pb-2 border-b border-[#222] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  BY CAMERA
                </h3>
                {(!nearMissData?.byCamera || nearMissData.byCamera.length === 0) ? (
                  <p className="text-gray-500 py-6 text-center">No camera data</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {nearMissData.byCamera.map((c) => (
                      <div key={c.cameraId} className="flex items-center justify-between bg-[#1D1D1D] p-2 rounded border border-[#2A2A2A]">
                        <span className="text-white font-bold">{c.cameraId}</span>
                        <span className="text-sky-400 font-bold">{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Shift Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
              {(nearMissData?.byShift || []).map((sh) => (
                <div key={sh.shift} className="bg-[#161616] p-3.5 rounded-xl border border-[#262626] flex items-center justify-between">
                  <div>
                    <span className="text-white font-bold block">{sh.shift}</span>
                    <span className="text-[10px] text-gray-500">{sh.hours} IST</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-amber-400">{sh.count}</span>
                    <span className="text-[10px] text-gray-500 block">Near-Misses</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Near-Misses Table */}
            <div className="bg-[#161616] rounded-xl border border-[#262626] overflow-hidden font-mono">
              <div className="p-3.5 bg-[#1B1B1B] border-b border-[#262626] flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  RECENT PERSISTED NEAR-MISSES (MAX 20)
                </h3>
                <span className="text-[10px] text-gray-400">CLICK ROW FOR FORENSIC DETAIL</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141414] text-gray-400 text-[10px] uppercase border-b border-[#262626]">
                    <tr>
                      <th className="p-3">ID / Time</th>
                      <th className="p-3">Camera</th>
                      <th className="p-3">Zone</th>
                      <th className="p-3">Rule / Type</th>
                      <th className="p-3">Severity</th>
                      <th className="p-3">Risk Score</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {(!nearMissData?.recent || nearMissData.recent.length === 0) ? (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-gray-500">
                          No recent near-miss records.
                        </td>
                      </tr>
                    ) : (
                      nearMissData.recent.map((nm) => (
                        <tr
                          key={nm.nearMissId}
                          onClick={() => setSelectedNearMiss(nm)}
                          className="hover:bg-[#202020] cursor-pointer transition-colors"
                        >
                          <td className="p-3">
                            <span className="font-bold text-amber-400 block">{nm.nearMissId}</span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(nm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </td>
                          <td className="p-3 text-white font-bold">{nm.cameraId}</td>
                          <td className="p-3 text-gray-300">{nm.zoneName}</td>
                          <td className="p-3 text-gray-400 truncate max-w-[150px]">{nm.type}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              nm.severity === 'CRITICAL' ? 'bg-critical/20 text-critical border-critical/40' :
                              nm.severity === 'HIGH' ? 'bg-warning/20 text-warning border-warning/40' :
                              nm.severity === 'MEDIUM' ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' :
                              'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            }`}>
                              {nm.severity}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-white">
                            {nm.riskScore !== null ? `${nm.riskScore}/100` : '—'}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              nm.resolved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {nm.resolved ? 'RESOLVED' : 'OPEN'}
                            </span>
                          </td>
                          <td className="p-3">
                            {nm.hasEvidence ? (
                              <span className="text-emerald-400 flex items-center gap-1 text-[10px]">
                                <Eye className="w-3 h-3" /> Available
                              </span>
                            ) : (
                              <span className="text-gray-500 text-[10px]">No snapshot</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Forensic Detail Modal */}
        {selectedNearMiss && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
            <div className="bg-[#161616] border border-[#333] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">
                    FORENSIC DETAIL — {selectedNearMiss.nearMissId}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNearMiss(null)}
                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#252525]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#1E1E1E] p-2.5 rounded border border-[#2A2A2A]">
                  <span className="text-[10px] text-gray-500 block">TIMESTAMP (IST)</span>
                  <span className="text-white font-bold">
                    {new Date(selectedNearMiss.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="bg-[#1E1E1E] p-2.5 rounded border border-[#2A2A2A]">
                  <span className="text-[10px] text-gray-500 block">CAMERA / ZONE</span>
                  <span className="text-white font-bold">
                    {selectedNearMiss.cameraId} · {selectedNearMiss.zoneName}
                  </span>
                </div>
                <div className="bg-[#1E1E1E] p-2.5 rounded border border-[#2A2A2A]">
                  <span className="text-[10px] text-gray-500 block">SEVERITY / RISK SCORE</span>
                  <span className="text-amber-400 font-bold">
                    {selectedNearMiss.severity} ({selectedNearMiss.riskScore !== null ? `${selectedNearMiss.riskScore}/100` : 'No score'})
                  </span>
                </div>
                <div className="bg-[#1E1E1E] p-2.5 rounded border border-[#2A2A2A]">
                  <span className="text-[10px] text-gray-500 block">STATUS / IDENTITY</span>
                  <span className="text-white font-bold">
                    {selectedNearMiss.status.toUpperCase()} ({selectedNearMiss.identityStatus})
                  </span>
                </div>
              </div>

              {/* Trigger Conditions */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-gray-400 font-bold block">TRIGGER CONDITIONS:</span>
                {selectedNearMiss.triggerConditions.length === 0 ? (
                  <p className="text-xs text-gray-500">No trigger conditions recorded.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedNearMiss.triggerConditions.map((tc, idx) => (
                      <li key={idx} className="text-xs text-gray-300 bg-[#1D1D1D] p-2 rounded border border-[#2A2A2A]">
                        • {tc}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Related Incident */}
              <div className="text-xs bg-[#1E1E1E] p-2.5 rounded border border-[#2A2A2A] flex items-center justify-between">
                <span className="text-gray-400">RELATED INCIDENT:</span>
                <span className="text-white font-bold">
                  {selectedNearMiss.incidentId || 'None (Autonomous Near-Miss)'}
                </span>
              </div>

              {/* Evidence Snapshot */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-gray-400 font-bold block">EVIDENCE SNAPSHOT:</span>
                {selectedNearMiss.hasEvidence && selectedNearMiss.evidence ? (
                  <div className="rounded-lg overflow-hidden border border-[#333] bg-[#0C0C0C]">
                    <img
                      src={selectedNearMiss.evidence}
                      alt="Near-miss evidence"
                      className="w-full max-h-48 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-500 bg-[#1A1A1A] rounded border border-[#282828]">
                    No evidence snapshot available
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedNearMiss(null)}
                  className="px-4 py-1.5 bg-[#2A2A2A] hover:bg-[#333] text-white rounded text-xs transition-colors font-bold"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 1 Charts: Real Incident Frequency & Telemetry + Violations by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Incident Frequency Curve */}
        <div className="lg:col-span-7 hud-panel p-4 rounded-xl border border-[#2B2B2B]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold text-gray-200">
              INCIDENT FREQUENCY & TELEMETRY OVER TIME
            </h3>
            <span className="text-[10px] font-mono text-gray-400">
              DENOMINATOR UNAVAILABLE FOR COMPLIANCE %
            </span>
          </div>
          <div className="h-64">
            {complianceHourly.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs font-mono text-gray-500">
                No incidents recorded in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={complianceHourly}>
                  <defs>
                    <linearGradient id="areaInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                  <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1E1E1E',
                      borderColor: '#333',
                      borderRadius: '6px',
                      fontFamily: 'Roboto Mono',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="incidents"
                    name="Logged Incidents"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#areaInc)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Violations by Type Bar Chart */}
        <div className="lg:col-span-5 hud-panel p-4 rounded-xl border border-[#2B2B2B]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold text-gray-200">
              VIOLATIONS BY PPE CATEGORY
            </h3>
            <span className="text-[10px] font-mono text-gray-400">
              TOTAL: {violationsByType.reduce((acc: number, v: any) => acc + (v.count || 0), 0)} LOGGED
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationsByType} layout="vertical">
                <XAxis type="number" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <YAxis dataKey="type" type="category" stroke="#6B7280" fontSize={10} width={95} fontFamily="Roboto Mono" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Violations by Zone & Shift Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Violations by Zone */}
        <div className="lg:col-span-6 hud-panel p-4 rounded-xl border border-[#2B2B2B]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold text-gray-200">
              SAFETY BREACH DISTRIBUTION BY INDUSTRIAL ZONE
            </h3>
            <span className="text-[10px] font-mono text-critical font-bold">
              {violationsByZone.length > 0 ? `${violationsByZone[0]?.zoneName || violationsByZone[0]?.zoneId || 'ZONE'} HIGHEST EXPOSURE` : 'DYNAMIC RISK MAPPING'}
            </span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationsByZone}>
                <XAxis dataKey="zoneName" stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" />
                <YAxis stroke="#6B7280" fontSize={10} fontFamily="Roboto Mono" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333',
                    borderRadius: '6px',
                    fontFamily: 'Roboto Mono',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="incidentCount" name="Incidents" fill="#FBBF24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incidents by Shift */}
        <div className="lg:col-span-6 hud-panel p-4 rounded-xl border border-[#2B2B2B]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold text-gray-200">
              INCIDENT VELOCITY BY SHIFT SCHEDULE
            </h3>
            {incidentsByShift.length > 0 && (() => {
              const peak = [...incidentsByShift].sort((a: any, b: any) => b.count - a.count)[0];
              return peak && peak.count > 0 ? (
                <span className="text-[10px] font-mono text-amber-400 font-bold">
                  PEAK: {peak.shift.toUpperCase()} ({peak.count} INCIDENTS)
                </span>
              ) : (
                <span className="text-[10px] font-mono text-emerald-400 font-bold">ALL SHIFTS CLEAR</span>
              );
            })()}
          </div>
          <div className="space-y-4 pt-2">
            {incidentsByShift.length === 0 ? (
              <p className="text-xs text-gray-500 font-mono py-6 text-center">
                No incidents recorded in this period.
              </p>
            ) : (() => {
              const maxShiftCount = Math.max(1, ...incidentsByShift.map((s: any) => s.count || 0));
              return incidentsByShift.map((shift: any) => (
                <div key={shift.shift} className="bg-[#181818] p-3 rounded-lg border border-[#282828]">
                  <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                    <span className="font-bold text-white">{shift.shift}</span>
                    <span className="text-safe font-bold">
                      {shift.compliance !== null ? `${shift.compliance}% Compliance` : `${shift.count} Recorded`}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-2">
                    <span>Hours: {shift.hours} (IST)</span>
                    <span className="text-warning font-bold">{shift.count} Violations Logged</span>
                  </div>
                  <div className="w-full bg-[#262626] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-warning h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round(((shift.count || 0) / maxShiftCount) * 100))}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Row 3: Repeat Violations Leaderboard */}
      <div className="hud-panel p-4 rounded-xl border border-[#2B2B2B]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-warning" />
            <h3 className="text-xs font-mono font-bold text-gray-200">
              REPEAT VIOLATIONS RE-EDUCATION TRACKER
            </h3>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            Mandatory EHS Retraining Triggered at 2+ Infractions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#181818] text-gray-400 text-[10px] uppercase border-b border-[#262626]">
              <tr>
                <th className="p-3">Worker ID</th>
                <th className="p-3">Full Name</th>
                <th className="p-3">Department</th>
                <th className="p-3">Clearance Tier</th>
                <th className="p-3">Violation Count (14D)</th>
                <th className="p-3">Statutory Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {repeatViolations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-xs font-mono text-gray-500">
                    No repeat violations recorded.
                  </td>
                </tr>
              ) : (
                repeatViolations.map((w: any) => (
                  <tr key={w.workerId} className="hover:bg-[#202020]">
                    <td className="p-3 font-bold text-safe">{w.workerId}</td>
                    <td className="p-3 text-white font-sans font-medium">{w.name}</td>
                    <td className="p-3 text-gray-400">{w.department}</td>
                    <td className="p-3 text-gray-300">{w.tier}</td>
                    <td className="p-3 font-bold text-critical">{w.count} Infractions</td>
                    <td className="p-3">
                      {w.count >= 2 ? (
                        <span className="px-2 py-0.5 bg-critical/20 text-critical border border-critical/40 rounded font-bold text-[10px]">
                          MANDATORY EHS RETRAINING
                        </span>
                      ) : w.count === 1 ? (
                        <span className="px-2 py-0.5 bg-warning/20 text-warning border border-warning/40 rounded font-bold text-[10px]">
                          FORMAL COUNSELING LOGGED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-safe/20 text-safe border border-safe/40 rounded font-bold text-[10px]">
                          EXEMPLARY RECORD
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
