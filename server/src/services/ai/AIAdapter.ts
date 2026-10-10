import { BoundingBox } from '../../models/DataStore';

export interface DetectionResult {
  workerId: string;
  workerName: string;
  class: string;
  confidence: number;
  boundingBox: BoundingBox;
  zone: string;
  cameraId: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  evidenceImage?: string;
  explainabilityFactors?: string[];
  recommendedAction?: string;
  isAuthoritative?: boolean;
}

export interface TrackedWorker {
  trackId: string;
  employeeId?: string | null;
  employeeName?: string | null;
  identityStatus: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  personConfidence?: number;
  ppeState: {
    helmet: 'PRESENT' | 'MISSING' | 'UNKNOWN';
    vest: 'PRESENT' | 'MISSING' | 'UNKNOWN';
    gloves: 'PRESENT' | 'MISSING' | 'UNKNOWN';
    shoes: 'PRESENT' | 'MISSING' | 'UNKNOWN';
    glasses?: 'PRESENT' | 'MISSING' | 'UNKNOWN' | 'NOT_SUPPORTED';
    mask?: 'PRESENT' | 'MISSING' | 'UNKNOWN' | 'NOT_SUPPORTED';
  };
  ppeDetails?: Record<string, {
    status: string;
    confidence: number;
    item?: string | null;
    notes?: string;
    durationSec?: number;
  }>;
  overallCompliance?: 'COMPLIANT' | 'NON-COMPLIANT' | 'UNKNOWN';
  complianceDurationSec?: number;
  temporalState: string;
  bbox: number[];
}

export interface IncidentCandidate {
  trackId: string;
  employeeId?: string | null;
  employeeName?: string | null;
  identityStatus: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  violationType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  cameraId: string;
  zone: string;
  zoneId?: string;
  timestamp: string;
  boundingBox: BoundingBox;
  ruleId: string;
  modelId: string;
  whyFlagged: string[];
  temporalConfigUsed?: Record<string, any>;
}

export interface FullInferenceResponse {
  success: boolean;
  modelName: string;
  modelId: string;
  modelStatus: string;
  inferenceTimeMs: number;
  totalPersonsDetected: number;
  totalViolationsDetected: number;
  detections: DetectionResult[];
  trackedWorkers: TrackedWorker[];
  incidentCandidates: IncidentCandidate[];
  warnings?: string[];
}

export interface InferenceInput {
  imageBuffer?: Buffer;
  imagePath?: string;
  videoBuffer?: Buffer;
  videoPath?: string;
  frameBase64?: string;
  cameraId?: string;
  zone?: string;
  confThresh?: number;
  requiredPpe?: string[];
  profile?: string;
}

export interface AIAdapter {
  readonly name: string;
  readonly version: string;
  detectImage(input: InferenceInput): Promise<DetectionResult[]>;
  detectImageFull?(input: InferenceInput): Promise<any>;
  detectVideo(input: InferenceInput): Promise<any>;
  detectFrame(input: InferenceInput): Promise<DetectionResult[]>;
  detectFrameFull?(input: InferenceInput): Promise<FullInferenceResponse>;
}
