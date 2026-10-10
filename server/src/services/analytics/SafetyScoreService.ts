import { DataStore, IncidentDoc } from '../../models/DataStore';

export interface SafetyScoreReport {
  score: number | null;
  status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL' | 'NO_DATA';
  message: string;
  totalIncidents: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  ppeComplianceRate: number | null;
  auditedPeriod: string;
}

export class SafetyScoreService {
  private static instance: SafetyScoreService;
  private store = DataStore.getInstance();

  public static getInstance(): SafetyScoreService {
    if (!SafetyScoreService.instance) {
      SafetyScoreService.instance = new SafetyScoreService();
    }
    return SafetyScoreService.instance;
  }

  public calculateScore(timeRange: 'today' | 'week' | 'month' | 'all' = 'today'): SafetyScoreReport {
    const incidents = this.store.incidents;

    if (!incidents || incidents.length === 0) {
      return {
        score: null,
        status: 'NO_DATA',
        message: 'No data available. Connect live camera or run video inference to collect compliance data.',
        totalIncidents: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        ppeComplianceRate: null,
        auditedPeriod: timeRange,
      };
    }

    const now = Date.now();
    const periodCutoffs: Record<string, number> = {
      today: now - 24 * 3600 * 1000,
      week: now - 7 * 24 * 3600 * 1000,
      month: now - 30 * 24 * 3600 * 1000,
      all: 0,
    };

    const cutoff = periodCutoffs[timeRange] || 0;
    const filtered = incidents.filter(i => {
      const ts = new Date(i.timestamp).getTime();
      return ts >= cutoff;
    });

    if (filtered.length === 0) {
      return {
        score: null,
        status: 'NO_DATA',
        message: `No incidents recorded for time range: ${timeRange}.`,
        totalIncidents: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        ppeComplianceRate: null,
        auditedPeriod: timeRange,
      };
    }

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let ppeViolations = 0;

    for (const inc of filtered) {
      if (inc.severity === 'critical') criticalCount++;
      else if (inc.severity === 'high') highCount++;
      else if (inc.severity === 'medium') mediumCount++;

      if (['no_helmet', 'no_safety_vest', 'no_gloves', 'no_safety_shoes', 'missing_vest', 'missing_helmet'].includes(inc.violationType)) {
        ppeViolations++;
      }
    }

    // Deduction model based on severity
    const penalty = (criticalCount * 15) + (highCount * 5) + (mediumCount * 2);
    const computedScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

    let status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL' = 'OPTIMAL';
    if (computedScore < 60 || criticalCount > 0) status = 'CRITICAL';
    else if (computedScore < 85) status = 'MODERATE';

    // Denominator for true PPE compliance is unavailable in historical incidents:
    // Report null truthfully to avoid manufacturing a fake percentage
    const ppeComplianceRate: number | null = null;

    return {
      score: computedScore,
      status,
      message: `${filtered.length} active events evaluated across facility cameras.`,
      totalIncidents: filtered.length,
      criticalCount,
      highCount,
      mediumCount,
      ppeComplianceRate,
      auditedPeriod: timeRange,
    };
  }
}
