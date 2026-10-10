import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  HardHat,
  Award,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  Clock,
  Send,
  User,
  Info,
  Calendar,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Incident } from '../../types';
import { ReportHazardModal } from '../../components/hazard/ReportHazardModal';

export const EmployeeDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hazards, setHazards] = useState<any[]>([]);
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [zoneRequirements, setZoneRequirements] = useState<string[]>([]);
  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [incRes, hazRes, empRes, zonesRes] = await Promise.all([
        api.getIncidents({ limit: 10 }).catch(() => ({ incidents: [] })),
        api.getHazards().catch(() => ({ hazards: [] })),
        api.getEmployees().catch(() => ({ employees: [] })),
        api.getZones().catch(() => ({ zones: [] })),
      ]);
      setIncidents(incRes.incidents || []);
      setHazards(hazRes.hazards || []);

      const myEmp = (empRes.employees || []).find(
        (e: any) =>
          (user?.workerId && e.employeeId?.toLowerCase() === user.workerId.toLowerCase()) ||
          (user?.email && e.email?.toLowerCase() === user.email.toLowerCase())
      );
      setEmployeeProfile(myEmp || null);

      if (myEmp?.requiredPPE && myEmp.requiredPPE.length > 0) {
        setZoneRequirements(myEmp.requiredPPE);
      } else {
        const assignedZone = (zonesRes.zones || []).find((z: any) =>
          user?.zoneIds?.some((zid) => zid.toLowerCase() === z.code.toLowerCase() || zid.toLowerCase() === z.name.toLowerCase())
        );
        setZoneRequirements(assignedZone?.requiredPPE || []);
      }
    } catch (err) {
      console.error('Failed to load employee records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn pb-12 max-w-5xl mx-auto">
      {/* Employee Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <User className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                WORKER SAFETY PORTAL
              </span>
              <span className="text-xs font-mono text-slate-400">
                ID: <strong className="text-white">{user?.workerId || user?.id}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Welcome, {user?.name}</h1>
            <p className="text-xs text-slate-400">
              Department: <span className="text-white">{user?.department || 'Operations'}</span> • Assigned Zone: <span className="text-emerald-400">{user?.zoneIds?.join(', ') || 'General'}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsHazardModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition-all font-mono"
        >
          <AlertTriangle className="w-4 h-4" />
          REPORT UNSAFE CONDITION
        </button>
      </div>

      {/* Daily Safety Toolbox Talk Notice */}
      <div className="bg-gradient-to-r from-blue-950/40 via-[#12151b] to-indigo-950/40 border border-blue-500/30 rounded-2xl p-5 relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-blue-400 uppercase tracking-wider">
                {user?.shift ? `TODAY'S TOOLBOX TALK • ${user.shift.toUpperCase()}` : "TODAY'S TOOLBOX TALK"}
              </span>
              <span className="text-[10px] font-mono text-slate-400">ACTIVE SHIFT</span>
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">
              Hydraulic Pressure Safety & Pinch-Point Awareness
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Always ensure zero residual pressure before undertaking any valve adjustment. Wear required PPE for your designated sector at all times.
            </p>
          </div>
        </div>
      </div>

      {/* Mandatory PPE Checklist for Today's Shift */}
      <div className="bg-[#12151b] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <HardHat className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white font-sans">
              Mandatory PPE Checklist for Your Sector
            </h2>
          </div>
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> SITE PROTOCOL
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
          {zoneRequirements.length === 0 ? (
            <div className="col-span-2 text-center py-6 text-slate-500">
              No specific PPE mandates recorded for this sector.
            </div>
          ) : (
            zoneRequirements.map((req) => (
              <div
                key={req}
                className="p-3.5 rounded-xl bg-[#0e1017] border border-white/5 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-white">{req}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">MANDATED FOR ZONE ENTRY</div>
                </div>
                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  REQUIRED
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Safety Certifications & Personal Audit Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Safety Training & Qualifications */}
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white font-sans">Safety Certifications</h3>
            </div>
            <span className="text-[10px] text-slate-500">ROSTER RECORD</span>
          </div>

          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-[#0e1017] border border-white/5 space-y-1">
              <div className="flex justify-between items-start">
                <span className="font-bold text-white text-xs">Site Safety Clearance</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold border border-emerald-500/20">
                  {employeeProfile?.status || 'ACTIVE'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">Department: {employeeProfile?.department || user?.department || 'Operations'}</div>
              <div className="text-[10px] text-slate-500">Profile Verified by Plant Safety Administration</div>
            </div>
          </div>
        </div>

        {/* My Reported Hazards / My Safety Record */}
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white font-sans">My Hazard Reports</h3>
            </div>
            <button
              onClick={() => setIsHazardModalOpen(true)}
              className="text-[11px] text-amber-400 hover:text-amber-300"
            >
              + Report New
            </button>
          </div>

          <div className="space-y-2.5">
            {hazards.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-[11px]">
                You have not submitted any hazard reports yet. If you spot an oil spill or loose cable, notify the team!
              </div>
            ) : (
              (hazards || []).map((h) => (
                <div key={h.id} className="p-3 rounded-xl bg-[#0e1017] border border-white/5 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">{h.hazardType}</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[9px] uppercase font-bold border border-amber-500/20">
                      {h.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 line-clamp-2">{h.description}</p>
                  <div className="text-[10px] text-slate-500">{h.zoneName} • {new Date(h.createdAt).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Report Hazard Modal */}
      <ReportHazardModal
        isOpen={isHazardModalOpen}
        onClose={() => setIsHazardModalOpen(false)}
        defaultZone={employeeProfile?.zoneId || user?.zoneIds?.[0] || ''}
        onHazardReported={() => loadData()}
      />
    </div>
  );
};
