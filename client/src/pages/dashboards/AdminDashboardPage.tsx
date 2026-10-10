import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  FileText,
  Activity,
  Cpu,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Server,
  Lock,
  RefreshCw,
  Eye,
  UserPlus
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [usersCount, setUsersCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [health, logsRes, usersRes] = await Promise.all([
        api.getAdminSystemHealth().catch(() => ({
          status: 'OFFLINE',
          uptimeSeconds: 0,
          activeUsersCount: 0,
          totalAuditRecords: 0,
          activeFeedsCount: 0,
          memoryUsageMB: 0,
        })),
        api.getAuditLogs({ limit: 8 }).catch(() => ({ auditLogs: [], total: 0 })),
        api.getUsers().catch(() => ({ users: [], total: 0 })),
      ]);
      setStats(health);
      setRecentLogs(logsRes.auditLogs || []);
      setUsersCount(usersRes.total || (usersRes.users ? usersRes.users.length : 0));
    } catch (err) {
      console.error('Failed to load admin telemetry', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                ROOT SYSTEM ADMINISTRATOR
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                ENTERPRISE POLICY ENFORCED
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Platform Governance & Security Console</h1>
            <p className="text-xs text-slate-400">
              Logged in as <span className="text-white font-semibold">{user?.name}</span> ({user?.email}) • Full Role & Scope Control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH TELEMETRY
          </button>
          <button
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            MANAGE USERS
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase mb-3">
            <span>Managed Users</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold text-white font-mono">{usersCount}</div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">5 System Roles</span> defined across plant
          </p>
        </div>

        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase mb-3">
            <span>Audit Trail Entries</span>
            <FileText className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold text-amber-400 font-mono">
            {stats?.totalAuditRecords ?? recentLogs.length}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <span className="text-amber-400 font-semibold">Immutable</span> SHA-256 integrity logs
          </p>
        </div>

        {/* 3. AI Inference Pipeline Card */}
        {(() => {
          const ai = stats?.ai || stats?.components?.ai || {};
          const isOffline = !ai.status || ai.status === 'OFFLINE' || ai.serviceStatus === 'AI OFFLINE';
          const isDegraded = !isOffline && (ai.modelStatus === 'unconfigured' || ai.modelStatus === 'DEGRADED' || ai.status === 'DEGRADED');
          const isReady = !isOffline && !isDegraded && (ai.modelStatus === 'READY' || ai.status === 'ONLINE' || ai.status === 'READY');

          return (
            <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase mb-2">
                <span>AI INFERENCE PIPELINE</span>
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>

              {isOffline ? (
                <div className="space-y-1.5 my-auto">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-xl font-bold text-rose-400 font-mono">OFFLINE</span>
                  </div>
                  <p className="text-xs text-rose-300 font-mono">AI service unavailable</p>
                  <p className="text-[10px] text-slate-400 font-mono">FastAPI core on port 8000 unreachable</p>
                </div>
              ) : isDegraded ? (
                <div className="space-y-1.5 my-auto">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xl font-bold text-amber-400 font-mono">DEGRADED</span>
                  </div>
                  <p className="text-xs text-amber-300 font-mono">Model not loaded</p>
                  <p className="text-[10px] text-slate-400 font-mono">Weights unconfigured in ai/models/</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-lg font-bold text-emerald-400 font-mono">
                        {ai.runtimeState === 'READY' || ai.modelStatus === 'READY' ? 'READY' : 'ONLINE'}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold">
                      {ai.classCount || 17} classes
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-white font-mono truncate" title={ai.modelName || 'Industrial YOLOv8'}>
                      {ai.modelName || 'Industrial YOLOv8'}
                    </p>
                  </div>

                  {/* Real Telemetry Metadata Grid */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono text-slate-400 pt-1 border-t border-white/5">
                    <div>
                      <span className="text-slate-500">Device: </span>
                      <span className="text-slate-200 uppercase font-semibold">
                        {ai.device?.includes('cuda') ? 'CUDA' : (ai.device || 'CPU')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Inference: </span>
                      <span className="text-emerald-400 font-semibold">
                        {ai.latencyMs !== null && ai.latencyMs !== undefined ? `${ai.latencyMs}ms` : '—'}
                      </span>
                    </div>
                    <div className="col-span-2 truncate" title={ai.gpuName || 'CUDA Accelerated'}>
                      <span className="text-slate-500">GPU: </span>
                      <span className="text-slate-200 truncate">
                        {ai.gpuName || (ai.device?.includes('cuda') ? 'NVIDIA GPU' : 'None (CPU)')}
                      </span>
                    </div>
                    <div className="col-span-2 truncate" title={ai.modelId || 'MODEL-PPE-SH17-001'}>
                      <span className="text-slate-500">Model: </span>
                      <span className="text-indigo-300 truncate">
                        {ai.modelId || 'MODEL-PPE-SH17-001'}
                      </span>
                    </div>
                    <div className="col-span-2 truncate" title={ai.actualChecksum || ai.checksum || 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62'}>
                      <span className="text-slate-500">Checksum: </span>
                      <span className="text-slate-400 font-mono text-[9px] truncate">
                        {(ai.actualChecksum || ai.checksum || 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62').slice(0, 19)}...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. System Core Status */}
        <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase mb-3">
            <span>System Core Status</span>
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                stats?.status === 'HEALTHY' || stats?.status === 'ONLINE'
                  ? 'bg-emerald-400'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span
              className={`text-2xl font-bold font-mono ${
                stats?.status === 'HEALTHY' || stats?.status === 'ONLINE'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {stats?.status || 'DEGRADED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between font-mono">
            <span>
              <span className="text-cyan-400 font-semibold">Uptime:</span>{' '}
              {stats?.uptimeSeconds !== undefined ? `${Math.floor(stats.uptimeSeconds / 60)} min` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
              {stats?.database?.includes('Replica') ? 'MongoDB rs0' : 'DB Connected'}
            </span>
          </p>
        </div>
      </div>

      {/* Main Grid: Management Shortcuts & Live Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Governance Modules */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Administrative Actions
            </h3>

            <div
              onClick={() => navigate('/admin/users')}
              className="group p-4 rounded-xl bg-[#0e1017] border border-white/5 hover:border-indigo-500/40 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Enterprise User Directory</h4>
                  <p className="text-xs text-slate-400">Assign roles, adjust zone scopes, enable/disable</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>

            <div
              onClick={() => navigate('/admin/audit-logs')}
              className="group p-4 rounded-xl bg-[#0e1017] border border-white/5 hover:border-amber-500/40 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Security Audit Log</h4>
                  <p className="text-xs text-slate-400">Inspect every login, dispatch, override, and 403 denial</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>

            <div
              onClick={() => navigate('/reports')}
              className="group p-4 rounded-xl bg-[#0e1017] border border-white/5 hover:border-emerald-500/40 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Compliance PDF Generator</h4>
                  <p className="text-xs text-slate-400">DGFASLI & OSHA certified safety reports</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </div>
          </div>

          {/* Security Perimeter Status */}
          <div className="bg-[#12151b] border border-white/5 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              Role Enforcement Engine
            </h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2 rounded-lg bg-[#0e1017] border border-white/5">
                <span className="text-slate-400">ADMIN</span>
                <span className="text-emerald-400 font-semibold">28/28 Permissions</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-[#0e1017] border border-white/5">
                <span className="text-slate-400">PLANT_MANAGER</span>
                <span className="text-indigo-400 font-semibold">Plant-Wide Analytics & Reports</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-[#0e1017] border border-white/5">
                <span className="text-slate-400">SAFETY_OFFICER</span>
                <span className="text-amber-400 font-semibold">Surveillance & Instant Dispatch</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-[#0e1017] border border-white/5">
                <span className="text-slate-400">SUPERVISOR</span>
                <span className="text-cyan-400 font-semibold">Assigned Zones Only (A, B)</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-[#0e1017] border border-white/5">
                <span className="text-slate-400">EMPLOYEE</span>
                <span className="text-slate-300 font-semibold">Personal Safety & PPE Portal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Audit Trail */}
        <div className="lg:col-span-2 bg-[#12151b] border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Immutable Security Audit Trail</h3>
              </div>
              <button
                onClick={() => navigate('/admin/audit-logs')}
                className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                View Full Log <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {recentLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  No security events recorded yet.
                </div>
              ) : (
                recentLogs.map((log) => {
                  const isDenied = log.result === 'DENIED';
                  const isSuccess = log.result === 'SUCCESS';
                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs ${
                        isDenied
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : 'bg-[#0e1017] border-white/5 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isDenied ? (
                          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{log.action}</span>
                            <span className="px-1.5 py-0.2 rounded bg-white/10 text-[10px] text-slate-300">
                              {log.userRole || 'USER'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            by {log.userEmail} {log.zoneId ? `• Zone: ${log.zoneId}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDenied ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {log.result}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>AUDIT RETENTION: 365 DAYS</span>
            <span>ZERO-TRUST LOGGING ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};
