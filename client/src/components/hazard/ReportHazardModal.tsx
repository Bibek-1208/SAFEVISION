import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Send, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';

interface ReportHazardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHazardReported?: (hazard: any) => void;
  defaultZone?: string;
}

const HAZARD_TYPES = [
  'Oil / Liquid Spill on Floor',
  'Blocked Emergency Exit / Fire Pathway',
  'Missing Guardrail / Edge Protection',
  'Damaged Wiring / Exposed Electrical Cable',
  'Excessive Smoke / Chemical Fumes',
  'Improper Chemical Storage',
  'Overhead Crane Obstruction',
  'Damaged Scaffolding',
  'Other Unsafe Physical Condition',
];

export const ReportHazardModal: React.FC<ReportHazardModalProps> = ({
  isOpen,
  onClose,
  onHazardReported,
  defaultZone = '',
}) => {
  const [zonesList, setZonesList] = useState<Array<{ id: string; name: string }>>([]);
  const [zoneName, setZoneName] = useState(defaultZone);
  const [hazardType, setHazardType] = useState(HAZARD_TYPES[0]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    api.getZones()
      .then((res) => {
        if (res.zones && res.zones.length > 0) {
          const mapped = res.zones.map((z: any) => ({
            id: z.id || z._id,
            name: z.name,
          }));
          setZonesList(mapped);
          if (!zoneName && mapped.length > 0) {
            setZoneName(defaultZone || mapped[0].name);
          }
        }
      })
      .catch((err) => console.error('Failed to load zones for ReportHazardModal', err));
  }, [defaultZone]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please provide a brief description of the observed hazard.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const selectedZoneObj = zonesList.find((z) => z.name === zoneName);
      const zoneId = selectedZoneObj ? selectedZoneObj.id : 'ZONE-A';

      const res = await api.reportHazard({
        zoneId,
        zoneName,
        hazardType,
        description,
        severity,
      });

      setSuccessMsg('Hazard reported successfully. Stewards and Safety Officers have been alerted.');
      if (onHazardReported) {
        onHazardReported(res.hazard);
      }

      setTimeout(() => {
        setSuccessMsg('');
        setDescription('');
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit hazard report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#14171f] border border-amber-500/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Glow Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Report Unsafe Hazard / Condition</h2>
              <p className="text-xs text-slate-400">Direct notification dispatched to plant safety network</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successMsg ? (
          <div className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-semibold text-white">Report Received</h3>
            <p className="text-sm text-emerald-300 max-w-sm mx-auto">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Zone Selection */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                Industrial Zone / Sector
              </label>
              <select
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e1017] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
              >
                {zonesList.map((zone) => (
                  <option key={zone.id} value={zone.name}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Hazard Category */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                Hazard Category
              </label>
              <select
                value={hazardType}
                onChange={(e) => setHazardType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e1017] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
              >
                {HAZARD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity Rating */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                Perceived Urgency / Severity
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'critical'] as const).map((lvl) => {
                  const active = severity === lvl;
                  const colorMap = {
                    low: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
                    medium: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
                    high: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
                    critical: 'border-red-500/40 text-red-400 bg-red-500/10',
                  };
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSeverity(lvl)}
                      className={`py-2 text-xs font-mono uppercase rounded-xl border transition-all ${
                        active
                          ? `${colorMap[lvl]} font-bold ring-2 ring-white/20`
                          : 'border-white/10 bg-[#0e1017] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                Observed Condition Details
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe exact physical location, leaking chemical type, machinery involved, or immediate danger..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e1017] border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Transmitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Broadcast Hazard Alert</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
