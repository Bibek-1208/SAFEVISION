import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { SiteProvider } from './context/SiteContext';
import { UIProvider } from './context/UIContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { AppShell } from './components/common/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RoleGuard } from './components/auth/Guards';

// Pages
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CamerasPage } from './pages/CamerasPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuditReportsPage } from './pages/AuditReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SmartIncidentResponsePage } from './pages/SmartIncidentResponsePage';
import { TrainingPage } from './pages/TrainingPage';

// Role-Specific Dashboards
import { AdminDashboardPage } from './pages/dashboards/AdminDashboardPage';
import { PlantManagerDashboardPage } from './pages/dashboards/PlantManagerDashboardPage';
import { SafetyOfficerDashboardPage } from './pages/dashboards/SafetyOfficerDashboardPage';
import { SupervisorDashboardPage } from './pages/dashboards/SupervisorDashboardPage';
import { EmployeeDashboardPage } from './pages/dashboards/EmployeeDashboardPage';

// Admin Subpages
import { UserManagementPage } from './pages/admin/UserManagementPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';

// Workforce, Shifts, Safety Rules & Diagnostics
import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
import { ShiftsManagementPage } from './pages/ShiftsManagementPage';
import { SafetyRulesPage } from './pages/SafetyRulesPage';
import { RestrictedZonesPage } from './pages/RestrictedZonesPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import { MobileFieldOpsPage } from './pages/MobileFieldOpsPage';

const queryClient = new QueryClient();

// Dynamic Role Home Redirector
const RoleHomeRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f12] flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono tracking-wider">RESOLVING USER PERMISSIONS...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  switch (user.role) {
    case 'ADMIN':
      return <Navigate to="/admin" replace />;
    case 'PLANT_MANAGER':
      return <Navigate to="/dashboard" replace />;
    case 'SAFETY_OFFICER':
      return <Navigate to="/surveillance" replace />;
    case 'SUPERVISOR':
      return <Navigate to="/supervisor" replace />;
    case 'EMPLOYEE':
      return <Navigate to="/employee" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

// Authenticated Layout Wrapper
const DashboardLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#101318] flex items-center justify-center font-mono text-xs text-emerald-400">
        SYNCHRONIZING ENTERPRISE SECURITY CORE...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <SiteProvider>
            <UIProvider>
            <BrowserRouter>
            <Routes>
              {/* Public Screen */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Command Center Routes */}
              <Route element={<DashboardLayout />}>
                {/* 1. Admin Module */}
                <Route
                  path="/admin"
                  element={
                    <RoleGuard roles={['ADMIN']}>
                      <AdminDashboardPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <RoleGuard roles={['ADMIN']}>
                      <UserManagementPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/admin/audit-logs"
                  element={
                    <RoleGuard roles={['ADMIN']}>
                      <AuditLogPage />
                    </RoleGuard>
                  }
                />

                {/* 2. Plant Manager Module */}
                <Route
                  path="/dashboard"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER']}>
                      <PlantManagerDashboardPage />
                    </RoleGuard>
                  }
                />

                {/* 3. Safety Officer Surveillance Room */}
                <Route
                  path="/surveillance"
                  element={
                    <RoleGuard roles={['ADMIN', 'SAFETY_OFFICER']}>
                      <SafetyOfficerDashboardPage />
                    </RoleGuard>
                  }
                />

                {/* 4. Supervisor Zone Ops */}
                <Route
                  path="/supervisor"
                  element={
                    <RoleGuard roles={['ADMIN', 'SUPERVISOR']}>
                      <SupervisorDashboardPage />
                    </RoleGuard>
                  }
                />

                {/* 5. Employee Portal */}
                <Route
                  path="/employee"
                  element={
                    <RoleGuard roles={['ADMIN', 'EMPLOYEE', 'SUPERVISOR']}>
                      <EmployeeDashboardPage />
                    </RoleGuard>
                  }
                />

                {/* Shared Resources with Explicit Role Guards */}
                <Route
                  path="/cameras"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR']}>
                      <CamerasPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/incidents"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE']}>
                      <IncidentsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/incidents/:id"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE']}>
                      <IncidentDetailPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/incident-response"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE']}>
                      <IncidentsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/employees"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR']}>
                      <EmployeeDirectoryPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/mobile"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER']}>
                      <MobileFieldOpsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/shifts"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR']}>
                      <ShiftsManagementPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/admin/safety-rules"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER']}>
                      <SafetyRulesPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/restricted-zones"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER']}>
                      <RestrictedZonesPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/zones"
                  element={<Navigate to="/restricted-zones" replace />}
                />
                <Route
                  path="/system-health"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER']}>
                      <SystemHealthPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER']}>
                      <AnalyticsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/audit-reports"
                  element={
                    <RoleGuard roles={['ADMIN', 'PLANT_MANAGER']}>
                      <AuditReportsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/reports"
                  element={<Navigate to="/audit-reports" replace />}
                />

                <Route
                  path="/onboarding"
                  element={
                    <RoleGuard roles={['ADMIN']}>
                      <OnboardingPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RoleGuard roles={['ADMIN']}>
                      <SettingsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/training"
                  element={
                    <RoleGuard roles={['ADMIN', 'SAFETY_OFFICER']}>
                      <TrainingPage />
                    </RoleGuard>
                  }
                />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Intelligent Root and Fallback Route */}
              <Route path="/" element={<RoleHomeRedirect />} />
              <Route path="*" element={<RoleHomeRedirect />} />
            </Routes>
          </BrowserRouter>
        </UIProvider>
        </SiteProvider>
      </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
