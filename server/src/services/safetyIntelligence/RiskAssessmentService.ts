import { DataStore, RiskConfigurationDoc, RiskAssessmentDoc, ZoneSafetyPolicyDoc } from '../../models/DataStore';
import { RiskConfigurationModel, RiskAssessmentModel } from '../../models/mongooseModels';
import { ZoneSafetyPolicyService } from './ZoneSafetyPolicyService';
import mongoose from 'mongoose';

export interface RiskFactorItem {
  type: string;
  item?: string;
  contribution: number;
  details?: string;
}

export interface RiskCalculationInput {
  violationType: string;
  confidence: number;
  zone: string;
  cameraId: string;
  trackId?: string;
  employeeId?: string | null;
  durationSeconds?: number;
  repeatViolationsCount?: number;
  simultaneousViolationsCount?: number;
  hazardDetected?: string;
  hazardConfidence?: number;
  inRestrictedArea?: boolean;
  zoneId?: string;
  affectedWorkersCount?: number;
}

export interface RiskCalculationOutput {
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: RiskFactorItem[];
  reproducibleInputs: Record<string, any>;
  recommendedAction: string;
}

export class RiskAssessmentService {
  private static instance: RiskAssessmentService;
  private store = DataStore.getInstance();
  private zonePolicyService = ZoneSafetyPolicyService.getInstance();

  private constructor() {}

  public static getInstance(): RiskAssessmentService {
    if (!RiskAssessmentService.instance) {
      RiskAssessmentService.instance = new RiskAssessmentService();
    }
    return RiskAssessmentService.instance;
  }

  /**
   * Retrieves active risk configuration from memory or DB.
   */
  public async getRiskConfiguration(siteId: string = 'site-rsp-1'): Promise<RiskConfigurationDoc> {
    const mem = this.store.riskConfigurations.find((c) => c.siteId === siteId);
    if (mem) return mem;

    if (mongoose.connection.readyState === 1) {
      try {
        const dbDoc = await RiskConfigurationModel.findOne({ siteId });
        if (dbDoc) {
          const doc = dbDoc.toObject() as unknown as RiskConfigurationDoc;
          this.store.riskConfigurations.push(doc);
          return doc;
        }
      } catch (_) {}
    }

    // Default configuration
    return {
      id: 'default-config',
      configId: 'CONFIG-RISK-DEFAULT',
      siteId,
      baseScores: {
        fire: 95,
        smoke: 90,
        worker_fall: 88,
        emergency_route_blockage: 85,
        emergency_exit_blockage: 90,
        restricted_zone: 65,
        missing_helmet: 55,
        missing_vest: 45,
        no_gloves: 40,
        no_safety_footwear: 40,
        unsafe_crowding: 35,
      },
      zoneMultipliers: {
        'furnace bay': 1.6,
        'zone-a': 1.6,
        'assembly & deck b': 1.0,
        'zone-b': 1.0,
        'loading dock & logistics': 1.3,
        'zone-c': 1.3,
        'warehouse & storage': 0.8,
        'zone-d': 0.8,
        'raw material hoppers': 1.4,
        'zone-e': 1.4,
        'packaging line': 0.7,
        'zone-f': 0.7,
      },
      thresholds: {
        lowMax: 29,
        moderateMax: 59,
        highMax: 79,
        criticalMin: 80,
      },
      persistenceBonus: {
        shortDurationSec: 3,
        shortBonus: 8,
        longDurationSec: 10,
        longBonus: 15,
      },
      repeatInfractionPenalty: {
        singlePenalty: 8,
        multiplePenalty: 15,
      },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM_DEFAULT',
    };
  }

  /**
   * Calculates a transparent, reproducible risk score from actual inputs and configuration.
   */
  public async calculateRisk(input: RiskCalculationInput): Promise<RiskCalculationOutput> {
    const config = await this.getRiskConfiguration();
    const zonePolicy = await this.zonePolicyService.getPolicyForZone(input.zone);

    const factors: RiskFactorItem[] = [];
    const normalizedViolation = (input.violationType || '').toLowerCase().replace(/-/g, '_');

    // 1. Base Score & Neural Confidence Contribution
    const baseScoresObj = config.baseScores instanceof Map ? Object.fromEntries(config.baseScores) : config.baseScores;
    const baseScore = baseScoresObj[normalizedViolation] ?? 40;
    const conf = Math.max(0.40, Math.min(1.0, input.confidence || 0.75));

    // Weight ppe contribution by configured policy weight
    const ppeWeightRatio = (zonePolicy.riskWeights.ppeWeight || 35) / 35;
    const ppeContribution = Math.round(baseScore * 0.45 * conf * ppeWeightRatio);
    factors.push({
      type: 'PPE_MISSING',
      item: input.violationType,
      contribution: ppeContribution,
      details: `Base weight ${baseScore} with ${(conf * 100).toFixed(1)}% AI confidence and policy weight ${zonePolicy.riskWeights.ppeWeight}`,
    });

    // 2. Zone Criticality Contribution
    const normZone = (input.zone || '').toLowerCase();
    const zoneMultsObj = config.zoneMultipliers instanceof Map ? Object.fromEntries(config.zoneMultipliers) : config.zoneMultipliers;
    let zoneMultiplier = 1.0;

    // Check dynamic MongoDB-backed restricted zones first
    if (this.store && Array.isArray(this.store.restrictedZones)) {
      const dbZone = this.store.restrictedZones.find(
        (rz) => !rz.isDeleted && rz.enabled && (
          (input.zoneId && rz.id === input.zoneId) ||
          rz.name.toLowerCase() === normZone ||
          normZone.includes(rz.name.toLowerCase())
        )
      );
      if (dbZone) {
        if (dbZone.riskLevel === 'CRITICAL' || dbZone.zoneType === 'HIGH_RISK') zoneMultiplier = 1.8;
        else if (dbZone.riskLevel === 'HIGH' || dbZone.zoneType === 'RESTRICTED') zoneMultiplier = 1.5;
        else if (dbZone.riskLevel === 'MODERATE') zoneMultiplier = 1.2;
        else if (dbZone.riskLevel === 'LOW') zoneMultiplier = 0.9;
      }
    }

    // Check dynamic MongoDB-backed emergency safety zones
    if (zoneMultiplier === 1.0 && this.store && Array.isArray(this.store.emergencyZones)) {
      const dbEmrgZone = this.store.emergencyZones.find(
        (ez) => !ez.isDeleted && ez.enabled && (
          (input.zoneId && ez.zoneId === input.zoneId) ||
          ez.name.toLowerCase() === normZone ||
          normZone.includes(ez.name.toLowerCase())
        )
      );
      if (dbEmrgZone) {
        if (dbEmrgZone.riskLevel === 'CRITICAL') zoneMultiplier = 1.8;
        else if (dbEmrgZone.riskLevel === 'HIGH') zoneMultiplier = 1.5;
        else if (dbEmrgZone.riskLevel === 'MODERATE') zoneMultiplier = 1.2;
        else if (dbEmrgZone.riskLevel === 'LOW') zoneMultiplier = 0.9;
      }
    }

    if (zoneMultiplier === 1.0) {
      for (const [zKey, mult] of Object.entries(zoneMultsObj)) {
        if (normZone.includes(zKey.toLowerCase()) || zKey.toLowerCase().includes(normZone)) {
          zoneMultiplier = mult as number;
          break;
        }
      }
    }

    const zoneWeightRatio = (zonePolicy.riskWeights.zoneWeight || 20) / 20;
    const zoneContribution = Math.round(15 * zoneMultiplier * zoneWeightRatio);
    factors.push({
      type: 'ZONE_CRITICALITY',
      item: input.zone,
      contribution: zoneContribution,
      details: `Zone danger multiplier of ${zoneMultiplier.toFixed(1)}x in '${input.zone}'`,
    });

    // 3. Persistence Duration Contribution
    let persistenceContribution = 0;
    const duration = input.durationSeconds || 0;
    if (duration >= config.persistenceBonus.longDurationSec) {
      persistenceContribution = config.persistenceBonus.longBonus;
    } else if (duration >= config.persistenceBonus.shortDurationSec) {
      persistenceContribution = config.persistenceBonus.shortBonus;
    }
    if (persistenceContribution > 0) {
      factors.push({
        type: 'PERSISTENCE',
        item: `${duration}s`,
        contribution: persistenceContribution,
        details: `Violation persisted across ${duration.toFixed(1)}s (threshold: >= ${config.persistenceBonus.shortDurationSec}s)`,
      });
    }

    // 4. Simultaneous / Multiple Violations Contribution
    const simultaneousCount = input.simultaneousViolationsCount || 0;
    if (simultaneousCount > 1) {
      const simContribution = Math.min(20, (simultaneousCount - 1) * 10);
      factors.push({
        type: 'SIMULTANEOUS_VIOLATIONS',
        item: `${simultaneousCount} violations`,
        contribution: simContribution,
        details: `${simultaneousCount} active PPE breaches detected on same worker track`,
      });
    }

    // 5. Environmental Hazard / Restricted Area Entry / Emergency Route Blockage
    if (input.inRestrictedArea) {
      const restrictedContribution = 20;
      factors.push({
        type: 'RESTRICTED_AREA_ENTRY',
        item: input.zone,
        contribution: restrictedContribution,
        details: `Worker breached restricted exclusion zone perimeter`,
      });
    }

    if (normalizedViolation === 'emergency_route_blockage' || normalizedViolation === 'emergency_exit_blockage') {
      const emergencyEgressContribution = 35;
      factors.push({
        type: 'EMERGENCY_EGRESS_HAZARD',
        item: input.zone,
        contribution: emergencyEgressContribution,
        details: `Confirmed visual obstruction of emergency egress and escape route corridor`,
      });
    }

    if (normalizedViolation === 'worker_isolated' || normalizedViolation === 'lone_worker') {
      const loneWorkerContribution = 35;
      factors.push({
        type: 'LONE_WORKER_ISOLATION',
        item: input.zone,
        contribution: loneWorkerContribution,
        details: `Worker isolated beyond safety threshold in designated lone-worker safety zone`,
      });
    }

    if (input.hazardDetected) {
      const hazardConf = input.hazardConfidence || 0.8;
      const hazardContribution = Math.round(25 * hazardConf);
      factors.push({
        type: 'HAZARD_PROXIMITY',
        item: input.hazardDetected,
        contribution: hazardContribution,
        details: `Active environmental hazard '${input.hazardDetected}' detected within zone`,
      });
    }

    // 6. Recidivism / Repeat Infraction Contribution
    const repeatCount = input.repeatViolationsCount || 0;
    if (repeatCount > 0) {
      const penalty = repeatCount >= 2 ? config.repeatInfractionPenalty.multiplePenalty : config.repeatInfractionPenalty.singlePenalty;
      factors.push({
        type: 'REPEAT_INFRACTION',
        item: `${repeatCount} prior violations`,
        contribution: penalty,
        details: `Recidivism adjustment: Worker has ${repeatCount} previous breaches on record`,
      });
    }

    // Sum all factors and clamp between 0 and 100
    const totalScore = factors.reduce((acc, f) => acc + f.contribution, 0);
    const clampedScore = Math.min(100, Math.max(5, totalScore));

    // Determine Risk Level from configurable thresholds
    let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    if (clampedScore >= config.thresholds.criticalMin) {
      riskLevel = 'CRITICAL';
    } else if (clampedScore > config.thresholds.moderateMax) {
      riskLevel = 'HIGH';
    } else if (clampedScore > config.thresholds.lowMax) {
      riskLevel = 'MODERATE';
    } else {
      riskLevel = 'LOW';
    }

    const recommendedAction = this.getRecommendedAction(normalizedViolation, riskLevel, input.zone);

    const result: RiskCalculationOutput = {
      riskScore: clampedScore,
      riskLevel,
      factors,
      reproducibleInputs: {
        violationType: input.violationType,
        confidence: input.confidence,
        zone: input.zone,
        cameraId: input.cameraId,
        durationSeconds: input.durationSeconds,
        repeatViolationsCount: input.repeatViolationsCount,
        simultaneousViolationsCount: input.simultaneousViolationsCount,
        inRestrictedArea: input.inRestrictedArea,
        hazardDetected: input.hazardDetected,
        configVersion: config.version,
      },
      recommendedAction,
    };

    return result;
  }

  /**
   * Action recommendation grounded in violation and severity.
   */
  private getRecommendedAction(
    violationType: string,
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL',
    zone: string
  ): string {
    if (riskLevel === 'CRITICAL') {
      return `IMMEDIATE ACTION REQUIRED: Dispatch area safety steward to ${zone}. Handoff required safety gear immediately.`;
    }
    if (violationType === 'worker_isolated' || violationType === 'lone_worker') {
      return `Dispatch secondary safety partner to ${zone}. Complete lone-worker safety check-in immediately.`;
    }
    if (violationType === 'missing_helmet') {
      return `Supply certified industrial helmet before worker proceeds in active crane bay in ${zone}.`;
    }
    if (violationType === 'missing_vest') {
      return `Issue high-visibility vest to worker in ${zone} to maintain mandated visual stand-off distance.`;
    }
    if (violationType === 'no_gloves') {
      return `Ensure cut/thermal-resistant gloves are equipped before handling materials in ${zone}.`;
    }
    if (violationType === 'no_safety_footwear') {
      return `Direct worker to change into steel-toe puncture-resistant boots for ${zone}.`;
    }
    return `Review PPE compliance with worker at next shift check-in for ${zone}.`;
  }

  /**
   * Updates risk configuration and increments version.
   */
  public async updateRiskConfiguration(
    updates: Partial<RiskConfigurationDoc>,
    actor: string = 'SAFETY_OFFICER'
  ): Promise<RiskConfigurationDoc> {
    const current = await this.getRiskConfiguration(updates.siteId || 'site-rsp-1');
    const updated: RiskConfigurationDoc = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };

    const idx = this.store.riskConfigurations.findIndex((c) => c.siteId === updated.siteId);
    if (idx >= 0) {
      this.store.riskConfigurations[idx] = updated;
    } else {
      this.store.riskConfigurations.push(updated);
    }

    if (mongoose.connection.readyState === 1) {
      try {
        await RiskConfigurationModel.findOneAndUpdate(
          { siteId: updated.siteId },
          { $set: updated },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn('[RiskAssessmentService] Failed to persist risk config to MongoDB:', err);
      }
    }

    return updated;
  }
}
