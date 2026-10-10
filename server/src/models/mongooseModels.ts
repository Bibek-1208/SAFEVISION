import mongoose, { Schema } from 'mongoose';

// 1. User Schema (RBAC + Scope + Firebase Identity)
const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: false },
  firebaseUid: { type: String, sparse: true, index: true },
  photoURL: { type: String },
  provider: { type: String, default: 'local' },
  role: {
    type: String,
    enum: ['ADMIN', 'PLANT_MANAGER', 'SAFETY_OFFICER', 'SUPERVISOR', 'EMPLOYEE'],
    default: 'EMPLOYEE',
    index: true,
  },
  department: { type: String, default: 'Operations' },
  siteIds: [{ type: String }],
  zoneIds: [{ type: String }],
  workerId: { type: String, default: null, index: true },
  status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  version: { type: Number, default: 1 },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 2. Site Schema
const SiteSchema = new Schema({
  siteId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, default: 'SafeVision Industrial' },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  location: { type: String, required: true },
  industry: { type: String, default: 'Heavy Manufacturing & Industrial' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  activeShift: { type: String, default: null },
  complianceRate: { type: Number, default: null },
  totalWorkers: { type: Number, default: 0 },
  camerasOnline: { type: Number, default: 0 },
  totalCameras: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 3. Zone Schema
const ZoneSchema = new Schema({
  zoneId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  dangerLevel: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium', index: true },
  requiredPPE: [{ type: String }],
  complianceRate: { type: Number, default: null },
  incidentCount: { type: Number, default: 0 },
  activeWorkers: { type: Number, default: 0 },
  riskWeight: { type: Number, default: 1.0 },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
ZoneSchema.index({ siteId: 1, name: 1 });

// 4. Camera Schema (Real RTSP + State Machine)
const CameraSchema = new Schema({
  cameraId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  zone: { type: String, required: true },
  streamUrl: { type: String, default: '' },
  streamUrlReference: { type: String, default: '' },
  protocol: { type: String, enum: ['RTSP', 'HLS', 'WebRTC', 'WEBCAM'], default: 'RTSP' },
  sourceType: { type: String, enum: ['ip_rtsp', 'browser_cam', 'uploaded_video', 'demo'], default: 'ip_rtsp' },
  status: {
    type: String,
    enum: [
      'NOT_CONFIGURED',
      'CONNECTING',
      'CONNECTED',
      'LIVE',
      'OFFLINE',
      'AUTH_FAILURE',
      'TIMEOUT',
      'ERROR',
      'RECONNECTING',
      'NO_FRAMES',
      'STREAM_ERROR',
    ],
    default: 'NOT_CONFIGURED',
    index: true,
  },
  enabled: { type: Boolean, default: true },
  fps: { type: Number, default: 0 },
  resolution: { type: String, default: '1920x1080' },
  latencyMs: { type: Number, default: null },
  ptzEnabled: { type: Boolean, default: false },
  temperature: { type: Number, default: null },
  lastFrameAt: { type: Date },
  lastHeartbeatAt: { type: Date },
  errorCode: { type: String },
  errorMessage: { type: String },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
CameraSchema.index({ siteId: 1, status: 1 });
CameraSchema.index({ zoneId: 1, status: 1 });

// 5. Shift Schema
const ShiftSchema = new Schema({
  shiftId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  days: [{ type: String }],
  active: { type: Boolean, default: true, index: true },
  supervisorId: { type: String },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 6. Employee Schema
const EmployeeSchema = new Schema({
  employeeId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, index: true },
  fullName: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  roleTitle: { type: String, required: true },
  department: { type: String, required: true, index: true },
  siteId: { type: String, required: true, index: true },
  assignedZoneId: { type: String, required: true, index: true },
  shift: { type: String, default: '' },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'],
    default: 'ACTIVE',
    index: true,
  },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  emergencyContact: { type: String, default: '' },
  emergencyContacts: [{ name: String, relation: String, phone: String }],
  insurance: { provider: String, policyNumber: String },
  idReferences: [{ type: { type: String }, maskedId: String }],
  requiredPPE: [{ type: String }],
  photoUrl: { type: String },
  violationCount: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
EmployeeSchema.index({ siteId: 1, assignedZoneId: 1 });

// 7. Safety Rule Schema
const SafetyRuleSchema = new Schema({
  ruleId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  ruleCode: { type: String, required: true, unique: true },
  violationClass: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true, index: true },
  minConfidence: { type: Number, default: 0.75 },
  cooldownSeconds: { type: Number, default: 30 },
  zones: [{ type: String }],
  notificationChannels: [{ type: String }],
  requiredPPE: [{ type: String }],
  temporalConfig: {
    detectionConfidenceThreshold: { type: Number, default: 0.65 },
    minimumObservedFrames: { type: Number, default: 10 },
    windowSize: { type: Number, default: 20 },
    minimumViolationRatio: { type: Number, default: 0.60 },
    persistenceDuration: { type: Number, default: 3.0 },
    cooldownDuration: { type: Number, default: 60.0 },
    recoveryDuration: { type: Number, default: 5.0 },
  },
  enabled: { type: Boolean, default: true, index: true },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 8. Model Registry Schema (Model & Data Provenance)
const ModelRegistrySchema = new Schema({
  modelId: { type: String, required: true, unique: true, index: true },
  modelName: { type: String, required: true },
  modelVersion: { type: String, required: true },
  modelType: { type: String, required: true, index: true },
  framework: { type: String, required: true },
  datasetSources: [{ type: String }],
  datasetVersions: [{ type: String }],
  datasetLicenses: [{ type: String }],
  trainingDate: { type: String },
  trainingConfig: { type: Schema.Types.Mixed },
  classList: [{ type: String }],
  weightsChecksum: { type: String },
  sourceRepository: { type: String },
  sourceCommit: { type: String },
  validationMetrics: { type: Schema.Types.Mixed },
  deploymentStatus: {
    type: String,
    enum: ['TRAINED', 'VALIDATED', 'DEPLOYED', 'DISABLED'],
    default: 'VALIDATED',
    index: true,
  },
  commercialUsePermitted: { type: Boolean, default: false },
  licensingNotice: { type: String, required: true },
  activatedAt: { type: Date },
  activatedBy: { type: String },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 9. Identity Association Schema (Temporal trackId to permanent employeeId)
const IdentityAssociationSchema = new Schema({
  identityAssociationId: { type: String, required: true, unique: true, index: true },
  trackId: { type: String, required: true, index: true },
  employeeId: { type: String, required: true, index: true },
  employeeName: { type: String, required: true },
  cameraId: { type: String, required: true, index: true },
  siteId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true, index: true },
  matchMethod: { type: String, default: 'BIOMETRIC_FEATURE_COSINE' },
  matchConfidence: { type: Number, required: true },
  matchStatus: { type: String, enum: ['CONFIRMED', 'UNCERTAIN', 'NO_MATCH', 'NOT_AVAILABLE'], default: 'CONFIRMED' },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});
IdentityAssociationSchema.index({ trackId: 1, validUntil: -1 });

// 10. Incident Schema (Authoritative Safety Breaches)
const IncidentSchema = new Schema({
  incidentId: { type: String, required: true, unique: true, index: true },
  incidentType: { type: String, default: 'SAFETY_VIOLATION', index: true },
  source: { type: String, enum: ['AI', 'HUMAN_REPORT'], default: 'AI', index: true },
  ruleId: { type: String, index: true },
  siteId: { type: String, default: 'site-rsp-1', index: true },
  zoneId: { type: String, index: true },
  zone: { type: String, required: true, index: true },
  cameraId: { type: String, required: true, index: true },
  modelId: { type: String, default: 'MODEL-PPE-SH17-001', index: true },
  trackId: { type: String, index: true },
  employeeId: { type: String, default: null, index: true },
  workerId: { type: String, default: 'UNIDENTIFIED' },
  workerName: { type: String, default: 'Unidentified Worker' },
  identityStatus: {
    type: String,
    enum: ['CONFIRMED', 'UNCONFIRMED', 'UNAVAILABLE'],
    default: 'UNCONFIRMED',
    index: true,
  },
  violationType: { type: String, required: true, index: true },
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true, index: true },
  confidence: { type: Number, required: true },
  boundingBox: {
    ymin: Number,
    xmin: Number,
    ymax: Number,
    xmax: Number,
    label: String,
    color: String,
  },
  riskScore: { type: Number, required: true },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
    default: 'HIGH',
    index: true,
  },
  riskFactors: [
    {
      type: { type: String },
      item: String,
      contribution: Number,
      details: String,
    },
  ],
  severityReason: { type: String, default: '' },
  severityFactors: [
    {
      factor: String,
      weight: Number,
    },
  ],
  status: {
    type: String,
    enum: ['DETECTED', 'ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED', 'FALSE_POSITIVE'],
    default: 'DETECTED',
    index: true,
  },
  evidenceImage: { type: String, default: '' },
  evidenceHash: { type: String, default: '' },
  evidence: { type: Schema.Types.Mixed },
  whyFlagged: [{ type: String }],
  whyCreated: [{ type: String }],
  explanation: [{ type: String }],
  timeline: [
    {
      eventId: String,
      eventType: String,
      timestamp: { type: Date, default: Date.now },
      description: String,
      actor: String,
      metadata: Schema.Types.Mixed,
    },
  ],
  escalationStatus: {
    type: String,
    enum: ['PENDING', 'ESCALATED_L1', 'ESCALATED_L2', 'ACKNOWLEDGED', 'RESOLVED'],
    default: 'PENDING',
    index: true,
  },
  escalationTier: { type: Number, default: 0 },
  escalatedAt: { type: Date },
  nearMissId: { type: String, index: true },
  recommendedAction: { type: String, required: true },
  stewardName: { type: String },
  resolvedAt: { type: Date },
  resolvedBy: { type: String },
  notes: { type: String },
  // Phase 11: Smart Incident Response
  responseState: {
    type: String,
    enum: ['UNASSIGNED', 'ROUTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'],
    default: 'UNASSIGNED',
    index: true,
  },
  routedAt: { type: Date },
  routingDecision: {
    severity: String,
    targetRoles: [String],
    targetUsers: [
      {
        id: String,
        name: String,
        email: String,
        role: String,
        department: String,
      },
    ],
    routingReason: String,
    siteId: String,
    zoneId: String,
    evaluatedAt: { type: Date, default: Date.now },
  },
  assignedResponder: {
    responderId: String,
    name: String,
    role: String,
    department: String,
    email: String,
    assignedAt: { type: Date },
    assignedBy: String,
    state: {
      type: String,
      enum: ['NO_FIRST_RESPONDER_CONFIGURED', 'RESPONDER_IDENTIFIED', 'RESPONDER_ASSIGNED', 'RESPONDER_ACKNOWLEDGED'],
      default: 'NO_FIRST_RESPONDER_CONFIGURED',
    },
  },
  responseStartedAt: { type: Date },
  responseStartedBy: { type: String },
  acknowledgedAt: { type: Date },
  acknowledgedBy: { type: String },
  falsePositiveReason: { type: String },
  temporalConfigUsed: { type: Schema.Types.Mixed },
  version: { type: Number, default: 1 },
  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
IncidentSchema.index({ timestamp: -1, severity: 1 });
IncidentSchema.index({ timestamp: -1, cameraId: 1 });
IncidentSchema.index({ timestamp: -1, zoneId: 1, severity: 1 });
IncidentSchema.index({ timestamp: -1, violationType: 1 });
IncidentSchema.index({ siteId: 1, zoneId: 1, status: 1 });
IncidentSchema.index({ siteId: 1, timestamp: -1 });
IncidentSchema.index({ cameraId: 1, timestamp: -1 });
IncidentSchema.index({ trackId: 1, violationType: 1, timestamp: -1 });
IncidentSchema.index({ employeeId: 1, timestamp: -1 });
IncidentSchema.index({ severity: 1, timestamp: -1 });
IncidentSchema.index({ riskScore: -1 });
IncidentSchema.index({ responseState: 1, severity: 1, timestamp: -1 });

// 11. Hazard Report Schema (Human Hazard Reporting)
const HazardReportSchema = new Schema({
  hazardReportId: { type: String, required: true, unique: true, index: true },
  reporterId: { type: String, required: true, index: true },
  reporterName: { type: String, required: true },
  siteId: { type: String, default: 'site-rsp-1', index: true },
  zoneId: { type: String, required: true, index: true },
  zoneName: { type: String, required: true },
  hazardType: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium', index: true },
  status: { type: String, enum: ['OPEN', 'UNDER_REVIEW', 'MITIGATED', 'DISMISSED'], default: 'OPEN', index: true },
  photos: [{ type: String }],
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

// 12. Notification Schema
const NotificationSchema = new Schema({
  notificationId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info'], default: 'info' },
  incidentId: { type: String, index: true },
  hazardReportId: { type: String },
  siteId: { type: String },
  zoneId: { type: String },
  read: { type: Boolean, default: false, index: true },
  targetRoles: [{ type: String }],
  timestamp: { type: Date, default: Date.now, index: true },
});

// 13. Audit Log Schema (Cryptographic SHA-256 Hash Chain)
const AuditLogSchema = new Schema({
  auditLogId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userEmail: { type: String, required: true },
  userRole: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true, index: true },
  resourceId: { type: String, required: true, index: true },
  siteId: { type: String },
  zoneId: { type: String },
  previousHash: { type: String, required: true },
  currentHash: { type: String, required: true },
  signature: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  result: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILED'], default: 'SUCCESS', index: true },
  metadata: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true },
});
AuditLogSchema.index({ timestamp: -1 });

// 14. Zone Safety Policy Schema (Phase 7 - Configurable Zone Safety Rules)
const ZoneSafetyPolicySchema = new Schema({
  policyId: { type: String, required: true, unique: true, index: true },
  zoneId: { type: String, required: true, index: true },
  siteId: { type: String, required: true, index: true },
  zoneName: { type: String, required: true },
  requiredPPE: [{ type: String }], // 'helmet', 'safety-vest', 'gloves', 'shoes', etc.
  restrictedAreas: [
    {
      areaId: String,
      name: String,
      coordinates: Schema.Types.Mixed,
      dangerLevel: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'high' },
    },
  ],
  hazardTypes: [{ type: String }],
  severityRules: [
    {
      ruleId: String,
      violationType: String,
      baseSeverity: { type: String, enum: ['critical', 'high', 'medium', 'low'] },
      minDurationSeconds: Number,
    },
  ],
  riskWeights: {
    ppeWeight: { type: Number, default: 35 },
    hazardWeight: { type: Number, default: 25 },
    zoneWeight: { type: Number, default: 20 },
    persistenceWeight: { type: Number, default: 15 },
    contextualWeight: { type: Number, default: 5 },
  },
  enabled: { type: Boolean, default: true, index: true },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'SYSTEM' },
});
ZoneSafetyPolicySchema.index({ siteId: 1, zoneId: 1 });

// 15. Risk Configuration Schema (Phase 7 - Configurable Dynamic Scoring)
const RiskConfigurationSchema = new Schema({
  configId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  baseScores: { type: Map, of: Number },
  zoneMultipliers: { type: Map, of: Number },
  thresholds: {
    lowMax: { type: Number, default: 29 },
    moderateMax: { type: Number, default: 59 },
    highMax: { type: Number, default: 79 },
    criticalMin: { type: Number, default: 80 },
  },
  persistenceBonus: {
    shortDurationSec: { type: Number, default: 3 },
    shortBonus: { type: Number, default: 8 },
    longDurationSec: { type: Number, default: 10 },
    longBonus: { type: Number, default: 15 },
  },
  repeatInfractionPenalty: {
    singlePenalty: { type: Number, default: 8 },
    multiplePenalty: { type: Number, default: 15 },
  },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'SYSTEM' },
});

// 16. Risk Assessment Schema (Phase 7 - Transparent Factor Breakdown)
const RiskAssessmentSchema = new Schema({
  assessmentId: { type: String, required: true, unique: true, index: true },
  incidentId: { type: String, index: true },
  siteId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true, index: true },
  cameraId: { type: String, required: true, index: true },
  trackId: { type: String, index: true },
  employeeId: { type: String, index: true },
  score: { type: Number, required: true },
  level: { type: String, enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'], required: true },
  factors: [
    {
      type: { type: String, required: true },
      item: { type: String },
      contribution: { type: Number, required: true },
      details: { type: String },
    },
  ],
  reproducibleInputs: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true },
});
RiskAssessmentSchema.index({ siteId: 1, timestamp: -1 });
RiskAssessmentSchema.index({ zoneId: 1, timestamp: -1 });

// 17. Near Miss Schema (Phase 7 - Unsafe Conditions Satisfying Rules)
const NearMissSchema = new Schema({
  nearMissId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true, index: true },
  cameraId: { type: String, required: true, index: true },
  trackId: { type: String, required: true, index: true },
  employeeId: { type: String, default: null, index: true },
  identityStatus: { type: String, enum: ['CONFIRMED', 'UNCONFIRMED', 'UNAVAILABLE'], default: 'UNCONFIRMED' },
  ruleId: { type: String, required: true, index: true },
  triggerConditions: [{ type: String }],
  riskScore: { type: Number, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  evidence: { type: String, default: '' },
  modelId: { type: String, default: 'MODEL-PPE-SH17-001' },
  resolved: { type: Boolean, default: false },
  incidentId: { type: String, default: null, index: true },
  hazardReportId: { type: String, default: null, index: true },
});
NearMissSchema.index({ siteId: 1, timestamp: -1 });
NearMissSchema.index({ zoneId: 1, timestamp: -1 });
NearMissSchema.index({ cameraId: 1, timestamp: -1 });
NearMissSchema.index({ trackId: 1, timestamp: -1 });
NearMissSchema.index({ employeeId: 1, timestamp: -1 });
NearMissSchema.index({ severity: 1, timestamp: -1 });
NearMissSchema.index({ ruleId: 1, timestamp: -1 });

// 18. Incident Event Schema (Phase 7 - Verifiable Real-Event Timeline)
const IncidentEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  incidentId: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  description: { type: String, required: true },
  actor: { type: String, default: 'SYSTEM_AI_ENGINE' },
  metadata: { type: Schema.Types.Mixed },
});
IncidentEventSchema.index({ incidentId: 1, timestamp: 1 });

// 19. Escalation Policy Schema (Phase 7 - Smart Multi-Tier Alert Escalation)
const EscalationPolicySchema = new Schema({
  policyId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true, index: true },
  tiers: [
    {
      tier: Number,
      role: String,
      timeoutSeconds: Number,
      notifyChannels: [String],
    },
  ],
  enabled: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
});

// 20. Restricted Zone / Geofence Schema (Phase 9.1 - Dynamic Camera Geofencing)
const Point2DSchema = new Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const ZoneScheduleSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    days: [{ type: String }],
    timezone: { type: String, default: 'UTC' },
  },
  { _id: false }
);

const RestrictedZoneSchema = new Schema({
  zoneId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  cameraId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  zoneType: {
    type: String,
    enum: ['RESTRICTED', 'HIGH_RISK', 'EMERGENCY', 'AUTHORIZED_ONLY', 'LONE_WORKER_ZONE'],
    default: 'RESTRICTED',
    index: true,
  },
  polygon: {
    type: [Point2DSchema],
    required: true,
    validate: {
      validator: (points: any[]) => Array.isArray(points) && points.length >= 3,
      message: 'A restricted zone polygon must contain at least 3 points.',
    },
  },
  enabled: { type: Boolean, default: true, index: true },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
    default: 'HIGH',
    index: true,
  },
  allowedRoles: [{ type: String }],
  allowedEmployees: [{ type: String }],
  allowedDepartments: [{ type: String }],
  unknownIdentityPolicy: {
    type: String,
    enum: ['DENY', 'ALLOW', 'FLAG_UNKNOWN'],
    default: 'FLAG_UNKNOWN',
  },
  schedule: { type: ZoneScheduleSchema, default: () => ({ enabled: false }) },
  requiredPPE: [{ type: String }],
  // Phase 9.3: Lone Worker / Isolation Monitoring Fields
  minimumWorkers: { type: Number, default: 2 },
  isolationThresholdSec: { type: Number, default: 120 },
  warningThresholdSec: { type: Number, default: 90 },
  checkInRequired: { type: Boolean, default: true },
  checkInTimeoutSec: { type: Number, default: 30 },
  authorizedWorkerPolicy: { type: String, default: 'ALLOW_ANY' },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  createdBy: { type: String, default: 'SYSTEM' },
  updatedBy: { type: String, default: 'SYSTEM' },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
RestrictedZoneSchema.index({ cameraId: 1, enabled: 1, isDeleted: 1 });
RestrictedZoneSchema.index({ siteId: 1, isDeleted: 1 });

// 21. Audit Report Schema (Compliance & Regulatory PDF Archive)
const AuditReportSchema = new Schema({
  reportId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, default: 'site-rsp-1', index: true },
  siteName: { type: String, required: true },
  siteCode: { type: String, required: true },
  standard: { type: String, enum: ['DGFASLI', 'OSHA', 'INTERNAL'], required: true },
  dateRange: {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  sections: [{ type: String }],
  generatedBy: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now, index: true },
  complianceScore: { type: Number, default: null },
  complianceScoreMethod: { type: String, default: 'SAFEVISION_SEVERITY_DEDUCTION' },
  totalViolations: { type: Number, default: 0 },
  criticalViolations: { type: Number, default: 0 },
  resolvedViolations: { type: Number, default: 0 },
  pdfPath: { type: String },
  fileName: { type: String },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
AuditReportSchema.index({ siteId: 1, generatedAt: -1 });

// 22. Emergency Safety Zone Schema (Phase 9.2: Emergency Exit & Escape Route Safety Monitoring)
const EmergencyZoneSchema = new Schema({
  zoneId: { type: String, required: true, unique: true, index: true },
  siteId: { type: String, required: true, index: true },
  cameraId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  zoneType: {
    type: String,
    enum: [
      'EMERGENCY_EXIT',
      'ESCAPE_ROUTE',
      'FIRE_EXTINGUISHER_ACCESS',
      'EMERGENCY_PANEL_ACCESS',
      'EVACUATION_PATH',
    ],
    required: true,
    index: true,
  },
  polygon: {
    type: [Point2DSchema],
    required: true,
    validate: {
      validator: (points: any[]) => Array.isArray(points) && points.length >= 3,
      message: 'An emergency safety area polygon must contain at least 3 points.',
    },
  },
  enabled: { type: Boolean, default: true, index: true },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
    default: 'HIGH',
    index: true,
  },
  temporalThresholdMs: { type: Number, default: 3000 },
  allowedObjectClasses: [{ type: String }],
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  createdBy: { type: String, default: 'SYSTEM' },
  updatedBy: { type: String, default: 'SYSTEM' },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
EmergencyZoneSchema.index({ cameraId: 1, enabled: 1, isDeleted: 1 });
EmergencyZoneSchema.index({ siteId: 1, isDeleted: 1 });

// Export Models
export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export const SiteModel = mongoose.models.Site || mongoose.model('Site', SiteSchema);
export const ZoneModel = mongoose.models.Zone || mongoose.model('Zone', ZoneSchema);
export const CameraModel = mongoose.models.Camera || mongoose.model('Camera', CameraSchema);
export const ShiftModel = mongoose.models.Shift || mongoose.model('Shift', ShiftSchema);
export const EmployeeModel = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
export const SafetyRuleModel = mongoose.models.SafetyRule || mongoose.model('SafetyRule', SafetyRuleSchema);
export const ModelRegistryModel = mongoose.models.ModelRegistry || mongoose.model('ModelRegistry', ModelRegistrySchema);
export const IdentityAssociationModel = mongoose.models.IdentityAssociation || mongoose.model('IdentityAssociation', IdentityAssociationSchema);
export const IncidentModel = mongoose.models.Incident || mongoose.model('Incident', IncidentSchema);
export const HazardReportModel = mongoose.models.HazardReport || mongoose.model('HazardReport', HazardReportSchema);
export const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export const ZoneSafetyPolicyModel = mongoose.models.ZoneSafetyPolicy || mongoose.model('ZoneSafetyPolicy', ZoneSafetyPolicySchema);
export const RiskConfigurationModel = mongoose.models.RiskConfiguration || mongoose.model('RiskConfiguration', RiskConfigurationSchema);
export const RiskAssessmentModel = mongoose.models.RiskAssessment || mongoose.model('RiskAssessment', RiskAssessmentSchema);
export const NearMissModel = mongoose.models.NearMiss || mongoose.model('NearMiss', NearMissSchema);
export const IncidentEventModel = mongoose.models.IncidentEvent || mongoose.model('IncidentEvent', IncidentEventSchema);
export const EscalationPolicyModel = mongoose.models.EscalationPolicy || mongoose.model('EscalationPolicy', EscalationPolicySchema);
export const RestrictedZoneModel = mongoose.models.RestrictedZone || mongoose.model('RestrictedZone', RestrictedZoneSchema);
export const AuditReportModel = mongoose.models.AuditReport || mongoose.model('AuditReport', AuditReportSchema);
export const EmergencyZoneModel = mongoose.models.EmergencyZone || mongoose.model('EmergencyZone', EmergencyZoneSchema);


