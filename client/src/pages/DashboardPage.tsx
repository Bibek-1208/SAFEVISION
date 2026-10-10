import React, { useState, useEffect } from 'react';
import { KPIRibbon } from '../components/dashboard/KPIRibbon';
import { CameraFeedCard } from '../components/camera/CameraFeedCard';
import { IncidentTriagePanel } from '../components/incidents/IncidentTriagePanel';
import { BottomTelemetryRow } from '../components/dashboard/BottomTelemetryRow';
import { SafetyTimeline } from '../components/analytics/SafetyTimeline';
import { ExplainabilityDrawer } from '../components/incident/ExplainabilityDrawer';
import { SafetyIntelligencePanel } from '../components/dashboard/SafetyIntelligencePanel';
import { EmergencySafetyWidget } from '../components/dashboard/EmergencySafetyWidget';
import { LoneWorkerWidget } from '../components/dashboard/LoneWorkerWidget';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import { Camera, Zone, Incident } from '../types';
import { Cpu, FlaskConical } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { liveIncidents, latestAlert, clearLatestAlert, systemHealth } = useSocket();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [primaryCamera, setPrimaryCamera] = useState<Camera | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial camera, zone, incident, and real database analytics
  const loadData = async () => {
    try {
      const [camsRes, zonesRes, incRes, analyticsRes] = await Promise.all([
        api.getCameras(),
        api.getZones(),
        api.getIncidents({ limit: 20 }),
        api.getAnalytics(),
      ]);
      setCameras(camsRes.cameras);
      setZones(zonesRes.zones);
      setIncidents(incRes.incidents);
      setAnalytics(analyticsRes);

      // Default primary camera to the first configured camera in MongoDB
      const firstCam = Array.isArray(camsRes.cameras) && camsRes.cameras.length > 0 ? camsRes.cameras[0] : null;
      setPrimaryCamera((prev) => prev && camsRes.cameras.some((c: any) => c.code === prev.code) ? prev : firstCam);
    } catch (err) {
      console.error('Error loading command center data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleCamerasUpdated = () => {
      loadData();
    };
    window.addEventListener('safevision:cameras-updated', handleCamerasUpdated);
    return () => {
      window.removeEventListener('safevision:cameras-updated', handleCamerasUpdated);
    };
  }, []);

  // Merge live WebSocket incidents into incident list
  const allIncidents = [
    ...liveIncidents.filter((li) => !incidents.some((i) => i.id === li.id)),
    ...incidents,
  ];

  const criticalCount = allIncidents.filter(
    (i) => i.severity === 'critical' && i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
  ).length;

  const warningCount = allIncidents.filter(
    (i) => (i.severity === 'high' || i.severity === 'medium') && i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
  ).length;

  return (
    <div className="p-3.5 space-y-3 min-h-screen bg-[#121212] text-gray-100 max-w-[1920px] mx-auto">
      {/* Test Mode Banner if active */}
      {isTestMode && (
        <div className="bg-amber-500/15 border border-amber-500/40 p-2.5 rounded-lg flex items-center justify-between text-xs font-mono text-amber-300">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-400" />
            <span className="font-bold">DEVELOPMENT & SIMULATION TEST MODE ACTIVE</span>
            <span className="text-gray-400">— Synthetic breaches enabled for hardware certification. Not reported to state regulator.</span>
          </div>
          <button
            onClick={() => setIsTestMode(false)}
            className="px-2.5 py-1 bg-[#222] hover:bg-[#333] border border-amber-500/50 rounded text-amber-400 text-[11px]"
          >
            Switch to Production Live Mode
          </button>
        </div>
      )}

      {/* High-priority real-time breach banner */}
      {latestAlert && latestAlert.status === 'DETECTED' && (
        <div className="bg-critical/20 border-2 border-critical p-3 rounded-lg flex items-center justify-between shadow-glow-critical animate-pulse">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-critical animate-ping" />
            <div>
              <p className="text-xs font-mono font-bold text-critical tracking-wider uppercase">
                CRITICAL NEURAL BREACH DETECTED: {latestAlert.violationType.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-gray-200">
                Worker {latestAlert.workerName} [{latestAlert.workerId}] in {latestAlert.zone} ({latestAlert.cameraId})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIncident(latestAlert)}
              className="px-3 py-1 bg-[#28181A] border border-critical text-critical font-mono text-xs font-bold rounded hover:bg-critical/30 transition"
            >
              INSPECT AUDIT PROOF
            </button>
            <button
              onClick={clearLatestAlert}
              className="px-3 py-1 bg-critical text-white font-mono text-xs font-bold rounded hover:bg-critical-dark transition"
            >
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}

      {/* Top Section: KPI Metrics Ribbon (Dynamic Data From Database) */}
      <KPIRibbon
        camerasOnline={cameras.filter((c) => c.status === 'LIVE').length}
        totalCameras={cameras.length}
        workersCount={analytics?.repeatViolations?.length || 0}
        complianceRate={analytics?.kpis?.overallCompliance ?? null}
        criticalCount={criticalCount}
        warningCount={warningCount}
        safetyIndex={analytics?.kpis?.safetyIndex ?? null}
      />

      {/* Main Grid: Live Surveillance Viewport + Incident Triage Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Surveillance Viewport: Primary Feed + Multi-cam Thumbnail Strip */}
        <div className="lg:col-span-8 flex flex-col space-y-2">
          {/* Primary 4K Feed with Error Boundary */}
          <ErrorBoundary fallbackTitle="Surveillance Feed Interrupted">
            {primaryCamera ? (
              <CameraFeedCard
                camera={primaryCamera}
                isPrimary={true}
                onSnapshot={() => {
                  alert(`Evidence snapshot captured from ${primaryCamera.code}!`);
                }}
                onRealIncidentDetected={(inc) => setSelectedIncident(inc)}
              />
            ) : (
              <div className="hud-panel aspect-[16/9] rounded-lg flex flex-col items-center justify-center font-mono text-xs text-gray-500 space-y-2">
                <span className="text-gray-400 font-bold">NO CAMERAS CONFIGURED</span>
                <span className="text-[10px] text-gray-600">Register a camera stream in Cameras section</span>
              </div>
            )}
          </ErrorBoundary>

          {/* Multi-cam Thumbnail Grid (Only render if additional cameras exist) */}
          {cameras.filter((c) => c.id !== primaryCamera?.id).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {cameras
                .filter((c) => c.id !== primaryCamera?.id)
                .slice(0, 3)
                .map((cam) => (
                  <div key={cam.id} className="relative group">
                    <CameraFeedCard
                      camera={cam}
                      isPrimary={false}
                      onSelect={() => setPrimaryCamera(cam)}
                    />
                    <button
                      onClick={() => setPrimaryCamera(cam)}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-safe hover:text-black text-gray-300 px-1.5 py-0.5 rounded text-[9px] font-mono opacity-0 group-hover:opacity-100 transition z-20"
                    >
                      FOCUS
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Right Incident Triage Queue */}
        <div className="lg:col-span-4 h-[580px] lg:h-auto flex flex-col">
          <ErrorBoundary fallbackTitle="Incident Triage Pipeline Disconnected">
            <IncidentTriagePanel
              incidents={allIncidents}
              onIncidentUpdated={loadData}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Emergency Safety Layer (Phase 9.2: Real Emergency Exit & Escape Route Safety Monitoring) */}
      <EmergencySafetyWidget
        onSelectCamera={(camCode) => {
          const matched = cameras.find((c) => c.code === camCode || c.id === camCode);
          if (matched) setPrimaryCamera(matched);
        }}
      />

      {/* Lone Worker Isolation Safety Layer (Phase 9.3: Real Lone Worker & Isolation Monitoring) */}
      <LoneWorkerWidget
        onSelectCamera={(camCode) => {
          const matched = cameras.find((c) => c.code === camCode || c.id === camCode);
          if (matched) setPrimaryCamera(matched);
        }}
      />

      {/* Safety Intelligence Layer (Phase 7: Context, Risk, Severity, Heatmap, Explainability, Patterns) */}
      <SafetyIntelligencePanel
        onSelectIncident={(inc) => setSelectedIncident(inc)}
        activeIncidents={allIncidents}
      />

      {/* Safety Timeline & Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <BottomTelemetryRow
            zones={zones}
            cameras={cameras}
            complianceData={analytics?.complianceHourly}
            systemHealth={systemHealth}
          />
        </div>
        <div className="lg:col-span-5">
          <SafetyTimeline
            incidents={allIncidents}
            onSelectIncident={(inc) => setSelectedIncident(inc)}
          />
        </div>
      </div>

      {/* Explainability Drawer */}
      <ExplainabilityDrawer
        incident={selectedIncident}
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
};
