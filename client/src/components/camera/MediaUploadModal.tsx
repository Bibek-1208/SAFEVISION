import React, { useState, useEffect } from 'react';
import {
  Upload,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Layers,
  Sparkles,
  ShieldAlert,
  User,
  Eye,
  Sliders,
  Check,
  RotateCcw,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';

interface MediaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone?: string;
  cameraId?: string;
  onAnalysisComplete?: (results: any) => void;
}

interface InspectionProfile {
  id: string;
  name: string;
  description: string;
  requiredPpe: string[];
  defaultConfidence?: number;
}

interface RegistryClass {
  id: string;
  name: string;
  displayName: string;
  category: string;
  subCategory?: string;
  isModelSupported: boolean;
  status: string;
  statusLabel?: string;
}

export const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  isOpen,
  onClose,
  zone = 'General Inspection',
  cameraId = 'UPLOADED_MEDIA',
  onAnalysisComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<any | null>(null);
  const [activeView, setActiveView] = useState<'SOURCE' | 'KEYFRAME'>('SOURCE');

  // Dynamic Class Registry & Profile State (Zero hardcoding)
  const [profiles, setProfiles] = useState<InspectionProfile[]>([]);
  const [availableClasses, setAvailableClasses] = useState<RegistryClass[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('Construction');
  const [selectedPpe, setSelectedPpe] = useState<string[]>(['helmet', 'safety-vest']);
  const [activeModelInfo, setActiveModelInfo] = useState<any>(null);

  // Overlay Toggles
  const [showPersons, setShowPersons] = useState<boolean>(true);
  const [showDetectedPpe, setShowDetectedPpe] = useState<boolean>(true);
  const [showExpectedRegions, setShowExpectedRegions] = useState<boolean>(true);

  // Fetch dynamic configuration from backend
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    api.getInspectionConfig()
      .then((res) => {
        if (!isMounted) return;
        const rawProfiles = Array.isArray(res.profiles) ? res.profiles : Object.values(res.profiles || {});
        if (rawProfiles && rawProfiles.length > 0) {
          setProfiles(rawProfiles);
          const constrProfile = rawProfiles.find((p: any) => p.name === 'Construction') || rawProfiles[0];
          setSelectedProfile(constrProfile.name);
          setSelectedPpe(constrProfile.requiredPpe || ['helmet', 'safety-vest']);
        }
        if (res.classes && res.classes.length > 0) {
          // Filter to PPE items for the requirements checklist
          const ppeItems = res.classes.filter((c: any) => c.category === 'PPE' || c.category === 'EQUIPMENT');
          setAvailableClasses(ppeItems);
        }
        if (res.activeModel) {
          setActiveModelInfo(res.activeModel);
        }
      })
      .catch((err) => {
        console.error('Failed to load inspection configuration:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProfileChange = (profileName: string) => {
    setSelectedProfile(profileName);
    const prof = profiles.find((p) => p.name === profileName);
    if (prof) {
      setSelectedPpe([...prof.requiredPpe]);
    } else if (profileName === 'Custom') {
      // Keep current selection
    }
  };

  const togglePpeRequirement = (className: string) => {
    if (selectedProfile !== 'Custom') {
      setSelectedProfile('Custom');
    }
    setSelectedPpe((prev) =>
      prev.includes(className)
        ? prev.filter((item) => item !== className)
        : [...prev, className]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ];
    if (!validTypes.includes(selected.type)) {
      setError('Unsupported file type. Please upload a valid MP4, WebM, MOV, JPEG, or PNG file.');
      return;
    }

    setFile(selected);
    setError(null);
    setAnalysisResult(null);
    setSelectedKeyframe(null);
    setActiveView('SOURCE');

    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
  };

  const handleRunInference = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      formData.append('video', file);
      formData.append('zone', zone);
      formData.append('cameraId', cameraId);
      formData.append('requiredPpe', JSON.stringify(selectedPpe));
      formData.append('profile', selectedProfile);

      try {
        const res = await api.detectVideo(formData);
        setAnalysisResult(res);
        if (res.keyframes && res.keyframes.length > 0) {
          setSelectedKeyframe(res.keyframes[0]);
          setActiveView('KEYFRAME');
        }
        if (onAnalysisComplete) onAnalysisComplete(res);
      } catch (err: any) {
        setError(err.message || 'Video analysis pipeline failed.');
      }
    } else {
      formData.append('image', file);
      formData.append('zone', zone);
      formData.append('cameraId', cameraId);
      formData.append('requiredPpe', JSON.stringify(selectedPpe));
      formData.append('profile', selectedProfile);

      try {
        const res = await api.detectImage(formData);
        setAnalysisResult(res);
        if (onAnalysisComplete) onAnalysisComplete(res);
      } catch (err: any) {
        setError(err.message || 'Image analysis pipeline failed.');
      }
    }

    setIsProcessing(false);
  };

  const resetState = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setError(null);
    setSelectedKeyframe(null);
    setActiveView('SOURCE');
    onClose();
  };

  const vm = analysisResult?.videoMetrics;
  const inspectionSummary = analysisResult?.inspectionSummary;
  const overallStatus = analysisResult?.overallStatus || vm?.analysisStatus || (
    analysisResult?.detections?.length > 0 ? 'COMPLIANT' : 'NO_PERSONNEL'
  );

  // Active overlay annotations to render
  const currentPersons = (activeView === 'KEYFRAME' && selectedKeyframe)
    ? (selectedKeyframe.person_assessments || selectedKeyframe.tracked_workers || [])
    : (analysisResult?.personAssessments || analysisResult?.trackedWorkers || []);

  const currentExpectedRegions = (activeView === 'KEYFRAME' && selectedKeyframe)
    ? (selectedKeyframe.expected_regions || [])
    : (analysisResult?.expectedRegions || []);

  const currentDetections = (activeView === 'KEYFRAME' && selectedKeyframe)
    ? (selectedKeyframe.detections || [])
    : (analysisResult?.detections || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto select-none">
      <div className="bg-[#12151D] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-4 px-6 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold font-mono tracking-wider text-white uppercase">
                  UNIFIED AI MEDIA INSPECTION & COMPLIANCE
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold">
                  PHASE 12.3 DYNAMIC PPE ONTOLOGY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Authoritative class-based verification with factual 5-state PPE evaluation
              </p>
            </div>
          </div>
          <button
            onClick={resetState}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Configuration Ribbon */}
          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-4 text-slate-400">
                <div>
                  <span className="text-slate-500">CAMERA SCOPE:</span>{' '}
                  <span className="text-white font-bold">{cameraId}</span>
                </div>
                <div>
                  <span className="text-slate-500">HAZARD ZONE:</span>{' '}
                  <span className="text-emerald-400 font-bold">{zone}</span>
                </div>
                {activeModelInfo && (
                  <div>
                    <span className="text-slate-500">ACTIVE MODEL:</span>{' '}
                    <span className="text-cyan-400 font-bold">{activeModelInfo.modelId}</span>
                  </div>
                )}
              </div>
              <div className="text-[10px] text-slate-500">
                Authoritative SH17 Baseline &bull; Dynamic Class Binding
              </div>
            </div>

            {/* Profile Selection & Dynamic PPE Requirement Matrix */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold font-mono text-slate-200 uppercase">
                    INSPECTION COMPLIANCE PROFILE:
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(profiles.length > 0 ? profiles : [
                    { id: 'construction', name: 'Construction', requiredPpe: ['helmet', 'safety-vest', 'shoes'] },
                    { id: 'manufacturing', name: 'Manufacturing', requiredPpe: ['helmet', 'safety-vest', 'gloves', 'shoes'] },
                    { id: 'laboratory', name: 'Laboratory', requiredPpe: ['face-mask', 'glasses', 'gloves', 'lab-coat'] },
                    { id: 'hazardous_materials', name: 'Hazardous Materials', requiredPpe: ['medical-suit', 'face-mask', 'glasses', 'gloves', 'shoes'] },
                    { id: 'custom', name: 'Custom', requiredPpe: [] },
                  ]).map((prof) => (
                    <button
                      key={prof.name}
                      onClick={() => handleProfileChange(prof.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 ${
                        selectedProfile === prof.name
                          ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      {selectedProfile === prof.name && <Check className="w-3 h-3 stroke-[3]" />}
                      <span>{prof.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic PPE Requirements Checklist */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>MANDATED PPE GEAR FOR INSPECTION ({selectedPpe.length} selected):</span>
                  <span className="text-[10px] text-slate-500">Click to toggle requirements</span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                  {availableClasses.map((cls) => {
                    const isRequired = selectedPpe.includes(cls.name);
                    const isTrained = cls.isModelSupported;
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => togglePpeRequirement(cls.name)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 border transition ${
                          isRequired
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                            : 'bg-black/30 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                            isRequired
                              ? 'bg-emerald-500 border-emerald-400 text-black font-bold'
                              : 'border-slate-600 bg-transparent'
                          }`}
                        >
                          {isRequired && '✓'}
                        </div>
                        <span className="font-medium">{cls.displayName || cls.name}</span>
                        {/* Status badge: registered vs model-supported */}
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                            isTrained
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                          }`}
                          title={
                            isTrained
                              ? 'Active model has trained detector support for this class'
                              : 'Registered class without model weights. Reports NOT_ASSESSABLE if inspected.'
                          }
                        >
                          {isTrained ? '✓ Trained' : '⚠ Untrained (NO_DATA)'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Upload Drop Area */}
          {!previewUrl ? (
            <label className="border-2 border-dashed border-white/10 hover:border-emerald-500/50 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition bg-white/[0.01] hover:bg-emerald-500/[0.02] group">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition mb-4">
                <Upload className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-white font-mono mb-1">
                Drag & drop factory video or snapshot here
              </p>
              <p className="text-xs text-slate-500 font-mono mb-4">
                Or click to browse from workstation filesystem
              </p>
              <span className="px-5 py-2.5 bg-emerald-500 text-black font-bold font-mono text-xs rounded-xl shadow-lg shadow-emerald-500/20 group-hover:bg-emerald-400 transition">
                SELECT MEDIA FILE
              </span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-4">
              {/* View Mode & Overlay Control Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-2.5 rounded-xl border border-white/5 font-mono text-xs">
                <div className="flex items-center gap-2">
                  {analysisResult?.keyframes && analysisResult.keyframes.length > 0 && (
                    <>
                      <button
                        onClick={() => setActiveView('SOURCE')}
                        className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                          activeView === 'SOURCE'
                            ? 'bg-emerald-500 text-black font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>SOURCE VIDEO</span>
                      </button>
                      <button
                        onClick={() => {
                          if (selectedKeyframe) setActiveView('KEYFRAME');
                        }}
                        className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                          activeView === 'KEYFRAME'
                            ? 'bg-emerald-500 text-black font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          KEYFRAME INSPECTOR {selectedKeyframe ? `(#${selectedKeyframe.frame_index})` : ''}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Overlays Visibility Toggles */}
                {analysisResult && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">OVERLAYS:</span>
                    <button
                      onClick={() => setShowPersons(!showPersons)}
                      className={`px-2 py-1 rounded border transition ${
                        showPersons
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                          : 'bg-white/5 border-white/5 text-slate-500'
                      }`}
                    >
                      Persons
                    </button>
                    <button
                      onClick={() => setShowDetectedPpe(!showDetectedPpe)}
                      className={`px-2 py-1 rounded border transition ${
                        showDetectedPpe
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/5 border-white/5 text-slate-500'
                      }`}
                    >
                      Detected PPE
                    </button>
                    <button
                      onClick={() => setShowExpectedRegions(!showExpectedRegions)}
                      className={`px-2 py-1 rounded border transition ${
                        showExpectedRegions
                          ? 'bg-red-500/20 border-red-500/40 text-red-300'
                          : 'bg-white/5 border-white/5 text-slate-500'
                      }`}
                    >
                      Missing Expected Regions
                    </button>
                  </div>
                )}
              </div>

              {/* Media Preview Viewport with Interactive SVG/Canvas Annotations */}
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-video flex items-center justify-center">
                {activeView === 'KEYFRAME' && selectedKeyframe?.snapshot_base64 ? (
                  <img
                    src={selectedKeyframe.snapshot_base64}
                    alt={`Keyframe #${selectedKeyframe.frame_index}`}
                    className="w-full h-full object-contain"
                  />
                ) : file?.type.startsWith('video/') ? (
                  <video
                    src={previewUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Inspection Preview"
                    className="w-full h-full object-contain"
                  />
                )}

                {/* Interactive SVG Bounding Box Overlays */}
                {analysisResult && (!file?.type.startsWith('video/') || activeView === 'KEYFRAME') && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* 1. Person Root Bounding Boxes */}
                    {showPersons && currentPersons.map((p: any, idx: number) => {
                      const bbox = p.bbox || (p.bounding_box ? [p.bounding_box.ymin, p.bounding_box.xmin, p.bounding_box.ymax, p.bounding_box.xmax] : null);
                      if (!bbox || bbox.length < 4) return null;
                      const [ymin, xmin, ymax, xmax] = bbox;
                      const isNonCompliant = p.compliance_state === 'NON-COMPLIANT' || (p.violations && p.violations.length > 0);
                      const strokeColor = isNonCompliant ? '#EF4444' : '#10B981';
                      
                      // Collision-aware label placement: if crowded or near top, position intelligently
                      let labelY = Math.max(2.8, ymin - 1.2);
                      const prevBoxes = currentPersons.slice(0, idx).map((prev: any) => {
                        return prev.bbox || (prev.bounding_box ? [prev.bounding_box.ymin, prev.bounding_box.xmin, prev.bounding_box.ymax, prev.bounding_box.xmax] : null);
                      }).filter(Boolean);
                      const collides = prevBoxes.some(([pYmin, pXmin]: number[]) => {
                        return Math.abs(xmin - pXmin) < 18 && Math.abs(ymin - pYmin) < 8;
                      });
                      if (collides || ymin < 4.5) {
                        const stagger = (idx % 2 === 1) ? 3.4 : 0;
                        labelY = Math.min(92, ymin + 3.2 + stagger); // Draw inside top of box with staggered pill badge
                      }

                      const labelText = `${p.person_id || p.track_id || `PERSON-${idx + 1}`} [${p.compliance_state || 'ASSESSED'}]`;
                      const badgeWidth = Math.min(32, Math.max(14, labelText.length * 1.15));

                      return (
                        <g key={`person-${idx}`}>
                          {/* Clean Root Person Box */}
                          <rect
                            x={`${xmin}%`}
                            y={`${ymin}%`}
                            width={`${Math.max(0, xmax - xmin)}%`}
                            height={`${Math.max(0, ymax - ymin)}%`}
                            fill={isNonCompliant ? 'rgba(239, 68, 68, 0.04)' : 'rgba(16, 185, 129, 0.04)'}
                            stroke={strokeColor}
                            strokeWidth="0.7"
                          />
                          {/* Anchored pill background for collision-free legibility */}
                          <rect
                            x={`${xmin}%`}
                            y={`${labelY - 2.4}%`}
                            width={`${badgeWidth}%`}
                            height="2.8%"
                            rx="0.4"
                            fill="rgba(10, 12, 16, 0.90)"
                            stroke={strokeColor}
                            strokeWidth="0.3"
                          />
                          <text
                            x={`${xmin + 0.6}%`}
                            y={`${labelY - 0.5}%`}
                            fill={strokeColor}
                            fontSize="2.1"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {labelText}
                          </text>
                        </g>
                      );
                    })}

                    {/* 2. Detected PPE Bounding Boxes (Solid Green Nested Evidence) */}
                    {showDetectedPpe && currentDetections.map((det: any, idx: number) => {
                      if (det.class_name === 'worker_ppe_track' || det.class === 'person') return null;
                      // Display real protective equipment evidence (exclude raw anatomical markers like ear, face)
                      const cn = (det.class_name || det.class || '').toLowerCase();
                      if (['head', 'face', 'ear', 'hands', 'foot'].includes(cn)) return null;
                      const bbox = det.bounding_box || det.bbox;
                      if (!bbox) return null;
                      const ymin = bbox.ymin ?? bbox[0];
                      const xmin = bbox.xmin ?? bbox[1];
                      const ymax = bbox.ymax ?? bbox[2];
                      const xmax = bbox.xmax ?? bbox[3];
                      const ppeLabel = `${det.class_name || det.class} (${((det.confidence || 0) * 100).toFixed(0)}%)`;
                      const ppeBadgeW = Math.min(22, Math.max(9, ppeLabel.length * 1.05));
                      return (
                        <g key={`det-${idx}`}>
                          <rect
                            x={`${xmin}%`}
                            y={`${ymin}%`}
                            width={`${Math.max(0, xmax - xmin)}%`}
                            height={`${Math.max(0, ymax - ymin)}%`}
                            fill="rgba(16, 185, 129, 0.12)"
                            stroke="#10B981"
                            strokeWidth="0.5"
                          />
                          <rect
                            x={`${xmin}%`}
                            y={`${Math.max(1, ymin - 2.2)}%`}
                            width={`${ppeBadgeW}%`}
                            height="2.2%"
                            rx="0.3"
                            fill="rgba(6, 78, 59, 0.92)"
                            stroke="#10B981"
                            strokeWidth="0.2"
                          />
                          <text
                            x={`${xmin + 0.4}%`}
                            y={`${Math.max(2.4, ymin - 0.6)}%`}
                            fill="#FFFFFF"
                            fontSize="1.8"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {ppeLabel}
                          </text>
                        </g>
                      );
                    })}

                    {/* 3. Missing PPE Expected Regions (Dashed Amber/Red — Never Disguised as Detector Box) */}
                    {showExpectedRegions && currentExpectedRegions.map((er: any, idx: number) => {
                      const bbox = er.bbox;
                      if (!bbox || bbox.length < 4) return null;
                      const [ymin, xmin, ymax, xmax] = bbox;
                      const expLabel = er.label || `[EXPECTED] ${er.item_name?.toUpperCase()} — MISSING`;
                      const expBadgeW = Math.min(28, Math.max(12, expLabel.length * 0.95));
                      return (
                        <g key={`expected-${idx}`}>
                          <rect
                            x={`${xmin}%`}
                            y={`${ymin}%`}
                            width={`${Math.max(0, xmax - xmin)}%`}
                            height={`${Math.max(0, ymax - ymin)}%`}
                            fill="rgba(239, 68, 68, 0.10)"
                            stroke="#EF4444"
                            strokeWidth="0.6"
                            strokeDasharray="2 1.5"
                          />
                          <rect
                            x={`${xmin}%`}
                            y={`${ymin + 0.4}%`}
                            width={`${expBadgeW}%`}
                            height="2.3%"
                            rx="0.3"
                            fill="rgba(69, 10, 10, 0.92)"
                            stroke="#EF4444"
                            strokeWidth="0.3"
                          />
                          <text
                            x={`${xmin + 0.4}%`}
                            y={`${ymin + 2.0}%`}
                            fill="#FCA5A5"
                            fontSize="1.7"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {expLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Viewport Overlay Badge */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-black/80 border border-white/10 text-white font-mono text-[10px] font-bold">
                    {activeView === 'KEYFRAME' && selectedKeyframe ? (
                      `FRAME #${selectedKeyframe.frame_index} (t=${selectedKeyframe.timestamp_sec.toFixed(2)}s)`
                    ) : (
                      `${file?.name} (${(file?.size! / (1024 * 1024)).toFixed(1)} MB)`
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreviewUrl(null);
                      setAnalysisResult(null);
                      setSelectedKeyframe(null);
                      setActiveView('SOURCE');
                    }}
                    className="p-1 rounded bg-black/80 border border-white/10 text-red-400 hover:text-white"
                    title="Change file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Button */}
              {!analysisResult && (
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleRunInference}
                    disabled={isProcessing}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold font-mono text-xs transition ${
                      isProcessing
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        <span>RUNNING NEURAL PPE EVALUATION ({selectedProfile})...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>EXECUTE INDUSTRIAL AI ANALYSIS</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl flex items-center gap-3 text-red-400 text-xs font-mono">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Analysis Results Display */}
          {analysisResult && (
            <div className="space-y-5 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-xs font-bold font-mono text-white tracking-wider uppercase">
                    INSPECTION COMPLIANCE REPORT ({selectedProfile})
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                  <span>Profile: <strong className="text-white">{selectedProfile}</strong></span>
                  <span>&bull;</span>
                  <span>Required Checks: <strong className="text-emerald-400">{selectedPpe.length} classes</strong></span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-slate-500">PERSONNEL DETECTED</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    {inspectionSummary?.persons_detected ?? (analysisResult.personAssessments?.length || analysisResult.totalPersonsDetected || 0)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-slate-500">PRESENT PPE</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">
                    {inspectionSummary?.present_count ?? 0}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-slate-500">MISSING PPE</div>
                  <div className={`text-base font-bold mt-0.5 ${(inspectionSummary?.missing_count || 0) > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {inspectionSummary?.missing_count ?? 0}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-slate-500">NOT ASSESSABLE</div>
                  <div className={`text-base font-bold mt-0.5 ${(inspectionSummary?.not_assessable_count || 0) > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {inspectionSummary?.not_assessable_count ?? 0}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-slate-500">OVERALL STATUS</div>
                  <div className="mt-0.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      overallStatus === 'COMPLIANT'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : overallStatus === 'NON-COMPLIANT'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : overallStatus === 'PARTIALLY_ASSESSED'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                    }`}>
                      {overallStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Factual Analysis Status Statement */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 text-xs font-mono ${
                  overallStatus === 'NON-COMPLIANT'
                    ? 'bg-red-950/30 border-red-900/60 text-red-200'
                    : overallStatus === 'PARTIALLY_ASSESSED'
                    ? 'bg-amber-950/30 border-amber-900/60 text-amber-200'
                    : overallStatus === 'NO_PERSONNEL'
                    ? 'bg-slate-900/40 border-slate-700/60 text-slate-300'
                    : 'bg-emerald-950/30 border-emerald-900/60 text-emerald-200'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {overallStatus === 'NON-COMPLIANT' ? (
                    <ShieldAlert className="w-5 h-5 text-red-400" />
                  ) : overallStatus === 'PARTIALLY_ASSESSED' ? (
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  ) : overallStatus === 'NO_PERSONNEL' ? (
                    <User className="w-5 h-5 text-slate-400" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold tracking-wide">
                    <span>
                      {overallStatus === 'NON-COMPLIANT'
                        ? `⚠ SAFETY VIOLATION DETECTED: Missing required PPE (${inspectionSummary?.missing_count || 0})`
                        : overallStatus === 'PARTIALLY_ASSESSED'
                        ? `⚠ PARTIALLY ASSESSED: ${inspectionSummary?.not_assessable_count || 0} class(es) unassessable`
                        : overallStatus === 'NO_PERSONNEL'
                        ? '○ NO PERSONNEL DETECTED'
                        : '✓ VERIFIED COMPLIANT WITH REQUIRED PROFILE'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/40 border border-white/10 uppercase font-mono">
                      {selectedProfile}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-300 leading-relaxed font-sans">
                    {inspectionSummary?.statement || vm?.analysisSummary || (
                      overallStatus === 'NO_PERSONNEL'
                        ? 'No personnel or targets were observed in the uploaded media.'
                        : 'All mandated profile items verified.'
                    )}
                  </p>
                </div>
              </div>

              {/* Per-Person Assessment Breakdown Cards */}
              {analysisResult.personAssessments && analysisResult.personAssessments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 font-bold">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      <span>EVALUATED PERSONNEL BREAKDOWN ({analysisResult.personAssessments.length})</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Truthful 5-state assessment: PRESENT &bull; MISSING &bull; NOT_ASSESSABLE &bull; NOT_REQUIRED &bull; UNSUPPORTED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analysisResult.personAssessments.map((person: any, pIdx: number) => {
                      const isCompliant = person.compliance_state === 'COMPLIANT';
                      const isPartiallyAssessed = person.compliance_state === 'PARTIALLY_ASSESSED';
                      return (
                        <div
                          key={pIdx}
                          className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3 font-mono text-xs"
                        >
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="font-bold text-white">
                                {person.person_id || `PERSON-${pIdx + 1}`}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({((person.confidence || 0.85) * 100).toFixed(1)}% conf)
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isCompliant
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : isPartiallyAssessed
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/40'
                              }`}
                            >
                              {person.compliance_state}
                            </span>
                          </div>

                          {/* List of PPE Items */}
                          <div className="space-y-1.5">
                            {person.assessments && person.assessments.map((item: any, iIdx: number) => {
                              const st = item.status;
                              return (
                                <div
                                  key={iIdx}
                                  className="flex items-start justify-between gap-2 p-1.5 rounded bg-white/[0.01] hover:bg-white/[0.03] text-[11px]"
                                >
                                  <div>
                                    <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                      <span>{item.display_name || item.item_name}</span>
                                    </div>
                                    {item.reason && (
                                      <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                                        {item.reason}
                                      </p>
                                    )}
                                  </div>
                                  <span
                                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                                      st === 'PRESENT'
                                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800'
                                        : st === 'MISSING'
                                        ? 'bg-red-950/70 text-red-400 border border-red-800'
                                        : st === 'NOT_ASSESSABLE'
                                        ? 'bg-amber-950/70 text-amber-400 border border-amber-800'
                                        : st === 'UNSUPPORTED'
                                        ? 'bg-purple-950/70 text-purple-400 border border-purple-800'
                                        : 'bg-slate-900 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    {st === 'PRESENT' ? '✓ PRESENT' :
                                     st === 'MISSING' ? '✗ MISSING' :
                                     st === 'NOT_ASSESSABLE' ? '? NOT ASSESSABLE' :
                                     st === 'UNSUPPORTED' ? '! UNSUPPORTED' : st}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Keyframe Snapshots Strip (Video Only) */}
              {analysisResult.keyframes && analysisResult.keyframes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase font-bold">
                    <span>Keyframe Snapshots ({analysisResult.keyframes.length} Captured)</span>
                    <span className="text-slate-500 font-normal">Click any snapshot to inspect in viewport</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    {analysisResult.keyframes.map((kf: any, idx: number) => {
                      const isSelected = selectedKeyframe === kf && activeView === 'KEYFRAME';
                      const hasViolations = kf.tracked_workers?.some((w: any) => w.violations && w.violations.length > 0) ||
                                            kf.detections?.some((d: any) => d.violation);
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedKeyframe(kf);
                            setActiveView('KEYFRAME');
                          }}
                          className={`shrink-0 w-40 rounded-lg overflow-hidden border cursor-pointer transition ${
                            isSelected
                              ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg'
                              : 'border-white/10 hover:border-white/40'
                          }`}
                        >
                          {kf.snapshot_base64 ? (
                            <img
                              src={kf.snapshot_base64}
                              alt={`Keyframe #${kf.frame_index}`}
                              className="w-full h-24 object-cover"
                            />
                          ) : (
                            <div className="w-full h-24 bg-black flex items-center justify-center text-[10px] font-mono text-slate-500">
                              Snapshot Unavailable
                            </div>
                          )}
                          <div className="p-1.5 bg-[#101318] text-[9px] font-mono text-slate-400 flex items-center justify-between">
                            <span>#{kf.frame_index} ({kf.timestamp_sec.toFixed(1)}s)</span>
                            <span
                              className={`font-bold px-1 rounded ${
                                hasViolations
                                  ? 'bg-red-950 text-red-400 border border-red-800'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {hasViolations ? 'VIOLATION' : `${kf.tracked_workers?.length || 0} tracks`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-white/10 flex justify-between items-center bg-black/40 font-mono text-xs">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>Authoritative SafeVision Safety Decision Pipeline &bull; DGFASLI / OSHA 1910 Grounded</span>
          </span>
          <button
            onClick={resetState}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl transition"
          >
            {analysisResult ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
