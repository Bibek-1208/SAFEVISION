import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Volume2,
  VolumeX,
  Bell,
  Cpu,
  ChevronDown,
  User as UserIcon,
  LogOut,
  Sliders,
  Menu,
  Building2,
  Plus,
  Edit2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useUI } from '../../context/UIContext';
import { useSite } from '../../context/SiteContext';
import { safetyAudio } from '../../services/SafetyAudioService';
import { api } from '../../services/api';
import { GlobalSearch } from './GlobalSearch';
import { determineActiveShift, ShiftScheduleItem } from '../../utils/shiftUtils';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markNotificationsAsRead } = useSocket();
  const { toggleMobileSidebar } = useUI();
  const navigate = useNavigate();

  const [soundEnabled, setSoundEnabled] = useState(safetyAudio.isArmed());
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Enterprise Site Context
  const { sites, currentSite, zoneCount, selectSite, openSiteModal } = useSite();
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const siteDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close site dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target as Node)) {
        setShowSiteDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dynamic Shift State & Schedule
  const [allShifts, setAllShifts] = useState<ShiftScheduleItem[]>([]);
  const [activeShift, setActiveShift] = useState<{ name: string; startTime: string; endTime: string } | null>(null);

  // Real AI Health State
  const [aiStatus, setAiStatus] = useState<{
    connected: boolean;
    latencyMs: number | null;
    modelStatus: 'unconfigured' | 'configured' | 'offline';
    modelName: string;
  }>({
    connected: false,
    latencyMs: null,
    modelStatus: 'offline',
    modelName: 'AI Service',
  });

  // Re-evaluate current active shift against schedule and current time
  const recomputeActiveShift = (shifts: ShiftScheduleItem[], tz?: string) => {
    const current = determineActiveShift(shifts, new Date(), tz);
    if (current) {
      setActiveShift({
        name: current.name,
        startTime: current.startTime,
        endTime: current.endTime,
      });
    } else {
      setActiveShift(null);
    }
  };

  // Fetch dynamic Shifts
  useEffect(() => {
    let isMounted = true;
    const fetchShifts = async () => {
      try {
        const shiftsRes = await api.getShifts();
        if (isMounted && shiftsRes) {
          const shiftList = Array.isArray(shiftsRes?.shifts) ? shiftsRes.shifts : [];
          setAllShifts(shiftList);

          if (shiftsRes?.activeShift) {
            const s = shiftsRes.activeShift;
            setActiveShift({
              name: s.name,
              startTime: s.startTime,
              endTime: s.endTime,
            });
          } else {
            recomputeActiveShift(shiftList, currentSite?.timezone);
          }
        }
      } catch (err) {
        console.error('Failed to load shift metadata:', err);
      }
    };

    fetchShifts();
    const interval = setInterval(fetchShifts, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentSite?.timezone]);

  // Clock ticker for shift transitions (e.g. at 14:01 automatically switch Shift A -> Shift B)
  useEffect(() => {
    if (allShifts.length === 0) return;
    const shiftTicker = setInterval(() => {
      recomputeActiveShift(allShifts, currentSite?.timezone);
    }, 10000);
    return () => clearInterval(shiftTicker);
  }, [allShifts, currentSite?.timezone]);

  // Poll AI engine health truthfully from /api/health/ai
  useEffect(() => {
    let isMounted = true;
    const checkAiHealth = async () => {
      try {
        const data = await api.getAiHealth();
        if (isMounted) {
          const isOnline = data.status === 'ONLINE' || data.serviceStatus === 'AI ONLINE';
          const isLoaded = data.modelStatus === 'READY' || data.modelStatus === 'MODEL LOADED' || data.runtimeState === 'READY';
          if (isOnline) {
            setAiStatus({
              connected: true,
              latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : (typeof data.latency === 'number' ? Math.round(data.latency) : null),
              modelStatus: isLoaded ? 'configured' : 'unconfigured',
              modelName: isLoaded
                ? (data.modelName || data.telemetry?.modelName || 'Industrial YOLOv8')
                : 'BASELINE CV (WEIGHTS UNCONFIGURED)',
            });
          } else {
            setAiStatus({
              connected: false,
              latencyMs: null,
              modelStatus: 'offline',
              modelName: 'AI OFFLINE',
            });
          }
        }
      } catch (_) {
        if (isMounted) {
          setAiStatus({
            connected: false,
            latencyMs: null,
            modelStatus: 'offline',
            modelName: 'AI OFFLINE',
          });
        }
      }
    };

    checkAiHealth();
    const interval = setInterval(checkAiHealth, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-[var(--header-height)] bg-[#0d1016] border-b border-white/5 flex items-center justify-between px-3 md:px-4 z-40 select-none">
      {/* Left: Hamburger & Brand & Plant Site Selector */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          onClick={toggleMobileSidebar}
          className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 md:hidden transition border border-white/5"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-glow-safe group-hover:border-emerald-400 transition">
            <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-wider text-white text-sm font-sans">
                SAFEVISION
              </span>
              <span className="text-[10px] px-1 py-0.2 bg-safe/20 text-safe font-mono font-bold rounded">
                AI
              </span>
            </div>
            <p className="text-[9px] text-gray-400 font-mono tracking-tight -mt-0.5">
              INDUSTRIAL TELEMETRY
            </p>
          </div>
        </div>

        <div className="h-6 w-px bg-[#262626] mx-1 hidden md:block" />

        {/* Dynamic Enterprise Site Selector Pill */}
        <div ref={siteDropdownRef} className="relative hidden lg:block">
          <div
            id="site-selector-trigger"
            onClick={() => setShowSiteDropdown((prev) => !prev)}
            className="flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#222222] border border-[#2E2E2E] hover:border-emerald-500/40 px-3 py-1.5 rounded-md cursor-pointer transition select-none"
            title="Click to switch or manage operational plant site"
          >
            <div className={`w-2 h-2 rounded-full ${currentSite ? 'bg-safe animate-pulse-subtle' : 'bg-amber-500'}`} />
            <div className="text-left">
              <p className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                {currentSite?.name || 'No Site Selected'}
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showSiteDropdown ? 'rotate-180 text-emerald-400' : ''}`} />
              </p>
              <p className="text-[9px] text-gray-400 font-mono">
                SITE: {currentSite?.code || 'UNCONFIGURED'} • {zoneCount === 0 ? '0 ZONES MONITORED' : `${zoneCount} ZONES MONITORED`}
              </p>
            </div>
          </div>

          {/* Interactive Site Dropdown Menu */}
          {showSiteDropdown && (
            <div
              id="site-selector-dropdown"
              className="absolute left-0 mt-2 w-80 bg-[#161922] border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
            >
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-wider text-gray-400 uppercase flex items-center gap-1.5 font-bold">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  Company & Site Network
                </span>
                <span className="text-[10px] font-mono bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">
                  {sites.length} Active
                </span>
              </div>

              {/* Sites List or Empty State */}
              <div className="max-h-60 overflow-y-auto py-1 space-y-1">
                {sites.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs font-mono text-gray-400">NO SITES CONFIGURED</p>
                    <p className="text-[10px] text-gray-500 mt-1">Add your first plant to begin surveillance</p>
                  </div>
                ) : (
                  sites.map((s) => {
                    const isSelected = (currentSite?.siteId === s.siteId) || (currentSite?.id === s.id);
                    return (
                      <div
                        key={s.siteId || s.id}
                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                          isSelected
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-white'
                            : 'hover:bg-white/5 border border-transparent text-gray-300'
                        }`}
                        onClick={() => {
                          selectSite(s.siteId || s.id);
                          setShowSiteDropdown(false);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                            <p className="text-xs font-semibold truncate text-white">{s.name}</p>
                            {isSelected && (
                              <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 pl-3.5 flex items-center gap-2">
                            <span>{s.code}</span>
                            <span>•</span>
                            <span>{s.zoneCount || 0} zones</span>
                            <span>•</span>
                            <span>{s.cameraCount || 0} cameras</span>
                          </p>
                        </div>

                        {/* Quick Edit Icon */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSiteDropdown(false);
                            openSiteModal('edit', s);
                          }}
                          className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition opacity-0 group-hover:opacity-100"
                          title="Edit Site Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Buttons: Add & Manage */}
              <div className="pt-2 mt-1 border-t border-white/5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  id="add-company-site-btn"
                  onClick={() => {
                    setShowSiteDropdown(false);
                    openSiteModal('add');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + ADD SITE
                </button>
                <button
                  type="button"
                  id="manage-sites-btn"
                  onClick={() => {
                    setShowSiteDropdown(false);
                    openSiteModal('manage');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-mono font-semibold transition"
                >
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  MANAGE SITES
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Real Global Search */}
      <GlobalSearch />

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Shift Schedule Badge */}
        <div className="hidden xl:flex flex-col text-right pr-2 border-r border-[#262626]">
          <span className="text-[10px] text-gray-400 font-mono">
            {activeShift ? activeShift.name : 'NO ACTIVE SHIFT'}
          </span>
          <span className="text-[11px] font-semibold text-gray-200 font-mono">
            {activeShift ? `${activeShift.startTime} - ${activeShift.endTime}` : '—'}
          </span>
        </div>

        {/* AI Engine Status Pill */}
        {aiStatus.connected ? (
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded border ${
              aiStatus.modelStatus === 'unconfigured'
                ? 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                : 'bg-[#161616] border-[#2A2A2A] text-gray-300'
            }`}
          >
            <Cpu
              className={`w-3.5 h-3.5 ${
                aiStatus.modelStatus === 'unconfigured' ? 'text-amber-400' : 'text-safe'
              }`}
            />
            <span className="text-[10px] font-mono">
              {aiStatus.modelName} {aiStatus.latencyMs !== null ? `• ${aiStatus.latencyMs}ms` : ''}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                aiStatus.modelStatus === 'unconfigured'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-safe animate-pulse'
              }`}
            />
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-950/40 border border-red-900/60">
            <Cpu className="w-3.5 h-3.5 text-critical" />
            <span className="text-[10px] font-mono text-red-400 font-bold">
              AI OFFLINE
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-critical" />
          </div>
        )}

        {/* Audio Alert Toggle */}
        <button
          onClick={async () => {
            if (safetyAudio.isArmed()) {
              safetyAudio.disarm();
              setSoundEnabled(false);
            } else {
              const ok = await safetyAudio.arm();
              setSoundEnabled(ok);
            }
          }}
          className={`p-2 rounded-md border ${
            soundEnabled
              ? 'bg-[#1C1C1C] border-[#333] text-gray-300 hover:text-white'
              : 'bg-red-900/20 border-red-800 text-red-400'
          } transition`}
          title={soundEnabled ? 'Acoustic siren enabled' : 'Acoustic siren muted'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-safe" />
          ) : (
            <VolumeX className="w-4 h-4 text-critical" />
          )}
        </button>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) markNotificationsAsRead();
            }}
            className="relative p-2 rounded-md bg-[#1C1C1C] border border-[#2E2E2E] hover:border-gray-600 text-gray-300 hover:text-white transition"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-critical text-white font-mono text-[9px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-[#1E1E1E] border border-[#333] rounded-lg shadow-2xl p-2 z-50">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#2A2A2A]">
                <span className="text-xs font-bold text-gray-200 font-mono">
                  LIVE INCIDENT ALERTS
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {notifications.length} logged
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#262626] mt-1">
                {notifications.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">
                    No active violation alerts
                  </p>
                ) : (
                  notifications.slice(0, 6).map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        setShowNotifications(false);
                        navigate(notif.incidentId ? `/incidents/${notif.incidentId}` : '/incidents');
                      }}
                      className="p-2.5 hover:bg-[#252525] rounded cursor-pointer transition text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[10px] font-bold font-mono px-1 rounded ${
                            notif.severity === 'critical'
                              ? 'bg-critical/20 text-critical'
                              : 'bg-warning/20 text-warning'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono">
                          {new Date(notif.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div className="relative">
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#2C2C2C] px-2.5 py-1 rounded-md cursor-pointer transition"
          >
            <div className="w-7 h-7 rounded-full bg-safe/20 border border-safe/40 flex items-center justify-center text-safe font-bold text-xs font-mono overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.name || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
              )}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-gray-200 leading-tight">
                {user?.name || 'Operational Personnel'}
              </p>
              <p className="text-[9px] text-safe font-mono uppercase">
                {user?.role ? user.role.replace(/_/g, ' ') : 'OPERATOR'}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </div>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333] rounded-lg shadow-2xl p-1 z-50">
              <div className="px-3 py-2 border-b border-[#2A2A2A]">
                <p className="text-xs font-bold text-white">{user?.name}</p>
                <p className="text-[10px] text-gray-400 font-mono truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate('/profile');
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#282828] rounded flex items-center gap-2"
              >
                <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                Profile & Credentials
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate('/settings');
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#282828] rounded flex items-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5 text-gray-400" />
                System Settings
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                  navigate('/login');
                }}
                className="w-full text-left px-3 py-2 text-xs text-critical hover:bg-critical/10 rounded flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5 text-critical" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
