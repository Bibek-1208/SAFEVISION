export interface RiskEvaluationInput {
  violationType:
    | 'missing_vest'
    | 'missing_helmet'
    | 'no_gloves'
    | 'no_safety_footwear'
    | 'restricted_zone'
    | 'smoke'
    | 'fire'
    | 'worker_fall'
    | 'unsafe_crowding';
  confidence: number;
  zone: string;
  zoneDangerLevel?: 'critical' | 'high' | 'medium' | 'low';
  durationSeconds?: number;
  repeatViolationsCount?: number;
}

export interface RiskEvaluationResult {
  riskScore: number; // 0 - 100
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendedAction: string;
  explainabilityFactors: string[];
}

export class RiskEngine {
  // Base scores for violations (0 - 100)
  private static readonly BASE_SCORES: Record<string, number> = {
    fire: 95,
    smoke: 90,
    worker_fall: 88,
    restricted_zone: 65,
    missing_vest: 45,
    missing_helmet: 55,
    no_gloves: 40,
    no_safety_footwear: 40,
    unsafe_crowding: 35,
  };

  // Dynamic Danger multipliers by zone danger level
  private static readonly DANGER_LEVEL_MULTIPLIERS: Record<string, number> = {
    critical: 1.6,
    high: 1.3,
    medium: 1.0,
    low: 0.8,
  };

  public static evaluate(input: RiskEvaluationInput): RiskEvaluationResult {
    const baseScore = this.BASE_SCORES[input.violationType] || 40;
    const normalizedZone = (input.zone || '').toLowerCase();
    
    // Resolve dynamic zone multiplier from zoneDangerLevel or normalized zone name
    let zoneMultiplier = 1.0;
    if (input.zoneDangerLevel && this.DANGER_LEVEL_MULTIPLIERS[input.zoneDangerLevel]) {
      zoneMultiplier = this.DANGER_LEVEL_MULTIPLIERS[input.zoneDangerLevel];
    } else if (normalizedZone.includes('furnace') || normalizedZone.includes('critical')) {
      zoneMultiplier = 1.6;
    } else if (normalizedZone.includes('raw material') || normalizedZone.includes('loading')) {
      zoneMultiplier = 1.3;
    } else if (normalizedZone.includes('warehouse')) {
      zoneMultiplier = 0.8;
    } else if (normalizedZone.includes('packaging')) {
      zoneMultiplier = 0.7;
    }

    // AI Confidence weighting (confidence between 0.0 - 1.0)
    const confidenceWeight = Math.max(0.6, input.confidence || 0.85);

    // Duration escalation (e.g. lingering in restricted zone)
    const duration = input.durationSeconds || 0;
    const durationBonus = duration > 10 ? 15 : duration > 3 ? 8 : 0;

    // Repeat violation history multiplier
    const repeatCount = input.repeatViolationsCount || 0;
    const repeatPenalty = repeatCount >= 2 ? 15 : repeatCount === 1 ? 8 : 0;

    // Calculate raw composite risk score
    let calculated = Math.round(baseScore * zoneMultiplier * confidenceWeight + durationBonus + repeatPenalty);

    // Hard rules for critical emergencies
    const isCriticalArea = input.zoneDangerLevel === 'critical' || normalizedZone.includes('furnace') || normalizedZone.includes('critical');
    if (input.violationType === 'fire' || input.violationType === 'smoke' || input.violationType === 'worker_fall') {
      calculated = Math.max(calculated, 90);
    } else if (input.violationType === 'restricted_zone' && isCriticalArea) {
      calculated = Math.max(calculated, 85);
    } else if (input.violationType === 'missing_helmet' && isCriticalArea) {
      calculated = Math.max(calculated, 78);
    }

    // Clamp between 0 and 100
    const riskScore = Math.min(100, Math.max(10, calculated));

    // Determine severity bucket
    let severity: 'critical' | 'high' | 'medium' | 'low';
    if (riskScore >= 80) {
      severity = 'critical';
    } else if (riskScore >= 65) {
      severity = 'high';
    } else if (riskScore >= 45) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    // Determine recommended action
    const recommendedAction = this.getRecommendedAction(input.violationType, severity, input.zone);

    // Generate explainability factors
    const explainabilityFactors: string[] = [
      `Base violation weight for '${input.violationType.replace('_', ' ')}' set to ${baseScore}/100.`,
      `Zone danger coefficient of ${zoneMultiplier.toFixed(1)}x applied for '${input.zone}'.`,
      `Neural inference confidence validated at ${(input.confidence * 100).toFixed(1)}%.`,
    ];

    if (durationBonus > 0) {
      explainabilityFactors.push(`Dwell escalation: Worker remained in hazard perimeter for ${duration}s.`);
    }
    if (repeatPenalty > 0) {
      explainabilityFactors.push(`Recidivism penalty: Worker has ${repeatCount} prior infractions on current shift.`);
    }

    return {
      riskScore,
      severity,
      recommendedAction,
      explainabilityFactors,
    };
  }

  private static getRecommendedAction(
    violationType: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    zone: string
  ): string {
    switch (violationType) {
      case 'fire':
      case 'smoke':
        return 'CRITICAL EVACUATION: Trigger plant sirens, trip automatic deluge valves, and alert fire marshals.';
      case 'worker_fall':
        return 'MEDICAL EMERGENCY: Dispatch emergency medical team to coordinates and halt overhead machinery.';
      case 'restricted_zone':
        return severity === 'critical'
          ? 'IMMEDIATE HALT: Sound localized bay acoustic horn and dispatch steward to escort worker out.'
          : 'Issue warning over bay PA and log perimeter breach entry time.';
      case 'missing_vest':
        return 'Dispatch safety steward with hi-visibility vest and enforce crane corridor standoff.';
      case 'missing_helmet':
        return `Supply certified hard hat before worker enters active overhead crane radius in ${zone}.`;
      case 'no_gloves':
        return 'Halt hot metal tool handling and provide aluminized thermal gloves.';
      case 'no_safety_footwear':
        return 'Restrict worker from heavy cargo staging area until steel-toe footwear is verified.';
      case 'unsafe_crowding':
        return 'Disperse personnel to maintain mandated 3-meter safety radius during material transit.';
      default:
        return 'Safety steward to perform routine inspection and document in daily log.';
    }
  }
}
