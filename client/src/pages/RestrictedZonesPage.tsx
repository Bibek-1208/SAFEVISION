import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Camera as CameraIcon,
  Shield,
  AlertTriangle,
  Clock,
  HardHat,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Info,
  Layers,
  DoorOpen,
  Flame,
  ArrowRightCircle,
} from 'lucide-react';
import { RestrictedZone, EmergencyZone, Camera, Site } from '../types';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { ZoneEditorModal } from '../components/camera/ZoneEditorModal';
import { EmergencyZoneEditorModal } from '../components/camera/EmergencyZoneEditorModal';

export const RestrictedZonesPage: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState<'RESTRICTED' | 'EMERGENCY'>('RESTRICTED');
  const [zones, setZones] = useState<RestrictedZone[]>([]);
  const [emergencyZones, setEmergencyZones] = useState<EmergencyZone[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCameraFilter, setSelectedCameraFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingZone, setEditingZone] = useState<RestrictedZone | null>(null);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState<boolean>(false);
  const [editingEmergencyZone, setEditingEmergencyZone] = useState<EmergencyZone | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [zonesRes, emrgRes, camsRes, sitesRes] = await Promise.all([
        api.getRestrictedZones(),
        api.getEmergencyZones().catch(() => ({ zones: [] })),
        api.getCameras().catch(() => ({ cameras: [] })),
        api.getSites().catch(() => ({ sites: [] })),
      ]);
      setZones(zonesRes.zones || []);
      setEmergencyZones(emrgRes.zones || []);
      setCameras(camsRes.cameras || []);
      setSites(sitesRes.sites || []);
    } catch (err: any) {
      console.error('[RestrictedZonesPage] Fetch error:', err);
      setFeedbackMessage({ text: err.message || 'Failed to load safety areas', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    if (socket) {
      const handleCreated = (data: any) => {
        if (data?.zone) {
          setZones((prev) => [data.zone, ...prev.filter((z) => z.zoneId !== data.zone.zoneId)]);
        }
      };

      const handleUpdated = (data: any) => {
        if (data?.zone) {
          setZones((prev) =>
            prev.map((z) => (z.zoneId === data.zone.zoneId ? data.zone : z))
          );
        }
      };

      const handleToggled = (data: any) => {
        if (data?.zoneId) {
          setZones((prev) =>
            prev.map((z) =>
              z.zoneId === data.zoneId ? { ...z, enabled: data.enabled } : z
            )
          );
        }
      };

      const handleDeleted = (data: any) => {
        if (data?.zoneId) {
          setZones((prev) => prev.filter((z) => z.zoneId !== data.zoneId));
        }
      };

      socket.on('restricted_zone.created', handleCreated);
      socket.on('restricted_zone.updated', handleUpdated);
      socket.on('restricted_zone.toggled', handleToggled);
      socket.on('restricted_zone.deleted', handleDeleted);

      // Emergency Zone Socket.IO Handlers (Phase 9.2)
      const handleEmrgCreated = (data: any) => {
        if (data?.zone) {
          setEmergencyZones((prev) => [data.zone, ...prev.filter((z) => z.zoneId !== data.zone.zoneId)]);
        }
      };

      const handleEmrgUpdated = (data: any) => {
        if (data?.zone) {
          setEmergencyZones((prev) =>
            prev.map((z) => (z.zoneId === data.zone.zoneId ? data.zone : z))
          );
        }
      };

      const handleEmrgToggled = (data: any) => {
        if (data?.zoneId) {
          setEmergencyZones((prev) =>
            prev.map((z) =>
              z.zoneId === data.zoneId ? { ...z, enabled: data.enabled } : z
            )
          );
        }
      };

      const handleEmrgDeleted = (data: any) => {
        if (data?.zoneId) {
          setEmergencyZones((prev) => prev.filter((z) => z.zoneId !== data.zoneId));
        }
      };

      socket.on('emergency_zone.created', handleEmrgCreated);
      socket.on('emergency_zone.updated', handleEmrgUpdated);
      socket.on('emergency_zone.toggled', handleEmrgToggled);
      socket.on('emergency_zone.deleted', handleEmrgDeleted);

      return () => {
        socket.off('restricted_zone.created', handleCreated);
        socket.off('restricted_zone.updated', handleUpdated);
        socket.off('restricted_zone.toggled', handleToggled);
        socket.off('restricted_zone.deleted', handleDeleted);
        socket.off('emergency_zone.created', handleEmrgCreated);
        socket.off('emergency_zone.updated', handleEmrgUpdated);
        socket.off('emergency_zone.toggled', handleEmrgToggled);
        socket.off('emergency_zone.deleted', handleEmrgDeleted);
      };
    }
  }, [socket]);

  const handleToggleZone = async (zone: RestrictedZone) => {
    try {
      const res = await api.toggleRestrictedZone(zone.zoneId || zone.id);
      setZones((prev) =>
        prev.map((z) => (z.zoneId === zone.zoneId ? { ...z, enabled: res.zone.enabled } : z))
      );
      setFeedbackMessage({
        text: `Restricted zone '${zone.name}' is now ${res.zone.enabled ? 'ACTIVE' : 'DISABLED'}.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || 'Failed to toggle zone', type: 'error' });
    }
  };

  const handleDeleteZone = async (zone: RestrictedZone) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete restricted zone '${zone.name}'?\nHistorical incident records referencing this zone will be preserved.`
    );
    if (!confirmed) return;

    try {
      await api.deleteRestrictedZone(zone.zoneId || zone.id);
      setZones((prev) => prev.filter((z) => z.zoneId !== zone.zoneId));
      setFeedbackMessage({
        text: `Restricted zone '${zone.name}' deleted. Historical references preserved.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || 'Failed to delete zone', type: 'error' });
    }
  };

  const handleOpenCreate = () => {
    setEditingZone(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (zone: RestrictedZone) => {
    setEditingZone(zone);
    setIsModalOpen(true);
  };

  const handleZoneSaved = (savedZone: RestrictedZone) => {
    setZones((prev) => {
      const idx = prev.findIndex((z) => z.zoneId === savedZone.zoneId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = savedZone;
        return copy;
      }
      return [savedZone, ...prev];
    });
    setFeedbackMessage({
      text: `Restricted zone '${savedZone.name}' successfully configured.`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Phase 9.2: Emergency Zone Operations
  const handleToggleEmergencyZone = async (zone: EmergencyZone) => {
    try {
      const res = await api.toggleEmergencyZone(zone.zoneId || zone.id);
      setEmergencyZones((prev) =>
        prev.map((z) => (z.zoneId === zone.zoneId ? { ...z, enabled: res.enabled } : z))
      );
      setFeedbackMessage({
        text: `Emergency area '${zone.name}' is now ${res.enabled ? 'ACTIVE' : 'DISABLED'}.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || 'Failed to toggle emergency area', type: 'error' });
    }
  };

  const handleDeleteEmergencyZone = async (zone: EmergencyZone) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete emergency safety area '${zone.name}'?\nHistorical incident records referencing this area will be preserved.`
    );
    if (!confirmed) return;

    try {
      await api.deleteEmergencyZone(zone.zoneId || zone.id);
      setEmergencyZones((prev) => prev.filter((z) => z.zoneId !== zone.zoneId));
      setFeedbackMessage({
        text: `Emergency safety area '${zone.name}' deleted. Historical references preserved.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || 'Failed to delete emergency area', type: 'error' });
    }
  };

  const handleOpenCreateEmergency = () => {
    setEditingEmergencyZone(null);
    setIsEmergencyModalOpen(true);
  };

  const handleOpenEditEmergency = (zone: EmergencyZone) => {
    setEditingEmergencyZone(zone);
    setIsEmergencyModalOpen(true);
  };

  const handleEmergencyZoneSaved = (savedZone: EmergencyZone) => {
    setEmergencyZones((prev) => {
      const idx = prev.findIndex((z) => z.zoneId === savedZone.zoneId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = savedZone;
        return copy;
      }
      return [savedZone, ...prev];
    });
    setFeedbackMessage({
      text: `Emergency safety area '${savedZone.name}' successfully configured.`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Filter Zones
  const filteredZones = zones.filter((z) => {
    if (selectedCameraFilter !== 'ALL' && z.cameraId.toLowerCase() !== selectedCameraFilter.toLowerCase()) {
      return false;
    }
    if (selectedTypeFilter !== 'ALL' && z.zoneType !== selectedTypeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = z.name.toLowerCase().includes(q);
      const matchCam = z.cameraId.toLowerCase().includes(q);
      const matchDesc = (z.description || '').toLowerCase().includes(q);
      if (!matchName && !matchCam && !matchDesc) return false;
    }
    return true;
  });

  // Filter Emergency Zones
  const filteredEmergencyZones = emergencyZones.filter((z) => {
    if (selectedCameraFilter !== 'ALL' && z.cameraId.toLowerCase() !== selectedCameraFilter.toLowerCase()) {
      return false;
    }
    if (selectedTypeFilter !== 'ALL' && z.zoneType !== selectedTypeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = z.name.toLowerCase().includes(q);
      const matchCam = z.cameraId.toLowerCase().includes(q);
      const matchDesc = (z.description || '').toLowerCase().includes(q);
      if (!matchName && !matchCam && !matchDesc) return false;
    }
    return true;
  });

  const getTypeBadgeClass = (type: RestrictedZone['zoneType']) => {
    switch (type) {
      case 'EMERGENCY':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'HIGH_RISK':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'AUTHORIZED_ONLY':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'RESTRICTED':
      default:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
  };

  const getEmergencyTypeBadgeClass = (type: EmergencyZone['zoneType']) => {
    switch (type) {
      case 'EMERGENCY_EXIT':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'ESCAPE_ROUTE':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'FIRE_EXTINGUISHER_ACCESS':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'EMERGENCY_PANEL_ACCESS':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'EVACUATION_PATH':
      default:
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
  };

  const getEmergencyTypeIcon = (type: EmergencyZone['zoneType']) => {
    switch (type) {
      case 'EMERGENCY_EXIT':
        return <DoorOpen className="w-3.5 h-3.5 text-red-400" />;
      case 'ESCAPE_ROUTE':
        return <ArrowRightCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'FIRE_EXTINGUISHER_ACCESS':
        return <Flame className="w-3.5 h-3.5 text-rose-400" />;
      case 'EMERGENCY_PANEL_ACCESS':
        return <Shield className="w-3.5 h-3.5 text-purple-400" />;
      case 'EVACUATION_PATH':
      default:
        return <Crosshair className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const getRiskBadgeClass = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'text-red-400 font-bold';
      case 'HIGH':
        return 'text-amber-400 font-bold';
      case 'MODERATE':
        return 'text-blue-400';
      case 'LOW':
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6 max-w-[1920px] mx-auto text-slate-100 select-none pb-12 animate-fade-in font-sans">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => {
            setActiveTab('RESTRICTED');
            setSelectedTypeFilter('ALL');
          }}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
            activeTab === 'RESTRICTED'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>RESTRICTED GEOFENCES</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white font-mono">
            {zones.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('EMERGENCY');
            setSelectedTypeFilter('ALL');
          }}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
            activeTab === 'EMERGENCY'
              ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-lg shadow-red-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <DoorOpen className="w-4 h-4" />
          <span>EMERGENCY SAFETY & ESCAPE ROUTES</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 font-mono">
            PHASE 9.2
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white font-mono">
            {emergencyZones.length}
          </span>
        </button>
      </div>

      {/* Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#12161F] p-6 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              activeTab === 'RESTRICTED'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {activeTab === 'RESTRICTED' ? (
              <Crosshair className="w-6 h-6" />
            ) : (
              <DoorOpen className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-wide text-white">
                {activeTab === 'RESTRICTED'
                  ? 'DYNAMIC RESTRICTED ZONES & GEOFENCING'
                  : 'EMERGENCY EXIT & ESCAPE ROUTE SAFETY MONITORING'}
              </h1>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold border ${
                  activeTab === 'RESTRICTED'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}
              >
                {activeTab === 'RESTRICTED' ? 'PHASE 9.1 ACTIVE' : 'PHASE 9.2 ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {activeTab === 'RESTRICTED'
                ? 'Authoritative MongoDB polygonal geofencing engine. Real-time camera spatial containment, role authorization, and temporal validation.'
                : 'Real-time CCTV blockage detection for emergency exits, evacuation routes, and safety equipment clearance per Phase 9.2.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAllData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
            title="Refresh Safety Areas"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {activeTab === 'RESTRICTED' ? (
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              CREATE RESTRICTED ZONE
            </button>
          ) : (
            <button
              onClick={handleOpenCreateEmergency}
              className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-500/20"
            >
              <Plus className="w-4 h-4" />
              CREATE EMERGENCY SAFETY AREA
            </button>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#161B26] p-4 rounded-xl border border-white/10 text-xs font-mono">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'RESTRICTED'
                ? 'Search by zone name, camera ID, or description...'
                : 'Search emergency area, camera ID, or description...'
            }
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
          />
        </div>

        <div className="md:col-span-3">
          <select
            value={selectedCameraFilter}
            onChange={(e) => setSelectedCameraFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-emerald-500 outline-none"
          >
            <option value="ALL" className="bg-[#161B26]">ALL CAMERAS</option>
            {cameras.map((c) => (
              <option key={c.code || c.id} value={c.code || c.id} className="bg-[#161B26]">
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-emerald-500 outline-none"
          >
            {activeTab === 'RESTRICTED' ? (
              <>
                <option value="ALL" className="bg-[#161B26]">ALL ZONE TYPES</option>
                <option value="RESTRICTED" className="bg-[#161B26]">RESTRICTED</option>
                <option value="HIGH_RISK" className="bg-[#161B26]">HIGH_RISK</option>
                <option value="EMERGENCY" className="bg-[#161B26]">EMERGENCY</option>
                <option value="AUTHORIZED_ONLY" className="bg-[#161B26]">AUTHORIZED_ONLY</option>
              </>
            ) : (
              <>
                <option value="ALL" className="bg-[#161B26]">ALL EMERGENCY TYPES</option>
                <option value="EMERGENCY_EXIT" className="bg-[#161B26]">EMERGENCY EXIT</option>
                <option value="ESCAPE_ROUTE" className="bg-[#161B26]">ESCAPE ROUTE</option>
                <option value="FIRE_EXTINGUISHER_ACCESS" className="bg-[#161B26]">FIRE EXTINGUISHER ACCESS</option>
                <option value="EMERGENCY_PANEL_ACCESS" className="bg-[#161B26]">EMERGENCY PANEL ACCESS</option>
                <option value="EVACUATION_PATH" className="bg-[#161B26]">EVACUATION PATH</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Main Zone Management Table or Empty State */}
      {activeTab === 'RESTRICTED' ? (
        filteredZones.length === 0 ? (
          /* Empty State per Requirement 26 */
          <div className="flex flex-col items-center justify-center p-16 bg-[#12161F] rounded-2xl border border-white/10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500">
              <Crosshair className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono tracking-wider text-slate-200 uppercase">
                NO RESTRICTED ZONES CONFIGURED
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-1 max-w-md mx-auto">
                No operational polygonal geofences have been established yet. Administrators and Safety Officers can define camera-specific boundaries.
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              CREATE RESTRICTED ZONE
            </button>
          </div>
        ) : (
          /* Zone Management Table per Requirement 8 */
          <div className="bg-[#12161F] rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#161B26] border-b border-white/10 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Zone</th>
                    <th className="py-3.5 px-4 font-bold">Camera</th>
                    <th className="py-3.5 px-4 font-bold">Site</th>
                    <th className="py-3.5 px-4 font-bold">Type</th>
                    <th className="py-3.5 px-4 font-bold">Enabled</th>
                    <th className="py-3.5 px-4 font-bold">Authorization</th>
                    <th className="py-3.5 px-4 font-bold">Schedule</th>
                    <th className="py-3.5 px-4 font-bold">Risk</th>
                    <th className="py-3.5 px-4 font-bold">Updated</th>
                    <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredZones.map((zone) => {
                    const cam = cameras.find((c) => c.code === zone.cameraId || c.id === zone.cameraId);

                    return (
                      <tr
                        key={zone.zoneId || zone.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Zone Name & Description */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-white text-xs flex items-center gap-1.5">
                              {zone.name}
                              <span className="text-[10px] text-slate-500">({zone.polygon?.length || 0} pts)</span>
                            </span>
                            {zone.description && (
                              <span className="text-[11px] text-slate-400 truncate max-w-xs">
                                {zone.description}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Camera */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <CameraIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-white font-bold">{zone.cameraId}</span>
                            {cam && (
                              <span className="text-[10px] text-slate-500 hidden sm:inline">
                                ({cam.name})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Site */}
                        <td className="py-3.5 px-4 text-slate-300">
                          {zone.siteId}
                        </td>

                        {/* Zone Type */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getTypeBadgeClass(
                              zone.zoneType
                            )}`}
                          >
                            {zone.zoneType}
                          </span>
                        </td>

                        {/* Enabled Status Toggle */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleZone(zone)}
                            className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white"
                            title={zone.enabled ? 'Click to disable' : 'Click to enable'}
                          >
                            {zone.enabled ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                ACTIVE
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                OFF
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Authorization Summary */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col text-[11px] text-slate-300">
                            {zone.zoneType === 'EMERGENCY' ? (
                              <span className="text-red-400 font-bold">NO WORKERS (EVACUATION)</span>
                            ) : zone.allowedRoles && zone.allowedRoles.length > 0 ? (
                              <span>{zone.allowedRoles.join(', ')}</span>
                            ) : zone.allowedEmployees && zone.allowedEmployees.length > 0 ? (
                              <span>{zone.allowedEmployees.length} Employee(s)</span>
                            ) : (
                              <span className="text-slate-500">General Authorized</span>
                            )}
                            <span className="text-[9px] text-slate-500">
                              Unknown: {zone.unknownIdentityPolicy || 'FLAG_UNKNOWN'}
                            </span>
                          </div>
                        </td>

                        {/* Schedule */}
                        <td className="py-3.5 px-4">
                          {zone.schedule?.enabled && zone.schedule.startTime ? (
                            <div className="flex items-center gap-1 text-amber-300 text-[11px]">
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>
                                {zone.schedule.startTime} - {zone.schedule.endTime}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">24/7 Monitored</span>
                          )}
                        </td>

                        {/* Risk Level */}
                        <td className="py-3.5 px-4">
                          <span className={getRiskBadgeClass(zone.riskLevel)}>
                            {zone.riskLevel}
                          </span>
                        </td>

                        {/* Updated Timestamp */}
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {zone.updatedAt ? new Date(zone.updatedAt).toLocaleDateString() : 'N/A'}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(zone)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                              title="Edit Zone"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(zone)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                              title="Soft Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        )
      ) : (
        /* Emergency Safety Areas Table (Phase 9.2) */
        filteredEmergencyZones.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 bg-[#12161F] rounded-2xl border border-white/10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/5 border border-red-500/20 flex items-center justify-center text-red-400">
              <DoorOpen className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono tracking-wider text-slate-200 uppercase">
                NO EMERGENCY AREAS CONFIGURED
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-1 max-w-md mx-auto">
                No camera-specific emergency exit, escape route, or safety equipment clearance polygons have been established yet.
              </p>
            </div>
            <button
              onClick={handleOpenCreateEmergency}
              className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-500/20"
            >
              <Plus className="w-4 h-4" />
              CREATE EMERGENCY SAFETY AREA
            </button>
          </div>
        ) : (
          <div className="bg-[#12161F] rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#161B26] border-b border-white/10 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Emergency Area</th>
                    <th className="py-3.5 px-4 font-bold">Camera</th>
                    <th className="py-3.5 px-4 font-bold">Site</th>
                    <th className="py-3.5 px-4 font-bold">Type</th>
                    <th className="py-3.5 px-4 font-bold">Enabled</th>
                    <th className="py-3.5 px-4 font-bold">Obstruction Targets</th>
                    <th className="py-3.5 px-4 font-bold">Persistence Threshold</th>
                    <th className="py-3.5 px-4 font-bold">Risk</th>
                    <th className="py-3.5 px-4 font-bold">Updated</th>
                    <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredEmergencyZones.map((zone) => {
                    const cam = cameras.find((c) => c.code === zone.cameraId || c.id === zone.cameraId);

                    return (
                      <tr
                        key={zone.zoneId || zone.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Area Name & Description */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-white text-xs flex items-center gap-1.5">
                              {zone.name}
                              <span className="text-[10px] text-slate-500">({zone.polygon?.length || 0} pts)</span>
                            </span>
                            {zone.description && (
                              <span className="text-[11px] text-slate-400 truncate max-w-xs">
                                {zone.description}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Camera */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <CameraIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-white font-bold">{zone.cameraId}</span>
                            {cam && (
                              <span className="text-[10px] text-slate-500 hidden sm:inline">
                                ({cam.name})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Site */}
                        <td className="py-3.5 px-4 text-slate-300">
                          {zone.siteId}
                        </td>

                        {/* Area Type */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border ${getEmergencyTypeBadgeClass(
                              zone.zoneType
                            )}`}
                          >
                            {getEmergencyTypeIcon(zone.zoneType)}
                            <span>{zone.zoneType.replace(/_/g, ' ')}</span>
                          </span>
                        </td>

                        {/* Enabled Status Toggle */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleEmergencyZone(zone)}
                            className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white"
                            title={zone.enabled ? 'Click to disable' : 'Click to enable'}
                          >
                            {zone.enabled ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                ACTIVE
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                OFF
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Obstruction Targets */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(zone.allowedObjectClasses || ['person', 'tool']).map((cls) => (
                              <span
                                key={cls}
                                className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-slate-300"
                              >
                                {cls}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Persistence Threshold */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1 text-amber-300 text-[11px]">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>
                              {((zone.temporalThresholdMs || 3000) / 1000).toFixed(1)}s persistence
                            </span>
                          </div>
                        </td>

                        {/* Risk Level */}
                        <td className="py-3.5 px-4">
                          <span className={getRiskBadgeClass(zone.riskLevel)}>
                            {zone.riskLevel}
                          </span>
                        </td>

                        {/* Updated Timestamp */}
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {zone.updatedAt ? new Date(zone.updatedAt).toLocaleDateString() : 'N/A'}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditEmergency(zone)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                              title="Edit Emergency Area"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEmergencyZone(zone)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                              title="Delete Emergency Area"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        )
      )}

      {/* Restricted Zone Editor Modal */}
      {isModalOpen && (
        <ZoneEditorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaved={handleZoneSaved}
          initialZone={editingZone}
          defaultCameraId={selectedCameraFilter !== 'ALL' ? selectedCameraFilter : undefined}
          cameras={cameras}
          sites={sites}
        />
      )}

      {/* Emergency Safety Zone Editor Modal (Phase 9.2) */}
      {isEmergencyModalOpen && (
        <EmergencyZoneEditorModal
          isOpen={isEmergencyModalOpen}
          onClose={() => setIsEmergencyModalOpen(false)}
          onSaved={handleEmergencyZoneSaved}
          initialZone={editingEmergencyZone}
          defaultCameraId={selectedCameraFilter !== 'ALL' ? selectedCameraFilter : undefined}
          cameras={cameras}
          sites={sites}
        />
      )}
    </div>
  );
};

