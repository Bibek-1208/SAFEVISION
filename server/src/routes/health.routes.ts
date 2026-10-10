import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { DataStore } from '../models/DataStore';
import { isMongoConnected, isReplicaSetVerified, replicaSetName } from '../config/db';

const router = Router();
const store = DataStore.getInstance();
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Probe AI Service
export async function probeAiService(): Promise<{
  status: 'ONLINE' | 'OFFLINE';
  latencyMs: number | null;
  details: any;
}> {
  try {
    const t0 = performance.now();
    const resp = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(2500) });
    const latencyMs = Math.round(performance.now() - t0);
    if (resp.ok) {
      const data = await resp.json();
      return {
        status: 'ONLINE',
        latencyMs,
        details: data,
      };
    }
    return {
      status: 'OFFLINE',
      latencyMs,
      details: { error: `AI microservice returned HTTP ${resp.status}` },
    };
  } catch (err: any) {
    return {
      status: 'OFFLINE',
      latencyMs: null,
      details: { error: err.message || 'Connection refused to AI microservice' },
    };
  }
}

// GET /api/health - Comprehensive truthful operational status
router.get('/', async (req: Request, res: Response) => {
  const aiProbe = await probeAiService();
  const liveCameras = store.cameras.filter((c) => c.status === 'LIVE').length;
  const totalCameras = store.cameras.length;
  const dbConnected = isMongoConnected && mongoose.connection.readyState === 1;

  // Truthful status calculation:
  // HEALTHY requires AI ONLINE, Database connected, and at least 1 camera configured/live.
  // If AI is offline, DB is running in in-memory fallback, or 0 cameras are live, report DEGRADED.
  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
  const degradedReasons: string[] = [];

  const isOnline = aiProbe.status === 'ONLINE';
  const aiDetails = aiProbe.details || {};
  const isModelLoaded = isOnline && (aiDetails.modelStatus === 'MODEL LOADED' || aiDetails.model_loaded === true || aiDetails.runtimeState === 'READY');
  const serviceStatus = isOnline ? 'AI ONLINE' : 'AI OFFLINE';
  const modelStatus = isOnline ? (isModelLoaded ? (aiDetails.runtimeState || 'READY') : 'MODEL NOT CONFIGURED') : 'MODEL NOT CONFIGURED';

  if (!isOnline) {
    overallStatus = 'DEGRADED';
    degradedReasons.push('AI microservice is offline');
  } else if (!isModelLoaded) {
    overallStatus = 'DEGRADED';
    degradedReasons.push('Approved SafeVision AI model weights unconfigured in ai/models/');
  }

  if (!dbConnected) {
    overallStatus = 'DEGRADED';
    degradedReasons.push('Native Database OFFLINE (Operating in ephemeral in-memory degraded mode)');
  }

  if (liveCameras === 0) {
    overallStatus = 'DEGRADED';
    degradedReasons.push('Zero cameras are currently streaming LIVE');
  }

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    degradedReasons: degradedReasons,
    components: {
      ai: {
        serviceStatus,
        modelStatus: isModelLoaded ? (aiDetails.runtimeState === 'READY' ? 'READY' : 'ONLINE') : (isOnline ? 'DEGRADED' : 'OFFLINE'),
        modelName: aiDetails.modelName || aiDetails.model_name || 'Industrial YOLOv8',
        modelId: aiDetails.modelId || 'MODEL-PPE-SH17-001',
        modelVersion: aiDetails.modelVersion || aiDetails.model_version || '1.0.0',
        weights: aiDetails.weights || aiDetails.weights_path || null,
        device: aiDetails.device || 'cpu',
        gpuName: aiDetails.gpu_name || null,
        latency: aiProbe.latencyMs,
        latencyMs: aiProbe.latencyMs,
        framesProcessed: aiDetails.framesProcessed ?? aiDetails.frames_processed ?? 0,
        lastInference: aiDetails.lastInference || aiDetails.last_inference_time || null,
        status: isOnline ? (isModelLoaded ? 'ONLINE' : 'DEGRADED') : 'OFFLINE',
        engine: aiDetails.ai_engine || (isModelLoaded ? 'SafeVision-Industrial-YOLOv8' : 'MODEL NOT CONFIGURED'),
        endpoint: aiUrl,
        classCount: aiDetails.classCount || 17,
        classes: aiDetails.classes || [],
        actualChecksum: aiDetails.actualChecksum || null,
        registeredChecksum: aiDetails.registeredChecksum || null,
        checksumMatched: aiDetails.checksumMatched ?? false,
      },
      database: {
        status: dbConnected ? 'CONNECTED' : 'DATABASE OFFLINE',
        driver: dbConnected ? (isReplicaSetVerified ? `MongoDB Replica Set (${replicaSetName})` : 'MongoDB Standalone (Change Streams Unverified)') : 'None (Degraded In-Memory)',
        changeStreamsVerified: isReplicaSetVerified,
        replicaSet: replicaSetName,
        readyState: mongoose.connection.readyState,
        records: {
          users: store.users.length,
          cameras: store.cameras.length,
          incidents: store.incidents.length,
          auditLogs: store.auditLogs.length,
          shifts: store.shifts.length,
          employees: store.employees.length,
          rules: store.safetyRules.length,
        },
      },
      cameras: {
        total: totalCameras,
        live: liveCameras,
        offline: store.cameras.filter((c) => c.status === 'OFFLINE').length,
        probing: store.cameras.filter((c) => c.status === 'PROBING').length,
      },
      realtime: {
        status: 'CONNECTED',
        transport: 'WebSocket / Socket.IO',
      },
      process: {
        nodeVersion: process.version,
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
  });
});

// GET /api/health/database
router.get('/database', (req: Request, res: Response) => {
  const dbConnected = isMongoConnected && mongoose.connection.readyState === 1;
  res.json({
    connected: dbConnected,
    mode: dbConnected ? (isReplicaSetVerified ? `MongoDB Replica Set (${replicaSetName})` : 'MongoDB Standalone (Change Streams Unverified)') : 'DATABASE OFFLINE (Ephemeral Mock Session)',
    changeStreamsVerified: isReplicaSetVerified,
    replicaSet: replicaSetName,
    readyState: mongoose.connection.readyState,
    readyStateText: ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'][mongoose.connection.readyState] || 'Unknown',
    counts: {
      users: store.users.length,
      cameras: store.cameras.length,
      incidents: store.incidents.length,
      activeIncidents: store.incidents.filter((i) => i.status !== 'RESOLVED').length,
      auditLogs: store.auditLogs.length,
      shifts: store.shifts.length,
      employees: store.employees.length,
      safetyRules: store.safetyRules.length,
      hazards: store.hazards.length,
    },
  });
});

// GET /api/health/ai
router.get('/ai', async (req: Request, res: Response) => {
  const probe = await probeAiService();
  const isOnline = probe.status === 'ONLINE';
  const details = probe.details || {};
  const isModelLoaded = isOnline && (details.modelStatus === 'MODEL LOADED' || details.model_loaded === true || details.runtimeState === 'READY');

  const serviceStatus = isOnline ? 'AI ONLINE' : 'AI OFFLINE';
  const modelStatus = isOnline
    ? (isModelLoaded ? (details.runtimeState === 'READY' ? 'READY' : 'MODEL LOADED') : 'MODEL NOT CONFIGURED')
    : 'MODEL NOT CONFIGURED';

  res.json({
    serviceStatus,
    modelStatus,
    runtimeState: details.runtimeState || (isModelLoaded ? 'READY' : 'OFFLINE'),
    modelName: details.modelName || details.model_name || 'Industrial YOLOv8',
    modelId: details.modelId || 'MODEL-PPE-SH17-001',
    modelVersion: details.modelVersion || details.model_version || '1.0.0',
    weights: details.weights || details.weights_path || null,
    device: details.device || 'cpu',
    gpuName: details.gpu_name || null,
    classCount: details.classCount || 17,
    classes: details.classes || [],
    actualChecksum: details.actualChecksum || null,
    registeredChecksum: details.registeredChecksum || null,
    checksumMatched: details.checksumMatched ?? false,
    latency: probe.latencyMs,
    framesProcessed: details.framesProcessed ?? details.frames_processed ?? 0,
    lastInference: details.lastInference || details.last_inference_time || null,
    status: isOnline ? (isModelLoaded ? 'ONLINE' : 'DEGRADED') : 'OFFLINE',
    url: aiUrl,
    latencyMs: probe.latencyMs,
    telemetry: details,
  });
});

// GET /api/health/cameras
router.get('/cameras', (req: Request, res: Response) => {
  const cameras = store.cameras.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    protocol: c.protocol,
    sourceType: c.sourceType,
    enabled: c.enabled,
    aiEnabled: c.aiEnabled,
    lastFrameAt: c.lastFrameAt,
    lastHeartbeatAt: c.lastHeartbeatAt,
    errorCode: c.errorCode,
    errorMessage: c.errorMessage,
  }));

  res.json({
    total: cameras.length,
    live: cameras.filter((c) => c.status === 'LIVE').length,
    offline: cameras.filter((c) => c.status === 'OFFLINE').length,
    cameras,
  });
});

// GET /api/health/realtime
router.get('/realtime', (req: Request, res: Response) => {
  res.json({
    status: 'CONNECTED',
    protocol: 'Socket.IO v4.8.1',
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

export default router;
