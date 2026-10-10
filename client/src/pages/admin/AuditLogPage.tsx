import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowLeft,
  Filter,
  Lock,
  Calendar,
  User,
  Info
} from 'lucide-react';
import { api } from '../../services/api';

export const AuditLogPage: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditLogs({ limit: 200 });
      setLogs(res.auditLogs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const ACTIONS = [
    'ALL',
    'USER_LOGIN',
    'SECURITY_ACCESS_DENIED',
    'INCIDENT_VIEWED',
    'INCIDENT_ACKNOWLEDGED',
    'INCIDENT_DISPATCHED',
    'INCIDENT_RESOLVED',
    'FALSE_POSITIVE_MARKED',
    'HAZARD_REPORTED',
    'USER_CREATED',
    'USER_ROLE_CHANGED',
  ];

  const filteredLogs = logs.filter((log) => {
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    const matchesSearch =
      log.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
      log.action?.toLowerCase().includes(search.toLowerCase()) ||
      log.resourceId?.toLowerCase().includes(search.toLowerCase()) ||
      log.zoneId?.toLowerCase().includes(search.toLowerCase());
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                ENTERPRISE GOVERNANCE
              </span>
              <span className="text-xs font-mono text-slate-400">IMMUTABLE EVENT LOG</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Security & Operational Audit Trail</h1>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          REFRESH LOGS
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-4 rounded-2xl">
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search email, action, incident ID, zone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white text-xs focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="flex items-center gap-1.5">
            {ACTIONS.slice(0, 6).map((act) => (
              <button
                key={act}
                onClick={() => setFilterAction(act)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono whitespace-nowrap transition-all ${
                  filterAction === act
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {act}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#12151b] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0e1017] text-slate-400 uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                <th className="py-3.5 px-4 font-semibold">Action</th>
                <th className="py-3.5 px-4 font-semibold">Actor / Role</th>
                <th className="py-3.5 px-4 font-semibold">Resource / Target</th>
                <th className="py-3.5 px-4 font-semibold">Result</th>
                <th className="py-3.5 px-4 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isDenied = log.result === 'DENIED';
                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white">{log.action}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200">{log.userEmail}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{log.userRole || 'USER'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                          {log.resourceType}: {log.resourceId}
                        </span>
                        {log.zoneId && <div className="text-[10px] text-slate-400 mt-0.5">Zone: {log.zoneId}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isDenied
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {isDenied ? <ShieldAlert className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                          {log.result}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors text-[11px]"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white font-sans">Audit Event Metadata</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white text-lg">
                ×
              </button>
            </div>

            <div className="space-y-2 bg-[#0e1017] p-4 rounded-xl border border-white/5 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Record ID:</span>
                <span className="text-white">{selectedLog.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Action:</span>
                <span className="text-amber-400 font-bold">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actor Email:</span>
                <span className="text-white">{selectedLog.userEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role:</span>
                <span className="text-white">{selectedLog.userRole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resource:</span>
                <span className="text-white">
                  {selectedLog.resourceType} ({selectedLog.resourceId})
                </span>
              </div>
              {selectedLog.zoneId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Zone:</span>
                  <span className="text-emerald-400">{selectedLog.zoneId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Result:</span>
                <span className={selectedLog.result === 'DENIED' ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {selectedLog.result}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timestamp:</span>
                <span className="text-white">{selectedLog.timestamp}</span>
              </div>
            </div>

            {selectedLog.metadata && (
              <div>
                <span className="text-slate-500 block mb-1">Payload / Context:</span>
                <pre className="bg-[#0e1017] p-3 rounded-xl border border-white/5 text-slate-300 overflow-x-auto text-[11px]">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
