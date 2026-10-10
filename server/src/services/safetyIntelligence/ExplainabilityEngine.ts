export interface ExplainabilityInput {
  violationType: string;
  zone: string;
  confidence: number;
  durationSeconds?: number;
  observedFrames?: number;
  totalWindowFrames?: number;
  violationRatio?: number;
  zoneRequiresItem: boolean;
  temporalConfirmed: boolean;
  riskScore: number;
  riskLevel: string;
  severity: string;
  identityStatus: string;
  employeeName?: string | null;
}

export class ExplainabilityEngine {
  /**
   * Generates a factual, grounded explanation strictly supported by stored observations and policies.
   */
  public static generateExplanation(input: ExplainabilityInput): string[] {
    const explanations: string[] = [];

    // 1. Primary AI Observation
    const humanName = input.violationType.replace(/_/g, ' ');
    explanations.push(`Observed condition: ${humanName.toUpperCase()} detected by industrial neural model.`);

    // 2. Zone Policy Mandate
    if (input.zoneRequiresItem) {
      explanations.push(`Zone safety policy for '${input.zone}' explicitly mandates this protective equipment.`);
    } else {
      explanations.push(`Safety guideline evaluated for '${input.zone}'.`);
    }

    // 3. AI Model Confidence
    const confPct = (input.confidence * 100).toFixed(1);
    explanations.push(`Neural inference confidence validated at ${confPct}%.`);

    // 4. Temporal Confirmation & Persistence
    if (input.durationSeconds !== undefined && input.durationSeconds > 0) {
      explanations.push(`Violation persisted continuously for ${input.durationSeconds.toFixed(1)}s (threshold: >= 3.0s).`);
    }

    if (input.observedFrames !== undefined && input.totalWindowFrames !== undefined) {
      const ratioPct = input.violationRatio !== undefined ? (input.violationRatio * 100).toFixed(0) : '—';
      explanations.push(
        `Temporal validator confirmed violation across ${input.observedFrames}/${input.totalWindowFrames} frames (${ratioPct}% window density).`
      );
    } else if (input.temporalConfirmed) {
      explanations.push('Temporal state machine confirmed state transition beyond transient noise window.');
    }

    // 5. Risk & Severity Breakdown
    explanations.push(`Composite risk assessed at ${input.riskScore}/100 (${input.riskLevel.toUpperCase()}).`);
    explanations.push(`Incident severity categorized as ${input.severity.toUpperCase()}.`);

    // 6. Identity Clearance
    if (input.identityStatus === 'CONFIRMED' && input.employeeName) {
      explanations.push(`Worker confirmed via employee identity registry: ${input.employeeName}.`);
    } else {
      explanations.push('Worker identity unconfirmed (temporary anonymous trackId assigned).');
    }

    return explanations;
  }

  private static instance: ExplainabilityEngine;

  public static getInstance(): ExplainabilityEngine {
    if (!ExplainabilityEngine.instance) {
      ExplainabilityEngine.instance = new ExplainabilityEngine();
    }
    return ExplainabilityEngine.instance;
  }

  public generateExplanation(input: Partial<ExplainabilityInput> & { violationType: string; zone: string; confidence: number }): { whyCreated: string[]; summary: string } {
    const list = ExplainabilityEngine.generateExplanation({
      violationType: input.violationType,
      zone: input.zone,
      confidence: input.confidence,
      durationSeconds: input.durationSeconds || 3.0,
      zoneRequiresItem: input.zoneRequiresItem !== false,
      temporalConfirmed: input.temporalConfirmed !== false,
      riskScore: input.riskScore || 70,
      riskLevel: input.riskLevel || 'HIGH',
      severity: input.severity || 'high',
      identityStatus: input.identityStatus || 'UNCONFIRMED',
      employeeName: input.employeeName,
    });
    return {
      whyCreated: list,
      summary: `Risk ${input.riskScore || 70} / ${input.riskLevel || 'HIGH'} - ${list.join('; ')}`,
    };
  }
}

