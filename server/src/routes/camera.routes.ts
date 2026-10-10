import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { DataStore } from '../models/DataStore';
import { CameraModel } from '../models/mongooseModels';
import { SocketService } from '../services/socket/SocketService';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';

const router = Router();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();

function maskStreamUrl(url: string, cameraId?: string): string {
  if (!url) return '';
  // STRICT SECURITY RULE (Phase 7.2): Never expose raw RTSP URLs, hostnames, ports, or credentials to frontend
  if (url.startsWith('rtsp://') || url.startsWith('rtsps://')) {
    const id = (cameraId || 'cam-01').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `webrtc://internal/${id}`;
  }
  return url.replace(/:\/\/(.*?):(.*?)@/, '://[PROTECTED]@');
}

// GET /api/cameras - Role & Scope Filtered CCTV Feeds (MongoDB Source of Truth)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  // Ordinary employees cannot access CCTV streams!
  if (user.role === 'EMPLOYEE' || !user.permissions.includes(PERMISSIONS.CAMERA_VIEW)) {
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'SECURITY_ACCESS_DENIED',
      resourceType: 'CCTV_STREAM',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'DENIED',
      metadata: { reason: 'Employee attempted to access CCTV streams' },
    });
    return res.status(403).json({
      error: 'Access denied: Employees are not authorized to view CCTV surveillance feeds.',
      code: 'CCTV_ACCESS_DENIED',
    });
  }

  // 1. Sync from MongoDB if connected (MongoDB is Authoritative)
  try {
    if (mongoose.connection.readyState === 1) {
      const dbCameras = await CameraModel.find().lean();
      if (dbCameras && dbCameras.length > 0) {
        store.cameras = dbCameras.map((doc: any) => {
          const existing = store.cameras.find((c) => c.code === doc.code || c.id === doc.cameraId);
          return {
            id: doc.cameraId || doc._id.toString(),
            name: doc.name,
            code: doc.code,
            zone: doc.zone,
            streamUrl: doc.streamUrl || '',
            status: (existing?.status && existing.status !== 'NOT_CONFIGURED') ? existing.status : (doc.status || 'OFFLINE'),
            fps: existing?.fps !== undefined ? existing.fps : (doc.fps || 0),
            resolution: doc.resolution || '1920x1080',
            latencyMs: existing?.latencyMs !== undefined ? existing.latencyMs : (doc.latencyMs || 0),
            enabled: doc.enabled !== false,
            ptzEnabled: doc.ptzEnabled || false,
            lastHeartbeatAt: existing?.lastHeartbeatAt || doc.lastHeartbeatAt,
            lastFrameAt: existing?.lastFrameAt || doc.lastFrameAt,
          };
        });
      } else {
        // If MongoDB contains 0 cameras, store cameras must also be empty
        store.cameras = [];
      }
    }
  } catch (err) {
    console.error('[CameraRoutes] Error fetching cameras from MongoDB:', err);
  }

  let cameras = store.cameras.map((c) => ({
    ...c,
    streamUrl: maskStreamUrl(c.streamUrl, c.code || c.id),
  }));

  // Scoping for Supervisor and Safety Officer
  if (user.role !== 'ADMIN' && !user.zoneIds.includes('*')) {
    cameras = cameras.filter((cam) => {
      const zoneObj = store.zones.find(
        (z) => z.name.toLowerCase() === cam.zone.toLowerCase() || z.code.toLowerCase() === cam.zone.toLowerCase()
      );
      if (!zoneObj) return user.zoneIds.some((zid) => zid.toLowerCase() === cam.zone.toLowerCase());
      return user.zoneIds.some(
        (zid) => zid.toLowerCase() === zoneObj.code.toLowerCase() || zid.toLowerCase() === zoneObj.name.toLowerCase()
      );
    });
  }

  return res.json({ cameras, total: cameras.length });
});

// Helper to notify Python AI pipeline when camera configuration changes
async function notifyPipelineSync() {
  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    await fetch(`${aiUrl}/pipeline/sync`, { method: 'POST', signal: AbortSignal.timeout(1500) });
  } catch (err) {
    // Non-blocking: Python pipeline might be inactive or starting up
  }
}

// GET /api/cameras/pipeline-config - Camera stream configurations for internal AI pipeline
router.get('/pipeline-config', (req, res: Response) => {
  const configs = store.cameras
    .filter((c) => c.enabled !== false && c.streamUrl)
    .map((c) => ({
      cameraId: c.code || c.id,
      cameraName: c.name,
      name: c.name,
      streamUrl: c.streamUrl,
      zoneId: c.zone,
      zone: c.zone,
      siteId: c.siteId || 'site-rsp-1',
      protocol: c.protocol || 'RTSP',
      enabled: c.enabled !== false,
      status: c.status,
      targetFps: c.fps || 24,
    }));
  return res.json({ cameras: configs, total: configs.length });
});

// POST /api/cameras/refresh - Probe and refresh status for all configured cameras
router.post('/refresh', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const net = await import('net');

  for (const cam of store.cameras) {
    if (cam.enabled === false) {
      cam.status = 'OFFLINE';
      cam.errorMessage = 'Camera disabled in configuration';
      continue;
    }

    if (cam.sourceType === 'WEBCAM' || cam.sourceType === 'FILE') {
      cam.status = 'LIVE';
      cam.lastHeartbeatAt = new Date().toISOString();
      cam.errorCode = undefined;
      cam.errorMessage = undefined;
      continue;
    }

    if (!cam.streamUrl) {
      cam.status = 'NOT_CONFIGURED';
      cam.errorCode = 'STREAM_URL_MISSING';
      cam.errorMessage = 'No RTSP or stream URL configured';
      continue;
    }

    // Attempt TCP probe for RTSP/IP cameras
    try {
      let host = '';
      let port = 554;
      if (cam.streamUrl.startsWith('rtsp://') || cam.streamUrl.startsWith('http://') || cam.streamUrl.startsWith('https://')) {
        const parsed = new URL(cam.streamUrl);
        host = parsed.hostname;
        port = parsed.port ? parseInt(parsed.port, 10) : (cam.streamUrl.startsWith('http:') ? 80 : cam.streamUrl.startsWith('https:') ? 443 : 554);
      } else if (cam.streamUrl.includes(':')) {
        const parts = cam.streamUrl.split(':');
        host = parts[0];
        port = parseInt(parts[1], 10) || 554;
      } else {
        host = cam.streamUrl;
      }

      await new Promise<void>((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(1500);

        sock.on('connect', () => {
          // TCP connection establishes socket reachability (CONNECTED).
          // Only actual frame receipt promotes to LIVE.
          const hasRecentFrames = cam.lastFrameAt && (Date.now() - new Date(cam.lastFrameAt).getTime() < 15000);
          cam.status = hasRecentFrames ? 'LIVE' : 'CONNECTED';
          cam.lastHeartbeatAt = new Date().toISOString();
          cam.errorCode = undefined;
          cam.errorMessage = undefined;
          sock.destroy();
          resolve();
        });

        sock.on('timeout', () => {
          cam.status = 'OFFLINE';
          cam.errorCode = 'TIMEOUT_4000MS';
          cam.errorMessage = `Connection to ${host}:${port} timed out`;
          sock.destroy();
          resolve();
        });

        sock.on('error', (err: any) => {
          cam.status = 'OFFLINE';
          cam.errorCode = 'CONNECTION_REFUSED';
          cam.errorMessage = err.message || 'Connection refused';
          sock.destroy();
          resolve();
        });

        sock.connect(port, host);
      });
    } catch (e: any) {
      cam.status = 'OFFLINE';
      cam.errorCode = 'PROBE_ERROR';
      cam.errorMessage = e.message;
    }

    socketService.emitCameraStatus(cam.code, (cam.status === 'LIVE' || cam.status === 'CONNECTED') ? 'ONLINE' : 'OFFLINE', {
      status: cam.status,
      errorCode: cam.errorCode,
      errorMessage: cam.errorMessage,
    });
  }

  const masked = store.cameras.map((c) => ({ ...c, streamUrl: maskStreamUrl(c.streamUrl, c.code || c.id) }));
  return res.json({ success: true, cameras: masked });
});

// GET /api/cameras/:id
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (user.role === 'EMPLOYEE') {
    return res.status(403).json({ error: 'Access denied to camera feeds.' });
  }

  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find(
    (c) => c.id === req.params.id || c.code.toLowerCase() === targetId
  );
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  // Check Zone Scope for Supervisor
  if (user.role === 'SUPERVISOR' && !user.zoneIds.includes('*')) {
    const zoneObj = store.zones.find(
      (z) => z.name.toLowerCase() === cam.zone.toLowerCase() || z.code.toLowerCase() === cam.zone.toLowerCase()
    );
    const inScope = zoneObj && user.zoneIds.some(
      (zid) => zid.toLowerCase() === zoneObj.code.toLowerCase() || zid.toLowerCase() === zoneObj.name.toLowerCase()
    );
    if (!inScope) {
      return res.status(403).json({
        error: `Scope denied. Camera ${cam.code} in zone '${cam.zone}' is outside your authorized supervision zones.`,
      });
    }
  }

  res.json({ camera: { ...cam, streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id) } });
});

// PATCH /api/cameras/:id/status (Requires CAMERA_MANAGE - Admin Only)
router.patch('/:id/status', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find(
    (c) => c.id === req.params.id || c.code.toLowerCase() === targetId
  );
  if (!cam) return res.status(404).json({ error: 'Camera not found' });

  const { status } = req.body;
  if (['LOADING', 'LIVE', 'PAUSED', 'OFFLINE', 'ERROR', 'RECONNECTING'].includes(status)) {
    cam.status = status;
    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CAMERA_UPDATED',
      resourceType: 'CAMERA',
      resourceId: cam.code,
      result: 'SUCCESS',
      metadata: { newStatus: status },
    });
    socketService.emitCameraStatus(cam.code, status === 'LIVE' ? 'ONLINE' : 'OFFLINE', { status });
  }

  res.json({ success: true, camera: cam });
});

// POST /api/cameras/test-connection - Real TCP socket probe / reachability validation for RTSP/IP camera
router.post('/test-connection', authenticate, async (req: AuthRequest, res: Response) => {
  const { streamUrl, protocol = 'RTSP' } = req.body;
  if (!streamUrl) {
    return res.status(400).json({ error: 'Stream URL is required.' });
  }

  const net = await import('net');
  let host = '';
  let port = 554;

  try {
    if (streamUrl.startsWith('rtsp://') || streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
      const parsed = new URL(streamUrl);
      host = parsed.hostname;
      port = parsed.port ? parseInt(parsed.port, 10) : (streamUrl.startsWith('http:') ? 80 : streamUrl.startsWith('https:') ? 443 : 554);
    } else if (streamUrl.includes(':')) {
      const parts = streamUrl.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10) || 554;
    } else {
      host = streamUrl;
    }

    const t0 = performance.now();
    const socket = new net.Socket();
    let isHandled = false;

    socket.setTimeout(4000);

    socket.on('connect', () => {
      if (!isHandled) {
        isHandled = true;
        const latencyMs = Math.round(performance.now() - t0);
        socket.destroy();
        return res.json({
          reachable: true,
          host,
          port,
          protocol,
          latencyMs,
          message: `Successfully connected to camera host ${host}:${port} (${latencyMs}ms latency). Stream endpoint is reachable.`,
        });
      }
    });

    socket.on('timeout', () => {
      if (!isHandled) {
        isHandled = true;
        socket.destroy();
        return res.json({
          reachable: false,
          host,
          port,
          protocol,
          message: `Connection to ${host}:${port} timed out after 4000ms. Host unreachable or firewall blocking port.`,
        });
      }
    });

    socket.on('error', (err: any) => {
      if (!isHandled) {
        isHandled = true;
        socket.destroy();
        return res.json({
          reachable: false,
          host,
          port,
          protocol,
          message: `Connection failed: ${err.message || 'Host connection refused'}. Verify IP/port configuration.`,
        });
      }
    });

    socket.connect(port, host);
  } catch (err: any) {
    return res.status(400).json({
      reachable: false,
      message: `Invalid stream URL or host format: ${err.message}`,
    });
  }
});

async function resolveCanonicalCamera(identifier: string): Promise<any> {
  if (!identifier) return null;
  const rawId = String(identifier).trim();
  const upper = rawId.toUpperCase();

  // 1. DataStore in-memory lookup strictly by ID or Code (Section 1 & 6)
  let cam = store.cameras.find(
    (c) =>
      c.id === rawId ||
      c.code.toUpperCase() === upper ||
      (c as any)._id?.toString() === rawId
  );

  // 2. Authoritative MongoDB lookup strictly by Code or ID
  if (!cam && mongoose.connection.readyState === 1) {
    try {
      const doc = await CameraModel.findOne({
        $or: [
          { code: { $regex: new RegExp(`^${rawId}$`, 'i') } },
          { cameraId: rawId },
          ...(mongoose.isValidObjectId(rawId) ? [{ _id: rawId }] : []),
        ],
      }).lean();
      if (doc) cam = doc as any;
    } catch {}
  }

  return cam;
}

// GET /api/cameras/:id/stream-status - Authoritative camera stream health & telemetry (Section 10)
router.get('/:id/stream-status', async (req: any, res: Response) => {
  const targetId = String(req.params.id || '').trim();
  const cam = await resolveCanonicalCamera(targetId);

  if (!cam) {
    return res.status(200).json({
      cameraId: targetId,
      configured: false,
      connected: false,
      status: 'NOT_CONFIGURED',
      streamType: 'NONE',
      streamPath: null,
      lastFrameAt: null,
      fps: 0,
      latencyMs: 0,
      frameAgeMs: 0,
      error: 'Camera not configured in database',
    });
  }

  const hasStreamUrl = Boolean(cam.streamUrl && cam.streamUrl.trim().length > 0);
  if (!hasStreamUrl || cam.enabled === false) {
    return res.status(200).json({
      cameraId: cam.code || cam.id,
      cameraCode: cam.code,
      configured: false,
      connected: false,
      status: cam.enabled === false ? 'DISABLED' : 'NOT_CONFIGURED',
      streamType: 'NONE',
      streamPath: null,
      lastFrameAt: cam.lastFrameAt || null,
      fps: 0,
      latencyMs: 0,
      frameAgeMs: 0,
      error: cam.enabled === false ? 'Camera is marked disabled' : 'No active stream configured for this camera',
    });
  }

  // Probe AI service worker status for verified active frame generation
  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  let aiStatus: any = null;
  try {
    const aiResp = await fetch(`${aiUrl}/camera/${cam.code}/status`, { signal: AbortSignal.timeout(1000) });
    if (aiResp.ok) {
      aiStatus = await aiResp.json();
    }
  } catch (_) {}

  const isConnected = Boolean(aiStatus?.connected ?? (cam.status === 'LIVE' && cam.fps > 0));
  const effectiveStatus = isConnected
    ? 'LIVE'
    : (cam.status === 'RECONNECTING' || aiStatus?.error?.includes('reconnecting') ? 'CONNECTING' : 'OFFLINE');

  return res.json({
    cameraId: cam.code || cam.id,
    cameraCode: cam.code,
    name: cam.name,
    configured: true,
    connected: isConnected,
    status: effectiveStatus,
    streamType: cam.protocol || 'RTSP',
    streamPath: `/api/cameras/${cam.code}/live-feed`,
    lastFrameAt: aiStatus?.lastFrameAt || cam.lastFrameAt || null,
    fps: isConnected ? (aiStatus?.fps ?? cam.fps ?? 0) : 0,
    latencyMs: isConnected ? (aiStatus?.latencyMs ?? cam.latencyMs ?? 0) : 0,
    frameAgeMs: isConnected ? (aiStatus?.frameAgeMs ?? (cam as any).frameAgeMs ?? 0) : 0,
    error: isConnected ? null : (aiStatus?.error || 'Camera offline: No active stream received'),
  });
});

// GET /api/cameras/:id/live-feed - Proxies live MJPEG video stream from AI engine
router.get('/:id/live-feed', async (req: any, res: Response) => {
  const cam = await resolveCanonicalCamera(req.params.id);
  if (!cam) return res.status(404).send('Camera not found');

  if (!cam.streamUrl || cam.enabled === false) {
    return res.status(404).send('No active stream configured for this camera');
  }

  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const http = await import('http');

  const proxyReq = http.request(`${aiUrl}/camera/${cam.code}/feed`, (aiRes) => {
    res.writeHead(aiRes.statusCode || 200, aiRes.headers);
    aiRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(503).send('Camera live feed unavailable');
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
});

// GET /api/cameras/:id/snapshot - Proxies single JPEG frame snapshot
router.get('/:id/snapshot', async (req: any, res: Response) => {
  const cam = await resolveCanonicalCamera(req.params.id);
  if (!cam) return res.status(404).send('Camera not found');

  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const http = await import('http');

  const proxyReq = http.request(`${aiUrl}/camera/${cam.code}/snapshot`, (aiRes) => {
    res.writeHead(aiRes.statusCode || 200, aiRes.headers);
    aiRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(503).send('Camera snapshot unavailable');
    }
  });

  proxyReq.end();
});

// POST /api/cameras - Register New IP / CCTV Camera Feed (MongoDB Source of Truth)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (!user.permissions.includes(PERMISSIONS.CAMERA_MANAGE) && user.role !== 'SAFETY_OFFICER' && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Permission denied: Cannot configure surveillance cameras.' });
  }

  const { name, code, zone, streamUrl, protocol = 'RTSP', resolution = '1280x720', fps = 20, enabled = true } = req.body;
  if (!name || !code || !zone) {
    return res.status(400).json({ error: 'Name, camera code (e.g. CAM-01), and zone are required.' });
  }

  const cleanCode = code.trim().toUpperCase();

  // Check duplicate in DataStore and MongoDB
  let existing = store.cameras.find((c) => c.code.toUpperCase() === cleanCode);
  if (!existing && mongoose.connection.readyState === 1) {
    const doc = await CameraModel.findOne({ code: cleanCode });
    if (doc) existing = doc.toObject() as any;
  }

  if (existing) {
    return res.status(409).json({
      error: 'Camera already configured',
      code: 'CAMERA_ALREADY_EXISTS',
      message: `Camera with code '${cleanCode}' is already registered in the system.`,
      camera: {
        ...existing,
        streamUrl: maskStreamUrl(existing.streamUrl, existing.code || existing.id),
      },
    });
  }

  const cameraId = `cam-${Date.now()}`;
  const newCamera = {
    id: cameraId,
    name,
    code: cleanCode,
    zone,
    streamUrl: streamUrl || '',
    status: 'CONNECTING' as any,
    fps: 0,
    resolution,
    latencyMs: 0,
    enabled: enabled !== false,
    ptzEnabled: false,
    lastHeartbeatAt: new Date().toISOString(),
  };

  // 1. Persist to MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      await CameraModel.create({
        cameraId,
        siteId: 'site-rsp-1',
        zoneId: zone,
        name,
        code: cleanCode,
        zone,
        streamUrl: streamUrl || '',
        protocol,
        sourceType: 'ip_rtsp',
        status: 'CONNECTING',
        enabled: enabled !== false,
        fps: 0,
        resolution,
      });
    }
  } catch (err: any) {
    console.error('[CameraRoutes] Failed to save camera to MongoDB:', err);
  }

  // 2. Add to in-memory DataStore
  store.cameras.push(newCamera);

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CAMERA_CONFIGURED',
    resourceType: 'CAMERA',
    resourceId: newCamera.code,
    result: 'SUCCESS',
    metadata: { zone, protocol },
  });

  // 3. Emit real-time creation event via Socket.IO so frontend updates seamlessly
  socketService.emitCameraCreated({
    ...newCamera,
    streamUrl: maskStreamUrl(newCamera.streamUrl, newCamera.code),
  });

  // 4. Notify AI pipeline worker to ingest new stream
  notifyPipelineSync();

  return res.status(201).json({
    success: true,
    camera: {
      ...newCamera,
      streamUrl: maskStreamUrl(newCamera.streamUrl, newCamera.code),
    },
  });
});

// GET /api/cameras/:id/stream - RTSP to WebRTC/HLS Gateway stream URL
router.get('/:id/stream', authenticate, (req: AuthRequest, res: Response) => {
  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find(
    (c) => c.id === req.params.id || c.code.toLowerCase() === targetId
  );
  if (!cam) return res.status(404).json({ error: 'Camera not found' });

  return res.json({
    cameraId: cam.id,
    code: cam.code,
    streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id),
    webrtcUrl: cam.streamUrl ? `http://localhost:8889/${cam.code.toLowerCase()}/whep` : null,
    hlsUrl: cam.streamUrl ? `http://localhost:8888/${cam.code.toLowerCase()}/index.m3u8` : null,
    liveFeedUrl: `/api/cameras/${cam.code}/live-feed`,
    gateway: 'SafeVision Direct AI & MediaMTX Gateway',
  });
});

// Helper for TCP probe
async function probeCameraStream(streamUrl: string): Promise<{
  reachable: boolean;
  status: 'CONNECTED' | 'UNREACHABLE' | 'TIMEOUT' | 'AUTH_FAILURE' | 'INVALID_URI' | 'UNSUPPORTED_STREAM';
  message: string;
  latencyMs?: number;
}> {
  if (!streamUrl) {
    return { reachable: false, status: 'INVALID_URI', message: 'Stream URI is empty' };
  }

  if (
    !streamUrl.startsWith('rtsp://') &&
    !streamUrl.startsWith('http://') &&
    !streamUrl.startsWith('https://') &&
    !streamUrl.includes(':')
  ) {
    return {
      reachable: false,
      status: 'UNSUPPORTED_STREAM',
      message: 'Stream must begin with rtsp://, http://, https:// or specify host:port',
    };
  }

  const net = await import('net');
  let host = '';
  let port = 554;
  try {
    if (streamUrl.startsWith('rtsp://') || streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
      const parsed = new URL(streamUrl);
      host = parsed.hostname;
      port = parsed.port ? parseInt(parsed.port, 10) : streamUrl.startsWith('http:') ? 80 : streamUrl.startsWith('https:') ? 443 : 554;
    } else {
      const parts = streamUrl.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10) || 554;
    }
  } catch (err: any) {
    return { reachable: false, status: 'INVALID_URI', message: `Invalid stream URI: ${err.message}` };
  }

  const startTime = Date.now();
  return new Promise((resolve) => {
    let handled = false;
    const socket = new net.Socket();
    socket.setTimeout(2500);

    socket.on('connect', () => {
      if (!handled) {
        handled = true;
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({
          reachable: true,
          status: 'CONNECTED',
          message: `Successfully connected to stream host ${host}:${port} (${latency}ms)`,
          latencyMs: latency,
        });
      }
    });

    socket.on('timeout', () => {
      if (!handled) {
        handled = true;
        socket.destroy();
        resolve({
          reachable: false,
          status: 'TIMEOUT',
          message: `TCP socket connection to ${host}:${port} timed out after 2500ms`,
        });
      }
    });

    socket.on('error', (err: any) => {
      if (!handled) {
        handled = true;
        socket.destroy();
        resolve({
          reachable: false,
          status: 'UNREACHABLE',
          message: `Connection refused or failed by ${host}:${port}: ${err.message}`,
        });
      }
    });

    socket.connect(port, host);
  });
}

// PATCH /api/cameras/:id - Update Camera Configuration
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toUpperCase();
  const cam = store.cameras.find((c) => c.id === req.params.id || c.code.toUpperCase() === targetId);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  const before = { ...cam };
  const { name, zone, streamUrl, enabled, fps, resolution, ptzEnabled } = req.body;

  if (name !== undefined) cam.name = name;
  if (zone !== undefined) cam.zone = zone;
  if (streamUrl !== undefined) cam.streamUrl = streamUrl;
  if (enabled !== undefined) cam.enabled = Boolean(enabled);
  if (fps !== undefined) cam.fps = Number(fps);
  if (resolution !== undefined) cam.resolution = resolution;
  if (ptzEnabled !== undefined) cam.ptzEnabled = Boolean(ptzEnabled);

  // Update in MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      await CameraModel.updateOne(
        { $or: [{ code: targetId }, { cameraId: req.params.id }] },
        {
          $set: {
            ...(name !== undefined ? { name } : {}),
            ...(zone !== undefined ? { zone, zoneId: zone } : {}),
            ...(streamUrl !== undefined ? { streamUrl } : {}),
            ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
            ...(fps !== undefined ? { fps: Number(fps) } : {}),
            ...(resolution !== undefined ? { resolution } : {}),
            ...(ptzEnabled !== undefined ? { ptzEnabled: Boolean(ptzEnabled) } : {}),
            updatedAt: new Date(),
          },
        }
      );
    }
  } catch (err) {
    console.error('[CameraRoutes] Error updating camera in MongoDB:', err);
  }

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CAMERA_MODIFIED',
    resourceType: 'CAMERA',
    resourceId: cam.code,
    result: 'SUCCESS',
    before,
    after: { ...cam, streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id) },
  });

  socketService.emitCameraUpdated({
    ...cam,
    streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id),
  });
  notifyPipelineSync();
  return res.json({ success: true, camera: { ...cam, streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id) } });
});

// PUT /api/cameras/:id - Full Camera Update
router.put('/:id', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toUpperCase();
  const cam = store.cameras.find((c) => c.id === req.params.id || c.code.toUpperCase() === targetId);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  const { name, zone, streamUrl, enabled, fps, resolution, ptzEnabled } = req.body;
  if (name !== undefined) cam.name = name;
  if (zone !== undefined) cam.zone = zone;
  if (streamUrl !== undefined) cam.streamUrl = streamUrl;
  if (enabled !== undefined) cam.enabled = Boolean(enabled);
  if (fps !== undefined) cam.fps = Number(fps);
  if (resolution !== undefined) cam.resolution = resolution;
  if (ptzEnabled !== undefined) cam.ptzEnabled = Boolean(ptzEnabled);

  try {
    if (mongoose.connection.readyState === 1) {
      await CameraModel.updateOne(
        { $or: [{ code: targetId }, { cameraId: req.params.id }] },
        {
          $set: {
            name: cam.name,
            zone: cam.zone,
            zoneId: cam.zone,
            streamUrl: cam.streamUrl,
            enabled: cam.enabled,
            fps: cam.fps,
            resolution: cam.resolution,
            ptzEnabled: cam.ptzEnabled,
            updatedAt: new Date(),
          },
        }
      );
    }
  } catch (err) {
    console.error('[CameraRoutes] Error updating camera in MongoDB:', err);
  }

  socketService.emitCameraUpdated({
    ...cam,
    streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id),
  });
  notifyPipelineSync();
  return res.json({ success: true, camera: { ...cam, streamUrl: maskStreamUrl(cam.streamUrl, cam.code || cam.id) } });
});

// DELETE /api/cameras/:id - Remove Camera from Surveillance Roster
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toUpperCase();
  const index = store.cameras.findIndex((c) => c.id === req.params.id || c.code.toUpperCase() === targetId);
  const cam = index !== -1 ? store.cameras[index] : null;
  const cameraCode = cam?.code || targetId;

  // 1. Delete from MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      await CameraModel.deleteOne({
        $or: [{ code: targetId }, { cameraId: req.params.id }, { code: cameraCode }],
      });
    }
  } catch (err) {
    console.error('[CameraRoutes] Error deleting camera from MongoDB:', err);
  }

  // 2. Remove from DataStore
  if (index !== -1) {
    store.cameras.splice(index, 1);
  }

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CAMERA_DELETED',
    resourceType: 'CAMERA',
    resourceId: cameraCode,
    result: 'SUCCESS',
    metadata: { code: cameraCode },
  });

  // 3. Stop worker in Python pipeline
  const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    await fetch(`${aiUrl}/pipeline/camera/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId: cameraCode }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (e) {}

  // 4. Emit real-time lifecycle event
  socketService.emitCameraDeleted(cameraCode);
  socketService.emitCameraStatus(cameraCode, 'OFFLINE', { status: 'OFFLINE', deleted: true });
  notifyPipelineSync();

  return res.json({ success: true, message: `Camera ${cameraCode} removed successfully.` });
});

// POST /api/cameras/:id/probe - Individual Camera Connection Probe
router.post('/:id/probe', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find((c) => c.id === req.params.id || c.code.toLowerCase() === targetId);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  const probe = await probeCameraStream(cam.streamUrl);
  if (probe.reachable) {
    const hasRecentFrames = cam.lastFrameAt && (Date.now() - new Date(cam.lastFrameAt).getTime() < 15000);
    cam.status = hasRecentFrames ? 'LIVE' : 'CONNECTED';
    cam.lastHeartbeatAt = new Date().toISOString();
    cam.latencyMs = probe.latencyMs || cam.latencyMs;
    cam.errorCode = undefined;
    cam.errorMessage = undefined;
  } else {
    cam.status = 'OFFLINE';
    cam.errorCode = probe.status;
    cam.errorMessage = probe.message;
  }

  socketService.emitCameraStatus(cam.code, (cam.status === 'LIVE' || cam.status === 'CONNECTED') ? 'ONLINE' : 'OFFLINE', { status: cam.status, latencyMs: cam.latencyMs });
  return res.json({
    success: true,
    cameraId: cam.id,
    code: cam.code,
    probeStatus: probe.status,
    reachable: probe.reachable,
    message: probe.message,
    latencyMs: probe.latencyMs,
    cameraStatus: cam.status,
  });
});

// POST /api/cameras/:id/connect - Explicit Camera Connect Action
router.post('/:id/connect', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find((c) => c.id === req.params.id || c.code.toLowerCase() === targetId);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  cam.enabled = true;
  const probe = await probeCameraStream(cam.streamUrl);
  const hasRecentFrames = cam.lastFrameAt && (Date.now() - new Date(cam.lastFrameAt).getTime() < 15000);
  cam.status = probe.reachable ? (hasRecentFrames ? 'LIVE' : 'CONNECTED') : 'OFFLINE';
  cam.lastHeartbeatAt = probe.reachable ? new Date().toISOString() : cam.lastHeartbeatAt;
  cam.errorCode = probe.reachable ? undefined : probe.status;
  cam.errorMessage = probe.reachable ? undefined : probe.message;

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CAMERA_CONNECTED',
    resourceType: 'CAMERA',
    resourceId: cam.code,
    result: probe.reachable ? 'SUCCESS' : 'FAILED',
    metadata: { status: cam.status, probeMessage: probe.message },
  });

  socketService.emitCameraStatus(cam.code, cam.status === 'LIVE' ? 'ONLINE' : 'OFFLINE', { status: cam.status });
  return res.json({
    success: probe.reachable,
    cameraId: cam.id,
    code: cam.code,
    status: cam.status,
    probe,
  });
});

// POST /api/cameras/:id/disconnect - Explicit Camera Disconnect Action
router.post('/:id/disconnect', authenticate, requirePermission(PERMISSIONS.CAMERA_MANAGE), (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const targetId = String(req.params.id).toLowerCase();
  const cam = store.cameras.find((c) => c.id === req.params.id || c.code.toLowerCase() === targetId);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });

  cam.enabled = false;
  cam.status = 'OFFLINE';
  cam.errorMessage = 'Disconnected by operator';

  AuditLogger.log({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CAMERA_DISCONNECTED',
    resourceType: 'CAMERA',
    resourceId: cam.code,
    result: 'SUCCESS',
  });

  socketService.emitCameraStatus(cam.code, 'OFFLINE', { status: 'OFFLINE' });
  return res.json({ success: true, cameraId: cam.id, code: cam.code, status: 'OFFLINE' });
});

export default router;
