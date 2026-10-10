import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Flame,
  UserX,
  Activity,
  Volume2
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface SafetyRule {
  id: string;
  name: string;
  ruleCode: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  minConfidence: number;
  cooldownSeconds: number;
  enabled: boolean;
  zones: string[];
  notificationChannels: string[];
  updatedAt: string;
}

export const SafetyRulesPage: React.FC = () => {
  const { user } = useAuth();
  const [rules, setRules] = useState<SafetyRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedRule, setSelectedRule] = useState<SafetyRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SafetyRule>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'PLANT_MANAGER';

  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSafetyRules();
      const safeRules: SafetyRule[] = (res.rules || []).map((r: any) => ({
        ...r,
        notificationChannels: Array.isArray(r.notificationChannels) ? r.notificationChannels : [],
        zones: Array.isArray(r.zones) ? r.zones : [],
      }));
      setRules(safeRules);
    } catch (err: any) {
      console.error('Failed to fetch safety rules', err);
      setMessage({ type: 'error', text: err.message || 'Failed to load safety rules' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggle = async (rule: SafetyRule) => {
    if (!isPrivileged) return;
    try {
      await api.updateSafetyRule(rule.id, { enabled: !rule.enabled });
      setMessage({
        type: 'success',
        text: `Safety policy '${rule.name}' is now ${!rule.enabled ? 'ENABLED' : 'DISABLED'}.`,
      });
      fetchRules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to toggle rule' });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.updateSafetyRule(selectedRule.id, editForm);
      setMessage({ type: 'success', text: `Policy parameters for ${selectedRule.name} updated.` });
      setIsEditOpen(false);
      fetchRules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update rule' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                STATUTORY COMPLIANCE
              </span>
              <span className="text-xs font-mono text-slate-400">SAFETY RULE THRESHOLDS</span>
              {!isPrivileged && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                  READ-ONLY (OFFICER AUDIT)
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Safety Detection Rules & Policy Engine</h1>
          </div>
        </div>

        <button
          onClick={fetchRules}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          REFRESH RULES
        </button>
      </div>

      {/* Message Notification */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-[#12151b] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-[#0e1017]/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Rule Code & Policy</th>
                <th className="py-3 px-4">Severity Tier</th>
                <th className="py-3 px-4">Min Confidence</th>
                <th className="py-3 px-4">Cooldown Window</th>
                <th className="py-3 px-4">Channels</th>
                <th className="py-3 px-4">Active State</th>
                <th className="py-3 px-4 text-right">Settings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-mono">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {isLoading ? 'Querying safety policy store...' : 'No statutory rules configured.'}
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400">{rule.ruleCode}</span>
                        <h4 className="font-bold text-white text-sm">{rule.name}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 max-w-md">{rule.description}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          rule.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : rule.severity === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        }`}
                      >
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-200 font-bold">{Math.round(rule.minConfidence * 100)}%</span>
                      <span className="text-slate-500 text-[10px] block">Threshold</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-200">{rule.cooldownSeconds}s</span>
                      <span className="text-slate-500 text-[10px] block">Suppression</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(rule.notificationChannels || []).length > 0 ? (
                          (rule.notificationChannels || []).map((c, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-300 border border-white/10"
                            >
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-[10px]">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {isPrivileged ? (
                        <button
                          onClick={() => handleToggle(rule)}
                          className="flex items-center gap-1.5 text-xs font-bold"
                        >
                          {rule.enabled ? (
                            <>
                              <ToggleRight className="w-6 h-6 text-emerald-400" />
                              <span className="text-emerald-400">ENABLED</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-6 h-6 text-slate-500" />
                              <span className="text-slate-500">MUTED</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className={rule.enabled ? 'text-emerald-400 font-bold' : 'text-slate-500 font-bold'}>
                          {rule.enabled ? 'ENABLED' : 'MUTED'}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isPrivileged && (
                        <button
                          onClick={() => {
                            setSelectedRule(rule);
                            setEditForm({
                              minConfidence: rule.minConfidence,
                              cooldownSeconds: rule.cooldownSeconds,
                              severity: rule.severity,
                              enabled: rule.enabled,
                            });
                            setIsEditOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                          title="Tune Thresholds"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Rule Modal */}
      {isEditOpen && selectedRule && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <span className="text-xs font-mono text-amber-400">{selectedRule.ruleCode}</span>
                <h3 className="font-bold text-white text-base">{selectedRule.name}</h3>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-slate-400">Minimum AI Confidence Threshold</label>
                  <span className="text-amber-400 font-bold">{Math.round((editForm.minConfidence || selectedRule.minConfidence) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={editForm.minConfidence || selectedRule.minConfidence}
                  onChange={(e) => setEditForm({ ...editForm, minConfidence: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Suppression Cooldown (Seconds)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={editForm.cooldownSeconds || selectedRule.cooldownSeconds}
                  onChange={(e) => setEditForm({ ...editForm, cooldownSeconds: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Severity Tier</label>
                <select
                  value={editForm.severity || selectedRule.severity}
                  onChange={(e) => setEditForm({ ...editForm, severity: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'UPDATING...' : 'APPLY PARAMETERS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
