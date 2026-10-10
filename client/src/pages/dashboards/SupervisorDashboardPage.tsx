import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  HardHat,
  BellRing,
  CheckCircle,
  MapPin,
  RefreshCw,
  PlusCircle,
  Eye,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Incident } from '../../types';
import { ReportHazardModal } from '../../components/hazard/ReportHazardModal';

export const SupervisorDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { liveIncidents } = useSocket();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hazards, setHazards] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [incRes, hazardRes, empRes] = await Promise.all([
        api.getIncidents({ limit: 30 }).catch(() => ({ incidents: [], total: 0 })),
        api.getHazards().catch(() => ({ hazards: [] })),
        api.getEmployees().catch(() => ({ employees: [] })),
      ]);
      setIncidents(incRes?.incidents || []);
      setHazards(hazardRes?.hazards || []);
      setEmployees(empRes?.employees || []);
    } catch (err) {
      console.error('Failed to load supervisor data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter incidents strictly to supervisor's scope
  const isSupervisorZone = (zoneNameOrId?: string | null) => {
    if (!zoneNameOrId) return false;
    if (!user || !user.zoneIds || user.zoneIds.includes('*')) return true;
    return user.zoneIds.some(
      (z) => z && z.toLowerCase() === zoneNameOrId.toLowerCase()
    );
  };

  const allIncidents = [
    ...(liveIncidents || []).filter((li) => !(incidents || []).some((i) => i.id === li.id)),
    ...(incidents || []),
  ];
  const scopedIncidents = allIncidents.filter((i) => isSupervisorZone(i.zone));
  const activeWarnings = scopedIncidents.filter((i) => i.status === 'DETECTED');

  const handleAcknowledge = async (incidentId: string) => {
    try {
      await api.updateIncidentStatus(incidentId, 'ACKNOWLEDGED', 'Shift supervisor warned crew member in person.');
      setActionSuccess(`Incident ${incidentId} acknowledged. Verbal warning logged.`);
      setTimeout(() => setActionSuccess(null), 3500);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge incident');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <HardHat className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                AREA SUPERVISION CONSOLE
              </span>
              <span className="text-xs font-mono text-slate-400">
                {user?.shift ? `SHIFT: ${user.shift}` : 'UNASSIGNED SHIFT'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Zone Operations & Floor Crew Safety</h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Assigned Sectors:</span>
              <span className="text-emerald-400 font-mono font-bold">
                {user?.zoneIds.includes('*') ? 'All Plant Zones (*)' : user?.zoneIds.join(', ')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          <button
            onClick={() => setIsHazardModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            REPORT FLOOR HAZARD
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Supervisor Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase mb-2">
            <span>Crew on Shift</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {employees.length} {employees.length === 1 ? 'Worker' : 'Workers'}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {employees.length > 0 ? 'Assigned to your supervised sectors' : 'No workers assigned in scope'}
          </p>
        </div>

        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase mb-2">
            <span>Active PPE Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-3xl font-bold ${activeWarnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {activeWarnings.length} Pending
          </div>
          <p className="text-xs text-slate-400 mt-2">Requires direct verbal corrective action</p>
        </div>

        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase mb-2">
            <span>Shift Compliance</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {scopedIncidents.length > 0
              ? `${Math.max(0, 100 - activeWarnings.length * 8)}%`
              : '—'}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {scopedIncidents.length > 0 ? `${scopedIncidents.length} events audited today` : 'No incidents recorded in scope'}
          </p>
        </div>
      </div>

      {/* Main Grid: Active Warnings in Supervised Zones & Floor Hazards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Warnings requiring supervisor action */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-white font-sans">
                  Active Crew Warnings in Supervised Zones
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {scopedIncidents.length} Records in Scope
              </span>
            </div>

            <div className="space-y-3">
              {scopedIncidents.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-mono">
                  No active safety breaches in your assigned zones. Great job maintaining compliance!
                </div>
              ) : (
                (scopedIncidents || []).map((incident) => {
                  const isUnresolved = incident.status === 'DETECTED';
                  return (
                    <div
                      key={incident.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isUnresolved
                          ? 'bg-amber-500/5 border-amber-500/30'
                          : 'bg-[#0e1017] border-white/5'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              incident.severity === 'critical'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {incident.severity}
                          </span>
                          <span className="text-white font-bold text-sm">
                            {incident.violationType.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-300 font-mono mb-3">
                        Worker: <span className="text-white font-semibold">{incident.workerName}</span> ({incident.workerId}) • Location: <span className="text-emerald-400">{incident.zone}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="text-xs font-mono">
                          Status:{' '}
                          <span
                            className={`font-semibold ${
                              incident.status === 'ACKNOWLEDGED'
                                ? 'text-blue-400'
                                : incident.status === 'RESOLVED'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {incident.status}
                          </span>
                        </div>

                        {incident.status === 'DETECTED' && (
                          <button
                            onClick={() => handleAcknowledge(incident.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold transition-all"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Acknowledge & Warn Worker
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Supervised Team Roster & Zone Hazards */}
        <div className="space-y-4">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-4 font-mono text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-sans">
              <Users className="w-4 h-4 text-blue-400" />
              Zone Floor Roster {user?.shift ? `(${user.shift})` : ''}
            </h3>

            <div className="space-y-2.5">
              {employees.length === 0 ? (
                <p className="text-slate-500 text-[11px]">No workers assigned in your supervised sectors.</p>
              ) : (
                employees.slice(0, 6).map((worker) => {
                  const hasWarning = activeWarnings.some(
                    (w) => w.workerId && w.workerId.toLowerCase() === (worker.employeeId || '').toLowerCase()
                  );
                  return (
                    <div key={worker.id} className="p-2.5 rounded-xl bg-[#0e1017] border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">{worker.fullName}</div>
                        <div className="text-[10px] text-slate-500">{worker.roleTitle} • {worker.employeeId}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          hasWarning
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {hasWarning ? 'WARNING' : 'COMPLIANT'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Reported Hazards in Area */}
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-sans">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Floor Hazard Watch
              </h3>
              <button
                onClick={() => setIsHazardModalOpen(true)}
                className="text-[11px] text-amber-400 hover:text-amber-300"
              >
                + New
              </button>
            </div>

            <div className="space-y-2">
              {hazards.length === 0 ? (
                <p className="text-slate-500 text-[11px]">No active hazards logged in your sectors.</p>
              ) : (
                (hazards || []).slice(0, 4).map((h) => (
                  <div key={h.id} className="p-2.5 rounded-xl bg-[#0e1017] border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-amber-400">{h.hazardType}</span>
                      <span className="text-[10px] text-slate-400">{h.zoneName}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] line-clamp-2">{h.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <ReportHazardModal
        isOpen={isHazardModalOpen}
        onClose={() => setIsHazardModalOpen(false)}
        defaultZone={user?.zoneIds?.[0] || ''}
        onHazardReported={() => loadData()}
      />
    </div>
  );
};
