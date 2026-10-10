import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Camera,
  AlertOctagon,
  BarChart3,
  FileText,
  Sliders,
  Settings,
  Shield,
  HardHat,
  User,
  Users,
  Radio,
  FileClock,
  Cpu,
  ShieldCheck,
  Clock,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Smartphone,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { api } from '../../services/api';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { liveIncidents } = useSocket();
  const {
    isSidebarCollapsed,
    toggleSidebarCollapse,
    isMobileSidebarOpen,
    closeMobileSidebar,
  } = useUI();
  const location = useLocation();
  const navigate = useNavigate();

  const [nodeHealth, setNodeHealth] = useState<'ONLINE' | 'OFFLINE' | 'CHECKING'>('CHECKING');
  const [systemStatus, setSystemStatus] = useState<string>('HEALTHY');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const criticalCount = (liveIncidents || []).filter(
    (i) => i.severity === 'critical' && i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
  ).length;

  const role = user?.role || 'SAFETY_OFFICER';

  // Live health check
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      const t0 = performance.now();
      try {
        const res = await api.getHealth();
        if (isMounted) {
          const t1 = performance.now();
          setLatencyMs(Math.round(t1 - t0));
          setNodeHealth('ONLINE');
          setSystemStatus(res.status || 'HEALTHY');
        }
      } catch {
        if (isMounted) {
          setNodeHealth('OFFLINE');
          setSystemStatus('OFFLINE');
          setLatencyMs(null);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Strict RBAC / SBAC navigation definitions based on verified routes
  const getNavSections = (): NavSection[] => {
    switch (role) {
      case 'ADMIN':
        return [
          {
            title: 'Operations',
            items: [
              { label: 'System Overview', path: '/admin', icon: Shield, exact: true },
              { label: 'CCTV Feeds', path: '/cameras', icon: Camera, badge: 'RTSP/LIVE' },
              {
                label: 'Incidents',
                path: '/incidents',
                icon: AlertOctagon,
                badge: criticalCount > 0 ? `${criticalCount} CRIT` : undefined,
                badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30',
              },
            ],
          },
          {
            title: 'Workforce & Rules',
            items: [
              { label: 'User Accounts', path: '/admin/users', icon: Users },
              { label: 'Personnel Roster', path: '/employees', icon: HardHat },
              { label: 'Shift Schedules', path: '/shifts', icon: Clock },
              { label: 'Safety Rules Engine', path: '/admin/safety-rules', icon: ShieldCheck },
              { label: 'Restricted Zones', path: '/restricted-zones', icon: ShieldAlert, badge: 'GEOFENCE' },
            ],
          },
          {
            title: 'Analytics & System',
            items: [
              { label: 'Safety Analytics', path: '/analytics', icon: BarChart3 },
              { label: 'Audit Reports', path: '/audit-reports', icon: FileText },
              { label: 'System Diagnostics', path: '/system-health', icon: Activity },
              { label: 'Site Onboarding', path: '/onboarding', icon: Sliders },
              { label: 'PPE Models & Training', path: '/training', icon: Cpu, badge: 'PHASE 12.2' },
              { label: 'AI Configuration', path: '/settings', icon: Settings },
              { label: 'Audit Trail', path: '/admin/audit-logs', icon: FileClock },
            ],
          },
        ];

      case 'PLANT_MANAGER':
        return [
          {
            title: 'Plant Management',
            items: [
              { label: 'Plant Overview', path: '/dashboard', icon: LayoutDashboard, exact: true },
              { label: 'CCTV Stream Matrix', path: '/cameras', icon: Camera, badge: 'RTSP/LIVE' },
              {
                label: 'Incidents',
                path: '/incidents',
                icon: AlertOctagon,
                badge: criticalCount > 0 ? `${criticalCount} CRIT` : undefined,
                badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30',
              },
              { label: 'Restricted Zones', path: '/restricted-zones', icon: ShieldAlert, badge: 'GEOFENCE' },
              { label: 'Workforce Roster', path: '/employees', icon: Users },
              { label: 'Shift Schedules', path: '/shifts', icon: Clock },
              { label: 'Safety Rules', path: '/admin/safety-rules', icon: ShieldCheck },
              { label: 'Compliance Analytics', path: '/analytics', icon: BarChart3 },
              { label: 'Audit Reports', path: '/audit-reports', icon: FileText },
              { label: 'System Health', path: '/system-health', icon: Activity },
            ],
          },
        ];

      case 'SAFETY_OFFICER':
        return [
          {
            title: 'Safety Command',
            items: [
              { label: 'Surveillance Room', path: '/surveillance', icon: Radio, badge: 'LIVE', exact: true },
              { label: 'Surveillance Cameras', path: '/cameras', icon: Camera, badge: 'RTSP/LIVE' },
              {
                label: 'Incidents',
                path: '/incidents',
                icon: AlertOctagon,
                badge: criticalCount > 0 ? `${criticalCount} CRIT` : undefined,
                badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30',
              },
              { label: 'Restricted Zones', path: '/restricted-zones', icon: ShieldAlert, badge: 'GEOFENCE' },
              { label: 'Personnel Roster', path: '/employees', icon: Users },
              { label: 'Safety Policies', path: '/admin/safety-rules', icon: ShieldCheck },
              { label: 'Compliance Analytics', path: '/analytics', icon: BarChart3 },
              { label: 'Audit Reports', path: '/audit-reports', icon: FileText },
              { label: 'PPE Models & Training', path: '/training', icon: Cpu, badge: 'PHASE 12.2' },
            ],
          },
        ];

      case 'SUPERVISOR':
        return [
          {
            title: 'Supervisor Desk',
            items: [
              { label: 'Zone Operations', path: '/supervisor', icon: HardHat, badge: 'SCOPED', exact: true },
              { label: 'Incidents', path: '/incidents', icon: AlertOctagon },
              { label: 'Zone Camera Feeds', path: '/cameras', icon: Camera },
              { label: 'Crew Workforce', path: '/employees', icon: Users },
              { label: 'Shift Schedules', path: '/shifts', icon: Clock },
            ],
          },
        ];

      case 'EMPLOYEE':
        return [
          {
            title: 'Worker Portal',
            items: [
              { label: 'My Safety Portal', path: '/employee', icon: User, badge: 'PPE', exact: true },
              { label: 'Incidents', path: '/incidents', icon: AlertOctagon },
              { label: 'My Shift & Zones', path: '/employees', icon: Clock },
              { label: 'My Profile', path: '/profile', icon: User },
            ],
          },
        ];

      default:
        return [];
    }
  };

  const sections = getNavSections();

  const handleLinkClick = () => {
    // Automatically close drawer on mobile upon navigation
    if (window.innerWidth < 768) {
      closeMobileSidebar();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isRoleAdmin = role === 'ADMIN';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div
          onClick={closeMobileSidebar}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        aria-label="Command Center Navigation"
        className={`fixed top-[var(--header-height)] left-0 bottom-0 bg-[#0d1016] border-r border-white/5 flex flex-col justify-between select-none z-40 transition-all duration-300 ease-in-out ${
          /* Desktop dimensions */
          isSidebarCollapsed ? 'md:w-[72px]' : 'md:w-64'
        } ${
          /* Mobile Drawer: slide in/out */
          isMobileSidebarOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Role & Site Badge (Expanded) or Compact Icon (Collapsed) */}
        <div className="shrink-0 p-3 border-b border-white/5 flex items-center justify-between">
          {!isSidebarCollapsed ? (
            <div className="flex-1 min-w-0 pr-2 font-mono">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>OPERATIONAL CONSOLE</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    nodeHealth === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                  }`}
                  title={`Backend: ${nodeHealth}`}
                />
              </div>
              <div className="text-xs font-bold text-white truncate mt-0.5">
                {role.replace(/_/g, ' ')}
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                {user?.zoneIds?.includes('*')
                  ? 'All Plant Zones (*)'
                  : `Zones: ${user?.zoneIds?.join(', ') || 'Unassigned'}`}
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center py-1">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  nodeHealth === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                }`}
                title={`Status: ${nodeHealth} (${role})`}
              />
            </div>
          )}

          {/* Desktop Collapse / Expand Toggle Button */}
          <button
            onClick={toggleSidebarCollapse}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition border border-white/10 shrink-0"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-4 custom-scrollbar">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-2.5 py-1 text-[10px] font-mono tracking-wider text-slate-500 font-bold uppercase truncate">
                  {section.title}
                </div>
              )}
              {isSidebarCollapsed && sIdx > 0 && (
                <div className="h-px bg-white/5 my-2 mx-1" />
              )}

              <nav className="space-y-1 font-mono text-xs">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isCurrentActive = item.exact
                    ? location.pathname === item.path
                    : location.pathname === item.path ||
                      (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={handleLinkClick}
                      title={isSidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) => {
                        const active = isActive || isCurrentActive;
                        return `relative flex items-center ${
                          isSidebarCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                        } rounded-xl transition-all group ${
                          active
                            ? 'bg-emerald-500/10 text-white font-bold border border-emerald-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`;
                      }}
                    >
                      {({ isActive }) => {
                        const active = isActive || isCurrentActive;
                        return (
                          <>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon
                                className={`w-4 h-4 shrink-0 transition ${
                                  active
                                    ? 'text-emerald-400'
                                    : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                              />
                              {!isSidebarCollapsed && (
                                <span className="truncate">{item.label}</span>
                              )}
                            </div>

                            {/* Badge */}
                            {!isSidebarCollapsed && item.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                  item.badgeColor || 'bg-white/10 text-slate-300'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}

                            {/* Collapsed dot badge for critical alerts */}
                            {isSidebarCollapsed && item.badge && (
                              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                          </>
                        );
                      }}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom Section: Authenticated User Profile & System Telemetry */}
        <div className="shrink-0 p-2.5 border-t border-white/5 bg-[#0a0c10] space-y-2">
          {!isSidebarCollapsed ? (
            <>
              {/* User Identity Card */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 font-bold font-mono text-xs">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SV'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate font-sans">
                      {user?.name || 'Operator'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">
                      {user?.email || 'authenticated'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      handleLinkClick();
                      navigate(isRoleAdmin ? '/settings' : '/profile');
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                    title={isRoleAdmin ? 'AI Configuration' : 'User Profile'}
                    aria-label="Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition"
                    title="Sign Out"
                    aria-label="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Edge Server Health Bar */}
              <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-slate-400" />
                  <span>CORE: {latencyMs !== null ? `${latencyMs}ms` : '—'}</span>
                </span>
                <span className="text-emerald-400 font-bold">RBAC ACTIVE</span>
              </div>
            </>
          ) : (
            /* Collapsed Mode User Action Stack */
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                onClick={() => navigate(isRoleAdmin ? '/settings' : '/profile')}
                className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition font-bold font-mono text-xs"
                title={`${user?.name || 'Operator'} (${role})`}
                aria-label="Profile"
              >
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SV'}
              </button>
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 flex items-center justify-center transition"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
