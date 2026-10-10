import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  Calendar,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Shift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  days: string[];
  active: boolean;
  supervisorId?: string;
  siteId: string;
}

export const ShiftsManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    startTime: '06:00',
    endTime: '14:00',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    siteId: 'site-rsp-1',
  });

  const [editForm, setEditForm] = useState<Partial<Shift>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'PLANT_MANAGER';

  const fetchShifts = async () => {
    setIsLoading(true);
    try {
      const res = await api.getShifts();
      setShifts(res.shifts || []);
    } catch (err: any) {
      console.error('Failed to fetch shifts', err);
      setMessage({ type: 'error', text: err.message || 'Failed to load shifts' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleToggle = async (shift: Shift) => {
    if (!isPrivileged) return;
    try {
      await api.toggleShift(shift.id);
      setMessage({
        type: 'success',
        text: `Shift ${shift.name} ${shift.active ? 'deactivated' : 'activated'} successfully.`,
      });
      fetchShifts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to toggle shift' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.createShift(createForm);
      setMessage({ type: 'success', text: `Shift '${createForm.name}' (${createForm.code}) registered.` });
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        code: '',
        startTime: '06:00',
        endTime: '14:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        siteId: 'site-rsp-1',
      });
      fetchShifts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create shift' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.updateShift(selectedShift.id, editForm);
      setMessage({ type: 'success', text: `Updated shift ${selectedShift.name}.` });
      setIsEditOpen(false);
      fetchShifts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update shift' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12151b] border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                OPERATIONAL ROTATION
              </span>
              <span className="text-xs font-mono text-slate-400">24/7 PLANT CONTINUITY</span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">Shift Schedules & Workforce Duty Rotas</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchShifts}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          {isPrivileged && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-colors shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              CONFIGURE NEW SHIFT
            </button>
          )}
        </div>
      </div>

      {/* Status Notification */}
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

      {/* Shifts Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {shifts.map((shift) => (
          <div
            key={shift.id}
            className={`p-5 rounded-2xl border transition-all ${
              shift.active
                ? 'bg-[#12151b] border-white/10 hover:border-amber-500/30'
                : 'bg-[#12151b]/40 border-white/5 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {shift.code}
              </span>
              {isPrivileged && (
                <button
                  onClick={() => handleToggle(shift)}
                  className="text-slate-400 hover:text-white transition-colors"
                  title={shift.active ? 'Deactivate Shift' : 'Activate Shift'}
                >
                  {shift.active ? (
                    <ToggleRight className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-500" />
                  )}
                </button>
              )}
            </div>

            <h3 className="text-base font-bold text-white">{shift.name}</h3>
            <p className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {shift.startTime} — {shift.endTime}
            </p>

            <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span>ACTIVE DAYS:</span>
                <span className="text-slate-200">{(shift.days || []).length} Days</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(shift.days || []).map((d, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-slate-300">
                    {d.substring(0, 3)}
                  </span>
                ))}
              </div>
            </div>

            {isPrivileged && (
              <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedShift(shift);
                    setEditForm({
                      name: shift.name,
                      startTime: shift.startTime,
                      endTime: shift.endTime,
                      days: shift.days || [],
                    });
                    setIsEditOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono"
                >
                  <Edit2 className="w-3 h-3" />
                  EDIT
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-bold text-white">Create Shift Schedule</h2>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Shift Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shift D (Night Relief)"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Shift Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SHIFT-D"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'CONFIGURING...' : 'CONFIRM SHIFT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditOpen && selectedShift && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#12151b] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-bold text-white">Modify Shift: {selectedShift.name}</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Shift Name</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editForm.startTime || selectedShift.startTime}
                    onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">End Time</label>
                  <input
                    type="time"
                    value={editForm.endTime || selectedShift.endTime}
                    onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e1017] border border-white/10 text-white focus:outline-none"
                  />
                </div>
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
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
