import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { ShieldAlert, ArrowLeft, LogOut, KeyRound, MapPin, UserCheck } from 'lucide-react';

interface CanProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({ permission, children, fallback = null }) => {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

interface RoleGuardProps {
  roles: Role | Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ roles, children, fallback }) => {
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f12] flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-mono tracking-wider">VERIFYING ENTERPRISE CREDENTIALS...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(roles)) {
    return fallback ? <>{fallback}</> : <AccessDeniedPage requiredRoles={Array.isArray(roles) ? roles : [roles]} />;
  }

  return <>{children}</>;
};

interface ScopeGuardProps {
  siteId?: string;
  zoneId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ScopeGuard: React.FC<ScopeGuardProps> = ({ siteId, zoneId, children, fallback }) => {
  const { isInScope } = useAuth();

  if (!isInScope(siteId, zoneId)) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
        <div className="flex items-center gap-3 font-semibold mb-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <span>Out of Zone Supervision Scope</span>
        </div>
        <p className="text-xs text-amber-200/80">
          This operational sector ({zoneId || siteId}) is outside your assigned plant credentials.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export const AccessDeniedPage: React.FC<{ requiredRoles?: Role[] }> = ({ requiredRoles }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const getDashboardRoute = (role?: Role) => {
    switch (role) {
      case 'ADMIN':
        return '/admin';
      case 'PLANT_MANAGER':
        return '/dashboard';
      case 'SAFETY_OFFICER':
        return '/surveillance';
      case 'SUPERVISOR':
        return '/supervisor';
      case 'EMPLOYEE':
        return '/employee';
      default:
        return '/login';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-xl bg-[#12151b] border border-red-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-8 h-8 text-red-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-widest px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                HTTP 403 FORBIDDEN
              </span>
              <span className="text-xs font-mono text-slate-400">RBAC / SBAC ENFORCEMENT</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">Access Restricted by Security Policy</h1>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          Your account does not possess operational authorization or zone clearance to inspect this sector. SafeVision operates an audited zero-trust security perimeter.
        </p>

        {/* User Scope Credentials Card */}
        {user && (
          <div className="bg-[#0b0d12] border border-white/5 rounded-xl p-4 mb-6 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                Authenticated User:
              </span>
              <span className="text-white font-semibold">{user.name} ({user.email})</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Active Security Role:
              </span>
              <span className="text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                {user.role}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Authorized Zone Scope:
              </span>
              <span className="text-emerald-400 font-semibold">
                {user.zoneIds.includes('*') ? 'ALL PLANT ZONES (*)' : user.zoneIds.join(', ')}
              </span>
            </div>
            {requiredRoles && requiredRoles.length > 0 && (
              <div className="flex justify-between items-center pt-1 text-red-300">
                <span>Required Roles for this Resource:</span>
                <span className="font-semibold">{requiredRoles.join(' or ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={() => navigate(getDashboardRoute(user?.role))}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Authorized Dashboard
          </button>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Switch Account
          </button>
        </div>
      </div>
    </div>
  );
};
