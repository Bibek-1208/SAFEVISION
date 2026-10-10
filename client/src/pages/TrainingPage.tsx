import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Database,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  FileCheck,
  ExternalLink,
  ChevronRight,
  Info,
  Play,
  Ban,
  Clock,
  Sparkles,
  RotateCcw,
  FileText,
  Activity,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const TrainingPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'datasets' | 'training' | 'modules'>('overview');

  // State
  const [activeModelData, setActiveModelData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<any[]>([]);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);
  const [selectedEvaluationReport, setSelectedEvaluationReport] = useState<any>(null);
  const [isActivatingModel, setIsActivatingModel] = useState<boolean>(false);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // SafeVision Authoritative Ontology Taxonomy
  const ONTOLOGY_TAXONOMY: Record<string, string[]> = {
    'PPE': [
      'Head Protection',
      'Eye Protection',
      'Face Protection',
      'Hearing Protection',
      'Respiratory Protection',
      'Hand Protection',
      'Body Protection',
      'Foot Protection',
      'Fall Protection',
    ],
    'PERSON': ['Worker / Human Individual'],
    'ANATOMICAL REFERENCES': ['Head', 'Face', 'Hands', 'Feet', 'Hearing Reference'],
    'HAZARD / OBJECT': ['Hand Tool', 'Electrical Object', 'Hazardous Object', 'Future Classes'],
  };

  // New PPE Class Modal
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDisplayName, setNewClassDisplayName] = useState('');
  const [newClassCategory, setNewClassCategory] = useState('PPE');
  const [newClassSubCategory, setNewClassSubCategory] = useState('Head Protection');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [newClassAliases, setNewClassAliases] = useState('');
  const [isSubmittingClass, setIsSubmittingClass] = useState(false);

  // Import Dataset Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importDir, setImportDir] = useState('ai/datasets/safevision_ppe_v1');
  const [importId, setImportId] = useState('DS-SAFEVISION-PPE-V1');
  const [importName, setImportName] = useState('SafeVision Custom Industrial PPE Dataset');
  const [importVersion, setImportVersion] = useState('1.0.0');
  const [importLicense, setImportLicense] = useState('SafeVision Proprietary (Internal Industrial Use)');
  const [importAttribution, setImportAttribution] = useState('SafeVision Telemetry Captures & On-Site Audits');
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // Selected Dataset for Audit Details
  const [selectedDatasetDetail, setSelectedDatasetDetail] = useState<any>(null);
  const [isAuditingDataset, setIsAuditingDataset] = useState(false);

  // Training Form
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('DS-SAFEVISION-PPE-V1');
  const [selectedBaseModelId, setSelectedBaseModelId] = useState<string>('MODEL-PPE-SH17-001');
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [modelRes, classesRes, datasetsRes, jobsRes, modelsListRes, pipelineRes] = await Promise.allSettled([
        api.getActiveTrainingModel(),
        api.getTrainingClasses(),
        api.getTrainingDatasets(),
        api.getTrainingJobs(),
        api.getTrainingModels(),
        api.getPipelineStatus(),
      ]);

      if (modelRes.status === 'fulfilled') setActiveModelData(modelRes.value);
      if (classesRes.status === 'fulfilled') setClasses(classesRes.value.classes || []);
      if (datasetsRes.status === 'fulfilled') {
        const dsets = datasetsRes.value.datasets || [];
        setDatasets(dsets);
        if (dsets.length > 0 && !selectedDatasetId) {
          setSelectedDatasetId(dsets[0].datasetId);
        }
      }
      if (jobsRes.status === 'fulfilled') setTrainingJobs(jobsRes.value.jobs || []);
      if (modelsListRes.status === 'fulfilled') setModelsList(modelsListRes.value.models || []);
      if (pipelineRes.status === 'fulfilled') setPipelineStatus(pipelineRes.value || null);
    } catch (err: any) {
      console.error('Failed to load training registry data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleActivateModel = async (modelId: string) => {
    setIsActivatingModel(true);
    setActionMessage(null);
    try {
      const res = await api.activateCandidateModel(modelId);
      setActionMessage({
        type: 'success',
        text: `Custom Module Activated: ${res.message || modelId}`,
      });
      fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Activation Failed: ${err.message}`,
      });
    } finally {
      setIsActivatingModel(false);
    }
  };

  const handleDeactivateModel = async (modelId: string) => {
    setIsActivatingModel(true);
    setActionMessage(null);
    try {
      const res = await api.deactivateCandidateModel(modelId);
      setActionMessage({
        type: 'info',
        text: `Module Deactivated: ${res.message || modelId}`,
      });
      fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Deactivation Failed: ${err.message}`,
      });
    } finally {
      setIsActivatingModel(false);
    }
  };

  const handleRollbackBaseline = async () => {
    if (!window.confirm('Are you sure you want to rollback to the Protected Baseline? All active custom modules will be safely unloaded.')) return;
    setIsRollingBack(true);
    setActionMessage(null);
    try {
      const res = await api.rollbackToBaseline();
      setActionMessage({
        type: 'success',
        text: `Rollback Completed: ${res.message || 'Pure protected baseline restored.'}`,
      });
      fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Rollback Failed: ${err.message}`,
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const getLifecycleBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            APPROVED
          </span>
        );
      case 'NO_TRAINING_DATA':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            NO_TRAINING_DATA
          </span>
        );
      case 'DATA_READY':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            DATA_READY
          </span>
        );
      case 'QUALITY_CHECKING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            QUALITY_CHECKING
          </span>
        );
      case 'QUALITY_BLOCKED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            QUALITY_BLOCKED
          </span>
        );
      case 'TRAINING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            TRAINING
          </span>
        );
      case 'EVALUATING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            EVALUATING
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            REJECTED
          </span>
        );
      case 'DEACTIVATED':
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  const handleCreatePPEClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassDisplayName.trim()) return;

    setIsSubmittingClass(true);
    setActionMessage(null);
    try {
      const aliasesList = newClassAliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await api.createTrainingClass({
        name: newClassName.trim().toLowerCase(),
        displayName: newClassDisplayName.trim(),
        category: newClassCategory,
        subCategory: newClassSubCategory,
        description: newClassDescription.trim(),
        aliases: aliasesList,
      });

      setActionMessage({
        type: 'info',
        text: `${res.disclaimer} Class ID: ${res.class?.id}`,
      });

      setIsAddClassModalOpen(false);
      setNewClassName('');
      setNewClassDisplayName('');
      setNewClassDescription('');
      setNewClassAliases('');
      await fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to create PPE class',
      });
    } finally {
      setIsSubmittingClass(false);
    }
  };

  const handleImportDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingImport(true);
    setActionMessage(null);
    try {
      const res = await api.importTrainingDataset({
        sourceDir: importDir,
        datasetId: importId,
        datasetName: importName,
        version: importVersion,
        license: importLicense,
        attribution: importAttribution,
      });

      setActionMessage({
        type: 'success',
        text: `Dataset '${res.dataset?.datasetName}' registered successfully. Quality Gate status: ${res.dataset?.qualityGateStatus}`,
      });

      setIsImportModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Dataset import failed',
      });
    } finally {
      setIsSubmittingImport(false);
    }
  };

  const handleAuditDataset = async (id: string) => {
    setIsAuditingDataset(true);
    setActionMessage(null);
    try {
      const res = await api.auditTrainingDataset(id);
      setSelectedDatasetDetail(res.dataset);
      setActionMessage({
        type: res.report?.passed ? 'success' : 'error',
        text: `Audit finished: ${res.report?.status}. Found ${res.report?.blockers_count} blockers, ${res.report?.warnings_count} warnings.`,
      });
      await fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to audit dataset',
      });
    } finally {
      setIsAuditingDataset(false);
    }
  };

  const handleQueueTrainingJob = async () => {
    const activeDataset = datasets.find((d) => d.datasetId === selectedDatasetId);
    if (!activeDataset) return;

    if (activeDataset.status === 'BLOCKED' || activeDataset.qualityGateStatus === 'BLOCKED') {
      setActionMessage({
        type: 'error',
        text: 'TRAINING BLOCKED: Cannot train on a BLOCKED dataset. Resolve all quality gate blockers first.',
      });
      return;
    }

    setIsSubmittingJob(true);
    setActionMessage(null);
    try {
      const res = await api.createTrainingJob({
        datasetId: selectedDatasetId,
        baseModelId: selectedBaseModelId,
      });

      setActionMessage({
        type: 'success',
        text: res.message || 'Training candidate queued. (Architecture preparation only: no training in Phase 12.2)',
      });
      await fetchData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to queue training candidate',
      });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const currentSelectedDataset = datasets.find((d) => d.datasetId === selectedDatasetId);
  const isSelectedDatasetBlocked =
    !currentSelectedDataset ||
    currentSelectedDataset.status === 'BLOCKED' ||
    currentSelectedDataset.qualityGateStatus === 'BLOCKED';

  return (
    <div className="min-h-screen bg-[#0d0f12] text-slate-200 p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Cpu className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                SafeVision AI Training & PPE Registry
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  PHASE 12.2 ARCHITECTURE
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Decoupled Dynamic PPE Class Registry • Dataset Provenance • 9-Category Quality Gate • Baseline Preservation
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsAddClassModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add PPE Class
          </button>
        </div>
      </div>

      {/* Action Notifications */}
      {actionMessage && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
            actionMessage.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          }`}
        >
          {actionMessage.type === 'error' ? (
            <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
          ) : actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 flex-shrink-0 text-blue-400 mt-0.5" />
          )}
          <div className="whitespace-pre-line leading-relaxed">{actionMessage.text}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {[
          { key: 'overview', label: 'Active Model & Architecture', icon: Cpu },
          { key: 'modules', label: `Baseline & Modules (${modelsList.length || 1})`, icon: ShieldCheck },
          { key: 'classes', label: `PPE Classes (${classes.length})`, icon: Tag },
          { key: 'datasets', label: `Datasets (${datasets.length})`, icon: Database },
          { key: 'training', label: 'Model Training Preparation', icon: Play },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-[2px] ${
                isActive
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW / ACTIVE MODEL */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Model Status Card */}
          <div className="lg:col-span-2 bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">Active Production Baseline Model</h2>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                STATUS: DEPLOYED & UNTOUCHED
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#0a0c0e] p-3 rounded-lg border border-slate-800/60 space-y-1.5">
                <span className="text-slate-400 uppercase tracking-wider font-mono">Model Identity</span>
                <p className="font-semibold text-slate-200 text-sm">
                  {activeModelData?.activeModel?.modelName || 'SafeVision Industrial PPE Detector (SH17 Architecture)'}
                </p>
                <p className="text-slate-400 font-mono">
                  ID: <span className="text-emerald-400">{activeModelData?.activeModel?.modelId || 'MODEL-PPE-SH17-001'}</span>
                </p>
                <p className="text-slate-400 font-mono">
                  Version: <span className="text-blue-400">{activeModelData?.activeModel?.modelVersion || '1.0.0'}</span>
                </p>
              </div>

              <div className="bg-[#0a0c0e] p-3 rounded-lg border border-slate-800/60 space-y-1.5">
                <span className="text-slate-400 uppercase tracking-wider font-mono">Physical Weights Protection</span>
                <p className="font-mono text-emerald-400 text-xs">
                  {activeModelData?.baselineModelPath || 'ai/models/industrial_yolov8.pt'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono break-all">
                  SHA256: {activeModelData?.baselineChecksum || 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62'}
                </p>
                <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                  Preserved as permanent fallback/rollback anchor
                </p>
              </div>
            </div>

            {/* Decoupled Class Manifest */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                  Decoupled Model Output Manifest (Index $\rightarrow$ SafeVision ID)
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {activeModelData?.classManifest?.manifest_entries?.length || 17} Registered Indices
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-[#0a0c0e] rounded-lg border border-slate-800/60">
                {(activeModelData?.classManifest?.manifest_entries || []).map((entry: any) => (
                  <div
                    key={entry.modelIndex}
                    className="p-2 rounded bg-slate-900/50 border border-slate-800 text-xs font-mono flex items-center justify-between"
                  >
                    <span className="text-slate-400">idx {entry.modelIndex}:</span>
                    <span className="text-emerald-400 font-semibold">{entry.safeVisionClassId}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Architecture Rules Card */}
          <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              Non-Negotiable Pipeline Rules
            </h2>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Zero Training in Phase 12.2:</strong> Data pipeline and architectural registry only. No weights modified.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Dynamic Registry:</strong> Adding PPE classes does not require touching detector code or policy engines.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <span>
                  <strong>Quality Gate Enforcement:</strong> If val/test splits have 0 annotations, training candidate creation is blocked by backend.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <span>
                  <strong>No Synthetic Data:</strong> Strict adherence to verifiable evidence; 0 synthetic incidents or fake metrics.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: PPE CLASSES */}
      {activeTab === 'classes' && (
        <div className="bg-[#12151a] rounded-xl border border-slate-800 overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white">SafeVision Authoritative PPE Class Registry</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Single source of truth with stable <code className="text-emerald-400">SV-PPE-xxx</code> identifiers.
              </p>
            </div>
            <button
              onClick={() => setIsAddClassModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New PPE Class
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0a0c0e] text-slate-400 uppercase font-mono tracking-wider border-y border-slate-800">
                <tr>
                  <th className="py-3 px-4">Stable ID</th>
                  <th className="py-3 px-4">Class Name</th>
                  <th className="py-3 px-4">Display Name</th>
                  <th className="py-3 px-4">Ontology Domain</th>
                  <th className="py-3 px-4">Sub-Category</th>
                  <th className="py-3 px-4">Lifecycle Status</th>
                  <th className="py-3 px-4">Aliases</th>
                  <th className="py-3 px-4">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {classes.map((cls) => {
                  const isActive = cls.active;
                  const isDetectedInModel =
                    activeModelData?.classManifest?.manifest_entries?.some(
                      (e: any) => e.safeVisionClassId === cls.id
                    );

                  return (
                    <tr key={cls.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4 text-emerald-400 font-bold">{cls.id}</td>
                      <td className="py-3 px-4 text-slate-200 font-semibold">{cls.name}</td>
                      <td className="py-3 px-4 text-white">{cls.displayName}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                          {cls.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {cls.subCategory ? (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-900 text-cyan-400 border border-cyan-500/20">
                            {cls.subCategory}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {getLifecycleBadge(cls.status)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                        {(cls.aliases || []).join(', ') || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            isActive ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DATASETS */}
      {activeTab === 'datasets' && (
        <div className="space-y-6">
          <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-white">Registered PPE Datasets & Provenance</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Provenance tracking, verified licenses, and 9-category deterministic Quality Gate results.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  <Database className="w-3.5 h-3.5" />
                  Import Dataset
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0a0c0e] text-slate-400 uppercase font-mono tracking-wider border-y border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Dataset ID</th>
                    <th className="py-3 px-4">Name & Version</th>
                    <th className="py-3 px-4">License & Attribution</th>
                    <th className="py-3 px-4">Images / Instances</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Quality Gate</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {datasets.map((ds) => {
                    const isBlocked = ds.qualityGateStatus === 'BLOCKED' || ds.status === 'BLOCKED';
                    return (
                      <tr key={ds.datasetId} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 text-emerald-400 font-bold">{ds.datasetId}</td>
                        <td className="py-3 px-4">
                          <div className="text-white font-semibold font-sans">{ds.datasetName}</div>
                          <div className="text-slate-400 text-[11px]">v{ds.version}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div
                            className={`text-[11px] font-semibold ${
                              ds.license === 'UNKNOWN' ? 'text-red-400' : 'text-slate-200'
                            }`}
                          >
                            {ds.license}
                          </div>
                          <div className="text-slate-400 text-[10px] truncate">{ds.attribution}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {ds.imageCount} imgs / {ds.annotationCount} boxes
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {ds.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 w-max ${
                              isBlocked
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isBlocked ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {ds.qualityGateStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAuditDataset(ds.datasetId)}
                              disabled={isAuditingDataset}
                              className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                            >
                              Run Audit
                            </button>
                            <button
                              onClick={() => setSelectedDatasetDetail(ds)}
                              className="px-2.5 py-1 text-[11px] rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition"
                            >
                              Audit Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quality Gate Audit Detail Drawer/Card */}
          {selectedDatasetDetail && (
            <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Quality Gate Diagnostic Report: {selectedDatasetDetail.datasetName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedDatasetDetail(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              {selectedDatasetDetail.qualityGateReport ? (
                <div className="space-y-4 text-xs">
                  {/* Blockers */}
                  <div className="space-y-1.5">
                    <span className="font-semibold text-red-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <Ban className="w-4 h-4" />
                      Critical Blockers ({selectedDatasetDetail.qualityGateReport.blockers?.length || 0})
                    </span>
                    {(selectedDatasetDetail.qualityGateReport.blockers || []).length > 0 ? (
                      <div className="space-y-1 bg-red-950/20 p-3 rounded-lg border border-red-500/30">
                        {selectedDatasetDetail.qualityGateReport.blockers.map((b: string, i: number) => (
                          <div key={i} className="text-red-300 font-mono flex items-start gap-2">
                            <span className="text-red-400 font-bold">•</span>
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-emerald-400 font-mono bg-emerald-950/20 p-2 rounded">
                        No blockers detected. Dataset passes Quality Gate.
                      </div>
                    )}
                  </div>

                  {/* Split Statistics */}
                  {selectedDatasetDetail.qualityGateReport.split_statistics && (
                    <div className="space-y-2">
                      <span className="font-semibold text-slate-300 uppercase font-mono tracking-wider">
                        Split Breakdown & Unreviewed Empty Inspection
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {['train', 'val', 'test'].map((split) => {
                          const stats = selectedDatasetDetail.qualityGateReport.split_statistics;
                          const imgs = stats.images?.[split] || 0;
                          const annotated = stats.annotated?.[split] || 0;
                          const empty = stats.empty?.[split] || 0;
                          const instances = stats.instances?.[split] || 0;

                          return (
                            <div key={split} className="bg-[#0a0c0e] p-3 rounded-lg border border-slate-800 space-y-1">
                              <div className="font-bold uppercase text-white font-mono">{split} Split</div>
                              <div className="text-slate-400">Total Images: <span className="text-slate-200">{imgs}</span></div>
                              <div className="text-slate-400">Annotated: <span className="text-emerald-400">{annotated}</span></div>
                              <div className="text-slate-400">Empty: <span className="text-amber-400">{empty}</span></div>
                              <div className="text-slate-400">Instances: <span className="text-blue-400">{instances}</span></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-mono">No audit report generated yet. Click "Run Audit".</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: TRAINING */}
      {activeTab === 'training' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" />
                Training Candidate Configuration
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Prepare immutable training configuration. Requires clean dataset with passing Quality Gate.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-mono uppercase tracking-wider mb-1.5">
                  Select Training Dataset:
                </label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                >
                  {datasets.map((d) => (
                    <option key={d.datasetId} value={d.datasetId}>
                      {d.datasetId} — {d.datasetName} ({d.qualityGateStatus})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-mono uppercase tracking-wider mb-1.5">
                  Select Base Architecture:
                </label>
                <select
                  value={selectedBaseModelId}
                  onChange={(e) => setSelectedBaseModelId(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                >
                  <option value="MODEL-PPE-SH17-001">MODEL-PPE-SH17-001 (YOLOv8 Industrial Baseline)</option>
                  <option value="MODEL-PPE-RFDETR-002">MODEL-PPE-RFDETR-002 (RF-DETR + ByteTrack Suite)</option>
                </select>
              </div>

              {/* Strict Quality Gate Enforcer Card */}
              {isSelectedDatasetBlocked ? (
                <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 text-red-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-red-400">
                    <Ban className="w-4 h-4 flex-shrink-0" />
                    [Train Candidate] Action is Strictly Disabled
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    The chosen dataset <code>{selectedDatasetId}</code> is marked <strong>BLOCKED</strong>.
                    Validation loss and mAP evaluation cannot be calculated on an unannotated or imbalanced validation split.
                    To enable model training in future phases, annotations must be completed and audited.
                  </p>
                  {currentSelectedDataset?.qualityGateReport?.blockers && (
                    <ul className="list-disc list-inside text-[11px] space-y-1 pt-1 font-mono text-red-200">
                      {currentSelectedDataset.qualityGateReport.blockers.map((b: string, i: number) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-bold">Dataset is READY for Training Candidate Scheduling.</span>
                    <p className="text-[11px] text-emerald-200">Quality gate has verified image integrity, annotations, and split balance.</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleQueueTrainingJob}
                disabled={isSelectedDatasetBlocked || isSubmittingJob}
                className={`w-full py-3 rounded-lg font-semibold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 ${
                  isSelectedDatasetBlocked
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50'
                }`}
              >
                <Play className="w-4 h-4" />
                {isSelectedDatasetBlocked ? 'Training Blocked by Quality Gate' : 'Queue Training Candidate Job'}
              </button>
            </div>
          </div>

          {/* Training Queue & Job History */}
          <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Scheduled Training Pipeline Jobs
            </h3>
            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {trainingJobs.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono p-4 text-center border border-dashed border-slate-800 rounded-lg">
                  No training jobs queued.
                </div>
              ) : (
                trainingJobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="p-3 rounded-lg bg-[#0a0c0e] border border-slate-800 text-xs font-mono space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{job.jobId}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {job.status}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Dataset: <span className="text-emerald-400">{job.datasetId}</span>
                    </div>
                    <div className="text-slate-500 text-[10px]">
                      Created: {new Date(job.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PROTECTED BASELINE & INCREMENTAL CUSTOM MODULES */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          {/* Pipeline Architecture Header Card */}
          <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      Protected Baseline + Incremental Custom Module Architecture
                    </h2>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Baseline detector (17 classes) remains permanent anchor • New classes trained & evaluated independently • Unified inference output
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleRollbackBaseline}
                  disabled={isRollingBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs font-semibold transition"
                  title="Unload all custom detector modules and return to pure protected baseline"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRollingBack ? 'animate-spin' : ''}`} />
                  Rollback to Pure Baseline
                </button>
              </div>
            </div>

            {/* Pipeline Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-[#0a0c0e] p-3.5 rounded-lg border border-slate-800/80 space-y-1.5">
                <span className="text-slate-400 uppercase tracking-wider text-[11px]">Protected Baseline</span>
                <p className="font-bold text-emerald-400 text-sm">MODEL-PPE-BASELINE-SH17</p>
                <p className="text-slate-300">17 Authoritative Classes</p>
                <p className="text-[10px] text-slate-500 truncate" title="ai/models/industrial_yolov8.pt">
                  ai/models/industrial_yolov8.pt
                </p>
                <div className="pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    PROTECTED_BASELINE
                  </span>
                </div>
              </div>

              <div className="bg-[#0a0c0e] p-3.5 rounded-lg border border-slate-800/80 space-y-1.5">
                <span className="text-slate-400 uppercase tracking-wider text-[11px]">Custom Detector Modules</span>
                <p className="font-bold text-blue-400 text-sm">
                  {pipelineStatus?.custom_modules_count || 0} Active Modules
                </p>
                <p className="text-slate-300">
                  Total Supported: {17 + (pipelineStatus?.custom_modules_count || 0)} Classes
                </p>
                <p className="text-[10px] text-slate-500">
                  Inference Isolation: Active
                </p>
                <div className="pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    UNIFIED DETECTION LAYER
                  </span>
                </div>
              </div>

              <div className="bg-[#0a0c0e] p-3.5 rounded-lg border border-slate-800/80 space-y-1.5">
                <span className="text-slate-400 uppercase tracking-wider text-[11px]">Hardware & VRAM Awareness</span>
                <p className="font-bold text-amber-400 text-sm">
                  {pipelineStatus?.hardware?.gpu_name || pipelineStatus?.device || 'CPU Inference'}
                </p>
                <p className="text-slate-300">Sequential Custom Inference</p>
                <p className="text-[10px] text-slate-500">RTX 2050 (4GB VRAM) Protected • Graceful CPU Fallback</p>
                <div className="pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    RESOURCE MANAGED
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Registry & Versioned Records */}
          <div className="bg-[#12151a] rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Model Registry & Candidate Lifecycles
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Every model artifact is versioned with SHA256 checksum and regression audit history.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0a0c0e] text-slate-400 uppercase tracking-wider border-y border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Model ID</th>
                    <th className="py-3 px-4">Model Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Target Class(es)</th>
                    <th className="py-3 px-4">SHA256 Checksum</th>
                    <th className="py-3 px-4">Evaluation / Regression</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {modelsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Loading model registry records...
                      </td>
                    </tr>
                  ) : (
                    modelsList.map((m) => {
                      const isBaseline = m.isProtected || m.modelId === 'MODEL-PPE-BASELINE-SH17';
                      const isApproved = m.status === 'APPROVED';
                      const isActive = m.status === 'ACTIVE' || m.deploymentStatus === 'ACTIVE';
                      const hasEval = !!(m.evaluationReport || m.regressionReport);

                      return (
                        <tr key={m.modelId} className="hover:bg-slate-900/40 transition">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-1.5">
                            {isBaseline && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                            {m.modelId}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {isBaseline ? 'PROTECTED_BASELINE' : m.modelType || 'INCREMENTAL_CUSTOM_MODULE'}
                          </td>
                          <td className="py-3 px-4">
                            {getLifecycleBadge(m.status || m.deploymentStatus)}
                          </td>
                          <td className="py-3 px-4 text-emerald-400">
                            {isBaseline ? '17 SH17 Baseline Classes' : (m.addedClassIds || []).join(', ') || 'Custom PPE'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={m.weightsChecksum || m.modelHash}>
                            {(m.weightsChecksum || m.modelHash || '—').substring(0, 20)}...
                          </td>
                          <td className="py-3 px-4">
                            {isBaseline ? (
                              <span className="text-slate-500">Authoritative Baseline</span>
                            ) : hasEval ? (
                              <button
                                onClick={() => setSelectedEvaluationReport(m.evaluationReport || m)}
                                className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1 text-[11px]"
                              >
                                <FileText className="w-3 h-3" />
                                View Regression Report
                              </button>
                            ) : (
                              <span className="text-slate-500">Not Evaluated</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isBaseline ? (
                              <span className="text-xs text-slate-500">Protected</span>
                            ) : isApproved ? (
                              <button
                                onClick={() => handleActivateModel(m.modelId)}
                                disabled={isActivatingModel}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition"
                              >
                                Activate
                              </button>
                            ) : isActive ? (
                              <button
                                onClick={() => handleDeactivateModel(m.modelId)}
                                disabled={isActivatingModel}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] border border-slate-700 transition"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Requires Gate Approval</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANDIDATE EVALUATION & REGRESSION REPORT */}
      {selectedEvaluationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-[#12151a] border border-slate-800 rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Candidate Acceptance Gate & Old-Class Regression Report
              </h3>
              <button
                onClick={() => setSelectedEvaluationReport(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Candidate Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono bg-[#0a0c0e] p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500">Candidate ID</span>
                <p className="font-bold text-white">{selectedEvaluationReport.candidateId || selectedEvaluationReport.modelId}</p>
              </div>
              <div>
                <span className="text-slate-500">Target Class</span>
                <p className="font-bold text-emerald-400">{selectedEvaluationReport.targetClassId || selectedEvaluationReport.addedClassIds?.[0] || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">Gate Verdict</span>
                <div className="pt-0.5">{getLifecycleBadge(selectedEvaluationReport.status || 'EVALUATED')}</div>
              </div>
              <div>
                <span className="text-slate-500">Evaluated At</span>
                <p className="text-slate-300">{selectedEvaluationReport.evaluatedAt || 'Recent'}</p>
              </div>
            </div>

            {/* New Class Metrics */}
            {selectedEvaluationReport.newClassMetrics && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  New Class Metrics (Held-Out Labelled Split)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono bg-[#0a0c0e] p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-500">Precision:</span>{' '}
                    <span className="text-white font-bold">{selectedEvaluationReport.newClassMetrics.precision ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Recall:</span>{' '}
                    <span className="text-white font-bold">{selectedEvaluationReport.newClassMetrics.recall ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">mAP50:</span>{' '}
                    <span className="text-emerald-400 font-bold">{selectedEvaluationReport.newClassMetrics.mAP50 ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Latency:</span>{' '}
                    <span className="text-cyan-400 font-bold">{selectedEvaluationReport.newClassMetrics.latency_ms ?? 0}ms</span>
                  </div>
                </div>
              </div>
            )}

            {/* Old-Class Regression Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  Protected Baseline Old-Class Regression Audit
                </h4>
                <span className="text-[11px] text-amber-400/90 font-mono">
                  Section 10: Missing GT classes are NOT marked PASS
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#0a0c0e] text-slate-400 uppercase tracking-wider border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Class</th>
                      <th className="py-2 px-3">SafeVision ID</th>
                      <th className="py-2 px-3">GT Status</th>
                      <th className="py-2 px-3">Baseline mAP</th>
                      <th className="py-2 px-3">Candidate mAP</th>
                      <th className="py-2 px-3">Delta Drop</th>
                      <th className="py-2 px-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(selectedEvaluationReport.regressionReport?.classes_report || []).map((cr: any) => (
                      <tr key={cr.class_name} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 text-white font-bold">{cr.class_name}</td>
                        <td className="py-2 px-3 text-emerald-400">{cr.safe_vision_class_id}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              cr.evaluation_status === 'AVAILABLE_FOR_EVALUATION'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {cr.evaluation_status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{cr.baseline_mAP50 !== null ? cr.baseline_mAP50 : '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{cr.candidate_mAP50 !== null ? cr.candidate_mAP50 : '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{cr.mAP_delta_drop_pct !== null ? `${cr.mAP_delta_drop_pct}%` : '—'}</td>
                        <td className="py-2 px-3 font-bold">
                          {cr.verdict === 'PASS' ? (
                            <span className="text-emerald-400">PASS</span>
                          ) : cr.verdict === 'REGRESSION_EXCEEDED' ? (
                            <span className="text-red-400">REGRESSION EXCEEDED</span>
                          ) : (
                            <span className="text-slate-500">INSUFFICIENT GT</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedEvaluationReport(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PPE CLASS */}
      {isAddClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="bg-[#12151a] border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-400" />
                Add New PPE Class
              </h3>
              <button
                onClick={() => setIsAddClassModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePPEClass} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Class Identifier Name (slug)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. respirator"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Human Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Industrial Respirator"
                  value={newClassDisplayName}
                  onChange={(e) => setNewClassDisplayName(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-mono uppercase mb-1">Ontology Domain</label>
                  <select
                    value={newClassCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setNewClassCategory(newCat);
                      setNewClassSubCategory(ONTOLOGY_TAXONOMY[newCat]?.[0] || '');
                    }}
                    className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    <option value="PPE">PPE (Protective Equipment)</option>
                    <option value="PERSON">PERSON</option>
                    <option value="ANATOMICAL REFERENCES">ANATOMICAL REFERENCES</option>
                    <option value="HAZARD / OBJECT">HAZARD / OBJECT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-mono uppercase mb-1">Sub-Category</label>
                  <select
                    value={newClassSubCategory}
                    onChange={(e) => setNewClassSubCategory(e.target.value)}
                    className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    {(ONTOLOGY_TAXONOMY[newClassCategory] || []).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Full-face or half-face respiratory protection"
                  value={newClassDescription}
                  onChange={(e) => setNewClassDescription(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Aliases (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. n95, breathing mask, respirator"
                  value={newClassAliases}
                  onChange={(e) => setNewClassAliases(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                <strong>Important:</strong> Creating this class registers the metadata only. Labelled training data and future model training are required before this PPE can be detected.
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddClassModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClass}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                >
                  {isSubmittingClass ? 'Creating...' : 'Create PPE Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT DATASET */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="bg-[#12151a] border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                Import YOLO PPE Dataset
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportDataset} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Dataset Directory (relative to workspace)</label>
                <input
                  type="text"
                  required
                  value={importDir}
                  onChange={(e) => setImportDir(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-mono uppercase mb-1">Dataset ID</label>
                  <input
                    type="text"
                    required
                    value={importId}
                    onChange={(e) => setImportId(e.target.value)}
                    className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-mono uppercase mb-1">Version</label>
                  <input
                    type="text"
                    required
                    value={importVersion}
                    onChange={(e) => setImportVersion(e.target.value)}
                    className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Dataset Name</label>
                <input
                  type="text"
                  required
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">License</label>
                <input
                  type="text"
                  required
                  value={importLicense}
                  onChange={(e) => setImportLicense(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono uppercase mb-1">Attribution & Provenance</label>
                <input
                  type="text"
                  value={importAttribution}
                  onChange={(e) => setImportAttribution(e.target.value)}
                  className="w-full bg-[#0a0c0e] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingImport}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
                >
                  {isSubmittingImport ? 'Importing...' : 'Register Dataset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
