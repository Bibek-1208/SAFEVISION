import { DataStore, NearMissDoc } from '../../models/DataStore';
import { NearMissModel } from '../../models/mongooseModels';
import { SocketService } from '../socket/SocketService';
import mongoose from 'mongoose';

export interface NearMissEvaluationInput {
  siteId: string;
  zoneId: string;
  cameraId: string;
  trackId: string;
  employeeId?: string | null;
  identityStatus?: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  violationType?: string;
  inRestrictedArea?: boolean;
  hazardDetected?: string;
  persistenceSeconds?: number;
  riskScore: number;
  confidence: number;
  modelId?: string;
  evidence?: string;
  incidentId?: string | null;
  hazardReportId?: string | null;
}

export class NearMissEngine {
  private static instance: NearMissEngine;
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();

  private constructor() {}

  public static getInstance(): NearMissEngine {
    if (!NearMissEngine.instance) {
      NearMissEngine.instance = new NearMissEngine();
    }
    return NearMissEngine.instance;
  }

  /**
   * Evaluates whether an observed set of conditions constitutes a database-driven Near-Miss.
   * Enforces that unknown identity remains employeeId = null, identityStatus = UNCONFIRMED.
   */
  public async evaluate(input: NearMissEvaluationInput): Promise<NearMissDoc | null> {
    const triggerConditions: string[] = [];
    let ruleId = '';

    const persistence = input.persistenceSeconds || 0;
    const hasPPEViolation = Boolean(input.violationType && input.violationType !== 'none');
    const hasRestrictedArea = Boolean(input.inRestrictedArea);
    const hasHazard = Boolean(input.hazardDetected);

    // Rule 1: Worker + PPE violation + Restricted Zone + Hazard present + Temporal persistence (>= 3s)
    if (hasPPEViolation && hasRestrictedArea && hasHazard && persistence >= 3.0) {
      ruleId = 'RULE-NM-TRIPLE-COMPOUND';
      triggerConditions.push(`Worker track ${input.trackId} observed without mandatory PPE (${input.violationType})`);
      triggerConditions.push(`Worker breached active restricted equipment perimeter in zone ${input.zoneId}`);
      triggerConditions.push(`Environmental hazard present: ${input.hazardDetected}`);
      triggerConditions.push(`Hazardous intersection persisted for ${persistence.toFixed(1)}s (>= 3.0s threshold)`);
    }
    // Rule 2: Worker in restricted area + hazard detected nearby + condition persists (>= 3s)
    else if (hasRestrictedArea && hasHazard && persistence >= 3.0) {
      ruleId = 'RULE-NM-RESTRICTED-HAZARD';
      triggerConditions.push(`Worker track ${input.trackId} entered restricted zone perimeter`);
      triggerConditions.push(`Active facility hazard detected nearby: ${input.hazardDetected}`);
      triggerConditions.push(`Proximity persisted for ${persistence.toFixed(1)}s`);
    }
    // Rule 3: Severe PPE violation in critical zone with prolonged persistence (>= 8s)
    else if (hasPPEViolation && persistence >= 8.0 && input.riskScore >= 75) {
      ruleId = 'RULE-NM-PERSISTENT-HIGH-RISK';
      triggerConditions.push(`Unmitigated safety breach (${input.violationType}) persisted unaddressed for ${persistence.toFixed(1)}s`);
      triggerConditions.push(`Composite risk score exceeded elevated danger threshold (${input.riskScore}/100)`);
    }

    if (triggerConditions.length === 0) {
      return null;
    }

    // Determine near-miss severity
    const severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      input.riskScore >= 80 ? 'CRITICAL' : input.riskScore >= 60 ? 'HIGH' : 'MEDIUM';

    const nmId = `NM-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
    const nearMissDoc: NearMissDoc = {
      id: `nm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nearMissId: nmId,
      siteId: input.siteId || 'site-rsp-1',
      zoneId: input.zoneId,
      cameraId: input.cameraId,
      trackId: input.trackId,
      employeeId: input.identityStatus === 'CONFIRMED' ? (input.employeeId || null) : null,
      identityStatus: input.identityStatus === 'CONFIRMED' ? 'CONFIRMED' : 'UNCONFIRMED',
      ruleId,
      triggerConditions,
      riskScore: input.riskScore,
      severity,
      timestamp: new Date().toISOString(),
      evidence: input.evidence || '',
      modelId: input.modelId || 'MODEL-PPE-SH17-001',
      resolved: false,
      incidentId: input.incidentId || null,
      hazardReportId: input.hazardReportId || null,
    };

    // Store in memory
    this.store.nearMisses.unshift(nearMissDoc);

    // Persist to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await NearMissModel.create({
          nearMissId: nearMissDoc.nearMissId,
          siteId: nearMissDoc.siteId,
          zoneId: nearMissDoc.zoneId,
          cameraId: nearMissDoc.cameraId,
          trackId: nearMissDoc.trackId,
          employeeId: nearMissDoc.employeeId,
          identityStatus: nearMissDoc.identityStatus,
          ruleId: nearMissDoc.ruleId,
          triggerConditions: nearMissDoc.triggerConditions,
          riskScore: nearMissDoc.riskScore,
          severity: nearMissDoc.severity,
          timestamp: new Date(nearMissDoc.timestamp),
          evidence: nearMissDoc.evidence,
          modelId: nearMissDoc.modelId,
          resolved: nearMissDoc.resolved,
          incidentId: nearMissDoc.incidentId,
          hazardReportId: nearMissDoc.hazardReportId,
        });
      } catch (err) {
        console.warn('[NearMissEngine] MongoDB persistence error:', err);
      }
    }

    // Broadcast realtime event
    this.socketService.emitRealtimeEvent(
      'near_miss.created',
      { nearMiss: nearMissDoc },
      {
        entityType: 'near_miss',
        entityId: nearMissDoc.nearMissId,
        siteId: nearMissDoc.siteId,
        zoneId: nearMissDoc.zoneId,
      }
    );

    return nearMissDoc;
  }

  /**
   * Retrieves near-miss records, optionally filtered by site, zone, or severity.
   */
  public async getNearMisses(filters?: { zoneId?: string; severity?: string; limit?: number }): Promise<NearMissDoc[]> {
    let results = [...this.store.nearMisses];

    if (filters?.zoneId && filters.zoneId !== 'All Zones') {
      results = results.filter((nm) => nm.zoneId.toLowerCase() === filters.zoneId!.toLowerCase());
    }
    if (filters?.severity && filters.severity !== 'All Severity') {
      results = results.filter((nm) => nm.severity.toLowerCase() === filters.severity!.toLowerCase());
    }

    const limit = filters?.limit || 50;
    return results.slice(0, limit);
  }

  /**
   * Evaluates compound near-miss conditions and returns an indicator object.
   */
  public async evaluateNearMiss(input: {
    siteId: string;
    zoneId: string;
    cameraId: string;
    trackId: string;
    employeeId?: string | null;
    identityStatus?: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
    hasPPEViolation?: boolean;
    violationType?: string;
    inRestrictedArea?: boolean;
    hazardPresent?: boolean;
    hazardType?: string;
    persistenceDurationSeconds?: number;
    riskScore?: number;
    confidence?: number;
  }): Promise<{ isNearMiss: boolean; nearMissDoc: NearMissDoc | null }> {
    const doc = await this.evaluate({
      siteId: input.siteId,
      zoneId: input.zoneId,
      cameraId: input.cameraId,
      trackId: input.trackId,
      employeeId: input.employeeId,
      identityStatus: input.identityStatus,
      violationType: input.violationType || (input.hasPPEViolation ? 'missing_helmet' : undefined),
      inRestrictedArea: input.inRestrictedArea,
      hazardDetected: input.hazardType || (input.hazardPresent ? 'general_hazard' : undefined),
      persistenceSeconds: input.persistenceDurationSeconds,
      riskScore: input.riskScore || 75,
      confidence: input.confidence || 0.9,
    });
    return {
      isNearMiss: doc !== null,
      nearMissDoc: doc,
    };
  }
}

