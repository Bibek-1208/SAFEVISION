export interface ViolationCandidate {
  trackingId: string;
  violationClass: string;
  zone: string;
  cameraId: string;
  confidence: number;
  boundingBox: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    label?: string;
    color?: string;
  };
  evidenceFrameBase64?: string;
  timestampMs?: number;
  thresholdMs?: number;
}

export interface VerificationResult {
  isConfirmed: boolean;
  hasBeenConfirmed?: boolean;
  status?: 'CANDIDATE' | 'CONFIRMED';
  persistedDurationSec: number;
  firstSeenTimestamp: string;
  frameCount: number;
  candidate: ViolationCandidate;
}

interface BufferEntry {
  candidate: ViolationCandidate;
  firstSeenMs: number;
  lastSeenMs: number;
  frameCount: number;
  confirmedFired: boolean;
}

export class TemporalVerificationService {
  private static instance: TemporalVerificationService;
  private buffer: Map<string, BufferEntry> = new Map();

  // Thresholds in milliseconds
  private readonly DEFAULT_PPE_THRESHOLD_MS = 3000; // 3.0 seconds for PPE
  private readonly EMERGENCY_THRESHOLD_MS = 1000;   // 1.0 second for fire, smoke, fall
  private readonly STALE_EXPIRY_MS = 10000;         // Clean up entries older than 10s

  private constructor() {
    // Periodic garbage collector
    setInterval(() => this.cleanupStale(), 5000);
  }

  public static getInstance(): TemporalVerificationService {
    if (!TemporalVerificationService.instance) {
      TemporalVerificationService.instance = new TemporalVerificationService();
    }
    return TemporalVerificationService.instance;
  }

  private getKey(candidate: ViolationCandidate): string {
    return `${candidate.cameraId}:${candidate.zone}:${candidate.trackingId}:${candidate.violationClass}`;
  }

  public recordSighting(candidate: ViolationCandidate): VerificationResult {
    const key = this.getKey(candidate);
    const now = candidate.timestampMs !== undefined ? candidate.timestampMs : Date.now();
    const isEmergency = ['fire', 'smoke', 'worker_fall'].includes(candidate.violationClass);
    const isRestrictedZone = candidate.violationClass.includes('restricted') || candidate.violationClass.includes('zone');
    const requiredThreshold = candidate.thresholdMs !== undefined
      ? candidate.thresholdMs
      : isEmergency
      ? this.EMERGENCY_THRESHOLD_MS
      : isRestrictedZone
      ? 1000
      : this.DEFAULT_PPE_THRESHOLD_MS;

    let entry = this.buffer.get(key);

    if (!entry) {
      entry = {
        candidate,
        firstSeenMs: now,
        lastSeenMs: now,
        frameCount: 1,
        confirmedFired: false,
      };
      this.buffer.set(key, entry);

      return {
        isConfirmed: false,
        hasBeenConfirmed: false,
        status: 'CANDIDATE',
        persistedDurationSec: 0,
        firstSeenTimestamp: new Date(now).toISOString(),
        frameCount: 1,
        candidate,
      };
    }

    // Update existing entry
    entry.lastSeenMs = now;
    entry.frameCount += 1;
    entry.candidate = candidate; // keep latest box and confidence

    const elapsedMs = entry.lastSeenMs - entry.firstSeenMs;
    const durationSec = Math.round((elapsedMs / 1000) * 10) / 10;
    const isPastThreshold = elapsedMs >= requiredThreshold;

    if (isPastThreshold && !entry.confirmedFired) {
      entry.confirmedFired = true;
      return {
        isConfirmed: true,
        hasBeenConfirmed: true,
        status: 'CONFIRMED',
        persistedDurationSec: durationSec,
        firstSeenTimestamp: new Date(entry.firstSeenMs).toISOString(),
        frameCount: entry.frameCount,
        candidate,
      };
    }

    return {
      isConfirmed: false,
      hasBeenConfirmed: entry.confirmedFired || isPastThreshold,
      status: (entry.confirmedFired || isPastThreshold) ? 'CONFIRMED' : 'CANDIDATE',
      persistedDurationSec: durationSec,
      firstSeenTimestamp: new Date(entry.firstSeenMs).toISOString(),
      frameCount: entry.frameCount,
      candidate,
    };
  }

  public clearEntry(cameraId: string, zone: string, trackingId: string, violationClass: string): void {
    const key = `${cameraId}:${zone}:${trackingId}:${violationClass}`;
    this.buffer.delete(key);
  }

  public resetTracking(trackingId: string): void {
    for (const [k, v] of this.buffer.entries()) {
      if (v.candidate.trackingId === trackingId) {
        this.buffer.delete(k);
      }
    }
  }

  private cleanupStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.buffer.entries()) {
      if (now - entry.lastSeenMs > this.STALE_EXPIRY_MS) {
        this.buffer.delete(key);
      }
    }
  }
}

