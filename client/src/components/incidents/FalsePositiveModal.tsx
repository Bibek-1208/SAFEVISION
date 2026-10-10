import React, { useState } from 'react';
import { AlertCircle, X, Check, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';
import { Incident } from '../../types';

interface FalsePositiveModalProps {
  incident: Incident;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const FalsePositiveModal: React.FC<FalsePositiveModalProps> = ({
  incident,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState<
    'Lighting' | 'Occlusion' | 'Incorrect detection' | 'Worker outside zone' | 'Other'
  >('Lighting');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.submitFalsePositive({
        incidentId: incident.id,
        reason,
        notes,
        submittedBy: 'Chief Safety Officer',
      });
      setSubmitted(true);
      setTimeout(() => {
        setIsSubmitting(false);
        setSubmitted(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const reasons = [
    { value: 'Lighting', desc: 'Glare, shadows, or furnace flame distortion affected optical detection.' },
    { value: 'Occlusion', desc: 'Worker body partially hidden behind equipment or machinery.' },
    { value: 'Incorrect detection', desc: 'Object misclassified (e.g. bag confused with vest).' },
    { value: 'Worker outside zone', desc: 'Worker was outside designated hazardous zone boundary.' },
    { value: 'Other', desc: 'Unusual environment condition or equipment calibration issue.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1C1C1C] border border-[#333] rounded-lg max-w-lg w-full p-6 shadow-2xl relative text-left">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-warning/20 border border-warning/40 flex items-center justify-center text-warning">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Report False Positive Detection
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Incident ID: {incident.incidentId} • {incident.violationType.replace('_', ' ').toUpperCase()}
            </p>
          </div>
        </div>

        <div className="bg-[#141414] border border-[#282828] p-3 rounded-md mb-4 text-xs text-gray-400">
          <p className="font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-warning" />
            Active Learning Dataset Capture:
          </p>
          Feedback is logged to the model improvement dataset for supervised retraining and optical threshold tuning.
        </div>

        {submitted ? (
          <div className="py-8 text-center text-safe flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-safe/20 border border-safe flex items-center justify-center mb-3">
              <Check className="w-6 h-6" />
            </div>
            <p className="font-bold text-sm">Feedback Recorded Successfully</p>
            <p className="text-xs text-gray-400 font-mono mt-1">Incident marked as FALSE POSITIVE in triage log.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-gray-300 font-bold mb-2">
                SELECT PRIMARY DISCREPANCY REASON *
              </label>
              <div className="space-y-2">
                {reasons.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition ${
                      reason === r.value
                        ? 'bg-safe/10 border-safe/60 text-white'
                        : 'bg-[#181818] border-[#2A2A2A] text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="fp_reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value as any)}
                      className="mt-0.5 accent-safe"
                    />
                    <div>
                      <p className="text-xs font-semibold">{r.value}</p>
                      <p className="text-[11px] text-gray-400">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-300 font-bold mb-1.5">
                OPERATOR NOTES / CONTEXT (OPTIONAL)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain lighting, camera angle, or worker garment details..."
                rows={3}
                className="w-full bg-[#161616] border border-[#2E2E2E] focus:border-safe/60 rounded p-2 text-xs text-gray-200 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#252525] hover:bg-[#303030] text-gray-300 rounded text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-warning hover:bg-warning-dark text-black rounded text-xs font-bold font-mono transition"
              >
                {isSubmitting ? 'Recording...' : 'Submit False Positive'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
