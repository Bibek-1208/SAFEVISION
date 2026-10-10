import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { ENV } from './config/env';
import { connectDB, isMongoConnected } from './config/db';
import { SocketService } from './services/socket/SocketService';
import { DataStore } from './models/DataStore';

// Routes
import authRoutes from './routes/auth.routes';
import detectionRoutes from './routes/detection.routes';
import incidentRoutes from './routes/incident.routes';
import zoneRoutes from './routes/zone.routes';
import cameraRoutes from './routes/camera.routes';
import analyticsRoutes from './routes/analytics.routes';
import reportRoutes from './routes/report.routes';
import siteRoutes from './routes/site.routes';
import feedbackRoutes from './routes/feedback.routes';
import adminRoutes from './routes/admin.routes';
import hazardRoutes from './routes/hazard.routes';
import healthRoutes from './routes/health.routes';
import shiftRoutes from './routes/shift.routes';
import employeeRoutes from './routes/employee.routes';
import safetyRuleRoutes from './routes/safetyRule.routes';
import modelRegistryRoutes from './routes/modelRegistry.routes';
import identityRoutes from './routes/identity.routes';
import zonePolicyRoutes from './routes/zonePolicy.routes';
import restrictedZoneRoutes from './routes/restrictedZone.routes';
import emergencyZoneRoutes from './routes/emergencyZone.routes';
import searchRoutes from './routes/search.routes';
import trainingRoutes from './routes/training.routes';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const socketService = SocketService.getInstance();
socketService.init(server);

// Middleware
const allowedOrigins = [ENV.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Asset Directories
const uploadsDir = path.resolve(__dirname, '../uploads');
const publicDir = path.resolve(__dirname, '../public');
app.use('/uploads', express.static(uploadsDir));
app.use('/evidence', express.static(path.join(publicDir, 'evidence')));

// Protected & Public API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/detection', detectionRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/restricted-zones', restrictedZoneRoutes);
app.use('/api/emergency-zones', emergencyZoneRoutes);
app.use('/api/emergency-routes', emergencyZoneRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hazards', hazardRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/safety-rules', safetyRuleRoutes);
app.use('/api/models', modelRegistryRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/zone-policies', zonePolicyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/training', trainingRoutes);

// KPI Direct Route (Authoritative from AnalyticsAggregationService)
app.get('/api/kpis', async (req: Request, res: Response) => {
  try {
    const { AnalyticsAggregationService } = await import('./services/analytics/AnalyticsAggregationService');
    const data = await AnalyticsAggregationService.getInstance().getDashboardAnalytics();
    return res.json(data.kpis);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch KPIs', message: err.message });
  }
});

// Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SafeVision Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Industrial Telemetry Server Error',
  });
});

// Real-Time System Health Beacon (Broadcast every 10s with real measured latency)
setInterval(async () => {
  const store = DataStore.getInstance();
  const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  let aiStatus = 'OFFLINE';
  let aiEngineName = 'AI OFFLINE';
  let latencyMs: number | null = null;

  try {
    const t0 = performance.now();
    const resp = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const t1 = performance.now();
      aiStatus = 'ONLINE';
      aiEngineName = data.ai_engine || data.modelName || 'Industrial YOLOv8';
      latencyMs = Math.round(t1 - t0);
    }
  } catch (_) {
    aiStatus = 'OFFLINE';
    aiEngineName = 'AI OFFLINE';
    latencyMs = null;
  }

  // Camera Inactivity Watchdog: if lastHeartbeatAt is older than 8s, transition LIVE -> OFFLINE
  const now = Date.now();
  for (const cam of store.cameras) {
    if (cam.status === 'LIVE' && cam.lastHeartbeatAt) {
      const elapsedMs = now - new Date(cam.lastHeartbeatAt).getTime();
      if (elapsedMs > 8000) {
        cam.status = 'OFFLINE';
        cam.fps = 0;
        socketService.emitCameraTelemetry(cam.code, {
          cameraId: cam.code,
          status: 'OFFLINE',
          fps: 0,
          processedFps: 0,
          lastHeartbeatAt: cam.lastHeartbeatAt,
        });
        console.warn(`[Watchdog] Camera ${cam.code} stream timed out (${elapsedMs}ms without heartbeat). Status transitioned to OFFLINE.`);
      }
    }
  }

  socketService.emitSystemHealth({
    aiEngine: aiStatus === 'ONLINE' ? aiEngineName : 'AI OFFLINE',
    camerasConnected: store.cameras.filter((c) => c.status === 'LIVE').length,
    totalCameras: store.cameras.length,
    dbStatus: isMongoConnected ? 'HEALTHY' : 'DATABASE OFFLINE',
    realtimeStatus: socketService.isInitialized ? 'CONNECTED' : 'DISCONNECTED',
    lastSync: new Date().toLocaleTimeString(),
    latencyMs,
  });
}, 5000);

import { ChangeStreamWatcher } from './services/realtime/ChangeStreamWatcher';

// Start Server
const startServer = async () => {
  await connectDB();

  if (isMongoConnected) {
    try {
      const { CameraModel } = await import('./models/mongooseModels');
      const store = DataStore.getInstance();
      const dbCams = await CameraModel.find({});
      if (dbCams.length > 0) {
        // Authoritative MongoDB camera source of truth
        store.cameras = dbCams.map((c: any) => ({
          id: c.cameraId,
          name: c.name,
          code: c.code,
          zone: c.zone,
          streamUrl: c.streamUrl,
          protocol: c.protocol,
          sourceType: c.sourceType,
          enabled: c.enabled !== false,
          status: c.status || 'OFFLINE',
          fps: c.fps || 0,
          resolution: c.resolution || '1280x720',
          latencyMs: c.latencyMs || 0,
          ptzEnabled: c.ptzEnabled || false,
          temperature: c.temperature || 0,
          lastFrameAt: c.lastFrameAt ? c.lastFrameAt.toISOString() : undefined,
          lastHeartbeatAt: c.lastHeartbeatAt ? c.lastHeartbeatAt.toISOString() : undefined,
        }));
        console.log(`[SafeVision DB] Synchronized ${store.cameras.length} camera(s) from MongoDB.`);
      } else if (store.cameras.length > 0) {
        // Seed initial real cameras from configuration to MongoDB
        for (const cam of store.cameras) {
          await CameraModel.create({
            cameraId: cam.id,
            siteId: (cam as any).siteId || 'site-rsp-1',
            zoneId: (cam as any).zoneId || 'zone-3',
            name: cam.name,
            code: cam.code,
            zone: cam.zone,
            streamUrl: cam.streamUrl,
            protocol: cam.protocol || 'RTSP',
            sourceType: cam.sourceType || 'ip_rtsp',
            status: cam.status || 'OFFLINE',
            fps: cam.fps || 0,
            resolution: cam.resolution || '1280x720',
            latencyMs: cam.latencyMs || 0,
            ptzEnabled: cam.ptzEnabled || false,
            enabled: cam.enabled !== false,
          });
        }
        console.log(`[SafeVision DB] Seeded ${store.cameras.length} camera(s) into MongoDB.`);
      }

      // Synchronize Restricted Zones from MongoDB
      const { RestrictedZoneModel } = await import('./models/mongooseModels');
      const dbZones = await RestrictedZoneModel.find({ isDeleted: { $ne: true } }).lean();
      if (dbZones.length > 0) {
        store.restrictedZones = dbZones.map((d: any) => ({
          id: d.zoneId,
          zoneId: d.zoneId,
          siteId: d.siteId,
          cameraId: d.cameraId,
          name: d.name,
          description: d.description || '',
          zoneType: d.zoneType,
          polygon: d.polygon,
          enabled: d.enabled !== false,
          riskLevel: d.riskLevel,
          allowedRoles: d.allowedRoles || [],
          allowedEmployees: d.allowedEmployees || [],
          allowedDepartments: d.allowedDepartments || [],
          unknownIdentityPolicy: d.unknownIdentityPolicy || 'FLAG_UNKNOWN',
          schedule: d.schedule,
          requiredPPE: d.requiredPPE || [],
          minimumWorkers: d.minimumWorkers !== undefined ? d.minimumWorkers : 2,
          isolationThresholdSec: d.isolationThresholdSec !== undefined ? d.isolationThresholdSec : 120,
          warningThresholdSec: d.warningThresholdSec !== undefined ? d.warningThresholdSec : 90,
          checkInRequired: d.checkInRequired !== false,
          checkInTimeoutSec: d.checkInTimeoutSec !== undefined ? d.checkInTimeoutSec : 30,
          authorizedWorkerPolicy: d.authorizedWorkerPolicy || 'ALLOW_ANY',
          isDeleted: false,
          deletedAt: null,
          createdBy: d.createdBy,
          updatedBy: d.updatedBy,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
          version: d.version || 1,
        }));
        console.log(`[SafeVision DB] Synchronized ${store.restrictedZones.length} restricted zone(s) from MongoDB.`);
      }

      // Authoritative MongoDB Site source of truth
      const { SiteModel } = await import('./models/mongooseModels');
      const dbSites = await SiteModel.find({});
      if (dbSites.length > 0) {
        store.sites = dbSites.map((s: any) => ({
          id: s.siteId || s._id.toString(),
          siteId: s.siteId,
          companyName: s.companyName || 'SafeVision Industrial',
          name: s.name,
          code: s.code,
          location: s.location,
          industry: s.industry || 'Heavy Manufacturing & Industrial',
          timezone: s.timezone || 'Asia/Kolkata',
          status: s.status || 'ACTIVE',
          activeShift: s.activeShift || null,
          complianceRate: s.complianceRate ?? 0,
          totalWorkers: s.totalWorkers ?? 0,
          camerasOnline: s.camerasOnline ?? 0,
          totalCameras: s.totalCameras ?? 0,
          createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
        }));
        console.log(`[SafeVision DB] Synchronized ${store.sites.length} site(s) from MongoDB.`);
      } else if (store.sites.length > 0) {
        // Seed initial real site to MongoDB
        for (const s of store.sites) {
          await SiteModel.create({
            siteId: s.id,
            companyName: s.companyName || 'Steel Authority of India Limited',
            name: s.name,
            code: s.code,
            location: s.location,
            industry: 'Integrated Steel Manufacturing',
            timezone: s.timezone || 'Asia/Kolkata',
            status: 'ACTIVE',
            activeShift: s.activeShift || null,
            complianceRate: s.complianceRate ?? 0,
            totalWorkers: s.totalWorkers ?? 0,
            camerasOnline: s.camerasOnline ?? 0,
            totalCameras: s.totalCameras ?? 0,
          });
        }
        console.log(`[SafeVision DB] Initialized ${store.sites.length} baseline site(s) in MongoDB.`);
      }

      // Synchronize Incidents from MongoDB
      const { IncidentModel, AuditReportModel } = await import('./models/mongooseModels');
      const dbIncidents = await IncidentModel.find({}).sort({ timestamp: -1 }).lean();
      if (dbIncidents.length > 0) {
        store.incidents = dbIncidents.map((i: any) => ({
          id: i.incidentId || i._id.toString(),
          incidentId: i.incidentId,
          workerId: i.workerId || 'UNIDENTIFIED',
          workerName: i.workerName || 'Unidentified Worker',
          employeeName: i.workerName,
          violationType: i.violationType,
          severity: i.severity,
          confidence: i.confidence,
          boundingBox: i.boundingBox || { ymin: 0, xmin: 0, ymax: 0, xmax: 0 },
          zone: i.zone,
          zoneId: i.zoneId,
          siteId: i.siteId || 'site-rsp-1',
          cameraId: i.cameraId,
          trackId: i.trackId,
          employeeId: i.employeeId,
          identityStatus: i.identityStatus || 'UNCONFIRMED',
          modelId: i.modelId,
          timestamp: i.timestamp ? new Date(i.timestamp).toISOString() : new Date().toISOString(),
          riskScore: i.riskScore || 0,
          riskLevel: i.riskLevel,
          status: i.status || 'DETECTED',
          evidenceImage: i.evidenceImage || '',
          whyFlagged: i.whyFlagged || [],
          whyCreated: i.whyCreated || [],
          explanation: i.explanation || [],
          recommendedAction: i.recommendedAction || 'Area safety inspection advised.',
          stewardName: i.stewardName,
          resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : undefined,
          resolvedBy: i.resolvedBy,
          notes: i.notes,
          source: i.source || 'AI',
          temporalConfigUsed: i.temporalConfigUsed,
          ruleId: i.ruleId,
          modelName: i.modelName,
          pipelineName: i.pipelineName,
        }));
        console.log(`[SafeVision DB] Synchronized ${store.incidents.length} incident(s) from MongoDB.`);
      }

      // Synchronize Audit Reports from MongoDB
      const dbReports = await AuditReportModel.find({}).sort({ generatedAt: -1 }).lean();
      if (dbReports.length > 0) {
        store.auditReports = dbReports.map((r: any) => ({
          id: r.reportId,
          reportId: r.reportId,
          siteId: r.siteId,
          siteCode: r.siteCode,
          siteName: r.siteName,
          standard: r.standard,
          dateRange: r.dateRange,
          sections: r.sections,
          generatedBy: r.generatedBy,
          generatedAt: r.generatedAt ? new Date(r.generatedAt).toISOString() : new Date().toISOString(),
          complianceScore: r.complianceScore,
          complianceScoreMethod: r.complianceScoreMethod,
          totalViolations: r.totalViolations,
          criticalViolations: r.criticalViolations,
          resolvedViolations: r.resolvedViolations,
          pdfPath: r.pdfPath,
          fileName: r.fileName,
        }));
        console.log(`[SafeVision DB] Synchronized ${store.auditReports.length} audit report(s) from MongoDB.`);
      }
    } catch (err: any) {
      console.warn('[SafeVision DB] Database synchronization notice:', err.message);
    }

    ChangeStreamWatcher.getInstance().start().catch((err) => {
      console.warn('[Server] ChangeStreamWatcher notice:', err.message);
    });
  }

  server.listen(ENV.PORT, () => {
    const activeSite = DataStore.getInstance().sites[0];
    console.log(`====================================================`);
    console.log(` SAFEVISION AI — INDUSTRIAL COMMAND CORE INITIALIZED `);
    console.log(` Port: ${ENV.PORT} | Environment: ${ENV.NODE_ENV}`);
    console.log(` WebSockets: Online (Socket.IO Hub Ready)`);
    console.log(` RBAC & Scope Engine: ACTIVE (5 Enterprise Roles)`);
    console.log(` Telemetry Core: ${activeSite?.name || 'Industrial Plant'} (${activeSite?.code || 'SITE-01'})`);
    console.log(`====================================================`);
  });
}

startServer();

export { app, server };
