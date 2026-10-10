export interface SeverityEvaluationInput {
  riskScore: number;
  violationType: string;
  zone: string;
  zoneDangerLevel?: 'critical' | 'high' | 'medium' | 'low';
  persistenceSeconds?: number;
  hazardType?: string;
  inRestrictedArea?: boolean;
  affectedWorkersCount?: number;
  repeatViolationsCount?: number;
}

export interface SeverityEvaluationOutput {
  severity: 'critical' | 'high' | 'medium' | 'low';
  severityReason: string;
  severityFactors: Array<{ factor: string; weight: number }>;
}

export class SeverityEngine {
  /**
   * Deterministically calculates traceable incident severity from multi-factor context.
   */
  public static evaluate(input: SeverityEvaluationInput): SeverityEvaluationOutput {
    const factors: Array<{ factor: string; weight: number }> = [];
    const normalizedViolation = (input.violationType || '').toLowerCase();
    const normalizedZone = (input.zone || '').toLowerCase();

    // 1. Direct Emergency Hazards (Fire / Smoke / Fall / Heavy Machinery)
    if (normalizedViolation === 'fire' || input.hazardType === 'fire') {
      factors.push({ factor: 'Active fire combustion detected in facility', weight: 100 });
      return {
        severity: 'critical',
        severityReason: 'Immediate life-safety hazard: Confirmed fire combustion detected.',
        severityFactors: factors,
      };
    }

    if (normalizedViolation === 'worker_fall' || input.hazardType === 'worker_fall') {
      factors.push({ factor: 'Worker sudden collapse or fall detected', weight: 95 });
      return {
        severity: 'critical',
        severityReason: 'Medical emergency: Sudden worker fall/collapse detected on floor.',
        severityFactors: factors,
      };
    }

    if (normalizedViolation === 'smoke' || input.hazardType === 'smoke') {
      factors.push({ factor: 'Dense smoke / thermal plume detected', weight: 90 });
      return {
        severity: 'critical',
        severityReason: 'Atmospheric hazard: Dense smoke / toxic combustion plume detected.',
        severityFactors: factors,
      };
    }

    if (normalizedViolation === 'emergency_route_blockage' || normalizedViolation === 'emergency_exit_blockage') {
      const isCritical = input.zoneDangerLevel === 'critical' || input.riskScore >= 75 || normalizedViolation === 'emergency_exit_blockage';
      factors.push({ factor: `Emergency egress pathway visual obstruction confirmed (${input.zone})`, weight: isCritical ? 90 : 75 });
      return {
        severity: isCritical ? 'critical' : 'high',
        severityReason: `Emergency egress route obstruction detected in '${input.zone}'. Immediate path clearance required.`,
        severityFactors: factors,
      };
    }

    // 2. Risk Score Base Contribution
    factors.push({ factor: `Calculated multi-factor risk score of ${input.riskScore}/100`, weight: input.riskScore });

    // 3. Zone Criticality & Restricted Areas
    const isCriticalZone =
      input.zoneDangerLevel === 'critical' ||
      normalizedZone.includes('furnace') ||
      normalizedZone.includes('caster');

    if (isCriticalZone) {
      factors.push({ factor: `Critical thermal/molten operation area (${input.zone})`, weight: 25 });
    }

    if (input.inRestrictedArea) {
      factors.push({ factor: 'Restricted equipment standoff zone breach', weight: 30 });
    }

    // 4. Persistence Contribution
    const persistence = input.persistenceSeconds || 0;
    if (persistence >= 10.0) {
      factors.push({ factor: `Prolonged unmitigated breach duration (${persistence.toFixed(1)}s)`, weight: 20 });
    } else if (persistence >= 3.0) {
      factors.push({ factor: `Temporally confirmed breach duration (${persistence.toFixed(1)}s)`, weight: 10 });
    }

    // 5. Worker Crowd / Affected Workers
    const affectedCount = input.affectedWorkersCount || 1;
    if (affectedCount > 1) {
      factors.push({ factor: `Multiple personnel (${affectedCount} workers) exposed to hazard`, weight: 15 });
    }

    // 6. Violation Specific Weights
    let violationWeight = 10;
    if (normalizedViolation === 'missing_helmet') {
      violationWeight = isCriticalZone ? 30 : 20;
      factors.push({ factor: `Missing statutory head protection in ${input.zone}`, weight: violationWeight });
    } else if (normalizedViolation === 'missing_vest') {
      violationWeight = isCriticalZone ? 35 : 20;
      factors.push({ factor: `Missing high-visibility vest in crane corridor`, weight: violationWeight });
    } else if (normalizedViolation === 'no_gloves') {
      violationWeight = isCriticalZone ? 20 : 10;
      factors.push({ factor: `Missing hand protection during material handling`, weight: violationWeight });
    } else if (normalizedViolation === 'no_safety_footwear') {
      violationWeight = 15;
      factors.push({ factor: `Missing certified steel-toe footwear on shop floor`, weight: violationWeight });
    }

    // Determine aggregate severity level
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let severityReason = '';

    if (input.riskScore >= 80 || (isCriticalZone && (normalizedViolation === 'missing_vest' || input.inRestrictedArea))) {
      severity = 'critical';
      severityReason = `Critical severity assigned due to high risk score (${input.riskScore}) in high-consequence zone '${input.zone}'.`;
    } else if (input.riskScore >= 60 || (isCriticalZone && normalizedViolation === 'missing_helmet') || persistence >= 10) {
      severity = 'high';
      severityReason = `High severity assigned: persistent breach in operational area '${input.zone}'.`;
    } else if (input.riskScore >= 35) {
      severity = 'medium';
      severityReason = `Medium severity assigned: standard PPE violation in monitored sector.`;
    } else {
      severity = 'low';
      severityReason = `Low severity: localized compliance advisory.`;
    }

    return {
      severity,
      severityReason,
      severityFactors: factors,
    };
  }

  private static instance: SeverityEngine;

  public static getInstance(): SeverityEngine {
    if (!SeverityEngine.instance) {
      SeverityEngine.instance = new SeverityEngine();
    }
    return SeverityEngine.instance;
  }

  public calculateSeverity(input: SeverityEvaluationInput): SeverityEvaluationOutput {
    return SeverityEngine.evaluate(input);
  }
}

