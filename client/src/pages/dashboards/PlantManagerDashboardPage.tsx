import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  FileText,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Calendar,
  Building2,
  Users,
  Clock,
  ArrowRight,
  Download,
  Activity,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';
import { KPIRibbon } from '../../components/dashboard/KPIRibbon';
import { IncidentTriagePanel } from '../../components/incidents/IncidentTriagePanel';
import { SafetyTimeline } from '../../components/analytics/SafetyTimeline';
import { ExplainabilityDrawer } from '../../components/incident/ExplainabilityDrawer';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Incident } from '../../types';

export const PlantManagerDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { liveIncidents } = useSocket();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [site, setSite] = useState<any>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [incRes, analyticsRes, siteRes, camRes, zoneRes, shiftRes] = await Promise.all([
        api.getIncidents({ limit: 15 }).catch(() => ({ incidents: [], total: 0 })),
        api.getAnalytics().catch(() => null),
        api.getCurrentSite().catch(() => null),
        api.getCameras().catch(() => ({ cameras: [] })),
        api.getZones().catch(() => ({ zones: [] })),
        api.getShifts().catch(() => ({ shifts: [] })),
      ]);
      setIncidents(incRes.incidents || []);
      setAnalytics(analyticsRes);
      setSite(siteRes?.site || null);
      setCameras(camRes?.cameras || []);
      setZones(zoneRes?.zones || []);
      setShifts(shiftRes?.shifts || []);
    } catch (err) {
      console.error('Error loading plant manager metrics:', err);
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

  const criticalCount = allIncidents.filter(
    (i) => i.severity === 'critical' && i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
  ).length;

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Executive Plant Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                PLANT EXECUTIVE MANAGEMENT
              </span>
              <span className="text-xs font-mono text-slate-400">
                {site ? `${site.name} (${site.code || 'SITE-01'})` : 'SITE NOT CONFIGURED'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Operational Safety & Regulatory Overview</h1>
            <p className="text-xs text-slate-400">
              Executive Officer: <span className="text-white font-semibold">{user?.name}</span>
              {shifts.length > 0 ? ` • ${shifts.find((s) => s.active)?.name || shifts[0].name} Active` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH METRICS
          </button>
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT DGFASLI AUDIT PDF
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <KPIRibbon
        camerasOnline={cameras.filter((c) => c.status === 'LIVE').length}
        totalCameras={cameras.length}
        workersCount={analytics?.workersCount ?? 0}
        complianceRate={analytics?.kpis?.overallCompliance ?? null}
        criticalCount={criticalCount}
        warningCount={allIncidents.filter((i) => (i.severity === 'high' || i.severity === 'medium') && i.status !== 'RESOLVED').length}
        safetyIndex={analytics?.kpis?.safetyIndex ?? null}
      />

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Zero Accident Milestone */}
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2 uppercase">
            <span>Safety Milestone</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white font-mono">
              {(() => {
                const crit = allIncidents.filter((i) => i.severity === 'critical');
                if (crit.length > 0) {
                  const latest = Math.max(...crit.map((i) => new Date(i.timestamp).getTime()));
                  return Math.floor((Date.now() - latest) / (1000 * 60 * 60 * 24));
                }
                if (allIncidents.length > 0) {
                  const oldest = Math.min(...allIncidents.map((i) => new Date(i.timestamp).getTime()));
                  return Math.max(1, Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24)));
                }
                return '—';
              })()}
            </span>
            <span className="text-sm font-semibold text-emerald-400">Days Zero-Lost-Time</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Target: Continuous zero-lost-time record under verified safety protocol.
          </p>
        </div>

        {/* Regulatory Compliance Index */}
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2 uppercase">
            <span>Audit Framework Compliance</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-indigo-400 font-mono">
              {analytics?.kpis?.overallCompliance ? `${analytics.kpis.overallCompliance}%` : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Compliance reporting mapped to selected standards (Factories Act & OSHA framework).
          </p>
        </div>

        {/* Industrial Zone Analytics */}
        <div
          onClick={() => navigate('/analytics')}
          className="group bg-[#12151b] border border-white/5 hover:border-purple-500/40 rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
            <span>Zone Analytics Matrix</span>
            <Building2 className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="my-2">
            <div className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
              {zones.length > 0 ? `${zones.length} Industrial Zones Configured` : 'NO DATA'}
            </div>
            <p className="text-xs text-slate-400">
              Data-driven safety metrics, PPE compliance tables & hazard trends.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-purple-400">
            <span>View Safety Analytics</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* Main Grid: Incident Triage & Safety Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Live Incident Triage & Steward Dispatch
              </h3>
              <button
                onClick={() => navigate('/incidents')}
                className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                Full Log <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <IncidentTriagePanel
              incidents={allIncidents}
              onIncidentUpdated={loadData}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          </div>

          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
            <SafetyTimeline
              incidents={allIncidents}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          </div>
        </div>

        {/* Right Column: Zone Risk Matrix & Quick Links */}
        <div className="space-y-4">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Zone Safety Performance
            </h3>

            <div className="space-y-3">
              {(zones || []).length === 0 ? (
                <p className="text-slate-500 text-xs font-mono">No industrial zones configured.</p>
              ) : (
                (zones || []).slice(0, 6).map((zone) => {
                  const zoneIncidents = allIncidents.filter(
                    (i) => i.zoneId === zone.id || i.zone?.toLowerCase() === zone.name?.toLowerCase()
                  );
                  const critZone = zoneIncidents.filter((i) => i.severity === 'critical' && i.status !== 'RESOLVED').length;
                  const activeCount = zoneIncidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE').length;
                  const status = critZone > 0 ? 'CRITICAL RISK' : activeCount > 0 ? 'ELEVATED RISK' : 'CLEAR';
                  const color = critZone > 0 ? 'text-red-400' : activeCount > 0 ? 'text-amber-400' : 'text-emerald-400';

                  return (
                    <div key={zone.id || zone.name} className="p-3 rounded-xl bg-[#0e1017] border border-white/5">
                      <div className="flex justify-between items-center text-xs mb-1.5 font-mono">
                        <span className="text-white font-medium">{zone.name}</span>
                        <span className={`font-bold ${color}`}>
                          {activeCount > 0 ? `${activeCount} ACTIVE (${status})` : '0 INCIDENTS (CLEAR)'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-500">
                        <span>Code: {zone.code || 'ZONE'}</span>
                        <span>Total Logged: {zoneIncidents.length}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Statutory Audit Reporting
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate certified compliance documentation mapped to configured safety framework (Factories Act / OSHA reference).
            </p>
            <button
              onClick={() => navigate('/audit-reports')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-mono text-xs border border-white/10 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Configure & Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Explainability Drawer */}
      {selectedIncident && (
        <ExplainabilityDrawer
          incident={selectedIncident}
          isOpen={!!selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </div>
  );
};
