import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  CheckCircle2,
  Clock,
  UserCheck,
  UserX,
  Play,
  Image as ImageIcon,
  ArrowRight,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Send,
  Radio,
  HardHat,
  Camera,
  MapPin,
  ChevronRight,
  ExternalLink,
  Flame,
  Activity,
  FileText,
} from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Incident,
  IncidentResponseBundle,
  IncidentQueueResponse,
  ResponseState,
  ResponderState,
} from '../types';

export const SmartIncidentResponsePage: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  // State
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [activeBundle, setActiveBundle] = useState<IncidentResponseBundle | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [isLoadingBundle, setIsLoadingBundle] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [filterZone, setFilterZone] = useState<string>('All');
  const [filterState, setFilterState] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals / Action inputs
  const [actionNotes, setActionNotes] = useState<string>('');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [selectedResponderId, setSelectedResponderId] = useState<string>('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  // Load Queue
  const fetchQueue = async () => {
    setIsLoadingQueue(true);
    setErrorMessage(null);
    try {
      const res: IncidentQueueResponse = await api.getResponseQueue({
        severity: filterSeverity !== 'All' ? filterSeverity : undefined,
        zone: filterZone !== 'All' ? filterZone : undefined,
        responseState: filterState !== 'All' ? filterState : undefined,
        search: searchQuery.trim() || undefined,
      });
      setQueue(res.incidents || []);

      // Auto-select first incident if none selected or if current not in queue
      if (res.incidents && res.incidents.length > 0) {
        if (!selectedIncidentId || !res.incidents.some((i: any) => i.incidentId === selectedIncidentId)) {
          setSelectedIncidentId(res.incidents[0].incidentId);
        }
      } else {
        setSelectedIncidentId(null);
        setActiveBundle(null);
      }
    } catch (err: any) {
      console.error('[SmartIncidentResponse] Fetch queue error:', err);
      setErrorMessage(err.message || 'Failed to load incident response queue');
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // Load Bundle for selected incident
  const fetchBundle = async (incidentId: string) => {
    setIsLoadingBundle(true);
    try {
      const bundle = await api.getIncidentResponse(incidentId);
      setActiveBundle(bundle);
    } catch (err: any) {
      console.error('[SmartIncidentResponse] Fetch bundle error:', err);
      setErrorMessage(err.message || 'Failed to load incident details');
    } finally {
      setIsLoadingBundle(false);
    }
  };

  // Initial load & filter changes
  useEffect(() => {
    fetchQueue();
  }, [filterSeverity, filterZone, filterState, searchQuery]);

  // When selection changes
  useEffect(() => {
    if (selectedIncidentId) {
      fetchBundle(selectedIncidentId);
    } else {
      setActiveBundle(null);
    }
  }, [selectedIncidentId]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    if (!socket) return;

    const handleIncidentUpdate = (payload: any) => {
      fetchQueue();
      if (selectedIncidentId) {
        const payloadIncId = payload?.incidentId || payload?.incident?.incidentId;
        if (payloadIncId === selectedIncidentId) {
          fetchBundle(selectedIncidentId);
        }
      }
    };

    socket.on('incident.created', handleIncidentUpdate);
    socket.on('incident.routed', handleIncidentUpdate);
    socket.on('incident.acknowledged', handleIncidentUpdate);
    socket.on('incident.assigned', handleIncidentUpdate);
    socket.on('incident.response_started', handleIncidentUpdate);
    socket.on('incident.resolved', handleIncidentUpdate);
    socket.on('incident.escalated', handleIncidentUpdate);
    socket.on('incident.event_added', handleIncidentUpdate);
    socket.on('incident:new', handleIncidentUpdate);

    return () => {
      socket.off('incident.created', handleIncidentUpdate);
      socket.off('incident.routed', handleIncidentUpdate);
      socket.off('incident.acknowledged', handleIncidentUpdate);
      socket.off('incident.assigned', handleIncidentUpdate);
      socket.off('incident.response_started', handleIncidentUpdate);
      socket.off('incident.resolved', handleIncidentUpdate);
      socket.off('incident.escalated', handleIncidentUpdate);
      socket.off('incident.event_added', handleIncidentUpdate);
      socket.off('incident:new', handleIncidentUpdate);
    };
  }, [socket, selectedIncidentId]);

  // Action Handlers
  const handleRoute = async () => {
    if (!selectedIncidentId) return;
    setIsProcessingAction(true);
    try {
      await api.routeIncident(selectedIncidentId);
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Routing failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedIncidentId) return;
    setIsProcessingAction(true);
    try {
      await api.acknowledgeIncidentResponse(selectedIncidentId, actionNotes || undefined);
      setActionNotes('');
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Acknowledgment failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedIncidentId || !selectedResponderId) return;
    setIsProcessingAction(true);
    try {
      await api.assignResponder(selectedIncidentId, selectedResponderId, actionNotes || undefined);
      setShowAssignModal(false);
      setActionNotes('');
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Assignment failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Open Assign Modal with pre-selected eligible responder
  const openAssignModal = () => {
    const eligible = activeBundle?.firstResponder?.eligibleResponders || [];
    if (eligible.length > 0) {
      if (!selectedResponderId || !eligible.some((r) => r.userId === selectedResponderId)) {
        setSelectedResponderId(eligible[0].userId);
      }
    } else {
      setSelectedResponderId('');
    }
    setShowAssignModal(true);
  };

  const handleStartResponse = async () => {
    if (!selectedIncidentId) return;
    setIsProcessingAction(true);
    try {
      await api.startIncidentResponse(selectedIncidentId, actionNotes || undefined);
      setActionNotes('');
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Failed to start response');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedIncidentId) return;
    setIsProcessingAction(true);
    try {
      await api.resolveIncidentResponse(selectedIncidentId, actionNotes || undefined);
      setShowResolveModal(false);
      setActionNotes('');
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Resolution failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedIncidentId) return;
    setIsProcessingAction(true);
    try {
      await api.escalateIncidentResponse(selectedIncidentId, actionNotes || undefined, escalateReason || undefined);
      setShowEscalateModal(false);
      setActionNotes('');
      setEscalateReason('');
      await fetchBundle(selectedIncidentId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || 'Escalation failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper colors
  const getSeverityBadge = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return 'bg-red-950/80 text-red-400 border border-red-500/50 shadow-sm shadow-red-950';
      case 'high':
        return 'bg-amber-950/80 text-amber-400 border border-amber-500/50';
      case 'medium':
        return 'bg-yellow-950/60 text-yellow-400 border border-yellow-500/40';
      case 'low':
        return 'bg-blue-950/60 text-blue-400 border border-blue-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  const getStateBadge = (state: string) => {
    switch (state?.toUpperCase()) {
      case 'ROUTED':
        return 'bg-blue-950/70 text-blue-400 border border-blue-500/50';
      case 'ACKNOWLEDGED':
        return 'bg-indigo-950/70 text-indigo-400 border border-indigo-500/50';
      case 'IN_PROGRESS':
        return 'bg-purple-950/70 text-purple-400 border border-purple-500/50 animate-pulse';
      case 'RESOLVED':
        return 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/50';
      case 'ESCALATED':
        return 'bg-red-950/80 text-red-400 border border-red-500/60 animate-pulse';
      default:
        return 'bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-slate-200 p-4 lg:p-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </span>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              SMART INCIDENT RESPONSE
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-medium">
                PHASE 11 PRODUCTION
              </span>
            </h1>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Deterministic Alert Routing · Grounded Summaries · Real Evidence Replay · Audit Trail
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchQueue()}
            disabled={isLoadingQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQueue ? 'animate-spin' : ''}`} />
            REFRESH QUEUE
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs font-mono text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Grid: Queue on Left, Command Center on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Column: Active Incidents Queue (5 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
              <h2 className="text-xs font-mono tracking-wider text-slate-400 font-bold flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-400" />
                ACTIVE INCIDENTS QUEUE ({queue.length})
              </h2>
              <span className="text-[10px] font-mono text-slate-500">SEVERITY-SORTED</span>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by ID, zone, worker..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#181c24] border border-slate-700/60 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="bg-[#181c24] border border-slate-700/60 rounded px-2 py-1 text-slate-300 focus:outline-none"
                >
                  <option value="All">All Severity</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  className="bg-[#181c24] border border-slate-700/60 rounded px-2 py-1 text-slate-300 focus:outline-none"
                >
                  <option value="All">All Status</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  <option value="ROUTED">Routed</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ESCALATED">Escalated</option>
                </select>

                <select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value)}
                  className="bg-[#181c24] border border-slate-700/60 rounded px-2 py-1 text-slate-300 focus:outline-none"
                >
                  <option value="All">All Zones</option>
                  <option value="Furnace Bay">Furnace Bay</option>
                  <option value="Zone 1 - Furnace Primary">Zone 1</option>
                  <option value="Zone 2 - Secondary Refining">Zone 2</option>
                  <option value="Zone 3 - Continuous Casting">Zone 3</option>
                  <option value="ZONE-A">Zone A</option>
                  <option value="ZONE-B">Zone B</option>
                </select>
              </div>
            </div>

            {/* Incident Cards Queue */}
            <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {isLoadingQueue ? (
                <div className="py-12 text-center text-xs font-mono text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                  LOADING ACTIVE QUEUE...
                </div>
              ) : queue.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-slate-500 bg-[#151921] rounded-lg border border-slate-800">
                  No active incidents.
                </div>
              ) : (
                queue.map((inc: any) => {
                  const isSelected = inc.incidentId === selectedIncidentId;
                  const resState = inc.responseState || 'UNASSIGNED';
                  return (
                    <div
                      key={inc.incidentId}
                      onClick={() => setSelectedIncidentId(inc.incidentId)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-[#1e232e] border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
                          : 'bg-[#151921] hover:bg-[#1a1f29] border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${getSeverityBadge(inc.severity)}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${getStateBadge(resState)}`}>
                          {resState}
                        </span>
                      </div>

                      <div className="font-semibold text-xs text-white capitalize line-clamp-1">
                        {String(inc.violationType || 'Safety Violation').replace(/_/g, ' ')}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {inc.zone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3 text-slate-500" />
                          {inc.cameraId}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/40">
                        <span>{inc.incidentId}</span>
                        <span>{new Date(inc.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Incident Command Center (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {!selectedIncidentId || !activeBundle ? (
            <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-12 text-center text-slate-500 font-mono text-xs flex flex-col items-center justify-center min-h-[400px]">
              <AlertOctagon className="w-8 h-8 text-slate-600 mb-3" />
              <span>Select an incident from the active queue to view response orchestration.</span>
            </div>
          ) : isLoadingBundle ? (
            <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center min-h-[400px]">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mb-3" />
              <span>SYNCHRONIZING PERSISTED RESPONSE ATTRIBUTES...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Header Action Banner */}
              <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white font-mono">{activeBundle.incident.incidentId}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${getSeverityBadge(activeBundle.incident.severity)}`}>
                      {activeBundle.incident.severity}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${getStateBadge(activeBundle.summary.responseState)}`}>
                      {activeBundle.summary.responseState}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3 font-mono mt-0.5">
                    <span>Zone: <strong className="text-slate-200">{activeBundle.incident.zone}</strong></span>
                    <span>·</span>
                    <span>Camera: <strong className="text-slate-200">{activeBundle.incident.cameraId}</strong></span>
                    <span>·</span>
                    <span>Detected: <strong className="text-slate-200">{new Date(activeBundle.incident.timestamp).toLocaleString()}</strong></span>
                  </div>
                </div>

                {/* Workflow Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {activeBundle.summary.responseState === 'UNASSIGNED' && (
                    <button
                      onClick={handleRoute}
                      disabled={isProcessingAction}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      ROUTE ALERT
                    </button>
                  )}

                  {activeBundle.summary.responseState !== 'ACKNOWLEDGED' &&
                    activeBundle.summary.responseState !== 'RESOLVED' && (
                      <button
                        onClick={handleAcknowledge}
                        disabled={isProcessingAction}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ACKNOWLEDGE
                      </button>
                    )}

                  <button
                    onClick={openAssignModal}
                    disabled={isProcessingAction || activeBundle.summary.responseState === 'RESOLVED'}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ASSIGN RESPONDER
                  </button>

                  {activeBundle.summary.responseState !== 'IN_PROGRESS' &&
                    activeBundle.summary.responseState !== 'RESOLVED' && (
                      <button
                        onClick={handleStartResponse}
                        disabled={isProcessingAction}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <Play className="w-3.5 h-3.5" />
                        START RESPONSE
                      </button>
                    )}

                  {activeBundle.summary.responseState !== 'RESOLVED' && (
                    <>
                      <button
                        onClick={() => setShowResolveModal(true)}
                        disabled={isProcessingAction}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        RESOLVE
                      </button>

                      <button
                        onClick={() => setShowEscalateModal(true)}
                        disabled={isProcessingAction}
                        className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        ESCALATE
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Grid 2-cols: Summary & Evidence Replay */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Panel 1: Incident Summary Card */}
                <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      INCIDENT SUMMARY
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">FACTUAL GROUNDED</span>
                  </div>

                  {/* Headline & Severity */}
                  <div className="flex items-start gap-2 bg-[#161a22] p-3 rounded-lg border border-slate-800/60">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase shrink-0 ${getSeverityBadge(activeBundle.incident.severity)}`}>
                      [{activeBundle.incident.severity.toUpperCase()}]
                    </span>
                    <div className="text-xs font-bold text-white font-mono leading-relaxed">
                      {activeBundle.summary.headline || `${activeBundle.incident.severity.toUpperCase()} ${String(activeBundle.incident.violationType || 'Safety Violation').replace(/_/g, ' ')}`}
                    </div>
                  </div>

                  {/* What Happened (Factual Summary) */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">WHAT HAPPENED:</span>
                    <div className="text-xs font-mono text-slate-300 bg-[#161a22] p-2.5 rounded-lg border border-slate-800/60 leading-relaxed">
                      {activeBundle.summary.factualSummary || activeBundle.summary.factualDescription}
                    </div>
                  </div>

                  {/* Location & Time Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px] uppercase">LOCATION</span>
                      <div className="text-slate-200 mt-1 space-y-0.5 text-[11px]">
                        <div>Site: <strong className="text-white">{activeBundle.summary.location?.siteId || activeBundle.summary.siteId}</strong></div>
                        <div>Zone: <strong className="text-white">{activeBundle.summary.location?.zone || activeBundle.summary.zone}</strong></div>
                        <div>Camera: <strong className="text-white">{activeBundle.summary.location?.cameraId || activeBundle.summary.cameraId}</strong></div>
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px] uppercase">WHEN & DETECTION</span>
                      <div className="text-slate-200 mt-1 space-y-0.5 text-[11px]">
                        <div>Time: <strong className="text-white">{new Date(activeBundle.summary.timestamp).toLocaleString()}</strong></div>
                        <div>Risk: <strong className="text-amber-400">{activeBundle.summary.riskScore}</strong> ({activeBundle.summary.riskLevel})</div>
                        <div>
                          PPE: {activeBundle.summary.missingPPE.length > 0 ? (
                            <strong className="text-red-400">{activeBundle.summary.missingPPE.map((p: string) => p.replace(/_/g, ' ')).join(', ')}</strong>
                          ) : (
                            <span className="text-slate-400">Not recorded</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px] uppercase">SUBJECT / WORKER</span>
                      <div className="text-slate-200 mt-1 text-[11px]">
                        {activeBundle.summary.subject?.isResolved || (activeBundle.summary.workerName && activeBundle.summary.workerName !== 'Unidentified Worker') ? (
                          <div>Worker: <strong className="text-white">{activeBundle.summary.subject?.workerName || activeBundle.summary.workerName}</strong> {activeBundle.summary.subject?.workerId ? `(${activeBundle.summary.subject.workerId})` : ''}</div>
                        ) : activeBundle.summary.subject?.personId ? (
                          <div className="text-slate-400">Person identity not resolved (Track: {activeBundle.summary.subject.personId})</div>
                        ) : (
                          <div className="text-slate-500">Person identity not resolved</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px] uppercase">RESPONSE & ROUTING</span>
                      <div className="text-slate-200 mt-1 space-y-0.5 text-[11px]">
                        <div>State: <strong className="text-indigo-400">{activeBundle.summary.responseState}</strong></div>
                        <div>Recipient: <strong className="text-white">{activeBundle.routingDecision?.recipient?.role || (activeBundle.routingDecision?.targetRoles?.join(', ') || 'Not configured')}</strong></div>
                        <div>Delivery: <strong className="text-blue-400">{activeBundle.routingDecision?.deliveryStatus || 'NOT_CONFIGURED'}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Evidence status summary */}
                  <div className="p-2 bg-[#161a22] rounded border border-slate-800/40 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <div>
                      <strong className="text-slate-300">Evidence: </strong>
                      {activeBundle.summary.evidence?.available || activeBundle.summary.evidenceAvailable
                        ? (activeBundle.summary.evidence?.type === 'VIDEO' || activeBundle.summary.replayAvailable
                            ? 'Snapshot and video replay available'
                            : 'Snapshot available; replay unavailable')
                        : 'No evidence attached'}
                    </div>
                    {activeBundle.summary.relatedNearMissId && (
                      <span className="text-amber-400 text-[10px] font-bold">Near-Miss Linked</span>
                    )}
                  </div>
                </div>

                {/* Panel 2: Incident Replay Card */}
                <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 flex items-center gap-2">
                      <Play className="w-4 h-4 text-purple-400" />
                      INCIDENT REPLAY
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          activeBundle.replay.evidenceType === 'VIDEO'
                            ? 'bg-purple-950/60 text-purple-300 border border-purple-800/50'
                            : activeBundle.replay.evidenceType === 'SNAPSHOT'
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {activeBundle.replay.evidenceType}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Display Area */}
                  <div className="bg-[#0b0d11] rounded-lg border border-slate-800 flex flex-col items-center justify-center overflow-hidden min-h-[190px] relative">
                    {/* STATE A — REAL VIDEO */}
                    {activeBundle.replay.evidenceType === 'VIDEO' && (activeBundle.replay.playback?.url || activeBundle.replay.videoUrl) ? (
                      <video
                        src={activeBundle.replay.playback?.url || activeBundle.replay.videoUrl || undefined}
                        controls
                        preload="metadata"
                        className="w-full h-full object-contain max-h-[220px]"
                      />
                    ) : /* STATE B — SNAPSHOT ONLY */
                    activeBundle.replay.evidenceType === 'SNAPSHOT' && (activeBundle.replay.playback?.url || activeBundle.replay.snapshotUrl) ? (
                      <img
                        src={activeBundle.replay.playback?.url || activeBundle.replay.snapshotUrl || undefined}
                        alt="Incident Snapshot Evidence"
                        className="w-full h-full object-contain max-h-[220px]"
                      />
                    ) : (
                      /* STATE C — NO EVIDENCE */
                      <div className="p-6 text-center text-slate-500 font-mono text-xs flex flex-col items-center">
                        <ImageIcon className="w-8 h-8 text-slate-700 mb-2" />
                        <span>No replay evidence is available for this incident.</span>
                      </div>
                    )}
                  </div>

                  {/* Replay Details / Notice Bar */}
                  <div className="space-y-2">
                    <div className="p-2 bg-[#161a22] rounded border border-slate-800 text-[11px] font-mono text-slate-400">
                      <strong className="text-slate-200">Replay Status: </strong>
                      {activeBundle.replay.message}
                    </div>

                    {/* Metadata summary (Camera, Timestamp, Integrity) */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-[#161a22] p-2 rounded border border-slate-800/60">
                      <div>
                        <span className="text-slate-500 uppercase">CAMERA: </span>
                        <span className="text-slate-300 font-semibold">
                          {activeBundle.replay.source?.cameraId || activeBundle.replay.camera || 'CAM-01'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase">INCIDENT TIME: </span>
                        <span className="text-slate-300 font-semibold">
                          {activeBundle.replay.incidentTimestamp
                            ? new Date(activeBundle.replay.incidentTimestamp).toLocaleTimeString([], { hour12: false })
                            : 'N/A'}
                        </span>
                      </div>
                      {activeBundle.replay.evidence?.durationSeconds && (
                        <div>
                          <span className="text-slate-500 uppercase">DURATION: </span>
                          <span className="text-slate-300">{activeBundle.replay.evidence.durationSeconds}s</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500 uppercase">INTEGRITY: </span>
                        <span className={activeBundle.replay.integrity?.verified ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {activeBundle.replay.integrity?.verified ? 'Verified' : 'Unverified'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid 2-cols: Response Routing & First Responder */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Panel 3: Response Routing Policy */}
                <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 flex items-center gap-2">
                      <Radio className="w-4 h-4 text-indigo-400" />
                      RESPONSE ROUTING
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">POLICY-DRIVEN</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          activeBundle.routingDecision.status === 'ROUTED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {activeBundle.routingDecision.status}
                      </span>
                    </div>
                  </div>

                  {/* Routing Decision Key Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px]">RECIPIENT</span>
                      <div className="text-white font-medium mt-0.5 truncate" title={activeBundle.routingDecision.recipient?.name || 'None configured'}>
                        {activeBundle.routingDecision.recipient?.name || 'None configured'}
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px]">ROLE</span>
                      <div className="text-white font-medium mt-0.5 truncate">
                        {activeBundle.routingDecision.recipient?.role || (activeBundle.routingDecision.targetRoles?.join(', ') || 'N/A')}
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px]">POLICY</span>
                      <div className="text-white font-medium mt-0.5 truncate" title={activeBundle.routingDecision.ruleMatched || activeBundle.routingDecision.policyId}>
                        {activeBundle.routingDecision.ruleMatched || activeBundle.routingDecision.policyId || 'POLICY-SEVERITY-BASED'}
                      </div>
                    </div>

                    <div className="bg-[#161a22] p-2 rounded border border-slate-800/40">
                      <span className="text-slate-500 text-[10px]">DELIVERY</span>
                      <div className="text-white font-medium mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                            activeBundle.routingDecision.deliveryStatus === 'DELIVERED'
                              ? 'bg-emerald-950 text-emerald-300'
                              : activeBundle.routingDecision.deliveryStatus === 'DELIVERY_PENDING'
                              ? 'bg-blue-950 text-blue-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {activeBundle.routingDecision.deliveryStatus || 'NOT_CONFIGURED'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#161a22] rounded-lg border border-slate-800 text-xs font-mono">
                    <span className="text-slate-500 text-[10px] uppercase block mb-1">ROUTING DECISION REASON:</span>
                    <span className="text-slate-300 font-medium">{activeBundle.routingDecision.routingReason}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                      RESOLVED RECIPIENTS ({activeBundle.routingDecision.targetUsers.length}):
                    </span>
                    {activeBundle.routingDecision.targetUsers.length === 0 ? (
                      <div className="p-3 bg-yellow-950/30 border border-yellow-800/40 rounded text-xs font-mono text-yellow-300">
                        No recipient configured for this routing policy.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                        {activeBundle.routingDecision.targetUsers.map((u) => (
                          <div
                            key={u.id}
                            className="p-2 bg-[#161a22] rounded border border-slate-800 flex items-center justify-between text-xs font-mono"
                          >
                            <div>
                              <div className="text-white font-medium">{u.name}</div>
                              <div className="text-[10px] text-slate-400">{u.email}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {u.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Panel 4: First Responder Routing */}
                <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 flex items-center gap-2">
                      <HardHat className="w-4 h-4 text-amber-400" />
                      FIRST RESPONDER
                    </h3>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        activeBundle.firstResponder.state === 'RESPONDER_ACKNOWLEDGED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : activeBundle.firstResponder.state === 'RESPONDER_ASSIGNED'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : activeBundle.firstResponder.state === 'RESPONDER_IDENTIFIED'
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {activeBundle.firstResponder.state.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#161a22] rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">STATUS:</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Assignment: {activeBundle.firstResponder.assignmentStatus === 'AUTOMATIC_POLICY'
                          ? 'Automatic policy'
                          : activeBundle.firstResponder.assignmentStatus === 'MANUAL_OPERATOR'
                          ? 'Manual operator'
                          : 'Not configured'}
                      </span>
                    </div>
                    <div className="text-slate-300 font-medium">{activeBundle.firstResponder.message}</div>
                    {activeBundle.firstResponder.explanation && (
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 leading-relaxed">
                        <span className="text-slate-500 font-semibold">Policy: </span>
                        {activeBundle.firstResponder.explanation}
                      </div>
                    )}
                  </div>

                  {activeBundle.firstResponder.responder ? (
                    <div className="p-3 bg-[#181d27] rounded-lg border border-emerald-500/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono uppercase block">NAME</span>
                          <div className="text-white font-bold text-xs font-mono">
                            {activeBundle.firstResponder.responder.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 font-mono uppercase block">ROLE</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            {activeBundle.firstResponder.responder.role}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-slate-800">
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase block">ACKNOWLEDGEMENT:</span>
                          <span className={activeBundle.firstResponder.state === 'RESPONDER_ACKNOWLEDGED' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                            {activeBundle.firstResponder.state === 'RESPONDER_ACKNOWLEDGED'
                              ? `Acknowledged (${activeBundle.firstResponder.responder.acknowledgedAt ? new Date(activeBundle.firstResponder.responder.acknowledgedAt).toLocaleTimeString() : 'Verified'})`
                              : 'Pending'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase block">ASSIGNED AT:</span>
                          <span className="text-slate-300">
                            {activeBundle.firstResponder.responder.assignedAt
                              ? new Date(activeBundle.firstResponder.responder.assignedAt).toLocaleTimeString()
                              : 'Automatic'}
                          </span>
                        </div>
                      </div>

                      {activeBundle.firstResponder.responder.assignedBy && (
                        <div className="text-[10px] font-mono text-slate-500">
                          Assigned by: <strong className="text-slate-400">{activeBundle.firstResponder.responder.assignedBy}</strong>
                        </div>
                      )}

                      {/* Inline Acknowledge button if assigned but pending acknowledgement */}
                      {activeBundle.firstResponder.state === 'RESPONDER_ASSIGNED' &&
                        activeBundle.summary.responseState !== 'RESOLVED' && (
                          <div className="pt-2 border-t border-slate-800 flex justify-end">
                            <button
                              onClick={handleAcknowledge}
                              disabled={isProcessingAction}
                              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Acknowledge Assignment
                            </button>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-900/60 rounded-lg border border-slate-800 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center min-h-[90px]">
                      <UserX className="w-6 h-6 text-slate-600 mb-1" />
                      <span>No eligible responder is currently available for this incident's site/zone policy.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel 5: Evidence Timeline */}
              <div className="bg-[#12151b] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300">
                      EVIDENCE TIMELINE ({activeBundle.timeline?.length || 0})
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeBundle.replay?.evidenceType === 'VIDEO' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50">
                        Video evidence reference available
                      </span>
                    ) : activeBundle.replay?.evidenceType === 'SNAPSHOT' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                        Snapshot evidence available
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {activeBundle.timeline?.length > 0 ? 'Timeline events are available. No evidence is attached.' : 'No evidence attached'}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500">CHRONOLOGICAL AUDIT</span>
                  </div>
                </div>

                {!activeBundle.timeline || activeBundle.timeline.length === 0 ? (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No persisted timeline events are available for this incident.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {activeBundle.timeline.map((evt: any, idx: number) => {
                      const actorObj = typeof evt.actor === 'object' && evt.actor !== null ? evt.actor : null;
                      const actorName = actorObj ? (actorObj.name || actorObj.role || actorObj.type || 'Unknown') : (evt.actor || 'System');
                      const actorType = actorObj?.type || (String(evt.actor || '').includes('ENGINE') ? 'AI' : 'SYSTEM');
                      const hasEventEv = evt.evidence && evt.evidence.available;
                      const hasIncEv = evt.incidentEvidence && evt.incidentEvidence.available;

                      return (
                        <div
                          key={evt.eventId || idx}
                          className="flex items-start gap-3 p-2.5 bg-[#161a22] rounded-lg border border-slate-800/70 text-xs font-mono transition-colors hover:border-slate-700"
                        >
                          <div className="flex flex-col text-slate-400 text-[10px] min-w-[75px] pt-0.5">
                            <span className="font-semibold text-slate-300">
                              {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              {new Date(evt.timestamp).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex-1 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  evt.eventType === 'PPE_VIOLATION_OBSERVED'
                                    ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                                    : evt.eventType === 'ALERT_ROUTED'
                                    ? 'bg-blue-950/50 text-blue-300 border-blue-800/60'
                                    : evt.eventType === 'INCIDENT_ACKNOWLEDGED' || evt.eventType === 'ACKNOWLEDGED'
                                    ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/60'
                                    : evt.eventType === 'RESPONDER_ASSIGNED'
                                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60'
                                    : evt.eventType === 'RESPONSE_STARTED'
                                    ? 'bg-teal-950/50 text-teal-300 border-teal-800/60'
                                    : evt.eventType === 'INCIDENT_ESCALATED'
                                    ? 'bg-rose-950/50 text-rose-300 border-rose-800/60'
                                    : evt.eventType === 'INCIDENT_RESOLVED' || evt.eventType === 'RESOLVED'
                                    ? 'bg-green-950/50 text-green-300 border-green-800/60'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}>
                                  ● {evt.eventType?.replace(/_/g, ' ')}
                                </span>

                                <span className="text-[10px] text-slate-400">
                                  by <span className="text-slate-300 font-semibold">{actorName}</span>
                                  {actorType === 'USER' && actorObj?.role && (
                                    <span className="ml-1 text-[9px] text-slate-500">({actorObj.role})</span>
                                  )}
                                </span>
                              </div>

                              {evt.source && (evt.source.cameraId || evt.source.zone) && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                  {evt.source.cameraId && <span>Cam: {evt.source.cameraId}</span>}
                                  {evt.source.zone && <span>Zone: {evt.source.zone}</span>}
                                </div>
                              )}
                            </div>

                            <div className="text-slate-200 mt-0.5 leading-relaxed text-[11px]">
                              {evt.description}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              {hasEventEv ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3" /> Event Evidence Attached ({evt.evidence.type})
                                </span>
                              ) : hasIncEv ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-900 text-slate-400 border border-slate-800 flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3 text-slate-500" /> Incident Evidence: {evt.incidentEvidence.type} available
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-600">No media attached</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Assign Responder */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#151921] border border-slate-700 rounded-xl p-5 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              ASSIGN FIRST RESPONDER
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Select an authorized supervisor or safety officer to take ownership of incident {selectedIncidentId}.
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono text-slate-300">Target Personnel:</label>
              {activeBundle?.firstResponder?.eligibleResponders && activeBundle.firstResponder.eligibleResponders.length > 0 ? (
                <select
                  value={selectedResponderId}
                  onChange={(e) => setSelectedResponderId(e.target.value)}
                  className="bg-[#1b202a] border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none"
                >
                  {activeBundle.firstResponder.eligibleResponders.map((r) => (
                    <option key={r.userId} value={r.userId}>
                      {r.name} ({r.role}{r.department ? ` - ${r.department}` : ''})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-yellow-950/30 border border-yellow-800/40 rounded text-xs font-mono text-yellow-300">
                  No eligible responders configured.
                </div>
              )}

              <label className="text-[11px] font-mono text-slate-300 mt-2">Assignment Notes (optional):</label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Direct operational instructions for responder..."
                rows={3}
                className="bg-[#1b202a] border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleAssign}
                disabled={
                  isProcessingAction ||
                  !selectedResponderId ||
                  !(activeBundle?.firstResponder?.eligibleResponders && activeBundle.firstResponder.eligibleResponders.length > 0)
                }
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-mono text-white font-bold"
              >
                CONFIRM ASSIGNMENT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resolve Incident */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#151921] border border-slate-700 rounded-xl p-5 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              RESOLVE SAFETY INCIDENT
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Provide formal audit resolution notes for incident {selectedIncidentId}.
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono text-slate-300">Resolution Reason / Corrective Action:</label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="e.g., Worker donned required safety helmet; area cleared and verified compliant."
                rows={3}
                className="bg-[#1b202a] border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleResolve}
                disabled={isProcessingAction}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-mono text-white font-bold"
              >
                SUBMIT RESOLUTION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Escalate Incident */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#151921] border border-slate-700 rounded-xl p-5 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              ESCALATE INCIDENT
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Trigger tier escalation for incident {selectedIncidentId} to higher operational leadership.
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono text-slate-300">Escalation Justification:</label>
              <input
                type="text"
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="e.g., Unresponsive on floor; critical hazard persists"
                className="bg-[#1b202a] border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none"
              />

              <label className="text-[11px] font-mono text-slate-300 mt-2">Additional Audit Notes:</label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Notes for incident audit trail..."
                rows={2}
                className="bg-[#1b202a] border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleEscalate}
                disabled={isProcessingAction}
                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-mono text-white font-bold"
              >
                TRIGGER ESCALATION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
