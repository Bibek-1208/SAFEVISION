import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useSocket } from './SocketContext';

export interface SiteRecord {
  id: string;
  siteId?: string;
  companyName?: string;
  name: string;
  code: string;
  location: string;
  industry?: string;
  timezone?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  activeShift?: string;
  complianceRate?: number;
  totalWorkers?: number;
  camerasOnline?: number;
  totalCameras?: number;
  zoneCount?: number;
  cameraCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface SiteContextType {
  sites: SiteRecord[];
  currentSite: SiteRecord | null;
  zoneCount: number;
  cameraCount: number;
  isLoading: boolean;
  error: string | null;
  selectSite: (siteId: string) => Promise<void>;
  refreshSites: () => Promise<void>;
  isSiteModalOpen: boolean;
  siteModalMode: 'manage' | 'add' | 'edit';
  editingSite: SiteRecord | null;
  openSiteModal: (mode?: 'manage' | 'add' | 'edit', site?: SiteRecord | null) => void;
  closeSiteModal: () => void;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);
const ACTIVE_SITE_KEY = 'safevision_active_site_id';

export const SiteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [currentSite, setCurrentSite] = useState<SiteRecord | null>(null);
  const [zoneCount, setZoneCount] = useState<number>(0);
  const [cameraCount, setCameraCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [siteModalMode, setSiteModalMode] = useState<'manage' | 'add' | 'edit'>('manage');
  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);

  const socketContext = useSocket();
  const socket = socketContext?.socket;

  const loadSitesAndActive = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const savedSiteId = localStorage.getItem(ACTIVE_SITE_KEY) || undefined;
      const [listRes, currentRes] = await Promise.all([
        api.getSites().catch(() => ({ sites: [], total: 0 })),
        api.getCurrentSite(savedSiteId).catch(() => ({ site: null, zoneCount: 0, cameraCount: 0 })),
      ]);

      const loadedSites: SiteRecord[] = Array.isArray(listRes.sites) ? listRes.sites : [];
      setSites(loadedSites);

      let active: SiteRecord | null = currentRes.site || null;

      // If active site not found but sites exist, default to the first one
      if (!active && loadedSites.length > 0) {
        active = loadedSites[0];
      }

      if (active) {
        setCurrentSite(active);
        setZoneCount(typeof currentRes.zoneCount === 'number' ? currentRes.zoneCount : (active.zoneCount ?? 0));
        setCameraCount(typeof currentRes.cameraCount === 'number' ? currentRes.cameraCount : (active.cameraCount ?? 0));
        localStorage.setItem(ACTIVE_SITE_KEY, active.id || active.siteId || active.code);
      } else {
        setCurrentSite(null);
        setZoneCount(0);
        setCameraCount(0);
      }
    } catch (err: any) {
      console.error('Failed to load site management context:', err);
      setError(err.message || 'Failed to load sites');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSitesAndActive();
  }, [loadSitesAndActive]);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleSiteChange = () => {
      loadSitesAndActive();
    };

    socket.on('site:created', handleSiteChange);
    socket.on('site:updated', handleSiteChange);
    socket.on('site:deleted', handleSiteChange);

    return () => {
      socket.off('site:created', handleSiteChange);
      socket.off('site:updated', handleSiteChange);
      socket.off('site:deleted', handleSiteChange);
    };
  }, [socket, loadSitesAndActive]);

  const selectSite = async (siteId: string) => {
    try {
      setIsLoading(true);
      const res = await api.getCurrentSite(siteId);
      if (res.site) {
        setCurrentSite(res.site);
        setZoneCount(res.zoneCount ?? res.site.zoneCount ?? 0);
        setCameraCount(res.cameraCount ?? res.site.cameraCount ?? 0);
        localStorage.setItem(ACTIVE_SITE_KEY, res.site.id || res.site.siteId || res.site.code);
      }
    } catch (err: any) {
      console.error('Failed to switch active site:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openSiteModal = (mode: 'manage' | 'add' | 'edit' = 'manage', site: SiteRecord | null = null) => {
    setSiteModalMode(mode);
    setEditingSite(site);
    setIsSiteModalOpen(true);
  };

  const closeSiteModal = () => {
    setIsSiteModalOpen(false);
    setEditingSite(null);
  };

  return (
    <SiteContext.Provider
      value={{
        sites,
        currentSite,
        zoneCount,
        cameraCount,
        isLoading,
        error,
        selectSite,
        refreshSites: loadSitesAndActive,
        isSiteModalOpen,
        siteModalMode,
        editingSite,
        openSiteModal,
        closeSiteModal,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
};

export const useSite = (): SiteContextType => {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used within a SiteProvider');
  }
  return context;
};
