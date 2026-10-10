import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { upload } from '../middleware/upload';
import { AIInferenceService } from '../services/ai/AIInferenceService';
import { IncidentCandidate } from '../services/ai/AIAdapter';
import { DataStore, IncidentDoc } from '../models/DataStore';
import { IncidentModel } from '../models/mongooseModels';
import { isMongoConnected, isReplicaSetVerified } from '../config/db';
import { ENV } from '../config/env';
import { SocketService } from '../services/socket/SocketService';
import { DeduplicationService } from '../services/verification/DeduplicationService';
import { NotificationService } from '../services/notifications/NotificationService';
import { AuditLogger } from '../security/AuditLogger';

import {
  ZoneSafetyPolicyService,
  RiskAssessmentService,
  SeverityEngine,
  NearMissEngine,
  ExplainabilityEngine,
  IncidentTimelineService,
  EscalationService,
  GeofenceEngine,
} from '../services/safetyIntelligence';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();
const EVIDENCE_DIR = path.resolve(__dirname, '../../evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  } catch (err) {
    console.error('[DetectionRoute] Failed to initialize evidence directory:', err);
  }
}
const aiService = AIInferenceService.getInstance();
const store = DataStore.getInstance();
const socketService = SocketService.getInstance();
const deduplicationService = DeduplicationService.getInstance();
const notificationService = NotificationService.getInstance();
const zonePolicyService = ZoneSafetyPolicyService.getInstance();
const riskAssessmentService = RiskAssessmentService.getInstance();
const nearMissEngine = NearMissEngine.getInstance();
const timelineService = IncidentTimelineService.getInstance();
const escalationService = EscalationService.getInstance();

/**
 * Ingests authoritative incident candidate from the trusted AI inference pipeline
 */
async function ingestAuthoritativeCandidate(candidate: IncidentCandidate, evidenceBase64?: string): Promise<IncidentDoc | null> {
  // 1. In-memory Deduplication check
  const dedup = deduplicationService.checkDuplicate({
    trackId: candidate.trackId,
    employeeId: candidate.employeeId,
    cameraId: candidate.cameraId,
    ruleId: candidate.ruleId,
    violationType: candidate.violationType,
    zone: candidate.zone,
    severity: candidate.severity,
  });

  if (!dedup.shouldCreateIncident) {
    return null;
  }

  // 2. Zone Policy Check: Verify this PPE item is required by the zone policy (only for PPE equipment checks)
  const PPE_KEYWORDS = ['helmet', 'vest', 'glove', 'shoe', 'boot', 'footwear', 'mask', 'goggle', 'glasses', 'ear_protection', 'hard hat', 'hi-vis'];
  const isPPEViolation = 
    PPE_KEYWORDS.some(k => candidate.violationType.toLowerCase().includes(k)) &&
    !candidate.violationType.toLowerCase().includes('zone') &&
    !candidate.violationType.toLowerCase().includes('entry');

  if (isPPEViolation) {
    const isPPERequired = await zonePolicyService.isPPERequired(candidate.zone, candidate.violationType);
    if (!isPPERequired) {
      console.log(`[DetectionRoute] PPE '${candidate.violationType}' is not mandated in zone '${candidate.zone}'. Skipping incident creation.`);
      return null;
    }
  }

  // 3. Strict Database Verification (Requirement 1 & 3: Do not silently fall back when DEMO_MODE=false)
  const mongoReady = mongoose.connection.readyState === 1 && isMongoConnected;
  if (!mongoReady && !ENV.DEMO_MODE) {
    throw new Error('Database Offline: MongoDB connection is unavailable while DEMO_MODE=false. Cannot persist authoritative incident.');
  }

  // 4. Database-Level Duplicate Check (Avoid duplicate incident insertion)
  if (mongoReady) {
    const existingDoc = await IncidentModel.findOne({
      trackId: candidate.trackId,
      violationType: candidate.violationType,
      cameraId: candidate.cameraId,
      status: 'DETECTED',
      timestamp: { $gte: new Date(Date.now() - 30000) }, // 30-second cooldown window
    });

    if (existingDoc) {
      console.warn(`[DetectionRoute] Duplicate incident prevented in MongoDB for track ${candidate.trackId} (${candidate.violationType})`);
      return null;
    }
  }

  // 5. Phase 7 Context & Safety Intelligence Calculation
  const diag = candidate.temporalConfigUsed || {};
  const persistenceSeconds = diag.violation_duration_sec ?? 3.0;
  const observedFrames = diag.violation_count;
  const totalWindowFrames = diag.window_size;
  const violationRatio = diag.violation_ratio;
  const inRestrictedArea = Boolean(
    diag.inRestrictedArea || 
    candidate.violationType === 'restricted_zone' || 
    candidate.violationType === 'unverified_person_in_restricted_zone' ||
    candidate.violationType.includes('restricted_zone')
  );

  // A. Multi-Factor Risk Assessment
  const riskResult = await riskAssessmentService.calculateRisk({
    violationType: candidate.violationType,
    confidence: candidate.confidence,
    zone: candidate.zone,
    zoneId: candidate.zoneId,
    cameraId: candidate.cameraId,
    trackId: candidate.trackId,
    employeeId: candidate.employeeId,
    durationSeconds: persistenceSeconds,
    inRestrictedArea,
  });

  // B. Traceable Severity Evaluation
  const severityResult = SeverityEngine.evaluate({
    riskScore: riskResult.riskScore,
    violationType: candidate.violationType,
    zone: candidate.zone,
    zoneDangerLevel: (candidate as any).zoneDangerLevel || (riskResult.riskLevel === 'CRITICAL' ? 'critical' : riskResult.riskLevel === 'HIGH' ? 'high' : 'medium'),
    persistenceSeconds,
    inRestrictedArea,
  });

  // C. Near-Miss Detection
  const nearMissDoc = await nearMissEngine.evaluate({
    siteId: 'site-rsp-1',
    zoneId: candidate.zone,
    cameraId: candidate.cameraId,
    trackId: candidate.trackId,
    employeeId: candidate.employeeId,
    identityStatus: candidate.identityStatus,
    violationType: candidate.violationType,
    persistenceSeconds,
    riskScore: riskResult.riskScore,
    confidence: candidate.confidence,
    modelId: candidate.modelId,
    evidence: evidenceBase64,
  });

  // D. Explainable AI Generation
  const explanation = ExplainabilityEngine.generateExplanation({
    violationType: candidate.violationType,
    zone: candidate.zone,
    confidence: candidate.confidence,
    durationSeconds: persistenceSeconds,
    observedFrames,
    totalWindowFrames,
    violationRatio,
    zoneRequiresItem: true,
    temporalConfirmed: true,
    riskScore: riskResult.riskScore,
    riskLevel: riskResult.riskLevel,
    severity: severityResult.severity,
    identityStatus: candidate.identityStatus || 'UNCONFIRMED',
    employeeName: candidate.employeeName,
  });

  // 6. Generate authoritative incident record with Phase 7 fields
  // 6. Generate authoritative incident record with Phase 7 fields
  const incId = `INC-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;

  // Phase 9.1.2: Real Visual Evidence Capture & Storage
  let rawB64 = evidenceBase64;
  let evidenceObj: any = null;
  let finalHash = '';
  let finalEvidenceImage = '';

  // If evidence was not passed directly, request authoritative frame from AI Engine
  if (!rawB64 || rawB64.trim().length === 0) {
    try {
      const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const capResp = await fetch(`${aiUrl}/camera/${candidate.cameraId}/capture-evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: candidate.trackId,
          violation_type: candidate.violationType,
          confidence: candidate.confidence,
          bounding_box: candidate.boundingBox,
          zone_polygon: diag.zone_polygon,
          zone_name: candidate.zone,
          is_breach: inRestrictedArea
        })
      });
      if (capResp.ok) {
        const capData: any = await capResp.json();
        if (capData.captured && capData.evidenceBase64) {
          rawB64 = capData.evidenceBase64;
        }
      }
    } catch (e: any) {
      console.warn(`[DetectionRoute] Capture evidence call failed for camera ${candidate.cameraId}:`, e.message);
    }
  }

  if (rawB64 && rawB64.trim().length > 0) {
    try {
      let cleanB64 = rawB64;
      if (cleanB64.includes(',')) {
        cleanB64 = cleanB64.split(',', 2)[1];
      }
      const imgBuffer = Buffer.from(cleanB64, 'base64');
      if (imgBuffer.length > 0) {
        finalHash = crypto.createHash('sha256').update(imgBuffer).digest('hex');
        if (!fs.existsSync(EVIDENCE_DIR)) {
          fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        }
        const filePath = path.join(EVIDENCE_DIR, `${incId}.jpg`);
        fs.writeFileSync(filePath, imgBuffer);

        finalEvidenceImage = `/api/incidents/${incId}/evidence`;
        evidenceObj = {
          captured: true,
          mediaType: 'image/jpeg',
          capturedAt: candidate.timestamp || new Date().toISOString(),
          cameraId: candidate.cameraId,
          source: 'REAL_CCTV',
          storageType: 'LOCAL_FS',
          storageRef: `evidence/${incId}.jpg`,
          sha256: finalHash,
          annotations: {
            bbox: candidate.boundingBox,
            violation: candidate.violationType,
            trackId: candidate.trackId,
            zoneId: candidate.zoneId || candidate.zone,
            confidence: candidate.confidence
          }
        };
        console.log(`[DetectionRoute] Authoritative visual evidence persisted: ${filePath} (${imgBuffer.length} bytes, SHA256: ${finalHash.slice(0, 12)}...)`);
      }
    } catch (persistErr: any) {
      console.error('[DetectionRoute] Failed to persist visual evidence image:', persistErr);
    }
  }

  if (!evidenceObj) {
    evidenceObj = {
      captured: false,
      mediaType: 'image/jpeg',
      capturedAt: candidate.timestamp || new Date().toISOString(),
      cameraId: candidate.cameraId,
      source: 'REAL_CCTV',
      storageType: 'LOCAL_FS',
      storageRef: '',
      failureReason: 'FRAME_UNAVAILABLE',
      annotations: {
        bbox: candidate.boundingBox,
        violation: candidate.violationType,
        trackId: candidate.trackId,
        zoneId: candidate.zoneId || candidate.zone
      }
    };
  }

  const newIncident: IncidentDoc = {
    id: `inc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    incidentId: incId,
    workerId: candidate.employeeId || 'UNIDENTIFIED',
    workerName: candidate.employeeName || (candidate.employeeId ? `Employee (${candidate.employeeId})` : 'Unidentified Worker'),
    employeeId: candidate.employeeId || undefined,
    employeeName: candidate.employeeName || undefined,
    identityStatus: candidate.identityStatus || 'UNCONFIRMED',
    trackId: candidate.trackId,
    violationType: candidate.violationType,
    severity: severityResult.severity,
    severityReason: severityResult.severityReason,
    severityFactors: severityResult.severityFactors,
    confidence: candidate.confidence,
    boundingBox: candidate.boundingBox,
    zone: candidate.zone,
    zoneId: candidate.zoneId || diag.zoneId || candidate.zone,
    cameraId: candidate.cameraId,
    timestamp: candidate.timestamp || new Date().toISOString(),
    riskScore: riskResult.riskScore,
    riskLevel: riskResult.riskLevel,
    riskFactors: riskResult.factors,
    status: 'DETECTED',
    evidenceImage: finalEvidenceImage,
    evidenceHash: finalHash || undefined,
    evidence: evidenceObj,
    whyFlagged: explanation,
    whyCreated: explanation,
    explanation,
    recommendedAction: riskResult.recommendedAction,
    nearMissId: nearMissDoc ? nearMissDoc.nearMissId : undefined,
    escalationStatus: 'PENDING',
    escalationTier: 1,
    timeline: [],
    source: 'AI',
    modelName: 'SafeVision-AI-Engine',
    modelVersion: '1.0.0-industrial',
    pipelineName: 'ByteTrack + SH17 Neural Pipeline',
    ruleId: candidate.ruleId,
    modelId: candidate.modelId,
    temporalConfigUsed: candidate.temporalConfigUsed,
    version: 1,
  };

  // 7. Persist to MongoDB safevision.incidents collection
  if (mongoReady) {
    try {
      await IncidentModel.create({
        incidentId: newIncident.incidentId,
        source: 'AI',
        ruleId: newIncident.ruleId,
        siteId: newIncident.siteId || 'site-rsp-1',
        zoneId: newIncident.zoneId || newIncident.zone,
        zone: newIncident.zone,
        cameraId: newIncident.cameraId,
        modelId: newIncident.modelId || 'MODEL-PPE-SH17-001',
        trackId: newIncident.trackId,
        employeeId: newIncident.employeeId || null,
        workerId: newIncident.workerId,
        workerName: newIncident.workerName,
        identityStatus: newIncident.identityStatus,
        violationType: newIncident.violationType,
        severity: newIncident.severity,
        severityReason: newIncident.severityReason,
        severityFactors: newIncident.severityFactors,
        confidence: newIncident.confidence,
        boundingBox: newIncident.boundingBox,
        riskScore: newIncident.riskScore,
        riskLevel: newIncident.riskLevel,
        riskFactors: newIncident.riskFactors,
        status: newIncident.status,
        evidenceImage: newIncident.evidenceImage,
        evidenceHash: newIncident.evidenceHash,
        evidence: newIncident.evidence,
        whyFlagged: newIncident.whyFlagged,
        whyCreated: newIncident.whyCreated,
        explanation: newIncident.explanation,
        recommendedAction: newIncident.recommendedAction,
        nearMissId: newIncident.nearMissId,
        escalationStatus: newIncident.escalationStatus,
        escalationTier: newIncident.escalationTier,
        temporalConfigUsed: newIncident.temporalConfigUsed,
        version: 1,
        timestamp: new Date(newIncident.timestamp),
      });
      console.log(`[DetectionRoute] Authoritative incident ${newIncident.incidentId} successfully persisted to MongoDB`);
    } catch (err: any) {
      if (err.code === 11000) {
        console.warn(`[DetectionRoute] Duplicate incidentId in MongoDB: ${err.message}`);
        return null;
      }
      if (!ENV.DEMO_MODE) {
        throw new Error(`CRITICAL: MongoDB incident persistence failed: ${err.message}`);
      }
      console.warn(`[DetectionRoute] MongoDB persistence notice (fallback in DEMO_MODE): ${err.message}`);
    }
  }

  // Update in-memory store
  store.incidents.unshift(newIncident);

  // 8. Record Real System Lifecycle Events in Timeline
  await timelineService.recordEvent(
    newIncident.incidentId,
    'TRACK_IDENTIFIED',
    `Worker track ${candidate.trackId} observed in ${candidate.zone} (${newIncident.identityStatus}).`,
    'BYTE_TRACK_ENGINE'
  );
  if (isPPEViolation) {
    await timelineService.recordEvent(
      newIncident.incidentId,
      'PPE_VIOLATION_OBSERVED',
      `${candidate.violationType.replace(/_/g, ' ').toUpperCase()} confirmed missing via neural association.`,
      'PPE_ASSOCIATION_ENGINE'
    );
  } else {
    await timelineService.recordEvent(
      newIncident.incidentId,
      'GEOFENCE_BREACH_CONFIRMED',
      `Restricted zone breach (${candidate.violationType.replace(/_/g, ' ')}) confirmed inside zone ${newIncident.zone}.`,
      'GEOFENCE_ENGINE'
    );
  }
  await timelineService.recordEvent(
    newIncident.incidentId,
    'TEMPORAL_CONFIRMATION',
    `Temporal breach confirmed over ${persistenceSeconds.toFixed(1)}s window.`,
    'TEMPORAL_VALIDATOR'
  );
  await timelineService.recordEvent(
    newIncident.incidentId,
    'RISK_SEVERITY_ASSESSED',
    `Risk assessed at ${newIncident.riskScore}/100 (${newIncident.riskLevel}), severity assigned as ${newIncident.severity.toUpperCase()}.`,
    'SAFETY_INTELLIGENCE_ENGINE'
  );

  // 9. Register with Smart Escalation Service
  escalationService.registerIncident(newIncident).catch((err) => {
    console.warn('[DetectionRoute] Escalation register notice:', err.message);
  });

  // 6. Record in deduplication window
  deduplicationService.recordDispatched({
    trackId: candidate.trackId,
    employeeId: candidate.employeeId,
    cameraId: candidate.cameraId,
    ruleId: candidate.ruleId,
    violationType: candidate.violationType,
    zone: candidate.zone,
    incidentId: newIncident.id,
    severity: newIncident.severity,
  });

  // 7. Audit Log
  AuditLogger.log({
    userId: 'SYSTEM_AI_PIPELINE',
    userEmail: 'ai-pipeline@safevision.internal',
    userRole: 'AI_AGENT',
    action: 'INCIDENT_CREATED',
    resourceType: 'INCIDENT',
    resourceId: newIncident.incidentId,
    zoneId: newIncident.zone,
    result: 'SUCCESS',
    metadata: {
      source: 'AI',
      trackId: newIncident.trackId,
      employeeId: newIncident.employeeId,
      modelId: newIncident.modelId,
      ruleId: newIncident.ruleId,
    },
  });

  // 8. Multi-channel Notifications
  notificationService.notifyIncident(newIncident);

  // 9. Realtime Synchronization
  // Direct Socket.IO legacy notification
  socketService.emitNewIncident(newIncident);

  // If MongoDB Change Streams is NOT verified or DB is in fallback, emit incident.created directly.
  // When Change Streams is verified, ChangeStreamWatcher handles broadcasting incident.created upon DB insert.
  if (!isReplicaSetVerified) {
    socketService.emitRealtimeEvent('incident.created', {
      eventId: `evt-${Date.now()}`,
      entityType: 'incident',
      entityId: newIncident.incidentId,
      siteId: newIncident.siteId || 'SITE-01',
      zoneId: newIncident.zone,
      version: 1,
      timestamp: newIncident.timestamp,
      incident: newIncident,
    });
  }

  return newIncident;
}

// GET /api/detection/health (Checks Python AI engine status)
router.get('/health', async (req: Request, res: Response) => {
  const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  try {
    const resp = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ connected: true, aiEngine: data });
    }
    return res.json({ connected: false, status: 'AI Service returned error', code: resp.status });
  } catch (err: any) {
    return res.json({ connected: false, status: 'AI Service offline', error: err.message });
  }
});

// POST /api/detection/frame (Live streaming frame from webcam or RTSP feed)
router.post('/frame', async (req: Request, res: Response) => {
  try {
    const { frameBase64, cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: 'Validation error: cameraId is required and cannot be empty.' });
    }

    if (!frameBase64) {
      return res.status(400).json({ error: 'Missing frameBase64 parameter.' });
    }

    const cam = store.cameras.find((c) => c.code === cameraId || c.id === cameraId);
    let zone = req.body.zone;
    if (!zone) {
      zone = cam?.zone || 'Unassigned Zone';
    }

    const isWebcamDirect = req.body.sourceType === 'browser_webcam' || cam?.sourceType === 'browser_cam' || cam?.sourceType === 'WEBCAM';
    if (cam && isWebcamDirect) {
      const wasLive = cam.status === 'LIVE';
      cam.lastFrameAt = new Date().toISOString();
      cam.status = 'LIVE';
      cam.lastHeartbeatAt = cam.lastFrameAt;
      if (!wasLive) {
        socketService.emitCameraStatus(cam.code, 'ONLINE', { status: 'LIVE' });
      }
    }

    const fullResult = await aiService.detectFrameFull({
      frameBase64,
      zone,
      cameraId,
    });

    const createdIncidents: IncidentDoc[] = [];

    // Only ingest if the model is configured and candidate was confirmed by temporal validation
    if (fullResult.modelStatus === 'configured' && fullResult.incidentCandidates.length > 0) {
      for (const cand of fullResult.incidentCandidates) {
        const inc = await ingestAuthoritativeCandidate(cand, frameBase64);
        if (inc) createdIncidents.push(inc);
      }
    }

    // Dynamic Geofence / Restricted Zone Evaluation (Phase 9.1)
    const geofenceEngine = GeofenceEngine.getInstance();
    const workersToEvaluate: any[] = (fullResult.trackedWorkers && fullResult.trackedWorkers.length > 0)
      ? fullResult.trackedWorkers
      : (fullResult.detections || []).map((d) => ({
          trackId: d.workerId || 'UNIDENTIFIED',
          employeeId: (d as any).employeeId || null,
          employeeName: d.workerName || null,
          identityStatus: (d as any).identityStatus || 'UNCONFIRMED',
          ppeState: {},
          boundingBox: d.boundingBox,
          confidence: d.confidence,
        }));

    let geofenceBreaches: any[] = [];
    if (workersToEvaluate.length > 0) {
      geofenceBreaches = await geofenceEngine.evaluateTracksForCamera(cameraId, workersToEvaluate, frameBase64);
      for (const breach of geofenceBreaches) {
        if (breach.temporalResult && breach.temporalResult.isConfirmed) {
          const incCandidate: IncidentCandidate = {
            trackId: breach.trackId,
            employeeId: breach.employeeId || null,
            employeeName: breach.employeeName || null,
            identityStatus: (breach.identityStatus as any) || 'UNCONFIRMED',
            violationType: breach.violationType || 'restricted_zone',
            severity: breach.zone.riskLevel === 'CRITICAL' ? 'critical' : breach.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
            confidence: breach.temporalResult.candidate.confidence || 0.85,
            cameraId,
            zone: breach.zone.name,
            zoneId: breach.zone.zoneId,
            timestamp: new Date().toISOString(),
            boundingBox: breach.boundingBox,
            ruleId: `RULE-RESTRICTED-${breach.zone.zoneId}`,
            modelId: fullResult.modelId || 'MODEL-PPE-SH17-001',
            whyFlagged: [
              breach.reason || `Restricted zone '${breach.zone.name}' (${breach.zone.zoneType}) breach confirmed.`,
              `Temporal verification confirmed over ${breach.temporalResult.persistedDurationSec.toFixed(1)}s window (${breach.temporalResult.frameCount} frames).`,
              `Reference position: bottom-center (${(breach.referencePoint.x * 100).toFixed(1)}%, ${(breach.referencePoint.y * 100).toFixed(1)}%) inside polygon.`,
              breach.employeeId ? `Worker Identity: ${breach.employeeName || breach.employeeId}` : 'Worker Identity: Unknown / Unconfirmed',
            ],
            temporalConfigUsed: {
              violation_duration_sec: breach.temporalResult.persistedDurationSec,
              violation_count: breach.temporalResult.frameCount,
              window_size: 20,
              violation_ratio: 1.0,
              inRestrictedArea: true,
              zoneId: breach.zone.zoneId,
            },
          };

          const inc = await ingestAuthoritativeCandidate(incCandidate, frameBase64);
          if (inc) createdIncidents.push(inc);
        }
      }
    }

    // Dynamic Emergency Exit / Escape Route Safety Monitoring (Phase 9.2)
    const tracksForEmergency = (fullResult.trackedWorkers && fullResult.trackedWorkers.length > 0)
      ? fullResult.trackedWorkers.map((tw: any) => ({
          trackId: tw.trackId,
          objectClass: 'person',
          confidence: tw.confidence || 0.85,
          boundingBox: tw.boundingBox,
          bbox: tw.bbox,
        }))
      : (fullResult.detections || []).map((d: any) => ({
          trackId: d.workerId || 'UNIDENTIFIED',
          objectClass: d.class === 'tool' ? 'tool' : 'person',
          confidence: d.confidence || 0.85,
          boundingBox: d.boundingBox,
          bbox: d.boundingBox,
        }));

    let emergencyBlockages: any[] = [];
    emergencyBlockages = await geofenceEngine.evaluateEmergencyBlockages(
      cameraId,
      tracksForEmergency,
      frameBase64
    );

      for (const blockage of emergencyBlockages) {
        if (blockage.isConfirmed) {
          const incCandidate: IncidentCandidate = {
            trackId: blockage.trackId,
            employeeId: null,
            employeeName: null,
            identityStatus: 'UNAVAILABLE',
            violationType: 'emergency_route_blockage',
            severity: blockage.zone.riskLevel === 'CRITICAL' ? 'critical' : blockage.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
            confidence: blockage.confidence || 0.85,
            cameraId,
            zone: blockage.zone.name,
            zoneId: blockage.zone.zoneId,
            timestamp: new Date().toISOString(),
            boundingBox: blockage.boundingBox,
            ruleId: `RULE-EMERGENCY-${blockage.zone.zoneType}-${blockage.zone.zoneId}`,
            modelId: fullResult.modelId || 'MODEL-PPE-SH17-001',
            whyFlagged: [
              blockage.whyFlagged,
              `Emergency Area Type: ${blockage.zone.zoneType.replace(/_/g, ' ')}`,
              `Configured Persistence Threshold: ${blockage.temporalThresholdSec.toFixed(1)}s (Observed: ${blockage.durationSec.toFixed(1)}s)`,
              `Object Classification: ${blockage.objectClass.toUpperCase()} (Confidence: ${(blockage.confidence * 100).toFixed(1)}%)`,
            ],
            temporalConfigUsed: {
              violation_duration_sec: blockage.durationSec,
              violation_count: blockage.temporalResult.frameCount,
              threshold_sec: blockage.temporalThresholdSec,
              objectClass: blockage.objectClass,
              zoneType: blockage.zone.zoneType,
              zoneId: blockage.zone.zoneId,
              state: 'BLOCKED',
            },
          };

          const inc = await ingestAuthoritativeCandidate(incCandidate, frameBase64);
          if (inc) {
            createdIncidents.push(inc);

            // Operational alert via Socket.IO (Section 12)
            socketService.emit('emergency_route.blocked', {
              incidentId: inc.incidentId,
              cameraId: inc.cameraId,
              zoneId: inc.zoneId,
              zone: inc.zone,
              zoneType: blockage.zone.zoneType,
              trackId: inc.trackId,
              objectClass: blockage.objectClass,
              severity: inc.severity,
              riskScore: inc.riskScore,
              timestamp: inc.timestamp,
              evidence: {
                captured: Boolean(inc.evidence?.captured),
                sha256: inc.evidence?.sha256,
              },
            });
          }
        }
      }

    // Dynamic Lone Worker / Isolation Safety Monitoring (Phase 9.3)
    const frameTsMs = req.body.frameTimestampMs
      ? Number(req.body.frameTimestampMs)
      : req.body.timestamp
      ? new Date(req.body.timestamp).getTime()
      : Date.now();

    const loneWorkerResults = await geofenceEngine.evaluateLoneWorkerZones(
      cameraId,
      tracksForEmergency,
      frameBase64,
      1280,
      720,
      frameTsMs
    );

    for (const lw of loneWorkerResults) {
      if (lw.isConfirmedIncident) {
        const incCandidate: IncidentCandidate = {
          trackId: lw.trackId,
          employeeId: null,
          employeeName: null,
          identityStatus: 'UNAVAILABLE',
          violationType: 'worker_isolated',
          severity: lw.zone.riskLevel === 'CRITICAL' ? 'critical' : lw.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
          confidence: lw.confidence || 0.85,
          cameraId,
          zone: lw.zone.name,
          zoneId: lw.zone.zoneId,
          timestamp: new Date().toISOString(),
          boundingBox: lw.boundingBox,
          ruleId: `RULE-LONE-WORKER-${lw.zone.zoneId}`,
          modelId: fullResult.modelId || 'MODEL-PPE-SH17-001',
          whyFlagged: [
            lw.whyFlagged,
            `Lone Worker Safety Zone: ${lw.zone.name}`,
            `Configured Isolation Threshold: ${lw.isolationThresholdSec}s (Observed: ${lw.durationSec.toFixed(1)}s)`,
            `Minimum Required Workers: ${lw.minimumWorkers} (Present: ${lw.workerCount})`,
          ],
          temporalConfigUsed: {
            violation_duration_sec: lw.durationSec,
            threshold_sec: lw.isolationThresholdSec,
            warning_threshold_sec: lw.warningThresholdSec,
            worker_count: lw.workerCount,
            minimum_workers: lw.minimumWorkers,
            zoneType: 'LONE_WORKER_ZONE',
            zoneId: lw.zone.zoneId,
            state: 'INCIDENT',
          },
        };

        const inc = await ingestAuthoritativeCandidate(incCandidate, frameBase64);
        if (inc) {
          inc.incidentType = 'LONE_WORKER';
          createdIncidents.push(inc);

          socketService.emit('lone_worker.incident_created', {
            incidentId: inc.incidentId,
            cameraId: inc.cameraId,
            zoneId: inc.zoneId,
            zoneName: inc.zone,
            trackId: inc.trackId,
            workerCount: lw.workerCount,
            minimumWorkers: lw.minimumWorkers,
            durationSec: lw.durationSec,
            isolationThresholdSec: lw.isolationThresholdSec,
            severity: inc.severity,
            riskScore: inc.riskScore,
            timestamp: inc.timestamp,
            evidence: {
              captured: Boolean(inc.evidence?.captured),
              sha256: inc.evidence?.sha256,
            },
          });
        }
      }
    }

    const activeZones = await geofenceEngine.getActiveZonesForCamera(cameraId);
    const activeEmergencyZones = await geofenceEngine.getActiveEmergencyZonesForCamera(cameraId);
    const activeLoneWorkerZones = await geofenceEngine.getActiveLoneWorkerZonesForCamera(cameraId);

    return res.json({
      success: fullResult.success,
      modelStatus: fullResult.modelStatus,
      modelId: fullResult.modelId,
      detections: fullResult.detections,
      trackedWorkers: fullResult.trackedWorkers,
      createdIncidents,
      activeZones,
      activeEmergencyZones,
      activeLoneWorkerZones,
      geofenceBreaches: geofenceBreaches.map((b) => ({
        zoneId: b.zone.zoneId,
        zoneName: b.zone.name,
        trackId: b.trackId,
        isAuthorized: b.isAuthorized,
        violationType: b.violationType,
        isConfirmed: Boolean(b.temporalResult?.isConfirmed),
      })),
      emergencyBlockages: emergencyBlockages.map((b) => ({
        zoneId: b.zone.zoneId,
        zoneName: b.zone.name,
        zoneType: b.zone.zoneType,
        trackId: b.trackId,
        objectClass: b.objectClass,
        state: b.state,
        durationSec: b.durationSec,
        isConfirmed: b.isConfirmed,
      })),
      workersDetected: fullResult.totalPersonsDetected,
      violationsCount: createdIncidents.length,
      aiEngine: aiService.getActiveAdapterInfo().name,
      warnings: fullResult.warnings || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Frame Detection Error]', error);
    return res.status(500).json({ error: error.message || 'Frame processing failed' });
  }
});

// POST /api/detection/incident-candidate (Direct RTSP AI Pipeline Authoritative Candidate Ingestion)
router.post('/incident-candidate', async (req: Request, res: Response) => {
  try {
    const { candidate, evidenceBase64 } = req.body;
    if (!candidate || !candidate.trackId || !candidate.violationType || !candidate.cameraId) {
      return res.status(400).json({ error: 'Invalid candidate payload: trackId, violationType, and cameraId are required.' });
    }

    // STRICT STREAM ISOLATION (Section 5 & 12): Reject mismatched or unconfigured camera IDs
    const cam = store.cameras.find(
      (c) => c.code.toUpperCase() === candidate.cameraId.toUpperCase() || c.id === candidate.cameraId
    );
    if (!cam) {
      console.warn(`[CAMERA_STREAM_ID_MISMATCH] Rejected incident candidate: Camera '${candidate.cameraId}' not found in active configuration.`);
      return res.status(404).json({ error: 'CAMERA_STREAM_ID_MISMATCH', message: `Camera '${candidate.cameraId}' not configured` });
    }
    if (cam.enabled === false) {
      console.warn(`[CAMERA_STREAM_ID_MISMATCH] Rejected incident candidate: Camera '${candidate.cameraId}' is marked disabled.`);
      return res.status(400).json({ error: 'CAMERA_DISABLED', message: `Camera '${candidate.cameraId}' is disabled` });
    }

    const wasLive = cam.status === 'LIVE';
    cam.lastFrameAt = new Date().toISOString();
    cam.status = 'LIVE';
    cam.lastHeartbeatAt = cam.lastFrameAt;
    if (!wasLive) {
      socketService.emitCameraStatus(cam.code, 'ONLINE', { status: 'LIVE' });
    }

    const newIncident = await ingestAuthoritativeCandidate(candidate, evidenceBase64);
    if (!newIncident) {
      return res.json({
        success: true,
        incidentCreated: false,
        message: 'Candidate deduplicated or in cooldown window.',
      });
    }

    return res.json({
      success: true,
      incidentCreated: true,
      incident: newIncident,
    });
  } catch (error: any) {
    console.error('[Incident Candidate Ingestion Error]', error);
    return res.status(500).json({ error: error.message || 'Candidate ingestion failed' });
  }
});

// POST /api/detection/camera-heartbeat (Updates camera live status & telemetry from direct RTSP worker)
router.post('/camera-heartbeat', async (req: Request, res: Response) => {
  try {
    const {
      cameraId,
      status,
      fps,
      processedFps,
      sourceFps,
      latencyMs,
      frameAgeMs,
      droppedFrames,
      processedFrames,
      workerUptime
    } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: 'cameraId is required' });
    }

    // STRICT STREAM ISOLATION (Section 5 & 12): Reject heartbeat for unconfigured camera IDs
    const cam = store.cameras.find(
      (c) => c.code.toUpperCase() === cameraId.toUpperCase() || c.id === cameraId
    );
    if (!cam) {
      console.warn(`[CAMERA_STREAM_ID_MISMATCH] Rejected heartbeat: Camera '${cameraId}' not found in active configuration.`);
      return res.status(404).json({ error: 'CAMERA_STREAM_ID_MISMATCH', message: `Camera '${cameraId}' not configured` });
    }

    const effectiveFps = processedFps !== undefined ? processedFps : fps;
    cam.status = status || 'LIVE';
    cam.lastHeartbeatAt = new Date().toISOString();
    if (cam.status === 'LIVE') {
      cam.lastFrameAt = cam.lastHeartbeatAt;
    }
    if (effectiveFps !== undefined) cam.fps = effectiveFps;
    if (latencyMs !== undefined) cam.latencyMs = latencyMs;
    if (frameAgeMs !== undefined) (cam as any).frameAgeMs = frameAgeMs;
    if (droppedFrames !== undefined) (cam as any).droppedFrames = droppedFrames;
    if (processedFrames !== undefined) (cam as any).processedFrames = processedFrames;
    if (sourceFps !== undefined) (cam as any).sourceFps = sourceFps;
    if (workerUptime !== undefined) (cam as any).workerUptime = workerUptime;

    // Broadcast real telemetry to Socket.IO clients
    socketService.emitCameraTelemetry(cam.code, {
      cameraId: cam.code,
      status: cam.status,
      fps: cam.fps,
      processedFps: effectiveFps,
      sourceFps,
      latencyMs: cam.latencyMs,
      frameAgeMs: (cam as any).frameAgeMs,
      droppedFrames: (cam as any).droppedFrames,
      processedFrames: (cam as any).processedFrames,
      workerUptime,
      lastHeartbeatAt: cam.lastHeartbeatAt,
    });

    // Persist status and telemetry to MongoDB (authoritative database)
    try {
      const { CameraModel } = await import('../models/mongooseModels');
      await CameraModel.updateOne(
        { code: cam.code },
        {
          $set: {
            status: cam.status,
            fps: cam.fps,
            latencyMs: cam.latencyMs,
            lastHeartbeatAt: new Date(cam.lastHeartbeatAt),
            lastFrameAt: cam.lastFrameAt ? new Date(cam.lastFrameAt) : undefined,
          },
        }
      );
    } catch (err: any) {
      // Non-fatal if DB write encounters transient issue
    }

    return res.json({ success: true, cameraId, status: cam?.status || status });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/detection/camera-detections (Receives lightweight live detections telemetry from AI worker)
router.post('/camera-detections', async (req: Request, res: Response) => {
  try {
    const { cameraId, timestamp, frameWidth, frameHeight, detections, frameBase64 } = req.body;
    if (!cameraId) {
      return res.status(400).json({ error: 'cameraId is required' });
    }

    // STRICT STREAM ISOLATION (Section 5 & 12): Reject detections for unconfigured or disabled camera
    const cam = store.cameras.find(
      (c) => c.code.toUpperCase() === cameraId.toUpperCase() || c.id === cameraId
    );
    if (!cam) {
      console.warn(`[CAMERA_STREAM_ID_MISMATCH] Rejected detections: Camera '${cameraId}' not configured.`);
      return res.status(404).json({ error: 'CAMERA_STREAM_ID_MISMATCH', message: `Camera '${cameraId}' not configured` });
    }
    if (cam.enabled === false) {
      console.warn(`[CAMERA_STREAM_ID_MISMATCH] Rejected detections: Camera '${cameraId}' is marked disabled.`);
      return res.status(400).json({ error: 'CAMERA_DISABLED', message: `Camera '${cameraId}' is disabled` });
    }

    cam.lastHeartbeatAt = timestamp || new Date().toISOString();
    cam.lastFrameAt = timestamp || new Date().toISOString();
    if (cam.status === 'OFFLINE' || cam.status === 'NO_FRAMES') {
      cam.status = 'LIVE';
    }

    const fw = Number(frameWidth) || 1280;
    const fh = Number(frameHeight) || 720;

    // Dynamic Geofence / Restricted Zone Evaluation (Phase 9.1 Hotfix)
    const geofenceEngine = GeofenceEngine.getInstance();
    const workersToEvaluate: any[] = (detections || []).map((d: any) => ({
      trackId: d.trackId || d.worker_tracking_id || 'UNIDENTIFIED',
      employeeId: d.employeeId || null,
      employeeName: d.employeeName || null,
      identityStatus: d.identityStatus || 'UNCONFIRMED',
      ppeState: d.ppe || d.ppeState || {},
      boundingBox: d.bbox || d.boundingBox,
      confidence: d.confidence || 0.85,
    }));

    let geofenceBreaches: any[] = [];
    const createdIncidents: IncidentDoc[] = [];

    if (workersToEvaluate.length > 0) {
      geofenceBreaches = await geofenceEngine.evaluateTracksForCamera(
        cameraId,
        workersToEvaluate,
        undefined,
        fw,
        fh
      );

      for (const breach of geofenceBreaches) {
        if (breach.temporalResult && breach.temporalResult.isConfirmed) {
          // Attempt to capture real live evidence snapshot from AI engine
          let evidenceBase64 = '';
          try {
            const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
            const snapResp = await fetch(`${aiUrl}/camera/${cameraId}/snapshot`, {
              signal: AbortSignal.timeout(600),
            });
            if (snapResp.ok) {
              const arrayBuffer = await snapResp.arrayBuffer();
              evidenceBase64 = `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
            }
          } catch (_) {}

          const incCandidate: IncidentCandidate = {
            trackId: breach.trackId,
            employeeId: breach.employeeId || null,
            employeeName: breach.employeeName || null,
            identityStatus: (breach.identityStatus as any) || 'UNCONFIRMED',
            violationType: breach.violationType || 'restricted_zone',
            severity: breach.zone.riskLevel === 'CRITICAL' ? 'critical' : breach.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
            confidence: breach.temporalResult.candidate.confidence || 0.85,
            cameraId,
            zone: breach.zone.name,
            zoneId: breach.zone.zoneId,
            timestamp: new Date().toISOString(),
            boundingBox: breach.boundingBox,
            ruleId: `RULE-RESTRICTED-${breach.zone.zoneId}`,
            modelId: 'MODEL-PPE-SH17-001',
            whyFlagged: [
              breach.reason || `Restricted zone '${breach.zone.name}' (${breach.zone.zoneType}) breach confirmed.`,
              `Temporal verification confirmed over ${breach.temporalResult.persistedDurationSec.toFixed(1)}s window (${breach.temporalResult.frameCount} frames).`,
              `Reference position: bottom-center (${(breach.referencePoint.x * 100).toFixed(1)}%, ${(breach.referencePoint.y * 100).toFixed(1)}%) inside polygon.`,
              breach.employeeId ? `Worker Identity: ${breach.employeeName || breach.employeeId}` : 'Worker Identity: Unknown / Unconfirmed',
            ],
            temporalConfigUsed: {
              violation_duration_sec: breach.temporalResult.persistedDurationSec,
              violation_count: breach.temporalResult.frameCount,
              window_size: 20,
              violation_ratio: 1.0,
              inRestrictedArea: true,
              zoneId: breach.zone.zoneId,
            },
          };

          const inc = await ingestAuthoritativeCandidate(incCandidate, evidenceBase64);
          if (inc) {
            createdIncidents.push(inc);
            console.log(`[Geofence Hotfix] Confirmed breach -> Incident ${inc.incidentId || inc.id} created for camera ${cameraId}`);
          }
        }
      }
    }

    // Dynamic Emergency Exit / Escape Route Safety Monitoring (Phase 9.2)
    let emergencyBlockages: any[] = [];
    const tracksForEmergency = (detections || []).filter((d: any) => {
      const cls = (d.class || d.label || '').toLowerCase();
      return cls === 'person' || cls === 'worker' || cls === 'tool';
    }).map((d: any) => ({
      trackId: d.trackId || `track-${Math.floor(Math.random() * 10000)}`,
      objectClass: (d.class || d.label || '').toLowerCase() === 'tool' ? 'tool' : 'person',
      confidence: d.confidence || 0.85,
      boundingBox: d.boundingBox || d.bbox,
      bbox: d.boundingBox || d.bbox,
    }));

    emergencyBlockages = await geofenceEngine.evaluateEmergencyBlockages(
      cameraId,
      tracksForEmergency,
      frameBase64 || req.body.frameBase64,
      fw,
      fh
    );

    for (const blockage of emergencyBlockages) {
      if (blockage.isConfirmed) {
        let evidenceBase64 = frameBase64 || req.body.frameBase64 || '';
        if (!evidenceBase64) {
          try {
            const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
            const snapResp = await fetch(`${aiUrl}/camera/${cameraId}/snapshot`, {
              signal: AbortSignal.timeout(600),
            });
            if (snapResp.ok) {
              const arrayBuffer = await snapResp.arrayBuffer();
              evidenceBase64 = `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
            }
          } catch (_) {}
        }

        const incCandidate: IncidentCandidate = {
          trackId: blockage.trackId,
          employeeId: null,
          employeeName: null,
          identityStatus: 'UNAVAILABLE',
          violationType: 'emergency_route_blockage',
          severity: blockage.zone.riskLevel === 'CRITICAL' ? 'critical' : blockage.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
          confidence: blockage.confidence || 0.85,
          cameraId,
          zone: blockage.zone.name,
          zoneId: blockage.zone.zoneId,
          timestamp: new Date().toISOString(),
          boundingBox: blockage.boundingBox,
          ruleId: `RULE-EMERGENCY-${blockage.zone.zoneType}-${blockage.zone.zoneId}`,
          modelId: 'MODEL-PPE-SH17-001',
          whyFlagged: [
            blockage.whyFlagged,
            `Emergency Area Type: ${blockage.zone.zoneType.replace(/_/g, ' ')}`,
            `Configured Persistence Threshold: ${blockage.temporalThresholdSec.toFixed(1)}s (Observed: ${blockage.durationSec.toFixed(1)}s)`,
            `Object Classification: ${blockage.objectClass.toUpperCase()} (Confidence: ${(blockage.confidence * 100).toFixed(1)}%)`,
          ],
          temporalConfigUsed: {
            violation_duration_sec: blockage.durationSec,
            violation_count: blockage.temporalResult.frameCount,
            threshold_sec: blockage.temporalThresholdSec,
            objectClass: blockage.objectClass,
            zoneType: blockage.zone.zoneType,
            zoneId: blockage.zone.zoneId,
            state: 'BLOCKED',
          },
        };

        const inc = await ingestAuthoritativeCandidate(incCandidate, evidenceBase64);
        if (inc) {
          createdIncidents.push(inc);
          socketService.emit('emergency_route.blocked', {
            incidentId: inc.incidentId,
            cameraId: inc.cameraId,
            zoneId: inc.zoneId,
            zone: inc.zone,
            zoneType: blockage.zone.zoneType,
            trackId: inc.trackId,
            objectClass: blockage.objectClass,
            severity: inc.severity,
            riskScore: inc.riskScore,
            timestamp: inc.timestamp,
            evidence: {
              captured: Boolean(inc.evidence?.captured),
              sha256: inc.evidence?.sha256,
            },
          });
        }
      }
    }

    // Lone Worker / Isolation Safety Monitoring (Phase 9.3)
    const validPersonsForLoneWorker = (detections || []).filter((d: any) => {
      const cls = (d.class || d.label || '').toLowerCase();
      const tid = d.trackId ?? d.track_id ?? d.worker_tracking_id;
      return (cls === 'person' || cls === 'worker') && tid !== undefined && tid !== null;
    }).map((d: any) => ({
      trackId: String(d.trackId ?? d.track_id ?? d.worker_tracking_id),
      objectClass: 'person',
      confidence: d.confidence || 0.85,
      boundingBox: d.boundingBox || d.bbox,
      bbox: d.boundingBox || d.bbox,
    }));

    const frameTsMs = req.body.frameTimestampMs
      ? Number(req.body.frameTimestampMs)
      : timestamp
      ? new Date(timestamp).getTime()
      : Date.now();

    const loneWorkerResults = await geofenceEngine.evaluateLoneWorkerZones(
      cameraId,
      validPersonsForLoneWorker,
      frameBase64 || req.body.frameBase64,
      fw,
      fh,
      frameTsMs
    );

    for (const lwIncident of loneWorkerResults) {
      if (lwIncident.isConfirmedIncident) {
        let evidenceBase64 = lwIncident.evidenceFrameBase64 || frameBase64 || req.body.frameBase64 || '';
        if (!evidenceBase64) {
          try {
            const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
            const snapResp = await fetch(`${aiUrl}/camera/${cameraId}/snapshot`, {
              signal: AbortSignal.timeout(600),
            });
            if (snapResp.ok) {
              const arrayBuffer = await snapResp.arrayBuffer();
              evidenceBase64 = `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
            }
          } catch (_) {}
        }

        const incCandidate: IncidentCandidate = {
          trackId: lwIncident.trackId,
          employeeId: null,
          employeeName: null,
          identityStatus: 'UNAVAILABLE',
          violationType: 'worker_isolated',
          severity: lwIncident.zone.riskLevel === 'CRITICAL' ? 'critical' : lwIncident.zone.riskLevel === 'HIGH' ? 'high' : 'medium',
          confidence: lwIncident.confidence || 0.9,
          cameraId,
          zone: lwIncident.zone.name,
          zoneId: lwIncident.zone.zoneId,
          timestamp: new Date().toISOString(),
          boundingBox: lwIncident.boundingBox,
          ruleId: `RULE-LONE-WORKER-${lwIncident.zone.zoneId}`,
          modelId: 'MODEL-PPE-SH17-001',
          whyFlagged: [
            lwIncident.whyFlagged,
            `Zone: ${lwIncident.zone.name} (Type: ${lwIncident.zone.zoneType})`,
            `Worker Count: ${lwIncident.workerCount} (Required Minimum: ${lwIncident.minimumWorkers})`,
            `Isolation Duration: ${lwIncident.durationSec.toFixed(1)}s (Threshold: ${lwIncident.isolationThresholdSec}s)`,
            `Risk Level: ${lwIncident.zone.riskLevel}`,
          ],
          temporalConfigUsed: {
            violation_duration_sec: lwIncident.durationSec,
            threshold_sec: lwIncident.isolationThresholdSec,
            workerCount: lwIncident.workerCount,
            minimumWorkers: lwIncident.minimumWorkers,
            state: lwIncident.state,
            zoneType: lwIncident.zone.zoneType,
            zoneId: lwIncident.zone.zoneId,
          },
        };

        const inc = await ingestAuthoritativeCandidate(incCandidate, evidenceBase64);
        if (inc) {
          inc.incidentType = 'LONE_WORKER';
          createdIncidents.push(inc);
          socketService.emit('lone_worker.incident_created', {
            incidentId: inc.incidentId,
            cameraId: inc.cameraId,
            zoneId: inc.zoneId,
            zone: inc.zone,
            zoneType: lwIncident.zone.zoneType,
            trackId: inc.trackId,
            workerCount: lwIncident.workerCount,
            minimumWorkers: lwIncident.minimumWorkers,
            durationSec: lwIncident.durationSec,
            isolationThresholdSec: lwIncident.isolationThresholdSec,
            severity: inc.severity,
            riskScore: inc.riskScore,
            timestamp: inc.timestamp,
            evidence: {
              captured: Boolean(inc.evidence?.captured),
              sha256: inc.evidence?.sha256,
            },
          });
        }
      }
    }

    const loneWorkerLiveStates = (await geofenceEngine.getLoneWorkerStates()).states.filter(
      (s) => s.cameraId.toLowerCase() === cameraId.toLowerCase()
    );

    const breachPayload = geofenceBreaches.map((b) => ({
      zoneId: b.zone.zoneId,
      zoneName: b.zone.name,
      trackId: b.trackId,
      isAuthorized: b.isAuthorized,
      isConfirmed: Boolean(b.temporalResult?.isConfirmed || b.temporalResult?.hasBeenConfirmed),
      breachStatus: b.temporalResult?.status || (b.temporalResult?.hasBeenConfirmed ? 'CONFIRMED' : 'CANDIDATE'),
      durationMs: b.temporalResult?.persistedDurationSec ? b.temporalResult.persistedDurationSec * 1000 : 0,
    }));

    const emergencyPayload = emergencyBlockages.map((b) => ({
      zoneId: b.zone.zoneId,
      zoneName: b.zone.name,
      zoneType: b.zone.zoneType,
      trackId: b.trackId,
      objectClass: b.objectClass,
      state: b.state,
      durationSec: b.durationSec,
      isConfirmed: b.isConfirmed,
    }));

    // Broadcast detection metadata & breach state via Socket.IO for live CV overlay rendering
    socketService.emitCameraDetections(cameraId, {
      cameraId,
      timestamp: timestamp || new Date().toISOString(),
      frameWidth: fw,
      frameHeight: fh,
      detections: detections || [],
      geofenceBreaches: breachPayload,
      emergencyBlockages: emergencyPayload,
      loneWorkerStatuses: loneWorkerLiveStates,
    });

    if (geofenceBreaches.length > 0) {
      socketService.emitZoneBreach(cameraId, {
        breaches: breachPayload,
        activeCount: geofenceBreaches.length,
      });
    }

    return res.json({
      success: true,
      cameraId,
      count: detections?.length || 0,
      breachesCount: geofenceBreaches.length,
      emergencyBlockagesCount: emergencyBlockages.length,
      loneWorkerStatesCount: loneWorkerLiveStates.length,
      geofenceBreaches: breachPayload,
      emergencyBlockages: emergencyPayload,
      loneWorkerStatuses: loneWorkerLiveStates,
      incidents: createdIncidents,
      incidentsCreated: createdIncidents.length,
      incidentsCreatedCount: createdIncidents.length,
    });
  } catch (error: any) {
    console.error('[Camera Detections Route Error]', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/detection/inspection-config (Phase 12.3 Authoritative Registry & Profile Configuration)
router.get('/inspection-config', async (req: Request, res: Response) => {
  try {
    const REGISTRY_FILE = path.resolve(__dirname, '../../../ai/configs/ppe_classes_registry.json');
    const MANIFEST_FILE = path.resolve(__dirname, '../../../ai/models/baseline_class_manifest.json');

    let registryData: any = { classes: [] };
    let manifestData: any = { classManifest: [] };

    if (fs.existsSync(REGISTRY_FILE)) {
      try {
        registryData = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      } catch (e) {
        console.error('[InspectionConfig] Failed to read registry:', e);
      }
    }

    if (fs.existsSync(MANIFEST_FILE)) {
      try {
        manifestData = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
      } catch (e) {
        console.error('[InspectionConfig] Failed to read manifest:', e);
      }
    }

    // Supported classes in active baseline model
    const supportedSet = new Set<string>();
    if (Array.isArray(manifestData.classManifest)) {
      for (const entry of manifestData.classManifest) {
        if (entry.safeVisionClassId) {
          supportedSet.add(entry.safeVisionClassId);
        }
      }
    }

    // Check AI server for any active custom modules
    try {
      const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const pipeResp = await fetch(`${aiUrl}/training/models/pipeline_status`, { signal: AbortSignal.timeout(1000) });
      if (pipeResp.ok) {
        const pipeData: any = await pipeResp.json();
        if (pipeData.custom_modules && Array.isArray(pipeData.custom_modules)) {
          for (const m of pipeData.custom_modules) {
            if (m.safe_vision_class_id) {
              supportedSet.add(m.safe_vision_class_id);
            }
          }
        }
      }
    } catch (_) {}

    const enrichedClasses = (registryData.classes || []).map((c: any) => ({
      ...c,
      isModelSupported: supportedSet.has(c.id),
      statusLabel: supportedSet.has(c.id) ? 'Model Supported' : (c.status === 'NO_TRAINING_DATA' ? 'No Training Data' : 'Model Support Unavailable')
    }));

    const profilesDict: Record<string, any> = {
      CONSTRUCTION: {
        id: 'construction',
        name: 'Construction',
        description: 'Structural and civil construction sites: hard hats, high-vis vests, protective footwear',
        requiredPpe: ['helmet', 'safety-vest', 'shoes'],
        required_classes: ['SV-PPE-002', 'SV-PPE-003', 'SV-PPE-005'],
        defaultConfidence: 0.45,
      },
      MANUFACTURING: {
        id: 'manufacturing',
        name: 'Manufacturing',
        description: 'Plant floors and heavy fabrication: helmets, vests, safety footwear, industrial gloves',
        requiredPpe: ['helmet', 'safety-vest', 'gloves', 'shoes'],
        required_classes: ['SV-PPE-002', 'SV-PPE-003', 'SV-PPE-004', 'SV-PPE-005'],
        defaultConfidence: 0.45,
      },
      LABORATORY: {
        id: 'laboratory',
        name: 'Laboratory',
        description: 'Cleanroom, biosafety, chemical labs: face masks, eye protection, lab coats, nitrile gloves',
        requiredPpe: ['face-mask', 'glasses', 'gloves', 'lab-coat'],
        required_classes: ['SV-PPE-007', 'SV-PPE-006', 'SV-PPE-004', 'SV-PPE-018'],
        defaultConfidence: 0.45,
      },
      HAZARDOUS_MATERIALS: {
        id: 'hazardous_materials',
        name: 'Hazardous Materials',
        description: 'Toxic, chemical, biohazard containment: hazmat suits, respirators, eye protection, chemical boots',
        requiredPpe: ['medical-suit', 'face-mask', 'glasses', 'gloves', 'shoes'],
        required_classes: ['SV-PPE-010', 'SV-PPE-007', 'SV-PPE-006', 'SV-PPE-004', 'SV-PPE-005'],
        defaultConfidence: 0.45,
      },
      CUSTOM: {
        id: 'custom',
        name: 'Custom',
        description: 'Ad-hoc user-selected PPE requirements and custom thresholds',
        requiredPpe: [],
        required_classes: [],
        defaultConfidence: 0.45,
      },
    };

    return res.json({
      success: true,
      classes: enrichedClasses,
      profiles: profilesDict,
      profilesList: Object.values(profilesDict),
      manifest: manifestData,
      activeModel: {
        modelId: manifestData.modelId || 'MODEL-PPE-BASELINE-SH17',
        modelVersion: manifestData.modelVersion || '1.0.0-sh17',
        supportedClassesCount: supportedSet.size,
      },
    });
  } catch (error: any) {
    console.error('[Inspection Config Error]', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch inspection config' });
  }
});

// POST /api/detection/image
router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Validation error: image file is required.' });
    }
    const cameraId = req.body.cameraId || 'UPLOADED_MEDIA';

    let zone = req.body.zone;
    if (!zone) {
      const cam = store.cameras.find((c) => c.code === cameraId || c.id === cameraId);
      zone = cam?.zone || 'General Inspection';
    }

    let requiredPpe: string[] | undefined = undefined;
    if (req.body.requiredPpe) {
      if (Array.isArray(req.body.requiredPpe)) {
        requiredPpe = req.body.requiredPpe;
      } else {
        try {
          const parsed = JSON.parse(req.body.requiredPpe);
          requiredPpe = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          requiredPpe = String(req.body.requiredPpe).split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    }
    const profile = req.body.profile || 'Construction';

    const fullResult = await aiService.detectImageFull({
      imagePath: file ? file.path : undefined,
      zone,
      cameraId,
      requiredPpe,
      profile,
    });

    const detections = fullResult.detections || [];

    return res.json({
      success: fullResult.success ?? true,
      detections,
      createdIncidents: [],
      activeAdapter: aiService.getActiveAdapterInfo(),
      personAssessments: fullResult.personAssessments || [],
      person_assessments: fullResult.personAssessments || [],
      expectedRegions: fullResult.expectedRegions || [],
      expected_regions: fullResult.expectedRegions || [],
      inspectionSummary: fullResult.inspectionSummary || null,
      inspection_summary: fullResult.inspectionSummary || null,
      overallStatus: fullResult.overallStatus || 'UNKNOWN',
      overall_status: fullResult.overallStatus || 'UNKNOWN',
      inspectionProfile: fullResult.inspectionProfile || profile,
      inspection_profile: fullResult.inspectionProfile || profile,
      trackedWorkers: fullResult.trackedWorkers || [],
      totalPersonsDetected: fullResult.totalPersonsDetected || 0,
      totalViolationsDetected: fullResult.totalViolationsDetected || 0,
    });
  } catch (error: any) {
    console.error('[Detection Error]', error);
    return res.status(500).json({ error: error.message || 'Detection failed' });
  }
});

// POST /api/detection/video
router.post('/video', upload.single('video'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Validation error: video file is required.' });
    }
    const cameraId = req.body.cameraId || 'UPLOADED_MEDIA';

    let zone = req.body.zone;
    if (!zone) {
      const cam = store.cameras.find((c) => c.code === cameraId || c.id === cameraId);
      zone = cam?.zone || 'Unassigned Zone';
    }

    let requiredPpe: string[] | undefined = undefined;
    if (req.body.requiredPpe) {
      if (Array.isArray(req.body.requiredPpe)) {
        requiredPpe = req.body.requiredPpe;
      } else {
        try {
          const parsed = JSON.parse(req.body.requiredPpe);
          requiredPpe = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          requiredPpe = String(req.body.requiredPpe).split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    }
    const profile = req.body.profile || 'Construction';

    const result = await aiService.detectVideo({
      videoPath: file ? file.path : undefined,
      zone,
      cameraId,
      requiredPpe,
      profile,
    });

    const detections: any[] = Array.isArray(result) ? result : (result.detections || []);
    const videoMetrics = (result as any)?.videoMetrics || null;
    const keyframes = (result as any)?.keyframes || [];
    const incidentCandidates = (result as any)?.incidentCandidates || [];

    return res.json({
      success: true,
      detections,
      videoMetrics,
      keyframes,
      incidentCandidates,
      createdIncidents: [],
      activeAdapter: aiService.getActiveAdapterInfo(),
      personAssessments: (result as any)?.personAssessments || [],
      person_assessments: (result as any)?.personAssessments || [],
      expectedRegions: (result as any)?.expectedRegions || [],
      expected_regions: (result as any)?.expectedRegions || [],
      inspectionSummary: (result as any)?.inspectionSummary || null,
      inspection_summary: (result as any)?.inspectionSummary || null,
      overallStatus: (result as any)?.overallStatus || null,
      overall_status: (result as any)?.overallStatus || null,
      inspectionProfile: (result as any)?.inspectionProfile || profile,
      inspection_profile: (result as any)?.inspectionProfile || profile,
    });
  } catch (error: any) {
    console.error('[Video Detection Error]', error);
    return res.status(500).json({ error: error.message || 'Video detection failed' });
  }
});

// GET /api/detection/adapters
router.get('/adapters', (req: Request, res: Response) => {
  res.json(aiService.getActiveAdapterInfo());
});

// POST /api/detection/adapters/select
router.post('/adapters/select', (req: Request, res: Response) => {
  const { adapter } = req.body;
  try {
    aiService.setAdapter(adapter);
    res.json({ success: true, activeAdapter: aiService.getActiveAdapterInfo() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/detection/health - Truthful AI Service health probe
router.get('/health', async (req: Request, res: Response) => {
  const { probeAiService } = await import('./health.routes');
  const probe = await probeAiService();
  const isOnline = probe.status === 'ONLINE';
  const details = probe.details || {};
  const isModelLoaded = isOnline && (details.modelStatus === 'MODEL LOADED' || details.model_loaded === true || details.runtimeState === 'READY');

  res.json({
    connected: isOnline,
    status: isOnline ? (isModelLoaded ? 'ONLINE' : 'DEGRADED') : 'OFFLINE',
    latencyMs: probe.latencyMs,
    aiEngine: {
      model_status: isModelLoaded ? 'configured' : 'unconfigured',
      model_name: details.modelName || details.model_name || 'Industrial YOLOv8',
      ai_engine: details.ai_engine || 'Approved SafeVision SH17 YOLOv8 Neural Inference',
      device: details.device || 'cpu',
      gpu_name: details.gpu_name || null,
      classCount: details.classCount || 17,
      actualChecksum: details.actualChecksum || null,
    },
    telemetry: details,
  });
});

export default router;
