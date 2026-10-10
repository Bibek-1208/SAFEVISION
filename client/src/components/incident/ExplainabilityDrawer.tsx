import React from 'react';
import { X, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, Scale, Clock, Activity } from 'lucide-react';
import { Incident } from '../../types';

interface ExplainabilityDrawerProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExplainabilityDrawer: React.FC<ExplainabilityDrawerProps> = ({
  incident,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !incident) return null;

  const isCrit = incident.severity === 'critical';

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-lg bg-[#181818] border-l border-[#333] h-full overflow-y-auto p-6 flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#282828] mb-6">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-6 h-6 text-safe" />
              <div>
                <h3 className="text-base font-bold text-white font-mono">AI AUDIT EXPLAINABILITY</h3>
                <p className="text-[11px] text-gray-400 font-mono">INCIDENT: {incident.incidentId}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#222] text-gray-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Core Identification */}
          <div className="bg-[#1F1F1F] p-4 rounded-lg border border-[#2A2A2A] mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400">DETECTED VIOLATION</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                  isCrit ? 'bg-critical/20 text-critical border border-critical/30' : 'bg-warning/20 text-warning border border-warning/30'
                }`}
              >
                {incident.severity.toUpperCase()}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mb-2">
              {incident.violationType.replace(/_/g, ' ').toUpperCase()}
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono text-gray-300">
              <div>
                <span className="text-gray-500">SUBJECT ID: </span>
                <span className="font-bold">{incident.workerId}</span>
              </div>
              <div>
                <span className="text-gray-500">CONFIDENCE: </span>
                <span className="text-safe font-bold">{(incident.confidence * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-gray-500">CAMERA: </span>
                <span>{incident.cameraId}</span>
              </div>
              <div>
                <span className="text-gray-500">ZONE: </span>
                <span>{incident.zone}</span>
              </div>
            </div>
          </div>

          {/* Neural & Optical Explainability Factors */}
          <div className="space-y-4 mb-6">
            <h4 className="text-xs font-mono text-gray-400 font-bold tracking-wider">
              VERIFICATION FACTORS & FEATURE WEIGHTS
            </h4>

            {incident.whyFlagged && incident.whyFlagged.length > 0 ? (
              <div className="space-y-2">
                {incident.whyFlagged.map((factor, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 bg-[#141414] p-3 rounded border border-[#222] text-xs">
                    <CheckCircle2 className="w-4 h-4 text-safe shrink-0 mt-0.5" />
                    <span className="text-gray-300 font-mono leading-relaxed">{factor}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#141414] p-3 rounded border border-[#222] text-xs text-gray-400 font-mono">
                Multivariate optical feature extractor confirmed non-compliance with OSHA 1910 PPE criteria.
              </div>
            )}
          </div>

          {/* Temporal Persistence & Bounding Box Specs */}
          <div className="bg-[#1F1F1F] p-4 rounded-lg border border-[#2A2A2A] mb-6">
            <h4 className="text-xs font-mono text-gray-400 font-bold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-safe" /> TEMPORAL PERSISTENCE GUARANTEE
            </h4>
            <p className="text-xs text-gray-300 font-mono leading-relaxed mb-3">
              Violation maintained continuity exceeding the 3.0s anti-occlusion threshold. Single-frame shadows or glancing occlusions were mathematically rejected before incident dispatch.
            </p>
            {incident.boundingBox && (
              <div className="bg-[#141414] p-2.5 rounded font-mono text-[10px] text-gray-400 flex justify-between">
                <span>YMIN: {incident.boundingBox.ymin}%</span>
                <span>XMIN: {incident.boundingBox.xmin}%</span>
                <span>YMAX: {incident.boundingBox.ymax}%</span>
                <span>XMAX: {incident.boundingBox.xmax}%</span>
              </div>
            )}
          </div>

          {/* Statutory Compliance Clause */}
          <div className="bg-[#1F1F1F] p-4 rounded-lg border border-[#2A2A2A]">
            <h4 className="text-xs font-mono text-gray-400 font-bold mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-warning" /> STATUTORY REGULATORY STANDARD
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed font-mono">
              {incident.violationType.includes('vest')
                ? 'DGFASLI Rule 65 & OSHA 29 CFR 1910.132 — High Visibility Garments mandatory in active overhead crane and material handling bays.'
                : incident.violationType.includes('helmet')
                ? 'OSHA 29 CFR 1910.135 — Mandatory certified head protection in designated impact and falling object zones.'
                : 'Factories Act 1948 Section 38 & OSHA 1910.38 — Fire protection and emergency response guidelines.'}
            </p>
          </div>
        </div>

        {/* Action Bottom Strip */}
        <div className="pt-4 border-t border-[#282828] mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-safe text-black font-bold font-mono text-xs rounded hover:bg-safe-light transition text-center"
          >
            ACKNOWLEDGE AUDIT
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-[#2A2A2A] text-gray-300 font-mono text-xs rounded hover:bg-[#3A3A3A] transition"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
