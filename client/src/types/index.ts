export type Role = 'ADMIN' | 'PLANT_MANAGER' | 'SAFETY_OFFICER' | 'SUPERVISOR' | 'EMPLOYEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  siteIds: string[];
  zoneIds: string[];
  teamIds: string[];
  workerId?: string;
  department: string;
  shift: string;
  permissions: string[];
  photoURL?: string;
  createdAt?: string;
  lastLogin?: string | null;
}

export interface AuditLog {
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
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  metadata?: Record<string, any>;
}

export interface Hazard {
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

export interface Site {
  id: string;
  name: string;
  code: string;
  location: string;
  activeShift: string;
  complianceRate: number;
  totalWorkers: number;
  camerasOnline: number;
  totalCameras: number;
}

export interface Zone {
  id: string;
  name: string;
  code: string;
  dangerLevel: 'critical' | 'high' | 'medium' | 'low';
  requiredPPE: string[];
  complianceRate: number;
  incidentCount: number;
  activeWorkers: number;
  riskWeight: number;
  status?: 'SAFE' | 'ELEVATED' | 'CRITICAL';
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

export interface RestrictedZone {
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
  // Phase 9.3: Lone Worker Configuration
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

export interface EmergencyZone {
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

export interface EmergencyZoneState {
  zoneId: string;
  cameraId: string;
  name: string;
  zoneType: EmergencyZoneType;
  state: 'CLEAR' | 'CANDIDATE_BLOCKAGE' | 'BLOCKED' | 'DISABLED' | 'CAMERA_OFFLINE' | 'AI_INFERENCE_UNAVAILABLE';
  activeTrackId?: string;
  objectClass?: string;
  durationSec: number;
  confidence?: number;
  riskLevel: string;
  lastUpdate: string;
  temporalThresholdSec: number;
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  label?: string;
  color?: string;
}

export interface Camera {
  id: string;
  name: string;
  code: string;
  zone: string;
  siteId?: string;
  streamUrl: string;
  protocol?: string;
  streamType?: string;
  status: 'LOADING' | 'LIVE' | 'PAUSED' | 'OFFLINE' | 'ERROR' | 'RECONNECTING' | 'DISABLED';
  enabled?: boolean;
  fps: number;
  resolution: string;
  latencyMs: number;
  lastSeen?: string;
  ptzEnabled: boolean;
  temperature?: number;
}

export interface Incident {
  id: string;
  incidentId: string;
  incidentType?: string;
  workerId: string;
  workerName: string;
  employeeName?: string;
  violationType:
    | 'missing_vest'
    | 'missing_helmet'
    | 'no_gloves'
    | 'no_safety_footwear'
    | 'restricted_zone'
    | 'smoke'
    | 'fire'
    | 'worker_fall'
    | 'unsafe_crowding'
    | 'emergency_route_blockage'
    | 'emergency_exit_blockage'
    | 'worker_isolated'
    | 'lone_worker'
    | (string & {});
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  boundingBox: BoundingBox;
  zone: string;
  zoneId?: string;
  zoneType?: EmergencyZoneType | string;
  cameraId: string;
  timestamp: string;
  riskScore: number;
  status: 'DETECTED' | 'ACKNOWLEDGED' | 'DISPATCHED' | 'RESOLVED' | 'FALSE_POSITIVE';
  evidenceImage: string;
  whyFlagged: string[];
  recommendedAction: string;
  stewardName?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  falsePositiveReason?: string;
  source?: 'AI' | 'MANUAL' | 'TEST_PROBE' | string;
  modelName?: string;
  modelVersion?: string;
  modelId?: string;
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
  trackId?: string;
  employeeId?: string;
  identityStatus?: 'CONFIRMED' | 'UNCONFIRMED' | 'UNAVAILABLE';
  temporalConfigUsed?: Record<string, any>;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  riskLevel?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  riskFactors?: Array<{
    type: string;
    item?: string;
    contribution: number;
    details?: string;
  }>;
  severityReason?: string;
  severityFactors?: Array<{
    factor: string;
    description: string;
    impact: string;
  }>;
  whyCreated?: string[];
  explanation?: string[];
  timeline?: IncidentTimelineEvent[];
  escalationStatus?: 'NONE' | 'PENDING' | 'ESCALATED_L1' | 'ESCALATED_L2' | 'ACKNOWLEDGED' | 'RESOLVED';
  escalationTier?: number;
  escalatedAt?: string;
  nearMissId?: string;
}

export interface IncidentTimelineEvent {
  id: string;
  eventId: string;
  incidentId: string;
  eventType: string;
  timestamp: string;
  description: string;
  actor: string;
  metadata?: Record<string, any>;
}

export interface ZoneSafetyPolicy {
  id: string;
  policyId: string;
  zoneId: string;
  siteId: string;
  zoneName: string;
  requiredPPE: string[];
  restrictedAreas?: string[];
  hazardTypes?: string[];
  severityRules?: any[];
  riskWeights?: {
    ppeWeight: number;
    hazardWeight: number;
    zoneWeight: number;
    persistenceWeight: number;
    contextualWeight: number;
  };
  enabled: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface NearMiss {
  id?: string;
  nearMissId: string;
  siteId: string;
  zoneId: string;
  cameraId: string;
  trackId?: string;
  employeeId?: string | null;
  identityStatus?: 'CONFIRMED' | 'UNCONFIRMED';
  triggerConditions: string[];
  riskScore: number;
  severity: string;
  timestamp: string;
  evidenceImage?: string;
  modelId?: string;
  ruleId?: string;
  explanation?: string[];
}

export interface NearMissSeverityItem {
  severity: string;
  count: number;
  percentage: number | null;
}

export interface NearMissTypeItem {
  type: string;
  count: number;
}

export interface NearMissZoneItem {
  zoneId: string;
  zoneName: string;
  count: number;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface NearMissCameraItem {
  cameraId: string;
  count: number;
}

export interface NearMissShiftItem {
  shift: string;
  hours: string;
  count: number;
}

export interface NearMissTimelinePoint {
  bucket: string;
  timeLabel: string;
  count: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface NearMissRecentItem {
  nearMissId: string;
  timestamp: string;
  cameraId: string;
  zoneId: string;
  zoneName: string;
  type: string;
  ruleId: string;
  severity: string;
  riskScore: number | null;
  status: string;
  resolved: boolean;
  evidence: string | null;
  hasEvidence: boolean;
  triggerConditions: string[];
  identityStatus: string;
  employeeId: string | null;
  incidentId: string | null;
  trackId?: string | null;
}

export interface NearMissAnalyticsReport {
  timeframe: string;
  totalNearMisses: number;
  previousPeriodNearMisses: number;
  changePercent: number | null;
  direction: 'increase' | 'decrease' | 'stable';
  bySeverity: NearMissSeverityItem[];
  byType: NearMissTypeItem[];
  byZone: NearMissZoneItem[];
  byCamera: NearMissCameraItem[];
  byShift: NearMissShiftItem[];
  timeline: NearMissTimelinePoint[];
  recent: NearMissRecentItem[];
  filters: {
    cameraId: string | null;
    zoneId: string | null;
    severity: string | null;
    nearMissType: string | null;
    shift: string | null;
    status: string | null;
  };
  total: number;
  nearMisses: any[];
  status: 'ACTIVE_DATA' | 'NO_DATA';
  message?: string;
}

export interface ZoneHeatmapData {
  zoneId: string;
  zoneName: string;
  status: 'ACTIVE_DATA' | 'NO DATA';
  riskScore: number | null;
  riskLevel: string;
  incidentCount: number;
  nearMissCount: number;
  activeIncidentCount: number;
  requiredPPE: string[];
  cameraStatus: string;
  lastIncidentAt?: string | null;
}

export interface SafetySummary {
  overallRiskScore: number;
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  activeCriticalCount: number;
  activeHighCount: number;
  activeNearMissCount: number;
  totalActiveIncidents: number;
  totalIncidents: number;
  zonesRequiringAttention: string[];
  timestamp: string;
}

export interface ObservedPatternsReport {
  status: 'OBSERVED PATTERNS' | 'INSUFFICIENT DATA';
  message?: string;
  patterns: string[];
  dataPoints: number;
  hourBuckets?: Record<string, number>;
  zoneCounts?: Record<string, number>;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  incidentId?: string;
  read: boolean;
  timestamp: string;
}

export interface AuditReport {
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

export interface SystemHealth {
  status?: string;
  aiEngine?: string;
  camerasConnected?: number;
  totalCameras?: number;
  dbStatus?: string;
  realtimeStatus?: string;
  lastSync?: string;
  latencyMs?: number;
  uptime?: number;
  uptimeSeconds?: number;
  components?: any;
  degradedReasons?: string[];
}

export interface IncidentTrendPoint {
  bucket: string;
  timeLabel: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  compliance: number | null;
}

export interface SeverityTrendPoint {
  bucket: string;
  timeLabel: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ViolationTrendSeries {
  timeline: Array<Record<string, any>>;
  types: Array<{
    type: string;
    count: number;
    color: string;
  }>;
}

export interface ZoneTrendSeries {
  timeline: Array<Record<string, any>>;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    totalIncidents: number;
  }>;
}

export interface CameraTrendSeries {
  timeline: Array<Record<string, any>>;
  cameras: Array<{
    cameraId: string;
    totalIncidents: number;
  }>;
}

export interface ShiftTrendPoint {
  shift: string;
  hours: string;
  count: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  compliance: number | null;
}

export interface ShiftTrendSeries {
  shifts: ShiftTrendPoint[];
  timeline: Array<{
    bucket: string;
    timeLabel: string;
    total: number;
    morning: number;
    afternoon: number;
    night: number;
  }>;
}

export interface DirectionSummary {
  currentCount: number;
  previousCount: number;
  changeCount: number;
  changePercent: number | null;
  direction: 'increase' | 'decrease' | 'stable';
  statement: string;
  timeframe: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  previousPeriodStart: string | null;
  previousPeriodEnd: string | null;
}

export interface SafetyTrendsResponse {
  timeframe: string;
  bucketUnit: 'hour' | 'day' | 'week';
  incidentTrend: IncidentTrendPoint[];
  severityTrend: SeverityTrendPoint[];
  violationTrends: ViolationTrendSeries;
  zoneTrends: ZoneTrendSeries;
  cameraTrends: CameraTrendSeries;
  shiftTrends: ShiftTrendSeries;
  directionSummary: DirectionSummary;
  filtersApplied: {
    timeframe: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  };
  totalIncidents: number;
  timestamp: string;
}

export interface ZoneComparisonTrend {
  direction: 'increase' | 'decrease' | 'stable';
  currentCount: number;
  previousCount: number;
  changeCount: number;
  changePercent: number | null;
}

export interface ZoneComparisonItem {
  zoneId: string;
  zoneName: string;
  incidentCount: number;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  cameras: string[];
  violationTypes: Array<{
    type: string;
    count: number;
  }>;
  latestIncident: string | null;
  riskScore: number | null;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA';
  trend: ZoneComparisonTrend;
}

export interface ZoneRankingItem {
  rank: number;
  zoneId: string;
  zoneName: string;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  latestIncident: string | null;
  trendDirection: 'increase' | 'decrease' | 'stable';
  changeCount: number;
}

export interface ZoneComparisonResponse {
  timeframe: string;
  zones: ZoneComparisonItem[];
  ranking: ZoneRankingItem[];
  summary: {
    totalMonitoredZones: number;
    activeZonesWithIncidents: number;
    highestIncidentZone: { zoneId: string; zoneName: string; count: number } | null;
    highestCriticalZone: { zoneId: string; zoneName: string; count: number } | null;
    worseningZonesCount: number;
    improvingZonesCount: number;
    stableZonesCount: number;
  };
  filtersApplied: {
    timeframe: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  };
  totalIncidents: number;
  timestamp: string;
}

export interface ShiftAnalysisTrend {
  currentCount: number;
  previousCount: number;
  changeCount: number;
  changePercent: number | null;
  direction: 'increase' | 'decrease' | 'stable';
}

export interface ShiftAnalysisItem {
  shift: 'Morning Shift' | 'Afternoon Shift' | 'Night Shift';
  hours: string;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  latestIncident: string | null;
  violationTypes: Array<{ type: string; count: number }>;
  zones: Array<{ zoneId: string; zoneName: string; count: number }>;
  cameras: Array<{ cameraId: string; count: number }>;
  compliance: number | null;
  exposureIndex: number | null;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA';
  trend: ShiftAnalysisTrend;
}

export interface ShiftAnalysisTimelinePoint {
  bucket: string;
  timeLabel: string;
  total: number;
  morning: number;
  afternoon: number;
  night: number;
}

export interface ShiftAnalysisResponse {
  timeframe: string;
  shifts: ShiftAnalysisItem[];
  timeline: ShiftAnalysisTimelinePoint[];
  summary: {
    highestIncidentShift: { shift: string; hours: string; incidentCount: number } | null;
    highestCriticalShift: { shift: string; hours: string; criticalCount: number } | null;
    mostWorseningShift: { shift: string; hours: string; changeCount: number } | null;
    totalShiftsMonitored: number;
  };
  filtersApplied: {
    timeframe: string;
    cameraId?: string;
    zoneId?: string;
    violationType?: string;
    severity?: string;
  };
  totalIncidents: number;
  timestamp: string;
}

export interface HeatmapCell {
  x: number;
  y: number;
  count: number;
  density: number;
  normXStart: number;
  normXEnd: number;
  normYStart: number;
  normYEnd: number;
}

export interface SpatialHotspot {
  rank: number;
  cellX: number;
  cellY: number;
  label: string;
  count: number;
  density: number;
}

export interface HeatmapTrend {
  currentCount: number;
  previousCount: number;
  changeCount: number;
  changePercent: number | null;
  direction: 'increase' | 'decrease' | 'stable';
  statement: string;
}

export interface ZoneSpatialContext {
  zoneId: string;
  zoneName: string;
  totalCount: number;
  spatialCount: number;
}

export interface SafetyHeatmapResponse {
  timeframe: string;
  grid: {
    rows: number;
    columns: number;
  };
  cells: HeatmapCell[];
  totalIncidentCount: number;
  spatialIncidentCount: number;
  excludedIncidentCount: number;
  maxCellCount: number;
  cameraId: string;
  topHotspots: SpatialHotspot[];
  trend: HeatmapTrend;
  zoneContext: ZoneSpatialContext[];
  filters: {
    cameraId: string | null;
    zoneId: string | null;
    severity: string | null;
    violationType: string | null;
    shift: string | null;
  };
  totalPoints: number;
  points: Array<{
    incidentId?: string;
    cameraId: string;
    zoneId: string;
    zone?: string;
    x: number;
    y: number;
    severity: string;
    violationType: string;
    timestamp: Date | string;
  }>;
}

export interface HeatmapFilterParams {
  timeframe?: string;
  cameraId?: string;
  zoneId?: string;
  severity?: string;
  violationType?: string;
  shift?: string;
  limit?: number;
}

// Phase 11: Smart Incident Response Types
export type ResponseState = 'UNASSIGNED' | 'ROUTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';

export type ResponderState =
  | 'NO_FIRST_RESPONDER_CONFIGURED'
  | 'RESPONDER_IDENTIFIED'
  | 'RESPONDER_ASSIGNED'
  | 'RESPONDER_ACKNOWLEDGED';

export interface RoutingRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

export interface RoutingDecision {
  severity: string;
  targetRoles: string[];
  targetRole?: string;
  targetUsers: RoutingRecipient[];
  recipient?: RoutingRecipient | null;
  recipients?: RoutingRecipient[];
  status: 'ROUTED' | 'NO_RECIPIENT_CONFIGURED' | 'ROUTING_ERROR';
  deliveryStatus?: 'DELIVERY_PENDING' | 'NOT_CONFIGURED' | 'DELIVERED';
  channel?: string;
  channelStatus?: 'ACTIVE' | 'NOT_CONFIGURED';
  routingReason: string;
  reason?: string;
  ruleMatched?: string;
  policyId?: string;
  siteId: string;
  zoneId: string;
  evaluatedAt: string;
}

export interface FirstResponderResolution {
  incidentId?: string;
  state: ResponderState;
  status?: ResponderState;
  assignmentStatus?: string;
  responder: {
    responderId?: string;
    userId?: string;
    name: string;
    role: string;
    department?: string;
    email?: string;
    assignedAt?: string;
    assignedBy?: string;
    acknowledgedAt?: string;
    state?: ResponderState;
    assignmentSource?: 'AUTOMATIC_POLICY' | 'MANUAL_OPERATOR';
  } | null;
  eligibleResponders?: {
    userId: string;
    name: string;
    role: string;
    department: string;
    email: string;
  }[];
  message: string;
  explanation?: string;
}

export interface IncidentLocationSummary {
  siteId: string;
  zoneId: string;
  zone: string;
  cameraId: string;
}

export interface IncidentSubjectSummary {
  workerId: string | null;
  workerName: string | null;
  personId: string | null;
  identityStatus: string;
  isResolved: boolean;
  displayLabel: string;
}

export interface IncidentDetectionSummary {
  missingPPE: string[];
  bbox: any | null;
  confidence: number | null;
}

export interface IncidentResponseSummary {
  incidentId: string;
  headline?: string;
  timestamp: string;
  occurredAt?: string;
  severity: string;
  violationType: string;
  incidentType: string;
  siteId: string;
  zone: string;
  zoneId: string;
  cameraId: string;
  workerId: string;
  workerName: string;
  worker?: string | null;
  employeeId: string | null;
  missingPPE: string[];
  riskScore: number;
  riskLevel: string;
  responseState: ResponseState;
  assignedResponder: FirstResponderResolution['responder'];
  responderState: ResponderState;
  evidenceAvailable: boolean;
  replayAvailable: boolean;
  relatedNearMissId: string | null;
  hazardReportId?: string | null;
  escalationStatus: string;
  escalationTier: number;
  notes?: string;
  stewardName?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  factualDescription: string;
  factualSummary?: string;
  location?: IncidentLocationSummary;
  subject?: IncidentSubjectSummary;
  detection?: IncidentDetectionSummary;
  response?: any;
  evidence?: any;
  timeline?: any[];
  dataAvailability?: any;
}

export interface IncidentReplaySource {
  type: string | null;
  cameraId: string | null;
  zoneId: string | null;
  zone: string | null;
}

export interface IncidentReplayEvidence {
  reference: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export interface IncidentReplayPlayback {
  playable: boolean;
  url: string | null;
  mode: 'VIDEO' | 'SNAPSHOT' | 'NONE';
}

export interface IncidentReplayIntegrity {
  verified: boolean;
  hash: string | null;
}

export interface ReplayDetails {
  incidentId: string;
  available?: boolean;
  replayAvailable: boolean;
  evidenceType: 'VIDEO' | 'SNAPSHOT' | 'NONE';
  hasReplayVideo?: boolean;
  source?: IncidentReplaySource;
  incidentTimestamp?: string | null;
  evidence?: IncidentReplayEvidence;
  playback?: IncidentReplayPlayback;
  integrity?: IncidentReplayIntegrity;
  message: string;
  replayNote?: string;
  videoUrl: string | null;
  snapshotUrl: string | null;
  evidenceSnapshot?: string | null;
  capturedAt: string | null;
  sha256: string | null;
  camera?: string;
  timestamp?: string;
}

export type IncidentReplayResponse = ReplayDetails;

export interface IncidentResponseBundle {
  incident: Incident;
  summary: IncidentResponseSummary;
  routingDecision: RoutingDecision;
  firstResponder: FirstResponderResolution;
  timeline: any[];
  replay: ReplayDetails;
}

export interface IncidentQueueResponse {
  total: number;
  incidents: Array<Incident & { responseState?: ResponseState }>;
}

// Phase 11.4: Evidence Timeline Types
export interface TimelineActor {
  id: string | null;
  name: string | null;
  role: string | null;
  type: 'USER' | 'SYSTEM' | 'AI' | 'UNKNOWN';
}

export interface TimelineSource {
  type: string | null;
  cameraId: string | null;
  zoneId: string | null;
  zone: string | null;
}

export interface TimelineEvidence {
  available: boolean;
  type: 'SNAPSHOT' | 'VIDEO' | 'NONE';
  reference: string | null;
}

export interface IncidentEvidenceTimelineEntry {
  id?: string;
  eventId: string | null;
  incidentId: string;
  eventType: string;
  timestamp: string;
  actor: TimelineActor;
  actorName?: string;
  source: TimelineSource;
  description: string;
  evidence: TimelineEvidence;
  incidentEvidence?: TimelineEvidence;
  metadata?: Record<string, unknown>;
}

export interface IncidentEvidenceTimelineReport {
  incidentId: string;
  timeline: IncidentEvidenceTimelineEntry[];
  totalEvents: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  evidenceEventCount: number;
  hasEvidence: boolean;
  incidentEvidence: TimelineEvidence;
  message: string | null;
}
