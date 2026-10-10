import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { useUI } from '../../context/UIContext';
import { SiteManagementModal } from '../sites/SiteManagementModal';

/**
 * AppShell: Unified authoritative application layout architecture
 * - Responsive Navbar: Fixed top bar with mobile hamburger and mission controls
 * - Responsive Sidebar: Collapsible desktop sidebar (64px - 256px) + mobile drawer
 * - MainContent: Dynamically responsive margin-left, independent page scrolling, zero overlap
 */
export const AppShell: React.FC = () => {
  const { isSidebarCollapsed } = useUI();

  return (
    <div className="min-h-screen bg-[#0a0c10] text-gray-100 selection:bg-emerald-500 selection:text-black">
      {/* Top Mission Header */}
      <Navbar />

      {/* Responsive Command Center Sidebar */}
      <Sidebar />

      {/* Main Content Viewport - Resizes dynamically with sidebar collapse state */}
      <main
        className={`mt-[var(--header-height)] ${
          isSidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-64'
        } ml-0 min-h-[calc(100vh-var(--header-height))] bg-[#0a0c10] p-4 lg:p-6 transition-all duration-300 ease-in-out overflow-y-auto`}
      >
        <div className="max-w-[1920px] mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Enterprise Company & Site Management Modal */}
      <SiteManagementModal />
    </div>
  );
};

export default AppShell;
