import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  Search,
  Filter,
  Download,
  Calendar,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Radio,
  Check,
  UserCheck,
  Clock,
  Camera,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Flame,
  FileText,
  Activity,
  Layers,
  Send,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { Incident, Zone } from '../types';
import { useSite } from '../context/SiteContext';
import { useSocket } from '../context/SocketContext';
import { IncidentProofModal } from '../components/incidents/IncidentProofModal';
import { FalsePositiveModal } from '../components/incidents/FalsePositiveModal';

type FilterTab =
  | 'ALL'
  | 'ACTIVE'
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'UNASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN PROGRESS'
  | 'RESOLVED';

export const IncidentsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentSite } = useSite();
  const { socket } = useSocket();

  // Navigation & State
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState('All Zones');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Evidence & Workspace Sub-tab
  const [workspaceTab, setWorkspaceTab] = useState<'evidence' | 'explainability' | 'timeline'>('evidence');
  const [evidenceBlobUrl, setEvidenceBlobUrl] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Modals & Action States
  const [showProofModal, setShowProofModal] = useState(false);
  const [showFalsePositiveModal, setShowFalsePositiveModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [showResolvePrompt, setShowResolvePrompt] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Sync searchQuery from URL param
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch !== null && urlSearch !== searchQuery) {
      setSearchQuery(urlSearch);
    }
  }, [searchParams]);

  // Load zones on mount
  useEffect(() => {
    api.getZones()
      .then((res) => setZones(res.zones || []))
      .catch((err) => console.error('Failed to load zones for incident filter', err));
  }, []);

  // Compute status & severity filters based on activeTab
  const queryFilters = useMemo(() => {
    let status: string | undefined = undefined;
    let severity: string | undefined = undefined;

    switch (activeTab) {
      case 'ALL':
        break;
      case 'ACTIVE':
        status = 'ACTIVE';
        break;
      case 'CRITICAL':
        severity = 'critical';
        break;
      case 'HIGH':
        severity = 'high';
        break;
      case 'MEDIUM':
        severity = 'medium';
        break;
      case 'LOW':
        severity = 'low';
        break;
      case 'UNASSIGNED':
        status = 'DETECTED';
        break;
      case 'ACKNOWLEDGED':
        status = 'ACKNOWLEDGED';
        break;
      case 'IN PROGRESS':
        status = 'DISPATCHED';
        break;
      case 'RESOLVED':
        status = 'RESOLVED';
        break;
    }

    return { status, severity };
  }, [activeTab]);

  const fetchIncidents = async () => {
    setIsLoading(true);
    try {
      const res = await api.getIncidents({
        zone: selectedZone !== 'All Zones' ? selectedZone : undefined,
        severity: queryFilters.severity,
        status: queryFilters.status !== 'ACTIVE' ? queryFilters.status : undefined,
        search: searchQuery.trim() || undefined,
        limit: 15,
        offset: (currentPage - 1) * 15,
      });

      let list = Array.isArray(res?.incidents) ? res.incidents : [];

      // Local client-side refinement for ACTIVE tab
      if (activeTab === 'ACTIVE') {
        list = list.filter(
          (i) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
        );
      }

      setIncidents(list);
      setTotalCount(res?.total ?? list.length);

      // Keep selected incident synced or auto-select first
      if (list.length > 0) {
        if (!selectedIncident || !list.some((i) => i.id === selectedIncident.id)) {
          setSelectedIncident(list[0]);
        } else {
          const fresh = list.find((i) => i.id === selectedIncident.id);
          if (fresh) setSelectedIncident(fresh);
        }
      } else {
        setSelectedIncident(null);
      }
    } catch (err) {
      console.error('[IncidentsPage] fetch error:', err);
      setIncidents([]);
      setTotalCount(0);
      setSelectedIncident(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [activeTab, selectedZone, searchQuery, currentPage, currentSite?.id]);

  // Real-time socket sync
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchIncidents();
    };
    socket.on('incident.created', handleUpdate);
    socket.on('incident.updated', handleUpdate);
    socket.on('incident:new', handleUpdate);
    socket.on('incident.status', handleUpdate);

    return () => {
      socket.off('incident.created', handleUpdate);
      socket.off('incident.updated', handleUpdate);
      socket.off('incident:new', handleUpdate);
      socket.off('incident.status', handleUpdate);
    };
  }, [socket]);

  // Load evidence blob for right pane workspace
  useEffect(() => {
    let isMounted = true;
    let urlToRevoke: string | null = null;

    async function loadEvidence() {
      if (!selectedIncident) {
        setEvidenceBlobUrl(null);
        setEvidenceLoading(false);
        return;
      }

      setEvidenceLoading(true);
      setEvidenceError(null);

      if (selectedIncident.evidenceImage && selectedIncident.evidenceImage.startsWith('data:image/')) {
        setEvidenceBlobUrl(selectedIncident.evidenceImage);
        setEvidenceLoading(false);
        return;
      }

      try {
        const blob = await api.getIncidentEvidenceBlob(selectedIncident.id);
        if (isMounted) {
          const objUrl = URL.createObjectURL(blob);
          urlToRevoke = objUrl;
          setEvidenceBlobUrl(objUrl);
          setEvidenceLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setEvidenceError(err.message || 'Evidence snapshot unavailable');
          setEvidenceLoading(false);
        }
      }
    }

    loadEvidence();

    return () => {
      isMounted = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [selectedIncident?.id]);

  // Workflow Action Handlers
  const handleAcknowledge = async () => {
    if (!selectedIncident) return;
    setIsActionLoading(true);
    setActionSuccessMessage(null);
    try {
      await api.updateIncidentStatus(selectedIncident.id, 'ACKNOWLEDGED', 'Acknowledged by operator in operational workspace');
      setActionSuccessMessage('Incident acknowledged successfully');
      fetchIncidents();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => setActionSuccessMessage(null), 3000);
    }
  };

  const handleSetInProgress = async () => {
    if (!selectedIncident) return;
    setIsActionLoading(true);
    setActionSuccessMessage(null);
    try {
      await api.updateIncidentStatus(selectedIncident.id, 'DISPATCHED', 'Investigation / mitigation in progress');
      setActionSuccessMessage('Incident marked IN PROGRESS / DISPATCHED');
      fetchIncidents();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => setActionSuccessMessage(null), 3000);
    }
  };

  const handleResolve = async () => {
    if (!selectedIncident) return;
    setIsActionLoading(true);
    setActionSuccessMessage(null);
    try {
      await api.updateIncidentStatus(
        selectedIncident.id,
        'RESOLVED',
        undefined,
        resolveNotes.trim() || 'Mitigated and verified compliant by operator'
      );
      setShowResolvePrompt(false);
      setResolveNotes('');
      setActionSuccessMessage('Incident marked RESOLVED');
      fetchIncidents();
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => setActionSuccessMessage(null), 3000);
    }
  };

  const exportCSV = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      await api.downloadIncidentsCsv({
        siteId: currentSite?.id,
        violationType: undefined,
        severity: queryFilters.severity,
        status: queryFilters.status !== 'ACTIVE' ? queryFilters.status : undefined,
        zone: selectedZone !== 'All Zones' ? selectedZone : undefined,
        search: searchQuery.trim() || undefined,
      });
      setExportMessage('CSV exported successfully.');
      setTimeout(() => setExportMessage(null), 3000);
    } catch (err: any) {
      setExportMessage(err.message || 'CSV export failed.');
      setTimeout(() => setExportMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const tabOptions: FilterTab[] = [
    'ALL',
    'ACTIVE',
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'UNASSIGNED',
    'ACKNOWLEDGED',
    'IN PROGRESS',
    'RESOLVED',
  ];

  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto text-slate-100 select-none pb-12 font-mono">
      {/* Top Header & Mission Bar */}
      <div className="bg-[#141720] border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">
                INCIDENT COMMAND & OPERATIONAL WORKSPACE
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 font-bold">
                {totalCount} TOTAL RECORDED
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live statutory breach roster, forensic evidence inspection, and mitigation command console.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {exportMessage && (
            <span className="text-xs text-emerald-400 animate-fadeIn">{exportMessage}</span>
          )}
          <button
            onClick={exportCSV}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Structured Operational Workspace: Split-Pane Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Pane: Authoritative Incident Roster & Filter Matrix (col-span-5) */}
        <div className="lg:col-span-5 bg-[#141720] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3.5">
          {/* Filter Tabs Strip */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-white/10">
            {tabOptions.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider transition ${
                    isActive
                      ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Search & Zone Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-2 text-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search incident, worker, camera..."
                className="w-full bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl pl-9 pr-3 py-1.5 text-slate-200 placeholder-slate-500 outline-none text-xs"
              />
            </div>
            <select
              value={selectedZone}
              onChange={(e) => {
                setSelectedZone(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto bg-[#101318] border border-white/10 focus:border-emerald-500/50 rounded-xl px-2.5 py-1.5 text-slate-300 outline-none text-xs"
            >
              <option value="All Zones">All Hazard Zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.name}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Incidents List Roster */}
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs">Synchronizing incident logs...</span>
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center p-8 bg-[#101318] border border-white/5 rounded-xl text-slate-400 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-bold text-slate-300">No matching incidents found</p>
                <p className="text-[11px] text-slate-500">
                  {activeTab !== 'ALL' ? `No records under filter '${activeTab}'.` : 'Surveillance perimeter is clear.'}
                </p>
              </div>
            ) : (
              incidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id;
                const isCrit = inc.severity === 'critical';
                const isResolved = inc.status === 'RESOLVED';
                const hasProof = Boolean(inc.evidenceImage);

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#181c26] border-emerald-500/60 shadow-lg ring-1 ring-emerald-500/20'
                        : 'bg-[#101318] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            isCrit ? 'bg-red-400 animate-pulse' : inc.severity === 'high' ? 'bg-amber-400' : 'bg-blue-400'
                          }`} />
                          <span className="font-bold text-white text-xs truncate max-w-[210px]">
                            {inc.incidentType || inc.violationType?.replace(/_/g, ' ') || 'Safety Breach'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span>{inc.cameraId || 'CAM'}</span>
                          <span>•</span>
                          <span>{inc.zone || 'Zone'}</span>
                          <span>•</span>
                          <span className="text-slate-500">{new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold border uppercase ${
                            isCrit
                              ? 'bg-red-950/40 text-red-400 border-red-500/40'
                              : inc.severity === 'high'
                              ? 'bg-amber-950/40 text-amber-400 border-amber-500/40'
                              : 'bg-blue-950/40 text-blue-400 border-blue-500/40'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isResolved
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : inc.status === 'DISPATCHED'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-white/5 text-slate-300 border border-white/10'
                          }`}
                        >
                          {inc.status || 'DETECTED'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Worker: <strong className="text-slate-200">{inc.employeeName || inc.workerName || inc.workerId || 'Unidentified'}</strong></span>
                      {hasProof ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          VISUAL PROOF
                        </span>
                      ) : (
                        <span className="text-slate-500">TELEMETRY ONLY</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {incidents.length} of {totalCount} records
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                {currentPage}
              </span>
              <button
                disabled={incidents.length < 15 || currentPage * 15 >= totalCount}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Structured Operational Workspace (col-span-7) */}
        <div className="lg:col-span-7 bg-[#141720] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
          {selectedIncident ? (
            <>
              {/* Workspace Top Details Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 font-bold text-slate-400">
                      ID: {selectedIncident.id}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border uppercase ${
                        selectedIncident.severity === 'critical'
                          ? 'bg-red-950/40 text-red-400 border-red-500/40'
                          : selectedIncident.severity === 'high'
                          ? 'bg-amber-950/40 text-amber-400 border-amber-500/40'
                          : 'bg-blue-950/40 text-blue-400 border-blue-500/40'
                      }`}
                    >
                      {selectedIncident.severity} SEVERITY
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-white/5 border border-white/10 text-emerald-400 uppercase">
                      STATUS: {selectedIncident.status || 'DETECTED'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white mt-1">
                    {selectedIncident.incidentType || selectedIncident.violationType?.replace(/_/g, ' ')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Recorded at {new Date(selectedIncident.timestamp).toLocaleString()} • {selectedIncident.zone} • Camera: <span className="text-slate-200 font-bold">{selectedIncident.cameraId}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProofModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-200 transition"
                    title="Open Full Forensic Audit Modal"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Audit Modal</span>
                  </button>
                </div>
              </div>

              {/* Action Notification Message */}
              {actionSuccessMessage && (
                <div className="bg-emerald-950/40 border border-emerald-500/60 rounded-xl p-2.5 text-xs text-emerald-400 flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{actionSuccessMessage}</span>
                </div>
              )}

              {/* Operator Mitigation Command Toolbar */}
              <div className="bg-[#101318] border border-white/10 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 font-bold uppercase text-[10px]">
                  OPERATIONAL MITIGATION WORKFLOW:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedIncident.status !== 'ACKNOWLEDGED' && selectedIncident.status !== 'DISPATCHED' && selectedIncident.status !== 'RESOLVED' && (
                    <button
                      onClick={handleAcknowledge}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  {selectedIncident.status !== 'DISPATCHED' && selectedIncident.status !== 'RESOLVED' && (
                    <button
                      onClick={handleSetInProgress}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-xl font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Set In Progress</span>
                    </button>
                  )}

                  {selectedIncident.status !== 'RESOLVED' && (
                    <button
                      onClick={() => setShowResolvePrompt(true)}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition shadow-md shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve Incident</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowFalsePositiveModal(true)}
                    disabled={isActionLoading}
                    className="px-3 py-1.5 bg-white/5 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-white/10 hover:border-red-500/40 rounded-xl font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>False Positive</span>
                  </button>
                </div>
              </div>

              {/* Inline Resolve Notes Prompt */}
              {showResolvePrompt && (
                <div className="bg-[#181c26] border border-emerald-500/40 p-3 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400">Resolution Verification Notes</span>
                    <button onClick={() => setShowResolvePrompt(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <textarea
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    placeholder="Document corrective actions taken, steward dispatched, and verified PPE compliance..."
                    rows={2}
                    className="w-full bg-[#101318] border border-white/10 rounded-lg p-2 text-white outline-none text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowResolvePrompt(false)}
                      className="px-3 py-1 bg-white/5 text-slate-400 rounded-lg hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResolve}
                      disabled={isActionLoading}
                      className="px-3 py-1 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400"
                    >
                      Confirm Resolution
                    </button>
                  </div>
                </div>
              )}

              {/* Workspace Navigation Sub-Tabs */}
              <div className="flex items-center gap-2 border-b border-white/10 pb-2 text-xs">
                <button
                  onClick={() => setWorkspaceTab('evidence')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    workspaceTab === 'evidence'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  1. Evidence & Forensics
                </button>
                <button
                  onClick={() => setWorkspaceTab('explainability')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    workspaceTab === 'explainability'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2. Explainability & Policy
                </button>
                <button
                  onClick={() => setWorkspaceTab('timeline')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    workspaceTab === 'timeline'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  3. Audit Trail
                </button>
              </div>

              {/* Tab 1: Evidence & Forensics */}
              {workspaceTab === 'evidence' && (
                <div className="space-y-3.5">
                  <div className="relative aspect-video bg-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                    {evidenceLoading ? (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                        <span className="text-xs">Loading authenticated forensic evidence...</span>
                      </div>
                    ) : evidenceBlobUrl ? (
                      <img
                        src={evidenceBlobUrl}
                        alt="Incident Evidence"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-6 text-slate-500">
                        <Camera className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{evidenceError || 'No visual proof captured for this event.'}</p>
                        <p className="text-[10px] text-slate-600 mt-1">Incident recorded via telemetry stream sensors.</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#101318] p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase font-bold">Personnel Identification</span>
                      <p className="text-white font-bold">{selectedIncident.employeeName || selectedIncident.workerName || selectedIncident.workerId || 'Unidentified Personnel'}</p>
                      <p className="text-slate-400 text-[11px]">Worker ID: {selectedIncident.workerId || 'N/A'}</p>
                    </div>

                    <div className="bg-[#101318] p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase font-bold">Perimeter & Geofence</span>
                      <p className="text-white font-bold">{selectedIncident.zone}</p>
                      <p className="text-slate-400 text-[11px]">Camera: {selectedIncident.cameraId}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Explainability & Policy */}
              {workspaceTab === 'explainability' && (
                <div className="space-y-3 text-xs">
                  <div className="bg-[#101318] p-4 rounded-xl border border-white/5 space-y-2">
                    <span className="text-slate-500 text-[10px] uppercase font-bold">Severity Justification & Root Cause</span>
                    <p className="text-slate-200 leading-relaxed">
                      {selectedIncident.whyFlagged?.join('; ') ||
                        selectedIncident.notes ||
                        `Personnel detected in ${selectedIncident.zone} without mandated safety equipment. Risk score assessed at ${selectedIncident.riskScore || 85}/100.`}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#101318] p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase font-bold">Risk Assessment</span>
                      <p className="text-lg font-bold text-red-400">{selectedIncident.riskScore || 85} / 100</p>
                      <p className="text-[10px] text-slate-400">OSHA Risk Matrix</p>
                    </div>
                    <div className="bg-[#101318] p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase font-bold">Recommended Action</span>
                      <p className="text-white font-bold">{selectedIncident.recommendedAction || 'Dispatch Steward'}</p>
                      <p className="text-[10px] text-slate-400">Policy Standard</p>
                    </div>
                    <div className="bg-[#101318] p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-slate-500 text-[10px] uppercase font-bold">Detection Confidence</span>
                      <p className="text-white font-bold">{Math.round((selectedIncident.confidence || 0.9) * 100)}%</p>
                      <p className="text-[10px] text-slate-400">AI Model Score</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Timeline & Audit Trail */}
              {workspaceTab === 'timeline' && (
                <div className="space-y-3 text-xs">
                  <div className="bg-[#101318] p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-slate-500 text-[10px] uppercase font-bold">Lifecycle Progression</span>
                    <div className="relative pl-6 space-y-4 border-l border-white/10 ml-2">
                      <div className="relative">
                        <span className="absolute -left-[31px] top-0 w-3 h-3 rounded-full bg-red-400 border-2 border-[#101318]" />
                        <p className="font-bold text-white text-[11px]">Breach Detected by AI Core</p>
                        <p className="text-slate-400 text-[10px]">{new Date(selectedIncident.timestamp).toLocaleString()}</p>
                      </div>

                      {selectedIncident.status === 'ACKNOWLEDGED' || selectedIncident.status === 'DISPATCHED' || selectedIncident.status === 'RESOLVED' ? (
                        <div className="relative">
                          <span className="absolute -left-[31px] top-0 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#101318]" />
                          <p className="font-bold text-white text-[11px]">Acknowledged by Operator</p>
                          <p className="text-slate-400 text-[10px]">Surveillance Command Center</p>
                        </div>
                      ) : null}

                      {selectedIncident.status === 'DISPATCHED' || selectedIncident.status === 'RESOLVED' ? (
                        <div className="relative">
                          <span className="absolute -left-[31px] top-0 w-3 h-3 rounded-full bg-blue-400 border-2 border-[#101318]" />
                          <p className="font-bold text-white text-[11px]">Mitigation Dispatched / In Progress</p>
                          <p className="text-slate-400 text-[10px]">Field steward response</p>
                        </div>
                      ) : null}

                      {selectedIncident.status === 'RESOLVED' ? (
                        <div className="relative">
                          <span className="absolute -left-[31px] top-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#101318]" />
                          <p className="font-bold text-white text-[11px]">Incident Resolved & Closed</p>
                          <p className="text-emerald-400 text-[10px]">{selectedIncident.notes || 'Verified compliant'}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-center space-y-3 text-slate-500">
              <ShieldAlert className="w-12 h-12 opacity-30" />
              <div>
                <p className="text-sm font-bold text-slate-300">No Incident Selected</p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Select an incident from the left roster to inspect authenticated forensic evidence, analyze root-cause explainability, and execute workflow mitigations.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Proof Modal */}
      <IncidentProofModal
        incident={selectedIncident}
        isOpen={showProofModal}
        onClose={() => setShowProofModal(false)}
        onUpdated={fetchIncidents}
      />

      {/* False Positive Feedback Modal */}
      {selectedIncident && (
        <FalsePositiveModal
          incident={selectedIncident}
          isOpen={showFalsePositiveModal}
          onClose={() => setShowFalsePositiveModal(false)}
          onSuccess={() => {
            setShowFalsePositiveModal(false);
            fetchIncidents();
          }}
        />
      )}
    </div>
  );
};
