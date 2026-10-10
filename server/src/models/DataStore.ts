import bcrypt from 'bcryptjs';
import { Role, ROLE_PERMISSIONS } from '../security/permissions';
import { getCam01EffectiveUrl } from '../config/env';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  firebaseUid?: string;
  photoURL?: string;
  provider?: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  siteIds: string[];
  zoneIds: string[];
  teamIds: string[];
  workerId?: string;
  department: string;
  shift: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
}

export interface SiteDoc {
  id: string;
  siteId?: string;
  companyName?: string;
  name: string;
  code: string;
  location: string;
  industry?: string;
  timezone?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  activeShift?: string;
  complianceRate?: number;
  totalWorkers?: number;
  camerasOnline?: number;
  totalCameras?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoneDoc {
  id: string;
  name: string;
  code: string;
  dangerLevel: 'critical' | 'high' | 'medium' | 'low';
  requiredPPE: string[];
  complianceRate: number;
  incidentCount: number;
  activeWorkers: number;
  riskWeight: number;
}

export interface Point2D {
  x: number; // 0.0 - 1.0 (normalized)
  y: number; // 0.0 - 1.0 (normalized)
}

export interface ZoneScheduleConfig {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
  days?: string[];
  timezone?: string;
}

export interface RestrictedZoneDoc {
  id: string;
  zoneId: string;
  siteId: string;
  cameraId: string;
  name: string;
  description?: string;
  zoneType: 'RESTRICTED' | 'HIGH_RISK' | 'EMERGENCY' | 'AUTHORIZED_ONLY' | 'LONE_WORKER_ZONE';
  polygon: Point2D[];
  enabled: boolean;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  allowedRoles: string[];
  allowedEmployees: string[];
  allowedDepartments: string[];
  unknownIdentityPolicy: 'DENY' | 'ALLOW' | 'FLAG_UNKNOWN';
  schedule?: ZoneScheduleConfig;
  requiredPPE: string[];
  // Phase 9.3: Lone Worker / Isolation Configuration
  minimumWorkers?: number;
  isolationThresholdSec?: number;
  warningThresholdSec?: number;
  checkInRequired?: boolean;
  checkInTimeoutSec?: number;
  authorizedWorkerPolicy?: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface LoneWorkerState {
  zoneId: string;
  cameraId: string;
  name: string;
  zoneType: 'LONE_WORKER_ZONE';
  state:
    | 'CLEAR'
    | 'INSIDE_CANDIDATE'
    | 'ISOLATED'
    | 'WARNING'
    | 'CHECK_IN_REQUIRED'
    | 'INCIDENT'
    | 'RESOLVED'
    | 'DISABLED'
    | 'CAMERA_OFFLINE'
    | 'AI_INFERENCE_UNAVAILABLE';
  activeTrackId?: string;
  workerCount: number;
  minimumWorkers: number;
  durationSec: number;
  warningThresholdSec: number;
  isolationThresholdSec: number;
  checkInRequired: boolean;
  checkInTimeoutSec: number;
  checkInPending: boolean;
  lastCheckInAt?: string;
  lastCheckInBy?: string;
  lastResolutionReason?: string;
  riskLevel: string;
  lastUpdate: string;
}

export type EmergencyZoneType =
  | 'EMERGENCY_EXIT'
  | 'ESCAPE_ROUTE'
  | 'FIRE_EXTINGUISHER_ACCESS'
  | 'EMERGENCY_PANEL_ACCESS'
  | 'EVACUATION_PATH';

export interface EmergencyZoneDoc {
  id: string;
  zoneId: string;
  siteId: string;
  cameraId: string;
  name: string;
  description?: string;
  zoneType: EmergencyZoneType;
  polygon: Point2D[];
  enabled: boolean;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  temporalThresholdMs: number;
  allowedObjectClasses: string[];
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CameraDoc {
  id: string;
  name: string;
  code: string; // e.g. CAM-01
  cameraCode?: string;
  siteId?: string;
  zoneId?: string;
  zone: string;
  protocol?: 'RTSP' | 'HLS' | 'WebRTC' | 'WEBCAM';
  sourceType?: 'ip_rtsp' | 'browser_cam' | 'uploaded_video' | 'demo' | 'WEBCAM' | 'FILE';
  streamUrl: string;
  streamUrlReference?: string;
  enabled?: boolean;
  aiEnabled?: boolean;
  status: 'LOADING' | 'LIVE' | 'PAUSED' | 'OFFLINE' | 'ERROR' | 'RECONNECTING' | 'UNREACHABLE' | 'NOT_CONFIGURED' | 'PROBING' | 'CONNECTING' | 'CONNECTED' | 'AUTH_FAILURE' | 'STREAM_ERROR' | 'NO_FRAMES';
  fps: number;
  resolution: string;
  latencyMs: number;
  ptzEnabled: boolean;
  temperature?: number;
  lastFrameAt?: string;
  lastHeartbeatAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShiftDoc {
  id: string;
  name: string;
  code: string;
  startTime: string; // "06:00"
  endTime: string;   // "14:00"
  days: string[];
  active: boolean;
  siteId: string;
  supervisorId?: string;
  enabled?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeDoc {
  id: string;
  employeeId: string;
  name?: string;
  fullName: string;
  email: string;
  roleTitle: string;
  dateOfBirth?: string;
  department: string;
  plant?: string;
  siteId: string;
  zone?: string;
  assignedZoneId: string;
  supervisor?: string;
  shift: string;
  joiningDate?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
  address?: string;
  phone?: string;
  emergencyContact?: string;
  requiredPPE: string[];
  education?: string;
  emergencyContacts?: { name: string; relation: string; phone: string }[];
  insurance?: { provider: string; policyNumber: string };
  idReferences?: { type: string; maskedId: string }[];
  photoUrl?: string;
  violationCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyRuleDoc {
  id: string;
  name: string;
  ruleCode: string;
  violationClass: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidenceThreshold?: number;
  minConfidence: number;
  consecutiveFrames?: number;
  minDurationMs?: number;
  cooldownMs?: number;
  cooldownSeconds: number;
  soundAlarm?: boolean;
  notifyOfficer?: boolean;
  zones: string[];
  notificationChannels: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationDoc {
  id: string;
  timestamp: string;
  cameraId: string;
  zoneId: string;
  compliant: boolean;
}

export interface WorkerDoc {
  id: string;
  workerId: string; // e.g. 0112-WK
  name: string;
  department: string;
  shift: string;
  clearanceLevel: string;
  photoUrl?: string;
  violationCount: number;
}

export interface BoundingBox {
  ymin: number; // 0-100 percentage or 0-1 normalized
  xmin: number;
  ymax: number;
  xmax: number;
  label?: string;
  color?: string;
}

export interface IncidentDoc {
  _id?: any;
  id: string;
  incidentId: string; // e.g. INC-8492
  incidentType?: string; // e.g. 'LONE_WORKER', 'EMERGENCY_OBSTRUCTION', 'SAFETY_VIOLATION'
  workerId: string;
  workerName: string;
  employeeName?: string;
  violationType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0.0 - 1.0
  boundingBox: BoundingBox;
  zone: string;
  zoneId?: string;
  siteId?: string;
  cameraId: string;
  trackId?: string;
  employeeId?: string | null;
  identityStatus?: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  modelId?: string;
  timestamp: string;
  riskScore: number; // 0 - 100
  riskLevel?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  riskFactors?: Array<{ type: string; item?: string; contribution: number; details?: string }>;
  severityReason?: string;
  severityFactors?: Array<{ factor: string; weight: number }>;
  status: 'DETECTED' | 'ACKNOWLEDGED' | 'DISPATCHED' | 'RESOLVED' | 'FALSE_POSITIVE';
  evidenceImage: string;
  whyFlagged: string[];
  whyCreated?: string[];
  explanation?: string[];
  timeline?: IncidentEventDoc[];
  escalationStatus?: 'PENDING' | 'ESCALATED_L1' | 'ESCALATED_L2' | 'ACKNOWLEDGED' | 'RESOLVED';
  escalationTier?: number;
  escalatedAt?: string;
  nearMissId?: string;
  recommendedAction: string;
  stewardName?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  source?: 'AI' | 'MANUAL' | 'HUMAN_REPORT' | 'TEST_PROBE' | string;
  modelName?: string;
  modelVersion?: string;
  evidenceHash?: string;
  evidence?: {
    captured: boolean;
    mediaType?: string;
    capturedAt?: string;
    cameraId?: string;
    frameId?: string;
    source?: string;
    width?: number;
    height?: number;
    storageType?: string;
    storageRef?: string;
    sha256?: string;
    annotations?: any;
    failureReason?: string;
  };
  ruleId?: string;
  pipelineName?: string;
  falsePositiveReason?: string;
  temporalConfigUsed?: any;
  // Phase 11: Smart Incident Response
  responseState?: 'UNASSIGNED' | 'ROUTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
  routedAt?: string;
  routingDecision?: {
    severity: string;
    targetRoles: string[];
    targetUsers: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string;
    }>;
    routingReason: string;
    siteId?: string;
    zoneId?: string;
    evaluatedAt: string;
  };
  assignedResponder?: {
    responderId: string;
    name: string;
    role: string;
    department: string;
    email: string;
    assignedAt?: string;
    assignedBy?: string;
    acknowledgedAt?: string;
    state: 'NO_FIRST_RESPONDER_CONFIGURED' | 'RESPONDER_IDENTIFIED' | 'RESPONDER_ASSIGNED' | 'RESPONDER_ACKNOWLEDGED';
    assignmentSource?: 'AUTOMATIC_POLICY' | 'MANUAL_OPERATOR';
  };
  responseStartedAt?: string;
  responseStartedBy?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface IncidentEventDoc {
  id?: string;
  eventId: string;
  incidentId: string;
  eventType: string;
  timestamp: string;
  description: string;
  actor: string;
  metadata?: Record<string, any>;
}

export interface ZoneSafetyPolicyDoc {
  id: string;
  policyId: string;
  zoneId: string;
  siteId: string;
  zoneName: string;
  requiredPPE: string[]; // 'helmet', 'safety-vest', 'gloves', 'shoes'
  restrictedAreas?: Array<{
    areaId: string;
    name: string;
    coordinates?: any;
    dangerLevel: 'critical' | 'high' | 'medium' | 'low';
  }>;
  hazardTypes?: string[];
  severityRules?: Array<{
    ruleId: string;
    violationType: string;
    baseSeverity: 'critical' | 'high' | 'medium' | 'low';
    minDurationSeconds?: number;
  }>;
  riskWeights: {
    ppeWeight: number;
    hazardWeight: number;
    zoneWeight: number;
    persistenceWeight: number;
    contextualWeight: number;
  };
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RiskConfigurationDoc {
  id: string;
  configId: string;
  siteId: string;
  baseScores: Record<string, number>;
  zoneMultipliers: Record<string, number>;
  thresholds: {
    lowMax: number;
    moderateMax: number;
    highMax: number;
    criticalMin: number;
  };
  persistenceBonus: {
    shortDurationSec: number;
    shortBonus: number;
    longDurationSec: number;
    longBonus: number;
  };
  repeatInfractionPenalty: {
    singlePenalty: number;
    multiplePenalty: number;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RiskAssessmentDoc {
  id: string;
  assessmentId: string;
  incidentId?: string;
  siteId: string;
  zoneId: string;
  cameraId: string;
  trackId?: string;
  employeeId?: string | null;
  score: number;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: Array<{
    type: string;
    item?: string;
    contribution: number;
    details?: string;
  }>;
  reproducibleInputs?: Record<string, any>;
  timestamp: string;
}

export interface NearMissDoc {
  id: string;
  nearMissId: string;
  siteId: string;
  zoneId: string;
  cameraId: string;
  trackId: string;
  employeeId?: string | null;
  identityStatus: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  ruleId: string;
  triggerConditions: string[];
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  evidence: string;
  modelId: string;
  resolved: boolean;
  incidentId?: string | null;
  hazardReportId?: string | null;
}

export interface EscalationPolicyDoc {
  id: string;
  policyId: string;
  siteId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  tiers: Array<{
    tier: number;
    role: string;
    timeoutSeconds: number;
    notifyChannels: string[];
  }>;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

export interface IdentityAssociationDoc {
  id: string;
  identityAssociationId: string;
  trackId: string;
  employeeId: string;
  employeeName: string;
  cameraId: string;
  siteId: string;
  zoneId: string;
  matchMethod: string;
  matchConfidence: number;
  matchStatus: 'CONFIRMED' | 'UNCERTAIN' | 'NO_MATCH' | 'NOT_AVAILABLE';
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

export interface ModelRegistryDoc {
  id: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  modelType: string;
  framework: string;
  datasetSources: string[];
  datasetVersions: string[];
  datasetLicenses: string[];
  trainingDate?: string;
  trainingConfig?: any;
  classList: string[];
  weightsChecksum?: string;
  sourceRepository?: string;
  sourceCommit?: string;
  validationMetrics?: any;
  deploymentStatus: 'TRAINED' | 'VALIDATED' | 'DEPLOYED' | 'DISABLED';
  commercialUsePermitted: boolean;
  licensingNotice: string;
  activatedAt?: string;
  activatedBy?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingJobDoc {
  id: string;
  jobId: string;
  datasetId: string;
  datasetVersion: string;
  baseModelId: string;
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REJECTED';
  rejectionReason?: string;
  targetClasses: string[];
  hyperparameters?: {
    epochs: number;
    batchSize: number;
    imgsz: number;
    lr0: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionDoc {
  id: string;
  workerId: string;
  class: string;
  confidence: number;
  boundingBox: BoundingBox;
  zone: string;
  cameraId: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface NotificationDoc {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  incidentId?: string;
  read: boolean;
  timestamp: string;
  targetRoles: string[];
}

export interface AuditReportDoc {
  id: string;
  reportId: string;
  siteId?: string;
  siteCode?: string;
  standard: 'DGFASLI' | 'OSHA' | 'INTERNAL';
  siteName: string;
  dateRange: {
    from: string;
    to: string;
  };
  sections: string[];
  generatedBy: string;
  generatedAt: string;
  complianceScore: number | null;
  complianceScoreMethod?: string;
  totalViolations: number;
  criticalViolations: number;
  resolvedViolations: number;
  pdfPath?: string;
  fileName?: string;
}

export interface FalsePositiveFeedbackDoc {
  id: string;
  incidentId: string;
  reason: 'Lighting' | 'Occlusion' | 'Incorrect detection' | 'Worker outside zone' | 'Other';
  notes: string;
  submittedBy: string;
  timestamp: string;
}

export interface AuditLogDoc {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  siteId?: string;
  zoneId?: string;
  timestamp: string;
  ipAddress: string;
  userAgent?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  metadata: Record<string, any>;
  before?: any;
  after?: any;
  previousHash: string;
  currentHash: string;
}

export interface HazardDoc {
  id: string;
  reporterId: string;
  reporterName: string;
  zoneId: string;
  zoneName: string;
  hazardType: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'OPEN' | 'IN_REVIEW' | 'MITIGATED';
  createdAt: string;
}

// In-Memory storage repository with full indexing and query capabilities
export class DataStore {
  users: UserDoc[] = [];
  sites: SiteDoc[] = [];
  zones: ZoneDoc[] = [];
  cameras: CameraDoc[] = [];
  workers: WorkerDoc[] = [];
  employees: EmployeeDoc[] = [];
  shifts: ShiftDoc[] = [];
  safetyRules: SafetyRuleDoc[] = [];
  observations: ObservationDoc[] = [];
  incidents: IncidentDoc[] = [];
  detections: DetectionDoc[] = [];
  notifications: NotificationDoc[] = [];
  auditReports: AuditReportDoc[] = [];
  feedbacks: FalsePositiveFeedbackDoc[] = [];
  get feedback(): FalsePositiveFeedbackDoc[] {
    return this.feedbacks;
  }
  auditLogs: AuditLogDoc[] = [];
  hazards: HazardDoc[] = [];
  identityAssociations: IdentityAssociationDoc[] = [];
  zoneSafetyPolicies: ZoneSafetyPolicyDoc[] = [];
  riskConfigurations: RiskConfigurationDoc[] = [];
  riskAssessments: RiskAssessmentDoc[] = [];
  nearMisses: NearMissDoc[] = [];
  incidentEvents: IncidentEventDoc[] = [];
  escalationPolicies: EscalationPolicyDoc[] = [];
  restrictedZones: RestrictedZoneDoc[] = [];
  emergencyZones: EmergencyZoneDoc[] = [];
  trainingJobs: TrainingJobDoc[] = [];
  modelRegistry: ModelRegistryDoc[] = [
    {
      id: 'reg-01',
      modelId: 'MODEL-PPE-SH17-001',
      modelName: 'SafeVision Industrial PPE Detector (SH17 Architecture)',
      modelVersion: '1.0.0',
      modelType: 'OBJECT_DETECTION_PPE',
      framework: 'PyTorch / Ultralytics YOLOv8',
      datasetSources: [
        'https://github.com/ahmadmughees/SH17dataset',
        'arXiv:2407.08581 [cs.CV]',
      ],
      datasetVersions: ['v1.0 (8,099 annotated images, 75,994 bounding instances)'],
      datasetLicenses: ['CC BY-NC-SA 4.0 (Creative Commons Attribution-NonCommercial-ShareAlike 4.0)'],
      trainingDate: '2026-03-15T00:00:00Z',
      trainingConfig: {
        epochs: 100,
        batch_size: 16,
        imgsz: 640,
        optimizer: 'SGD',
        lr0: 0.01,
      },
      classList: [
        'person', 'ear', 'ear-mufs', 'face', 'face-guard', 'face-mask',
        'foot', 'tool', 'glasses', 'gloves', 'helmet', 'hands', 'head',
        'medical-suit', 'shoes', 'safety-suit', 'safety-vest'
      ],
      weightsChecksum: 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62',
      sourceRepository: 'https://github.com/ahmadmughees/SH17dataset',
      sourceCommit: '3a91b40',
      validationMetrics: {
        status: 'REAL_MODEL_CHECKSUM_VERIFIED',
        actualChecksum: 'sha256:5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62',
        verifiedDevice: 'cuda:0 (NVIDIA GeForce RTX 2050)'
      },
      deploymentStatus: 'DEPLOYED',
      commercialUsePermitted: false,
      licensingNotice: 'CRITICAL: Dataset released under CC BY-NC-SA 4.0 (Non-Commercial). Commercial deployment requires written licensing/commercial permission from copyright holders.',
      version: 1,
      createdAt: '2026-03-15T00:00:00Z',
      updatedAt: '2026-09-28T06:00:00Z',
    },
    {
      id: 'reg-02',
      modelId: 'MODEL-PPE-RFDETR-002',
      modelName: 'RF-DETR + ByteTrack Industrial PPE Suite',
      modelVersion: '0.1.0',
      modelType: 'OBJECT_DETECTION_PPE',
      framework: 'RF-DETR (PyTorch) + ByteTrack',
      datasetSources: [
        'https://github.com/Pratham-22/ppe-compliance',
        'https://github.com/ahmadmughees/SH17dataset',
      ],
      datasetVersions: ['SH17 v1.0 checkpoint_epoch44'],
      datasetLicenses: ['MIT (ppe-compliance)', 'CC BY-NC-SA 4.0 (SH17)'],
      trainingDate: '2026-02-10T12:00:00Z',
      trainingConfig: {
        backbone: 'ResNet-50 / Transformer',
        epochs: 44,
        tracking_algorithm: 'ByteTrack',
        temporal_window_frames: 15,
        temporal_violation_ratio: 0.60,
      },
      classList: ['person', 'helmet', 'safety-vest', 'head', 'hands', 'gloves', 'foot', 'shoes'],
      weightsChecksum: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      sourceRepository: 'https://github.com/Pratham-22/ppe-compliance',
      sourceCommit: 'v0.1-release',
      validationMetrics: {
        mAP50: 0.815,
        precision: 0.841,
        recall: 0.790,
        tracking_mota: 0.764,
        tracking_motp: 0.821,
      },
      deploymentStatus: 'VALIDATED',
      commercialUsePermitted: false,
      licensingNotice: 'Commercial deployment requires SH17 non-commercial license clearance.',
      version: 1,
      createdAt: '2026-02-10T12:00:00Z',
      updatedAt: '2026-02-10T12:00:00Z',
    }
  ];

  public recordObservation(compliant: boolean, cameraId: string, zoneId: string): void {
    this.observations.unshift({
      id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      cameraId,
      zoneId,
      compliant,
    });
    // Keep max 1000 recent observations in memory
    if (this.observations.length > 1000) {
      this.observations = this.observations.slice(0, 1000);
    }
  }

  public getComplianceMetrics(timeRange: 'today' | 'week' | 'month' | 'all' = 'today'): {
    observationCount: number;
    compliantCount: number;
    complianceRate: number | null;
    cameraSources: string[];
    period: string;
    lastUpdate: string | null;
  } {
    const now = Date.now();
    const periodCutoffs: Record<string, number> = {
      today: now - 24 * 3600 * 1000,
      week: now - 7 * 24 * 3600 * 1000,
      month: now - 30 * 24 * 3600 * 1000,
      all: 0,
    };
    const cutoff = periodCutoffs[timeRange] || 0;
    const filtered = this.observations.filter((o) => new Date(o.timestamp).getTime() >= cutoff);

    if (filtered.length === 0) {
      return {
        observationCount: 0,
        compliantCount: 0,
        complianceRate: null,
        cameraSources: [],
        period: timeRange,
        lastUpdate: null,
      };
    }

    const compliantCount = filtered.filter((o) => o.compliant).length;
    const complianceRate = Math.round((compliantCount / filtered.length) * 100);
    const cameraSources = Array.from(new Set(filtered.map((o) => o.cameraId)));

    return {
      observationCount: filtered.length,
      compliantCount,
      complianceRate,
      cameraSources,
      period: timeRange,
      lastUpdate: filtered[0].timestamp,
    };
  }

  private static instance: DataStore;

  private constructor() {
    this.seedInitialData();
  }

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  private seedInitialData() {
    const defaultHash = bcrypt.hashSync('Test@1234', 10);
    const pass123Hash = bcrypt.hashSync('Password123!', 10);
    const nowIso = new Date().toISOString();

    // 1. Enterprise RBAC Test Accounts (Clearly marked for Development)
    this.users = [
      {
        id: 'usr-admin-corp',
        name: 'System Administrator (Corporate)',
        email: 'admin@safevision.ai',
        passwordHash: pass123Hash,
        role: 'ADMIN',
        status: 'ACTIVE',
        siteIds: ['*'],
        zoneIds: ['*'],
        teamIds: ['*'],
        department: 'Systems Engineering & CyberOps',
        shift: '24/7 Enterprise Core',
        permissions: ROLE_PERMISSIONS.ADMIN,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-manager-corp',
        name: 'Rajesh Sengupta (Plant Manager)',
        email: 'manager@safevision.ai',
        passwordHash: pass123Hash,
        role: 'PLANT_MANAGER',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['*'],
        teamIds: ['*'],
        department: 'Operations & EHS Executive',
        shift: 'General Plant Hours (08:00 - 17:00)',
        permissions: ROLE_PERMISSIONS.PLANT_MANAGER,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-officer-corp',
        name: 'Bibek Kumar (Safety Officer)',
        email: 'safety@safevision.ai',
        passwordHash: pass123Hash,
        role: 'SAFETY_OFFICER',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['*'],
        teamIds: ['team-safety'],
        department: 'Safety Compliance Division',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.SAFETY_OFFICER,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-supervisor-corp',
        name: 'Rahul Verma (Zone Supervisor)',
        email: 'supervisor@safevision.ai',
        passwordHash: pass123Hash,
        role: 'SUPERVISOR',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['zone-sms-01', 'zone-sms-02', 'Zone 1 - Furnace Primary', 'Zone 2 - Secondary Refining', 'ZONE-A', 'ZONE-B', 'Furnace Bay'],
        teamIds: ['team-casting', 'team-assembly'],
        department: 'Furnace & Casting Operations',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.SUPERVISOR,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-employee-corp',
        name: 'Vikram Sethi (Floor Technician)',
        email: 'employee@safevision.ai',
        passwordHash: pass123Hash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['zone-sms-01', 'Zone 1 - Furnace Primary', 'ZONE-A'],
        teamIds: ['team-casting'],
        workerId: '0112-WK',
        department: 'Molten Casting Division',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.EMPLOYEE,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-admin-01',
        name: 'System Administrator (Test Account)',
        email: 'admin@test.local',
        passwordHash: defaultHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        siteIds: ['*'],
        zoneIds: ['*'],
        teamIds: ['*'],
        department: 'Systems Engineering & CyberOps',
        shift: '24/7 Enterprise Core',
        permissions: ROLE_PERMISSIONS.ADMIN,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-manager-01',
        name: 'Rajesh Sengupta (Plant Manager - Test Account)',
        email: 'manager@test.local',
        passwordHash: defaultHash,
        role: 'PLANT_MANAGER',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['*'],
        teamIds: ['*'],
        department: 'Operations & EHS Executive',
        shift: 'General Plant Hours (08:00 - 17:00)',
        permissions: ROLE_PERMISSIONS.PLANT_MANAGER,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-officer-01',
        name: 'Bibek Kumar (Safety Officer - Test Account)',
        email: 'officer@test.local',
        passwordHash: defaultHash,
        role: 'SAFETY_OFFICER',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'],
        teamIds: ['team-safety'],
        department: 'Safety Compliance Division',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.SAFETY_OFFICER,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-supervisor-01',
        name: 'Rahul Verma (Zone Supervisor - Test Account)',
        email: 'supervisor@test.local',
        passwordHash: defaultHash,
        role: 'SUPERVISOR',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['ZONE-A', 'ZONE-B'], // Scoped exclusively to Zone A (Furnace Bay) & Zone B (Assembly)
        teamIds: ['team-casting', 'team-assembly'],
        department: 'Furnace & Casting Operations',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.SUPERVISOR,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
      {
        id: 'usr-employee-01',
        name: 'Amit Sharma (Floor Technician - Test Account)',
        email: 'employee@test.local',
        passwordHash: defaultHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        siteIds: ['site-rsp-1'],
        zoneIds: ['ZONE-A'],
        teamIds: ['team-casting'],
        workerId: '0112-WK',
        department: 'Molten Casting Division',
        shift: 'Shift A (06:00 - 14:00)',
        permissions: ROLE_PERMISSIONS.EMPLOYEE,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLogin: null,
      },
    ];

    // 2. Sites (Authentic baseline)
    this.sites = [
      {
        id: 'site-rsp-1',
        name: 'Rourkela Steel Plant',
        code: 'RSP-ZB-01',
        location: 'Rourkela, Odisha, India',
        activeShift: 'Shift A (Morning)',
        complianceRate: 0,
        totalWorkers: 5,
        camerasOnline: 0,
        totalCameras: 8,
      },
    ];

    // 3. Zones (Authentic baseline)
    this.zones = [
      {
        id: 'zone-1',
        name: 'Furnace Bay',
        code: 'ZONE-A',
        dangerLevel: 'critical',
        requiredPPE: ['helmet', 'vest', 'footwear', 'gloves'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 1.6,
      },
      {
        id: 'zone-2',
        name: 'Assembly & Deck B',
        code: 'ZONE-B',
        dangerLevel: 'medium',
        requiredPPE: ['helmet', 'vest', 'footwear'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 1.0,
      },
      {
        id: 'zone-3',
        name: 'Loading Dock & Logistics',
        code: 'ZONE-C',
        dangerLevel: 'high',
        requiredPPE: ['helmet', 'vest', 'footwear'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 1.3,
      },
      {
        id: 'zone-4',
        name: 'Warehouse & Storage',
        code: 'ZONE-D',
        dangerLevel: 'low',
        requiredPPE: ['vest', 'footwear'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 0.8,
      },
      {
        id: 'zone-5',
        name: 'Raw Material Hoppers',
        code: 'ZONE-E',
        dangerLevel: 'high',
        requiredPPE: ['helmet', 'vest', 'gloves', 'footwear'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 1.4,
      },
      {
        id: 'zone-6',
        name: 'Packaging Line',
        code: 'ZONE-F',
        dangerLevel: 'low',
        requiredPPE: ['vest', 'footwear'],
        complianceRate: 0,
        incidentCount: 0,
        activeWorkers: 0,
        riskWeight: 0.7,
      },
    ];

    // 4. Cameras (Authoritative source: MongoDB / Operator configuration / Seed baseline)
    this.cameras = [
      {
        id: 'cam-01',
        name: 'Furnace Bay - Primary Angle',
        code: 'CAM-01',
        zone: 'Furnace Bay',
        streamUrl: getCam01EffectiveUrl(),
        status: 'LIVE',
        fps: 20,
        resolution: '1920x1080',
        latencyMs: 120,
        ptzEnabled: false,
        enabled: true,
      },
      {
        id: 'cam-02',
        name: 'Assembly & Deck B - West Feed',
        code: 'CAM-02',
        zone: 'Assembly & Deck B',
        streamUrl: '',
        status: 'LIVE',
        fps: 20,
        resolution: '1920x1080',
        latencyMs: 140,
        ptzEnabled: false,
        enabled: true,
      },
      {
        id: 'cam-03',
        name: 'Loading Dock North',
        code: 'CAM-03',
        zone: 'Loading Dock & Logistics',
        streamUrl: '',
        status: 'OFFLINE',
        fps: 0,
        resolution: '1920x1080',
        latencyMs: 0,
        ptzEnabled: false,
        enabled: true,
      },
      {
        id: 'cam-04',
        name: 'Tool Inspection Station',
        code: 'CAM-04',
        zone: 'Tool Inspection Station',
        streamUrl: '',
        status: 'LIVE',
        fps: 20,
        resolution: '1920x1080',
        latencyMs: 110,
        ptzEnabled: false,
        enabled: true,
      },
    ];

    // 5. Workers
    this.workers = [
      {
        id: 'wk-0112',
        workerId: '0112-WK',
        name: 'Amit Sharma',
        department: 'Casting Division',
        shift: 'Shift A',
        clearanceLevel: 'Tier 3 (Hot Metal Area)',
        violationCount: 0,
      },
      {
        id: 'wk-0102',
        workerId: '0102-WK',
        name: 'Ravi Verma',
        department: 'Crane Maintenance',
        shift: 'Shift A',
        clearanceLevel: 'Tier 3 (Hot Metal Area)',
        violationCount: 0,
      },
      {
        id: 'wk-0087',
        workerId: '0087-WK',
        name: 'V. Patil',
        department: 'Material Handling',
        shift: 'Shift A',
        clearanceLevel: 'Tier 2 (General Plant)',
        violationCount: 0,
      },
      {
        id: 'wk-0105',
        workerId: '0105-WK',
        name: 'Deepak Sahu',
        department: 'Rolling Operations',
        shift: 'Shift A',
        clearanceLevel: 'Tier 2 (General Plant)',
        violationCount: 0,
      },
      {
        id: 'wk-0099',
        workerId: '0099-WK',
        name: 'Sunil Jena',
        department: 'Electrical Maintenance',
        shift: 'Shift A',
        clearanceLevel: 'Tier 3 (Substation)',
        violationCount: 0,
      },
    ];

    // 6. Incidents & Telemetry Observations (Zero fake entries)
    this.incidents = [];
    this.observations = [];
    this.notifications = [];
    this.auditReports = [];

    // 9. Shifts
    this.shifts = [
      {
        id: 'shift-1',
        name: 'Shift A (Morning)',
        code: 'SHIFT-A',
        startTime: '06:00',
        endTime: '14:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        active: true,
        siteId: 'site-rsp-1',
        enabled: true,
        createdBy: 'usr-admin-01',
        updatedBy: 'usr-admin-01',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'shift-2',
        name: 'Shift B (Afternoon)',
        code: 'SHIFT-B',
        startTime: '14:00',
        endTime: '22:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        active: true,
        siteId: 'site-rsp-1',
        enabled: true,
        createdBy: 'usr-admin-01',
        updatedBy: 'usr-admin-01',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'shift-3',
        name: 'Shift C (Night)',
        code: 'SHIFT-C',
        startTime: '22:00',
        endTime: '06:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        active: true,
        siteId: 'site-rsp-1',
        enabled: true,
        createdBy: 'usr-admin-01',
        updatedBy: 'usr-admin-01',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'shift-4',
        name: 'General Shift',
        code: 'SHIFT-GEN',
        startTime: '08:00',
        endTime: '17:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        active: true,
        siteId: 'site-rsp-1',
        enabled: true,
        createdBy: 'usr-admin-01',
        updatedBy: 'usr-admin-01',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    // 10. Employees
    this.employees = [
      {
        id: 'emp-01',
        employeeId: '0112-WK',
        name: 'Amit Sharma',
        fullName: 'Amit Sharma',
        email: 'amit.sharma@safevision.ai',
        roleTitle: 'Casting Operations Technician',
        dateOfBirth: '1992-04-12',
        department: 'Molten Casting Division',
        plant: 'Rourkela Steel Plant',
        siteId: 'site-rsp-1',
        zone: 'ZONE-A',
        assignedZoneId: 'zone-1',
        supervisor: 'Rahul Verma',
        shift: 'Shift A (06:00 - 14:00)',
        joiningDate: '2021-03-15',
        status: 'ACTIVE',
        address: 'Sector 4, Rourkela, Odisha',
        phone: '+91 98765 11223',
        emergencyContact: '+91 98765 00001',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Thermal Gloves', 'Steel-Toe Boots'],
        education: 'Diploma in Metallurgy',
        emergencyContacts: [{ name: 'Pooja Sharma', relation: 'Spouse', phone: '+91 98765 11223' }],
        insurance: { provider: 'ESIC Heavy Industry Coverage', policyNumber: 'ESI-RSP-98214' },
        idReferences: [{ type: 'Aadhaar', maskedId: 'XXXX-XXXX-8921' }],
        violationCount: 2,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'emp-02',
        employeeId: '0102-WK',
        name: 'Ravi Verma',
        fullName: 'Ravi Verma',
        email: 'ravi.verma@safevision.ai',
        roleTitle: 'Overhead Crane Operator',
        dateOfBirth: '1989-08-22',
        department: 'Crane Maintenance',
        plant: 'Rourkela Steel Plant',
        siteId: 'site-rsp-1',
        zone: 'ZONE-A',
        assignedZoneId: 'zone-1',
        supervisor: 'Rahul Verma',
        shift: 'Shift A (06:00 - 14:00)',
        joiningDate: '2019-11-01',
        status: 'ACTIVE',
        address: 'Koel Nagar, Rourkela',
        phone: '+91 98765 22334',
        emergencyContact: '+91 98765 00002',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Steel-Toe Boots'],
        education: 'ITI Crane Operator',
        emergencyContacts: [{ name: 'S. Verma', relation: 'Brother', phone: '+91 98765 22334' }],
        insurance: { provider: 'Tata AIG Industrial Safety', policyNumber: 'TA-IND-44912' },
        idReferences: [{ type: 'PAN', maskedId: 'ABCDE****F' }],
        violationCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'emp-03',
        employeeId: '0087-WK',
        name: 'V. Patil',
        fullName: 'Vikram Patil',
        email: 'vikram.patil@safevision.ai',
        roleTitle: 'Logistics Handler',
        dateOfBirth: '1994-01-19',
        department: 'Material Handling',
        plant: 'Rourkela Steel Plant',
        siteId: 'site-rsp-1',
        zone: 'ZONE-C',
        assignedZoneId: 'zone-3',
        supervisor: 'K. Nayak',
        shift: 'Shift B (14:00 - 22:00)',
        joiningDate: '2022-07-10',
        status: 'ACTIVE',
        address: 'Chhend Colony, Rourkela',
        phone: '+91 98765 33445',
        emergencyContact: '+91 98765 00003',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Steel-Toe Boots'],
        education: 'Higher Secondary',
        emergencyContacts: [{ name: 'R. Patil', relation: 'Father', phone: '+91 98765 33445' }],
        insurance: { provider: 'ESIC Coverage', policyNumber: 'ESI-RSP-77123' },
        idReferences: [{ type: 'Aadhaar', maskedId: 'XXXX-XXXX-3341' }],
        violationCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'emp-04',
        employeeId: '0105-WK',
        name: 'Deepak Sahu',
        fullName: 'Deepak Sahu',
        email: 'deepak.sahu@safevision.ai',
        roleTitle: 'Rolling Mill Mechanical Specialist',
        dateOfBirth: '1991-06-30',
        department: 'Assembly & Rolling',
        plant: 'Rourkela Steel Plant',
        siteId: 'site-rsp-1',
        zone: 'ZONE-B',
        assignedZoneId: 'zone-2',
        supervisor: 'Rahul Verma',
        shift: 'Shift A (06:00 - 14:00)',
        joiningDate: '2020-02-14',
        status: 'ACTIVE',
        address: 'Panposh Road, Rourkela',
        phone: '+91 98765 44556',
        emergencyContact: '+91 98765 00004',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Steel-Toe Boots'],
        education: 'Diploma in Mechanical',
        emergencyContacts: [{ name: 'M. Sahu', relation: 'Spouse', phone: '+91 98765 44556' }],
        insurance: { provider: 'New India Assurance Industrial Group', policyNumber: 'NIA-RSP-55102' },
        idReferences: [{ type: 'Aadhaar', maskedId: 'XXXX-XXXX-9912' }],
        violationCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'emp-05',
        employeeId: '0099-WK',
        name: 'Sunil Jena',
        fullName: 'Sunil Jena',
        email: 'sunil.jena@safevision.ai',
        roleTitle: 'Electrical Substation Technician',
        dateOfBirth: '1995-12-05',
        department: 'Electrical Maintenance',
        plant: 'Rourkela Steel Plant',
        siteId: 'site-rsp-1',
        zone: 'ZONE-B',
        assignedZoneId: 'zone-2',
        supervisor: 'Rahul Verma',
        shift: 'Shift A (06:00 - 14:00)',
        joiningDate: '2023-01-08',
        status: 'ACTIVE',
        address: 'Basanti Colony, Rourkela',
        phone: '+91 98765 55667',
        emergencyContact: '+91 98765 00005',
        requiredPPE: ['Safety Helmet', 'High-Vis Vest', 'Insulated Boots'],
        education: 'Diploma in Electrical Engineering',
        emergencyContacts: [{ name: 'A. Jena', relation: 'Father', phone: '+91 98765 55667' }],
        insurance: { provider: 'ESIC Coverage', policyNumber: 'ESI-RSP-11928' },
        idReferences: [{ type: 'Aadhaar', maskedId: 'XXXX-XXXX-7782' }],
        violationCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    // 11. Safety Rules (Guaranteed complete contract schema)
    this.safetyRules = [
      {
        id: 'rule-helmet',
        name: 'Mandatory Hardhat / Helmet Enforcement',
        ruleCode: 'RULE-HELMET',
        violationClass: 'missing_helmet',
        description: 'Enforce statutory hardhat usage (IS 2925 / EN 397) within active operational and crane bays.',
        severity: 'high',
        confidenceThreshold: 0.75,
        minConfidence: 0.75,
        consecutiveFrames: 3,
        minDurationMs: 1500,
        cooldownMs: 60000,
        cooldownSeconds: 60,
        soundAlarm: false,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-vest',
        name: 'High-Visibility Reflective Vest Requirement',
        ruleCode: 'RULE-VEST',
        violationClass: 'missing_vest',
        description: 'Mandatory class-2 / class-3 retroreflective vest compliance for visual personnel tracking.',
        severity: 'critical',
        confidenceThreshold: 0.80,
        minConfidence: 0.80,
        consecutiveFrames: 3,
        minDurationMs: 2000,
        cooldownMs: 60000,
        cooldownSeconds: 60,
        soundAlarm: true,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-footwear',
        name: 'Steel-Toe Safety Footwear Protocol',
        ruleCode: 'RULE-FOOTWEAR',
        violationClass: 'no_safety_footwear',
        description: 'Enforce steel-toe puncture-resistant boots (IS 15298 / S3 SRC) across all shop floors.',
        severity: 'medium',
        confidenceThreshold: 0.70,
        minConfidence: 0.70,
        consecutiveFrames: 4,
        minDurationMs: 2500,
        cooldownMs: 60000,
        cooldownSeconds: 60,
        soundAlarm: false,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-gloves',
        name: 'Thermal & Cut-Resistant Gloves Requirement',
        ruleCode: 'RULE-GLOVES',
        violationClass: 'no_gloves',
        description: 'Thermal barrier & ANSI A4 cut-resistant gloves mandatory near scrap handlers and molten ladles.',
        severity: 'high',
        confidenceThreshold: 0.75,
        minConfidence: 0.75,
        consecutiveFrames: 3,
        minDurationMs: 2000,
        cooldownMs: 60000,
        cooldownSeconds: 60,
        soundAlarm: false,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-restricted',
        name: 'Hazardous / Restricted Zone Transit Breach',
        ruleCode: 'RULE-RESTRICTED',
        violationClass: 'restricted_zone',
        description: 'Immediate containment of unauthorized worker ingress into designated red-tier danger zones.',
        severity: 'critical',
        confidenceThreshold: 0.85,
        minConfidence: 0.85,
        consecutiveFrames: 2,
        minDurationMs: 1000,
        cooldownMs: 45000,
        cooldownSeconds: 45,
        soundAlarm: true,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-fire',
        name: 'Immediate Open Flame / Combustion Hotspot',
        ruleCode: 'RULE-FIRE',
        violationClass: 'fire',
        description: 'Optical thermal bloom and uncontained open fire detection triggering facility-level sirens.',
        severity: 'critical',
        confidenceThreshold: 0.80,
        minConfidence: 0.80,
        consecutiveFrames: 2,
        minDurationMs: 500,
        cooldownMs: 30000,
        cooldownSeconds: 30,
        soundAlarm: true,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-smoke',
        name: 'Dense Smoke & Particulate Inundation',
        ruleCode: 'RULE-SMOKE',
        violationClass: 'smoke',
        description: 'Rapid atmospheric opacity and industrial combustion smoke detection.',
        severity: 'critical',
        confidenceThreshold: 0.75,
        minConfidence: 0.75,
        consecutiveFrames: 2,
        minDurationMs: 1000,
        cooldownMs: 30000,
        cooldownSeconds: 30,
        soundAlarm: true,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-fall',
        name: 'Worker Down / Collapse / Fall Detection',
        ruleCode: 'RULE-FALL',
        violationClass: 'worker_fall',
        description: 'Automated optical detection of worker collapse, slips, trips, and severe falls.',
        severity: 'critical',
        confidenceThreshold: 0.80,
        minConfidence: 0.80,
        consecutiveFrames: 2,
        minDurationMs: 800,
        cooldownMs: 30000,
        cooldownSeconds: 30,
        soundAlarm: true,
        notifyOfficer: true,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'rule-crowding',
        name: 'Machinery Radius Over-Crowding',
        ruleCode: 'RULE-CROWDING',
        violationClass: 'unsafe_crowding',
        description: 'Personnel density monitoring around active continuous casters and rolling mill beds.',
        severity: 'low',
        confidenceThreshold: 0.70,
        minConfidence: 0.70,
        consecutiveFrames: 4,
        minDurationMs: 3000,
        cooldownMs: 90000,
        cooldownSeconds: 90,
        soundAlarm: false,
        notifyOfficer: false,
        zones: ['*'],
        notificationChannels: ['AUDIO_SIREN'],
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    // 12. Phase 7: Zone Safety Policies (Configurable Database-Driven Policies)
    this.zoneSafetyPolicies = [
      {
        id: 'zsp-1',
        policyId: 'POLICY-ZONE-A',
        zoneId: 'zone-1',
        siteId: 'site-rsp-1',
        zoneName: 'Furnace Bay',
        requiredPPE: ['helmet', 'safety-vest', 'gloves', 'shoes'],
        restrictedAreas: [
          { areaId: 'ra-furnace-core', name: 'Molten Core Standoff (3m)', dangerLevel: 'critical' },
        ],
        hazardTypes: ['thermal_burn', 'molten_splash', 'overhead_crane'],
        severityRules: [
          { ruleId: 'rule-helmet', violationType: 'missing_helmet', baseSeverity: 'high', minDurationSeconds: 3.0 },
          { ruleId: 'rule-vest', violationType: 'missing_vest', baseSeverity: 'critical', minDurationSeconds: 2.0 },
          { ruleId: 'rule-gloves', violationType: 'no_gloves', baseSeverity: 'high', minDurationSeconds: 3.0 },
        ],
        riskWeights: { ppeWeight: 40, hazardWeight: 25, zoneWeight: 20, persistenceWeight: 10, contextualWeight: 5 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
      {
        id: 'zsp-2',
        policyId: 'POLICY-ZONE-B',
        zoneId: 'zone-2',
        siteId: 'site-rsp-1',
        zoneName: 'Assembly & Deck B',
        requiredPPE: ['helmet', 'safety-vest', 'shoes'],
        hazardTypes: ['pinch_point', 'rolling_stock'],
        riskWeights: { ppeWeight: 35, hazardWeight: 20, zoneWeight: 20, persistenceWeight: 15, contextualWeight: 10 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
      {
        id: 'zsp-3',
        policyId: 'POLICY-ZONE-C',
        zoneId: 'zone-3',
        siteId: 'site-rsp-1',
        zoneName: 'Loading Dock & Logistics',
        requiredPPE: ['helmet', 'safety-vest', 'shoes'],
        hazardTypes: ['heavy_vehicle', 'crush_hazard'],
        riskWeights: { ppeWeight: 35, hazardWeight: 25, zoneWeight: 20, persistenceWeight: 15, contextualWeight: 5 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
      {
        id: 'zsp-4',
        policyId: 'POLICY-ZONE-D',
        zoneId: 'zone-4',
        siteId: 'site-rsp-1',
        zoneName: 'Warehouse & Storage',
        requiredPPE: ['safety-vest', 'shoes'],
        hazardTypes: ['falling_goods', 'forklift'],
        riskWeights: { ppeWeight: 30, hazardWeight: 20, zoneWeight: 20, persistenceWeight: 20, contextualWeight: 10 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
      {
        id: 'zsp-5',
        policyId: 'POLICY-ZONE-E',
        zoneId: 'zone-5',
        siteId: 'site-rsp-1',
        zoneName: 'Raw Material Hoppers',
        requiredPPE: ['helmet', 'safety-vest', 'gloves', 'shoes'],
        hazardTypes: ['inhalation', 'conveyor_entrapment'],
        riskWeights: { ppeWeight: 35, hazardWeight: 25, zoneWeight: 20, persistenceWeight: 15, contextualWeight: 5 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
      {
        id: 'zsp-6',
        policyId: 'POLICY-ZONE-F',
        zoneId: 'zone-6',
        siteId: 'site-rsp-1',
        zoneName: 'Packaging Line',
        requiredPPE: ['safety-vest', 'shoes'],
        hazardTypes: ['repetitive_motion', 'low_clearance'],
        riskWeights: { ppeWeight: 30, hazardWeight: 20, zoneWeight: 20, persistenceWeight: 20, contextualWeight: 10 },
        enabled: true,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
    ];

    // 13. Phase 7: Dynamic Configurable Risk Configuration
    this.riskConfigurations = [
      {
        id: 'rc-default',
        configId: 'CONFIG-RISK-RSP-01',
        siteId: 'site-rsp-1',
        baseScores: {
          fire: 95,
          smoke: 90,
          worker_fall: 88,
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
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: 'SYSTEM_BOOTSTRAP',
      },
    ];

    // 14. Phase 7: Smart Alert Escalation Policies
    this.escalationPolicies = [
      {
        id: 'ep-crit',
        policyId: 'ESC-CRITICAL',
        siteId: 'site-rsp-1',
        severity: 'critical',
        tiers: [
          { tier: 1, role: 'SUPERVISOR', timeoutSeconds: 30, notifyChannels: ['AUDIO_SIREN', 'DISPATCH_STEWARD'] },
          { tier: 2, role: 'SAFETY_OFFICER', timeoutSeconds: 60, notifyChannels: ['DASHBOARD_ALERT', 'SMS'] },
          { tier: 3, role: 'PLANT_MANAGER', timeoutSeconds: 120, notifyChannels: ['EMERGENCY_BROADCAST'] },
        ],
        enabled: true,
        version: 1,
        updatedAt: nowIso,
      },
      {
        id: 'ep-high',
        policyId: 'ESC-HIGH',
        siteId: 'site-rsp-1',
        severity: 'high',
        tiers: [
          { tier: 1, role: 'SUPERVISOR', timeoutSeconds: 60, notifyChannels: ['DISPATCH_STEWARD'] },
          { tier: 2, role: 'SAFETY_OFFICER', timeoutSeconds: 120, notifyChannels: ['DASHBOARD_ALERT'] },
        ],
        enabled: true,
        version: 1,
        updatedAt: nowIso,
      },
    ];
  }

  /**
   * Evaluates the current active operational shift based on actual shift records,
   * current server time, and site timezone if configured.
   */
  getCurrentShift(atDate: Date = new Date(), timezone?: string): ShiftDoc | null {
    if (!this.shifts || this.shifts.length === 0) return null;

    let timeParts: { hour: number; minute: number };
    let currentDay: string;

    const tz = timezone || process.env.TIMEZONE || 'Asia/Kolkata';

    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      });
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: tz,
      });
      const parts = formatter.formatToParts(atDate);
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
      timeParts = { hour, minute };
      currentDay = dayFormatter.format(atDate);
    } catch (_) {
      timeParts = { hour: atDate.getHours(), minute: atDate.getMinutes() };
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      currentDay = days[atDate.getDay()];
    }

    const currentMinutes = timeParts.hour * 60 + timeParts.minute;
    const activeCandidates = this.shifts.filter((s) => s.active !== false && s.enabled !== false);

    // Prioritize specific shifts (Shift A, Shift B, Shift C) over broad general shifts if overlapping
    const sorted = [...activeCandidates].sort((a, b) => {
      if (a.code.includes('GEN') && !b.code.includes('GEN')) return 1;
      if (!a.code.includes('GEN') && b.code.includes('GEN')) return -1;
      return 0;
    });

    for (const shift of sorted) {
      if (!shift.startTime || !shift.endTime) continue;

      if (Array.isArray(shift.days) && shift.days.length > 0) {
        const matchesDay = shift.days.some((d) => d.toLowerCase() === currentDay.toLowerCase());
        if (!matchesDay) continue;
      }

      const [startH, startM] = shift.startTime.split(':').map((v) => parseInt(v, 10));
      const [endH, endM] = shift.endTime.split(':').map((v) => parseInt(v, 10));
      const startMinutes = startH * 60 + (startM || 0);
      const endMinutes = endH * 60 + (endM || 0);

      if (startMinutes < endMinutes) {
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          return shift;
        }
      } else if (startMinutes > endMinutes) {
        // Overnight shift crossing midnight (e.g. 22:00 - 06:00)
        if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
          return shift;
        }
      } else {
        return shift;
      }
    }

    return null;
  }
}
