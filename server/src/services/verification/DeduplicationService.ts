export interface DeduplicationCheck {
  shouldCreateIncident: boolean;
  existingIncidentId?: string;
  cooldownRemainingSec: number;
}

interface IncidentCacheEntry {
  incidentId: string;
  timestampMs: number;
  severity: string;
  trackId: string;
  employeeId?: string | null;
  ruleId: string;
  violationType: string;
  cameraId: string;
}

export class DeduplicationService {
  private static instance: DeduplicationService;
  private recentIncidents: Map<string, IncidentCacheEntry> = new Map();

  // Cooldown window in seconds before generating a new incident for the same subject, camera, & violation
  private readonly COOLDOWN_SECONDS = 60;

  private constructor() {
    // Garbage collection every 30 seconds
    setInterval(() => this.cleanup(), 30000);
  }

  public static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  /**
   * Generates a stable deduplication key incorporating trackId, employeeId (if confirmed),
   * cameraId, ruleId, and violationType.
   */
  public getKey(params: {
    trackId: string;
    employeeId?: string | null;
    cameraId: string;
    ruleId: string;
    violationType: string;
    zone?: string;
  }): string {
    const workerIdentityKey = params.employeeId ? `emp:${params.employeeId}` : `track:${params.trackId}`;
    return `${params.cameraId}:${params.zone || 'default'}:${workerIdentityKey}:${params.ruleId}:${params.violationType}`.toLowerCase();
  }

  public checkDuplicate(params: {
    trackId: string;
    employeeId?: string | null;
    cameraId: string;
    ruleId: string;
    violationType: string;
    zone?: string;
    severity?: string;
  }): DeduplicationCheck {
    const key = this.getKey(params);
    const now = Date.now();
    const entry = this.recentIncidents.get(key);

    if (!entry) {
      return {
        shouldCreateIncident: true,
        cooldownRemainingSec: 0,
      };
    }

    const elapsedSec = (now - entry.timestampMs) / 1000;
    const cooldownRemaining = Math.max(0, Math.ceil(this.COOLDOWN_SECONDS - elapsedSec));

    // If cooldown has passed, allow new incident
    if (elapsedSec >= this.COOLDOWN_SECONDS) {
      return {
        shouldCreateIncident: true,
        cooldownRemainingSec: 0,
      };
    }

    // If emergency escalated to critical, allow immediate break-through of cooldown
    if (params.severity === 'critical' && entry.severity !== 'critical') {
      return {
        shouldCreateIncident: true,
        cooldownRemainingSec: 0,
      };
    }

    return {
      shouldCreateIncident: false,
      existingIncidentId: entry.incidentId,
      cooldownRemainingSec: cooldownRemaining,
    };
  }

  public recordDispatched(params: {
    trackId: string;
    employeeId?: string | null;
    cameraId: string;
    ruleId: string;
    violationType: string;
    zone?: string;
    incidentId: string;
    severity?: string;
  }): void {
    const key = this.getKey(params);
    this.recentIncidents.set(key, {
      incidentId: params.incidentId,
      timestampMs: Date.now(),
      severity: params.severity || 'high',
      trackId: params.trackId,
      employeeId: params.employeeId,
      ruleId: params.ruleId,
      violationType: params.violationType,
      cameraId: params.cameraId,
    });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.recentIncidents.entries()) {
      if (now - entry.timestampMs > this.COOLDOWN_SECONDS * 1000) {
        this.recentIncidents.delete(key);
      }
    }
  }
}
