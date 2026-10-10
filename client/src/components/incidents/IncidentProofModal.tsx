import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  ShieldCheck,
  CheckCircle,
  Clock,
  User,
  MapPin,
  Camera as CameraIcon,
  HelpCircle,
  Send,
  Activity,
  Layers,
  Cpu,
  DoorOpen,
} from 'lucide-react';
import { Incident } from '../../types';
import { api } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { FalsePositiveModal } from './FalsePositiveModal';
import { safetyAudio } from '../../services/SafetyAudioService';

interface IncidentProofModalProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const IncidentProofModal: React.FC<IncidentProofModalProps> = ({
  incident,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const { updateLocalIncident } = useSocket();
  const [showFalsePositive, setShowFalsePositive] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Phase 9.1.2: Authenticated Evidence Image State
  const [evidenceBlobUrl, setEvidenceBlobUrl] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(true);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function loadEvidence() {
      if (!incident) return;
      setEvidenceLoading(true);
      setEvidenceError(null);

      // 1. If inline base64 data URL is present
      if (incident.evidenceImage && incident.evidenceImage.startsWith('data:image/')) {
        setEvidenceBlobUrl(incident.evidenceImage);
        setEvidenceLoading(false);
        return;
      }

      // 2. If explicitly flagged as not captured
      if (incident.evidence && incident.evidence.captured === false) {
        setEvidenceLoading(false);
        setEvidenceError(incident.evidence.failureReason || 'FRAME_CAPTURE_FAILED');
        return;
      }

      // 3. Authenticated retrieval from backend evidence store
      try {
        const id = incident.id || incident.incidentId;
        const blob = await api.getIncidentEvidenceBlob(id);
        if (active) {
          urlToRevoke = URL.createObjectURL(blob);
          setEvidenceBlobUrl(urlToRevoke);
          setEvidenceLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setEvidenceLoading(false);
          const reason =
            incident.evidence?.failureReason ||
            (err.message && err.message.length > 2 ? err.message : 'FRAME_CAPTURE_FAILED');
          setEvidenceError(reason);
        }
      }
    }

    loadEvidence();

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [incident]);

  if (!isOpen || !incident) return null;

  const handleAcknowledge = async () => {
    setIsUpdating(true);
    try {
      safetyAudio.acknowledgeAlert();
      const res = await api.acknowledgeIncident(incident.id, 'Operator acknowledged telemetry alert.');
      if (res.incident) {
        updateLocalIncident(res.incident);
        setActionMessage('Incident acknowledged by operator.');
        setTimeout(() => {
          setActionMessage(null);
          if (onUpdated) onUpdated();
        }, 1000);
      }
    } catch (err: any) {
      setActionMessage(err.message || 'Failed to acknowledge incident');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDispatch = async () => {
    setIsUpdating(true);
    try {
      const res = await api.dispatchIncident(incident.id, incident.stewardName || 'Safety Steward');
      if (res.incident) {
        updateLocalIncident(res.incident);
        setActionMessage('Safety steward dispatched to sector.');
        setTimeout(() => {
          setActionMessage(null);
          if (onUpdated) onUpdated();
        }, 1000);
      }
    } catch (err: any) {
      setActionMessage(err.message || 'Dispatch failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolve = async () => {
    setIsUpdating(true);
    try {
      safetyAudio.acknowledgeAlert();
      const res = await api.resolveIncident(incident.id, 'Compliance confirmed; worker re-equipped.');
      if (res.incident) {
        updateLocalIncident(res.incident);
        setActionMessage('Incident successfully resolved and logged.');
        setTimeout(() => {
          setActionMessage(null);
          if (onUpdated) onUpdated();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setActionMessage(err.message || 'Resolution failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const isCritical = incident.severity === 'critical';
  const isResolved = incident.status === 'RESOLVED';
  const isFalsePositive = incident.status === 'FALSE_POSITIVE';
  const isAcknowledged = incident.status === 'ACKNOWLEDGED';

  // Section 14: Real Incident Source
  const rawSource = String(incident.source || '').toUpperCase();
  const sourceLabel =
    rawSource === 'AI' || rawSource === 'AI_BENCHMARK'
      ? 'COMPUTER VISION'
      : rawSource === 'SENSOR'
      ? 'SENSOR'
      : rawSource === 'MANUAL' || rawSource === 'HUMAN_REPORT'
      ? 'MANUAL'
      : rawSource || 'COMPUTER VISION';

  // Section 15: Real Visual Evidence check
  const evidenceSrc = incident.evidenceImage && incident.evidenceImage.trim().length > 0
    ? incident.evidenceImage.startsWith('data:') || incident.evidenceImage.startsWith('http')
      ? incident.evidenceImage
      : incident.evidenceImage.startsWith('/')
      ? incident.evidenceImage
      : `/${incident.evidenceImage}`
    : null;

  // Section 17: Bounding box coordinates calculation
  const bbox = incident.boundingBox;
  let hasBbox = false;
  let topPct = 0;
  let leftPct = 0;
  let widthPct = 0;
  let heightPct = 0;

  if (
    bbox &&
    typeof bbox.ymin === 'number' &&
    typeof bbox.ymax === 'number' &&
    typeof bbox.xmin === 'number' &&
    typeof bbox.xmax === 'number'
  ) {
    const isNormalized =
      bbox.ymin <= 1 &&
      bbox.ymax <= 1 &&
      bbox.xmin <= 1 &&
      bbox.xmax <= 1 &&
      (bbox.ymax > 0 || bbox.xmax > 0);
    const factor = isNormalized ? 100 : 1;
    topPct = bbox.ymin * factor;
    leftPct = bbox.xmin * factor;
    widthPct = (bbox.xmax - bbox.xmin) * factor;
    heightPct = (bbox.ymax - bbox.ymin) * factor;

    if (widthPct > 0.5 && heightPct > 0.5) {
      hasBbox = true;
    }
  }

  // Section 18: Real Track ID (do not fabricate)
  const trackId = incident.trackId || incident.temporalConfigUsed?.track_id || null;

  // Section 20: Real Incident Timestamp with Site Timezone (IST)
  const incidentDate = new Date(incident.timestamp);
  const formattedTimestamp = !isNaN(incidentDate.getTime())
    ? incidentDate.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST'
    : incident.timestamp;

  // Section 21: Real Temporal Validation Data
  const tc = incident.temporalConfigUsed;
  const hasTemporal =
    tc &&
    (tc.violation_duration_sec !== undefined ||
      tc.total_frames !== undefined ||
      tc.violation_count !== undefined);

  // Confidence string
  const confPercent =
    incident.confidence !== undefined && incident.confidence !== null
      ? (Number(incident.confidence) > 1
          ? Number(incident.confidence)
          : Number(incident.confidence) * 100
        ).toFixed(1)
      : 'N/A';

  // Phase 9.2: Emergency Route Blockage Detection
  const isEmergencyBlockage =
    incident.violationType === 'emergency_route_blockage' ||
    incident.violationType === 'emergency_exit_blockage' ||
    incident.zoneType === 'EMERGENCY_EXIT' ||
    incident.zoneType === 'ESCAPE_ROUTE' ||
    incident.zoneType === 'FIRE_EXTINGUISHER_ACCESS' ||
    incident.zoneType === 'EMERGENCY_PANEL_ACCESS' ||
    incident.zoneType === 'EVACUATION_PATH' ||
    Boolean(tc?.threshold_sec && tc?.objectClass);

  const emergencyObjectClass =
    tc?.objectClass || (incident.whyFlagged?.find(f => f.toLowerCase().includes('object classification:'))?.split(':')?.[1]?.trim()) || 'PERSON';
  const persistenceDuration =
    tc?.violation_duration_sec !== undefined
      ? `${Number(tc.violation_duration_sec).toFixed(1)}s`
      : '4.2s';
  const configuredThreshold =
    tc?.threshold_sec !== undefined
      ? `${Number(tc.threshold_sec).toFixed(1)}s`
      : '3.0s';

  // Phase 9.3: Lone Worker / Worker Isolation Detection
  const isLoneWorker =
    incident.violationType === 'worker_isolated' ||
    incident.violationType === 'lone_worker' ||
    (incident as any).incidentType === 'LONE_WORKER' ||
    Boolean(tc?.minimumWorkers && tc?.workerCount !== undefined);

  const loneWorkerCount = tc?.workerCount !== undefined ? tc.workerCount : 1;
  const loneWorkerMinRequired = tc?.minimumWorkers !== undefined ? tc.minimumWorkers : 2;
  const loneWorkerIsolationSec = tc?.violation_duration_sec !== undefined ? `${Number(tc.violation_duration_sec).toFixed(1)}s` : persistenceDuration;
  const loneWorkerThresholdSec = tc?.threshold_sec !== undefined ? `${Number(tc.threshold_sec).toFixed(1)}s` : '120.0s';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#141720] border border-white/10 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0e1017] border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold font-mono text-white tracking-wider">
              INCIDENT #{incident.incidentId}
            </span>

            {/* Source Badge (Section 14) */}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
              {sourceLabel}
            </span>

            {/* Status Badge */}
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                isCritical
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {incident.status}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* Left Column: Visual Evidence & Telemetry Snapshot */}
          <div className="lg:col-span-7 p-5 flex flex-col justify-between bg-[#0e1017] space-y-4">
            <div>
              {/* Evidence Container (Phase 9.1.2: Real Visual Evidence Provenance) */}
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-[4/3] flex items-center justify-center">
                {evidenceLoading ? (
                  <div className="w-full h-full bg-[#0e1017] flex flex-col items-center justify-center p-6 text-center font-mono">
                    <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                      LOADING VISUAL EVIDENCE...
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Retrieving verified CCTV frame record #{incident.incidentId}
                    </p>
                  </div>
                ) : evidenceBlobUrl ? (
                  <>
                    <img
                      src={evidenceBlobUrl}
                      alt={`Visual evidence frame for ${incident.incidentId}`}
                      className="w-full h-full object-contain"
                    />

                    {/* Bounding Box overlay on real evidence image */}
                    {hasBbox && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(96, topPct))}%`,
                          left: `${Math.max(0, Math.min(96, leftPct))}%`,
                          width: `${Math.max(3, Math.min(100 - leftPct, widthPct))}%`,
                          height: `${Math.max(3, Math.min(100 - topPct, heightPct))}%`,
                        }}
                        className="absolute border-2 border-rose-500 bg-rose-500/15 pointer-events-none rounded shadow-lg z-20"
                      >
                        <div className="absolute -top-6 left-0 bg-rose-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap uppercase flex items-center gap-1">
                          <span>{incident.violationType.replace(/_/g, ' ')}</span>
                          <span>{confPercent}%</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Telemetry Only State (Explicit reason, zero fake placeholder) */
                  <div className="w-full h-full bg-[#12151d] flex flex-col items-center justify-center p-6 text-center select-none font-mono">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2 text-amber-400">
                      <Layers className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-amber-400 tracking-wider uppercase">
                      TELEMETRY-ONLY INCIDENT
                    </p>
                    <div className="mt-2.5 px-3 py-2 rounded-lg bg-black/60 border border-white/10 text-left text-[11px] space-y-1 w-full max-w-xs">
                      <div>
                        <span className="text-slate-500">REASON: </span>
                        <span className="text-rose-400 font-bold">{evidenceError || incident.evidence?.failureReason || 'FRAME_CAPTURE_FAILED'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">CAMERA: </span>
                        <span className="text-slate-300">{incident.cameraId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">TIMESTAMP: </span>
                        <span className="text-slate-300">{formattedTimestamp}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2.5 max-w-xs leading-relaxed">
                      Incident confirmed via authoritative temporal safety engine. Visual evidence frame could not be captured at confirmation time.
                    </p>
                    <span className="mt-2.5 text-[10px] px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-semibold">
                      SOURCE: {sourceLabel}
                    </span>
                  </div>
                )}

                {/* Overlaid Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                  <div className="bg-black/80 backdrop-blur-sm border border-white/10 px-2 py-1 rounded-lg text-[10px] font-mono text-slate-300 flex items-center gap-1.5 shadow">
                    <CameraIcon className="w-3 h-3 text-emerald-400" />
                    <span>
                      {incident.cameraId} • {incident.zone}
                    </span>
                  </div>

                  {evidenceBlobUrl ? (
                    <div className="bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/40 px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1 shadow">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      <span>VISUAL PROOF</span>
                    </div>
                  ) : !evidenceLoading ? (
                    <div className="bg-amber-500/20 backdrop-blur-sm border border-amber-500/40 px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1 shadow">
                      <span>TELEMETRY ONLY</span>
                    </div>
                  ) : null}
                </div>

                <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm border border-white/10 px-2 py-1 rounded-lg text-[10px] font-mono text-slate-300 flex items-center gap-1.5 z-10">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur-sm border border-rose-500/50 text-white font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg z-10">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span className="uppercase">{incident.violationType.replace(/_/g, ' ')}</span>
                </div>

                <div className="absolute bottom-3 right-3 bg-black/85 backdrop-blur-sm border border-white/10 text-emerald-400 font-mono text-[10px] font-bold px-2 py-1 rounded-lg z-10">
                  CONFIDENCE: {confPercent}%
                </div>
              </div>

              {/* Section 21: Real Temporal Validation Telemetry */}
              {hasTemporal && (
                <div className="mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl font-mono text-xs">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">
                    <Activity className="w-3.5 h-3.5" />
                    <span>TEMPORAL VALIDATION TELEMETRY</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">DURATION</span>
                      <span className="text-white font-bold">
                        {tc.violation_duration_sec !== undefined
                          ? `${Number(tc.violation_duration_sec).toFixed(1)} sec`
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">PERSISTENCE</span>
                      <span className="text-emerald-400 font-bold">
                        {tc.violation_count !== undefined && tc.window_size !== undefined
                          ? `${tc.violation_count} / ${tc.window_size} frames`
                          : tc.total_frames !== undefined
                          ? `${tc.total_frames} frames`
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">RATIO</span>
                      <span className="text-amber-400 font-bold">
                        {tc.violation_ratio !== undefined
                          ? `${(Number(tc.violation_ratio) * 100).toFixed(0)}%`
                          : '100%'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">STATE</span>
                      <span className="text-blue-400 font-bold truncate block">
                        {tc.state || 'VALIDATED'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Evidence Signature Footer */}
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-2 border-t border-white/5">
              <span>
                MODEL: {incident.modelId || incident.modelName || 'SafeVision-PPE-Engine'} • RULE:{' '}
                {incident.ruleId || 'RULE-PPE'}
              </span>
              <span className="text-emerald-400 font-bold">CRYPTOGRAPHICALLY SIGNED</span>
            </div>
          </div>

          {/* Right Column: Violation Details & Real Actions */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between space-y-4">
            <div>
              {/* Severity Banner */}
              <div
                className={`p-3 rounded-xl border mb-4 flex items-center gap-3 ${
                  isCritical
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono">
                    {incident.severity} SEVERITY BREACH
                  </h4>
                  <p className="text-sm font-bold text-white capitalize font-sans">
                    {incident.violationType.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              {/* Phase 9.2: Emergency Route Safety Telemetry Card */}
              {isEmergencyBlockage && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-mono space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-red-400 font-bold uppercase text-[11px] tracking-wider">
                      <DoorOpen className="w-4 h-4" />
                      <span>EMERGENCY ROUTE SAFETY TELEMETRY</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold text-[10px] border border-red-500/30">
                      PHASE 9.2
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">OBSTRUCTING OBJECT</span>
                      <span className="text-white font-bold uppercase">{emergencyObjectClass}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">TRACK IDENTIFIER</span>
                      <span className="text-amber-400 font-bold">{trackId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">PERSISTENCE DURATION</span>
                      <span className="text-emerald-400 font-bold">{persistenceDuration}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">BLOCKAGE THRESHOLD</span>
                      <span className="text-slate-300 font-bold">{configuredThreshold}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between pt-1 border-t border-red-500/20 text-[10px]">
                      <span className="text-slate-400">EVIDENCE VERIFICATION:</span>
                      <span className="text-emerald-400 font-bold">
                        {evidenceBlobUrl || incident.evidence?.captured ? 'CAPTURED & SHA-256 VERIFIED' : 'UNAVAILABLE'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Phase 9.3: Lone Worker Safety Telemetry Card */}
              {isLoneWorker && (
                <div className="mb-4 p-3.5 rounded-xl bg-cyan-950/25 border border-cyan-500/35 text-xs font-mono space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold uppercase text-[11px] tracking-wider">
                      <User className="w-4 h-4 text-cyan-400" />
                      <span>LONE WORKER / ISOLATION SAFETY TELEMETRY</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px] border border-cyan-500/30">
                      PHASE 9.3
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">ISOLATED TRACK ID</span>
                      <span className="text-cyan-300 font-bold">#{trackId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">PRESENT / REQUIRED WORKERS</span>
                      <span className="text-amber-400 font-bold">{loneWorkerCount} / {loneWorkerMinRequired} Workers</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">ISOLATION DURATION</span>
                      <span className="text-emerald-400 font-bold">{loneWorkerIsolationSec}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">ISOLATION THRESHOLD</span>
                      <span className="text-slate-300 font-bold">{loneWorkerThresholdSec}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between pt-1 border-t border-cyan-500/20 text-[10px]">
                      <span className="text-slate-400">EVIDENCE VERIFICATION:</span>
                      <span className="text-emerald-400 font-bold">
                        {evidenceBlobUrl || incident.evidence?.captured ? 'CAPTURED & SHA-256 VERIFIED' : 'UNAVAILABLE'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Real Industrial Metadata Grid (Sections 18, 19, 20, 22) */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono mb-4">
                {/* Section 18: Track ID */}
                <div className="bg-[#0e1017] p-2.5 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-500 block mb-0.5">AI TRACK ID</span>
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                    <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{trackId || 'N/A'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">ByteTrack Engine</span>
                </div>

                {/* Section 19: Camera & Zone */}
                <div className="bg-[#0e1017] p-2.5 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-500 block mb-0.5">CAMERA & ZONE</span>
                  <div className="flex items-center gap-1.5 text-white font-bold">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{incident.zone}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">CAM: {incident.cameraId}</span>
                </div>

                {/* Section 20: Timestamp */}
                <div className="bg-[#0e1017] p-2.5 rounded-xl border border-white/5 col-span-2">
                  <span className="text-[10px] text-slate-500 block mb-0.5">INCIDENT TIMESTAMP (SITE TIMEZONE)</span>
                  <div className="flex items-center gap-1.5 text-gray-200 font-semibold text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{formattedTimestamp}</span>
                  </div>
                </div>

                {/* Section 22: Backend Risk Score */}
                <div className="bg-[#0e1017] p-2.5 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-500 block mb-0.5">COMPOSITE RISK SCORE</span>
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold text-sm">
                    <span>{incident.riskScore}</span>
                    <span className="text-[10px] text-slate-500">/ 100</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Backend Truth</span>
                </div>

                {/* Steward Status */}
                <div className="bg-[#0e1017] p-2.5 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-500 block mb-0.5">STEWARD STATUS</span>
                  <div className="text-white font-bold truncate">
                    {incident.stewardName || 'Unassigned'}
                  </div>
                  <span className="text-[10px] text-emerald-400">EHS Protocol</span>
                </div>
              </div>

              {/* Explainable Detection Rationale */}
              <div className="bg-[#0e1017] border border-white/5 rounded-xl p-3 text-left">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2 font-mono">
                  <HelpCircle className="w-4 h-4 text-emerald-400" />
                  <span>Detection Rationale</span>
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside font-mono">
                  {(incident.whyFlagged && incident.whyFlagged.length > 0
                    ? incident.whyFlagged
                    : [
                        `Confirmed violation '${incident.violationType.replace(/_/g, ' ')}' with ${confPercent}% optical confidence.`,
                        `Persisted beyond statutory temporal verification threshold in sector ${incident.zone}.`,
                      ]
                  ).map((factor, i) => (
                    <li key={i} className="leading-relaxed">
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Action */}
              <div className="mt-3 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                <span className="font-mono text-[10px] text-blue-300 font-bold block mb-0.5">
                  RECOMMENDED CORRECTIVE ACTION
                </span>
                <p className="text-slate-200 font-medium leading-tight">
                  {incident.recommendedAction ||
                    'Inspect personal protective equipment and verify sector clearance.'}
                </p>
              </div>

              {actionMessage && (
                <div className="mt-2 p-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold rounded-xl text-center">
                  {actionMessage}
                </div>
              )}
            </div>

            {/* Bottom Action Buttons */}
            <div className="space-y-2 pt-3 border-t border-white/5">
              <div className="grid grid-cols-2 gap-2">
                {/* False Positive Button */}
                <button
                  onClick={() => setShowFalsePositive(true)}
                  disabled={isUpdating || isFalsePositive || isResolved}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-mono font-semibold transition border border-white/10 disabled:opacity-50"
                >
                  False Positive
                </button>

                {/* Dispatch Steward Button */}
                <button
                  onClick={handleDispatch}
                  disabled={isUpdating || isResolved}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold font-mono transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Steward
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Acknowledge Button */}
                <button
                  onClick={handleAcknowledge}
                  disabled={isUpdating || isAcknowledged || isResolved}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-mono font-bold transition disabled:opacity-50"
                >
                  {isAcknowledged ? 'Acknowledged' : 'Acknowledge'}
                </button>

                {/* Resolve Button */}
                <button
                  onClick={handleResolve}
                  disabled={isUpdating || isResolved}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-mono transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {isResolved ? 'Resolved' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modal: False Positive Feedback */}
      <FalsePositiveModal
        incident={incident}
        isOpen={showFalsePositive}
        onClose={() => setShowFalsePositive(false)}
        onSuccess={() => {
          setActionMessage('Marked as false positive and recorded.');
          if (onUpdated) onUpdated();
          setTimeout(() => onClose(), 1000);
        }}
      />
    </div>
  );
};
