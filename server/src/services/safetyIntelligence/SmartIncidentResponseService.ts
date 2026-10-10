import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { DataStore, IncidentDoc, UserDoc } from '../../models/DataStore';
import { IncidentModel, IncidentEventModel, UserModel, NearMissModel } from '../../models/mongooseModels';
import { SocketService } from '../socket/SocketService';
import { AuditLogger } from '../../security/AuditLogger';
import { IncidentTimelineService } from './IncidentTimelineService';
import { EscalationService } from './EscalationService';

const EVIDENCE_DIR = path.resolve(__dirname, '../../../evidence');

export type ResponseState = 'UNASSIGNED' | 'ROUTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';

export type ResponderState =
  | 'NO_FIRST_RESPONDER_CONFIGURED'
  | 'RESPONDER_IDENTIFIED'
  | 'RESPONDER_ASSIGNED'
  | 'RESPONDER_ACKNOWLEDGED';

export interface RoutingRecipient {
  id: string;
  userId?: string;
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
  urgency?: string;
  channel?: string;
  channelStatus?: 'ACTIVE' | 'NOT_CONFIGURED';
  deliveryStatus?: 'DELIVERY_PENDING' | 'NOT_CONFIGURED' | 'DELIVERED';
  reason?: string;
  routingReason: string;
  status: 'ROUTED' | 'NO_RECIPIENT_CONFIGURED' | 'ROUTING_ERROR';
  siteId: string;
  zoneId: string;
  evaluatedAt: string;
  calculatedAt?: string;
  ruleMatched?: string;
  policyId?: string;
}

export interface FirstResponderResolution {
  incidentId?: string;
  state: ResponderState;
  status?: ResponderState;
  assignmentStatus?: string;
  responder: {
    responderId: string;
    name: string;
    role: string;
    department: string;
    email: string;
    assignedAt?: string;
    assignedBy?: string;
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

export interface IncidentResponseDetailsSummary {
  responseState: ResponseState;
  status: string;
  routedRecipient: RoutingRecipient | null;
  targetRoles: string[];
  routingPolicy: string | null;
  routingReason: string | null;
  deliveryStatus: string;
  assignedResponder: FirstResponderResolution['responder'];
  responderState: ResponderState;
  escalationStatus: string;
  escalationTier: number;
}

export interface IncidentEvidenceSummary {
  available: boolean;
  type: 'VIDEO' | 'SNAPSHOT' | 'NONE';
  reference: string | null;
  replayAvailable: boolean;
  failureReason: string | null;
  message: string;
}

export interface IncidentDataAvailability {
  workerResolved: boolean;
  ppeRecorded: boolean;
  evidenceAvailable: boolean;
  replayAvailable: boolean;
  routingConfigured: boolean;
  nearMissLinked: boolean;
  hazardReportLinked: boolean;
  timelineEventsCount: number;
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
  eventId: string | null;
  incidentId: string;
  eventType: string;
  timestamp: string;
  actor: TimelineActor;
  actorName: string;
  source: TimelineSource;
  description: string;
  evidence: TimelineEvidence;
  incidentEvidence: TimelineEvidence;
  metadata: Record<string, unknown>;
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

export interface IncidentSummary {
  incidentId: string;
  headline: string;
  timestamp: string;
  occurredAt: string;
  severity: string;
  violationType: string;
  incidentType: string;
  siteId: string;
  zone: string;
  zoneId: string;
  cameraId: string;
  camera?: string;
  workerId: string;
  workerName: string;
  worker?: string | null;
  employeeId: string | null;
  missingPPE: string[];
  riskScore: number;
  riskLevel: string;
  responseState: ResponseState;
  responseStatus?: ResponseState;
  assignedResponder: FirstResponderResolution['responder'];
  responderState: ResponderState;
  evidenceAvailable: boolean;
  replayAvailable: boolean;
  relatedNearMissId: string | null;
  relatedNearMiss?: any;
  hazardReportId?: string | null;
  relatedHazardReport?: any;
  escalationStatus: string;
  escalationTier: number;
  notes?: string;
  stewardName?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  factualDescription: string;
  factualSummary: string;
  location: IncidentLocationSummary;
  subject: IncidentSubjectSummary;
  detection: IncidentDetectionSummary;
  response: IncidentResponseDetailsSummary;
  evidence: IncidentEvidenceSummary;
  timeline: any[];
  dataAvailability: IncidentDataAvailability;
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
  available: boolean;
  evidenceType: 'VIDEO' | 'SNAPSHOT' | 'NONE';
  replayAvailable: boolean;
  hasReplayVideo?: boolean;
  source: IncidentReplaySource;
  incidentTimestamp: string | null;
  evidence: IncidentReplayEvidence;
  playback: IncidentReplayPlayback;
  message: string;
  replayNote?: string;
  integrity: IncidentReplayIntegrity;
  videoUrl: string | null;
  snapshotUrl: string | null;
  evidenceSnapshot?: string | null;
  capturedAt: string | null;
  sha256: string | null;
  camera?: string;
  timestamp?: string;
}

export class SmartIncidentResponseService {
  private static instance: SmartIncidentResponseService;
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();
  private timelineService = IncidentTimelineService.getInstance();
  private escalationService = EscalationService.getInstance();

  private constructor() {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      try {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      } catch (_) {}
    }
  }

  public static getInstance(): SmartIncidentResponseService {
    if (!SmartIncidentResponseService.instance) {
      SmartIncidentResponseService.instance = new SmartIncidentResponseService();
    }
    return SmartIncidentResponseService.instance;
  }

  /**
   * Helper to check if a user is authorized for a specific zone scope.
   */
  private isUserInZoneScope(user: UserDoc, zoneNameOrCode: string): boolean {
    if (user.role === 'ADMIN' || user.role === 'PLANT_MANAGER') return true;
    if (!user.zoneIds || user.zoneIds.length === 0) return false;
    if (user.zoneIds.includes('*')) return true;

    const target = (zoneNameOrCode || '').toLowerCase().trim();
    if (!target) return true;

    // Check direct matching against code or name
    const directMatch = user.zoneIds.some((zid) => zid.toLowerCase().trim() === target);
    if (directMatch) return true;

    // Check against configured zone dictionary
    const matchedZone = this.store.zones.find(
      (z) => z.name.toLowerCase() === target || z.code.toLowerCase() === target
    );
    if (matchedZone) {
      return user.zoneIds.some(
        (zid) =>
          zid.toLowerCase() === matchedZone.code.toLowerCase() ||
          zid.toLowerCase() === matchedZone.name.toLowerCase()
      );
    }
    return false;
  }

  /**
   * Helper to resolve an incident by id (incidentId or MongoDB _id) from MongoDB or in-memory DataStore.
   */
  public async getIncident(incidentIdOrKey: string): Promise<any | null> {
    const key = String(incidentIdOrKey || '').trim();
    if (!key) return null;

    // 1. Check MongoDB first for authoritative persisted state
    if (mongoose.connection.readyState === 1) {
      try {
        const queryOr: any[] = [{ incidentId: key }, { incidentId: new RegExp(`^${key}$`, 'i') }];
        if (mongoose.isValidObjectId(key)) {
          queryOr.push({ _id: key });
        }
        const dbDoc = await IncidentModel.findOne({ $or: queryOr }).lean();
        if (dbDoc) {
          const docObj: any = { ...dbDoc, id: (dbDoc as any).incidentId || (dbDoc as any)._id.toString() };
          // Harmonize responseState if legacy
          if (!docObj.responseState) {
            if (docObj.status === 'RESOLVED') docObj.responseState = 'RESOLVED';
            else if (docObj.status === 'DISPATCHED') docObj.responseState = 'IN_PROGRESS';
            else if (docObj.status === 'ACKNOWLEDGED') docObj.responseState = 'ACKNOWLEDGED';
            else if (docObj.routingDecision) docObj.responseState = 'ROUTED';
            else docObj.responseState = 'UNASSIGNED';
          }
          return docObj;
        }
      } catch (err) {
        console.warn('[SmartIncidentResponseService] Mongo query error:', err);
      }
    }

    // 2. Check in-memory DataStore fallback
    const memInc = this.store.incidents.find(
      (i) => i.incidentId.toLowerCase() === key.toLowerCase() || i.id.toLowerCase() === key.toLowerCase()
    );
    if (memInc) {
      if (!memInc.responseState) {
        if (memInc.status === 'RESOLVED') memInc.responseState = 'RESOLVED';
        else if (memInc.status === 'DISPATCHED') memInc.responseState = 'IN_PROGRESS';
        else if (memInc.status === 'ACKNOWLEDGED') memInc.responseState = 'ACKNOWLEDGED';
        else if (memInc.routingDecision) memInc.responseState = 'ROUTED';
        else memInc.responseState = 'UNASSIGNED';
      }
      return memInc;
    }

    return null;
  }

  /**
   * Deterministically evaluates routing policy based strictly on persisted incident information.
   * NO FAKE RECIPIENTS: If no real user matches, returns NO_RECIPIENT_CONFIGURED.
   */
  public async evaluateRoutingPolicy(incident: any): Promise<RoutingDecision> {
    const sev = (incident.severity || 'medium').toLowerCase();
    const zone = incident.zone || incident.zoneId || 'Unspecified Zone';
    const siteId = incident.siteId || (incident as any).site || 'site-rsp-1';
    const camera = incident.cameraId || (incident as any).camera || 'CAM-Unknown';
    const violation = incident.violationType || 'safety_violation';

    // 1. Severity-based Target Roles Mapping (Phase 11 Policy)
    let targetRoles: string[] = [];
    if (sev === 'critical') {
      targetRoles = ['SAFETY_OFFICER', 'PLANT_MANAGER', 'ADMIN'];
    } else if (sev === 'high') {
      targetRoles = ['SUPERVISOR', 'SAFETY_OFFICER'];
    } else if (sev === 'medium') {
      targetRoles = ['SUPERVISOR'];
    } else if (sev === 'low') {
      targetRoles = ['SUPERVISOR'];
    } else if (sev === 'info') {
      targetRoles = ['SAFETY_OFFICER'];
    } else {
      targetRoles = ['SAFETY_OFFICER'];
    }

    // 2. Query configured users strictly from application's real user directory
    const candidates: UserDoc[] = [];

    // From DataStore.users
    for (const u of this.store.users) {
      if (u.status !== 'ACTIVE') continue;
      if (!targetRoles.includes(u.role)) continue;

      // Site check: '*' or matching siteId
      const userSites = (u.siteIds || []).map((s: string) => s.toLowerCase().trim());
      const targetSite = (siteId || '').toLowerCase().trim();
      const siteMatch = userSites.includes('*') || (targetSite !== '' && userSites.includes(targetSite));
      if (!siteMatch) continue;

      // Zone check
      const zoneMatch = this.isUserInZoneScope(u, zone);
      if (!zoneMatch) continue;

      if (!candidates.some((existing) => existing.id === u.id || existing.email === u.email)) {
        candidates.push(u);
      }
    }

    // Also check MongoDB users if ready
    if (mongoose.connection.readyState === 1) {
      try {
        const dbUsers = await UserModel.find({
          role: { $in: targetRoles },
          status: 'ACTIVE',
        }).lean();

        for (const dbu of dbUsers) {
          const typedU = dbu as any;
          const userSites = ((typedU.siteIds || []) as string[]).map((s: string) => s.toLowerCase().trim());
          const targetSite = (siteId || '').toLowerCase().trim();
          const siteMatch = userSites.includes('*') || (targetSite !== '' && userSites.includes(targetSite));
          if (!siteMatch) continue;

          const zoneMatch = this.isUserInZoneScope(typedU, zone);
          if (!zoneMatch) continue;

          if (!candidates.some((existing) => existing.email === typedU.email)) {
            candidates.push({
              id: typedU._id.toString(),
              name: typedU.name,
              email: typedU.email,
              role: typedU.role,
              status: typedU.status,
              siteIds: typedU.siteIds || [],
              zoneIds: typedU.zoneIds || [],
              teamIds: [],
              department: typedU.department || 'Operations',
              shift: 'Shift A',
              permissions: [],
              createdAt: typedU.createdAt?.toISOString() || new Date().toISOString(),
              updatedAt: typedU.updatedAt?.toISOString() || new Date().toISOString(),
              lastLogin: null,
            });
          }
        }
      } catch (_) {}
    }

    // Deterministic Candidate Sorting: Priority role order first, then alphabetical by name/id
    candidates.sort((a, b) => {
      const roleIdxA = targetRoles.indexOf(a.role);
      const roleIdxB = targetRoles.indexOf(b.role);
      if (roleIdxA !== roleIdxB) {
        return (roleIdxA === -1 ? 99 : roleIdxA) - (roleIdxB === -1 ? 99 : roleIdxB);
      }
      const nameCmp = (a.name || a.email).localeCompare(b.name || b.email);
      if (nameCmp !== 0) return nameCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    const targetUsers: RoutingRecipient[] = candidates.map((u) => ({
      id: u.id,
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department || 'Operations',
    }));

    // 3. Factual, Auditable Routing Reason
    let specificDetail = '';
    const vLower = violation.toLowerCase();
    const isEmergency = vLower.includes('emergency') || vLower.includes('blockage') || vLower.includes('exit');
    if (isEmergency) {
      specificDetail = ' + emergency escape corridor obstruction';
    } else if (vLower.includes('lone') || vLower.includes('isolated')) {
      specificDetail = ' + isolated lone-worker condition';
    } else if (vLower.includes('fall')) {
      specificDetail = ' + worker fall detected';
    } else if (vLower.includes('fire') || vLower.includes('smoke')) {
      specificDetail = ' + thermal/smoke hazard';
    }

    const rulePolicyId = `POLICY-${sev.toUpperCase()}-${violation.toUpperCase()}`;

    let routingReason = '';
    let status: 'ROUTED' | 'NO_RECIPIENT_CONFIGURED' = 'NO_RECIPIENT_CONFIGURED';
    let deliveryStatus: 'DELIVERY_PENDING' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
    let channel = 'IN_APP';
    let channelStatus: 'ACTIVE' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';

    if (targetUsers.length > 0) {
      status = 'ROUTED';
      deliveryStatus = 'DELIVERY_PENDING';
      channel = sev === 'critical' ? 'IN_APP_PUSH' : 'IN_APP';
      channelStatus = 'ACTIVE';
      routingReason = `${sev.toUpperCase()} severity safety incident (${violation.replace(/_/g, ' ')}${specificDetail}) detected in ${zone} on ${camera} routed to ${targetRoles.join(', ')}.`;
    } else {
      status = 'NO_RECIPIENT_CONFIGURED';
      deliveryStatus = 'NOT_CONFIGURED';
      channel = 'NONE';
      channelStatus = 'NOT_CONFIGURED';
      routingReason = `${sev.toUpperCase()} severity safety incident (${violation.replace(/_/g, ' ')}${specificDetail}) detected in ${zone} on ${camera}: No active recipient configured for roles [${targetRoles.join(', ')}] in site '${siteId}' and zone '${zone}'.`;
    }

    const urgency = sev === 'critical' ? 'IMMEDIATE' : sev === 'high' ? 'HIGH' : sev === 'medium' ? 'NORMAL' : 'LOW';

    const primaryRecipient = targetUsers.length > 0 ? targetUsers[0] : null;

    return {
      severity: sev,
      targetRoles,
      targetRole: targetRoles[0],
      targetUsers,
      recipient: primaryRecipient,
      recipients: targetUsers,
      urgency,
      channel,
      channelStatus,
      deliveryStatus,
      reason: routingReason,
      routingReason,
      status,
      siteId,
      zoneId: incident.zoneId || zone,
      evaluatedAt: new Date().toISOString(),
      calculatedAt: new Date().toISOString(),
      ruleMatched: rulePolicyId,
      policyId: rulePolicyId,
    };
  }

  /**
   * Returns deterministic list of real, active, authorized first responder candidates
   * filtered strictly by incident severity routing policy, site scope, and zone scope.
   */
  public async getEligibleFirstResponders(incident: any): Promise<UserDoc[]> {
    const sev = (incident.severity || 'medium').toLowerCase();
    const zone = incident.zone || incident.zoneId || '';
    const siteId = incident.siteId || (incident as any).site || 'site-rsp-1';

    // 1. Severity-based Target Roles Mapping (Phase 11.2 policy)
    let targetRoles: string[] = [];
    if (sev === 'critical') {
      targetRoles = ['SAFETY_OFFICER', 'PLANT_MANAGER', 'ADMIN'];
    } else if (sev === 'high') {
      targetRoles = ['SUPERVISOR', 'SAFETY_OFFICER'];
    } else if (sev === 'medium') {
      targetRoles = ['SUPERVISOR'];
    } else if (sev === 'low') {
      targetRoles = ['SUPERVISOR'];
    } else if (sev === 'info') {
      targetRoles = ['SAFETY_OFFICER'];
    } else {
      targetRoles = ['SUPERVISOR', 'SAFETY_OFFICER'];
    }

    const candidates: UserDoc[] = [];

    // Check DataStore in-memory users
    for (const u of this.store.users) {
      if (u.status !== 'ACTIVE') continue;
      if (u.role === 'EMPLOYEE') continue;
      if (!targetRoles.includes(u.role)) continue;

      // Site scope
      const userSites = (u.siteIds || []).map((s: string) => s.toLowerCase().trim());
      const targetSite = (siteId || '').toLowerCase().trim();
      const siteMatch = userSites.includes('*') || (targetSite !== '' && userSites.includes(targetSite));
      if (!siteMatch) continue;

      // Zone scope
      if (!this.isUserInZoneScope(u, zone)) continue;

      if (!candidates.some((existing) => existing.id === u.id || existing.email === u.email)) {
        candidates.push(u);
      }
    }

    // Check MongoDB users if ready
    if (mongoose.connection.readyState === 1) {
      try {
        const dbUsers = await UserModel.find({
          role: { $in: targetRoles },
          status: 'ACTIVE',
        }).lean();

        for (const dbu of dbUsers) {
          const typedU = dbu as any;
          if (typedU.role === 'EMPLOYEE') continue;

          const userSites = ((typedU.siteIds || []) as string[]).map((s: string) => s.toLowerCase().trim());
          const targetSite = (siteId || '').toLowerCase().trim();
          const siteMatch = userSites.includes('*') || (targetSite !== '' && userSites.includes(targetSite));
          if (!siteMatch) continue;

          if (!this.isUserInZoneScope(typedU, zone)) continue;

          if (!candidates.some((existing) => existing.email === typedU.email || existing.id === typedU._id.toString())) {
            candidates.push({
              id: typedU._id.toString(),
              name: typedU.name,
              email: typedU.email,
              role: typedU.role,
              status: typedU.status,
              siteIds: typedU.siteIds || [],
              zoneIds: typedU.zoneIds || [],
              teamIds: [],
              department: typedU.department || 'Operations',
              shift: 'Shift A',
              permissions: [],
              createdAt: typedU.createdAt?.toISOString() || new Date().toISOString(),
              updatedAt: typedU.updatedAt?.toISOString() || new Date().toISOString(),
              lastLogin: null,
            });
          }
        }
      } catch (_) {}
    }

    // Deterministic Candidate Sorting:
    // 1. Role priority order (per targetRoles)
    // 2. Stable alphabetical tie-breaker by user name
    // 3. Stable user ID tie-breaker
    candidates.sort((a, b) => {
      const roleIdxA = targetRoles.indexOf(a.role);
      const roleIdxB = targetRoles.indexOf(b.role);
      if (roleIdxA !== roleIdxB) {
        return (roleIdxA === -1 ? 99 : roleIdxA) - (roleIdxB === -1 ? 99 : roleIdxB);
      }
      const nameCmp = (a.name || a.email).localeCompare(b.name || b.email);
      if (nameCmp !== 0) return nameCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    return candidates;
  }

  /**
   * Resolves first responder status with 4 distinct states.
   * NO FAKE RESPONDERS: Returns NO_FIRST_RESPONDER_CONFIGURED when none found.
   */
  public async resolveFirstResponder(incident: any): Promise<FirstResponderResolution> {
    const incId = incident.incidentId || incident.id || '';
    const sev = (incident.severity || 'medium').toUpperCase();

    // 1. Already formally acknowledged responder
    if (incident.assignedResponder && (incident.assignedResponder.state === 'RESPONDER_ACKNOWLEDGED' || incident.responseState === 'ACKNOWLEDGED')) {
      const resp = {
        ...incident.assignedResponder,
        state: 'RESPONDER_ACKNOWLEDGED' as ResponderState,
      };
      return {
        incidentId: incId,
        state: 'RESPONDER_ACKNOWLEDGED',
        status: 'RESPONDER_ACKNOWLEDGED',
        assignmentStatus: 'ACKNOWLEDGED',
        responder: resp,
        message: `Responder ${resp.name} acknowledged incident.`,
        explanation: `${resp.role} ${resp.name} acknowledged assignment and verified incident.`,
      };
    }

    // 2. Formally assigned responder
    if (
      incident.assignedResponder &&
      (incident.assignedResponder.state === 'RESPONDER_ASSIGNED' || incident.assignedResponder.responderId)
    ) {
      const resp = {
        ...incident.assignedResponder,
        state: 'RESPONDER_ASSIGNED' as ResponderState,
      };
      return {
        incidentId: incId,
        state: 'RESPONDER_ASSIGNED',
        status: 'RESPONDER_ASSIGNED',
        assignmentStatus: 'ASSIGNED',
        responder: resp,
        message: `Responder ${resp.name} assigned to incident.`,
        explanation: `${resp.role} ${resp.name} assigned to lead response. Acknowledgment pending.`,
      };
    }

    // 3. Resolve eligible candidates using deterministic severity routing policy & scopes
    const candidates = await this.getEligibleFirstResponders(incident);

    if (candidates.length > 0) {
      const candidateUser = candidates[0];
      const eligibleSummary = candidates.map((u) => ({
        userId: u.id,
        name: u.name,
        role: u.role,
        department: u.department || 'Operations',
        email: u.email,
      }));

      return {
        incidentId: incId,
        state: 'RESPONDER_IDENTIFIED',
        status: 'RESPONDER_IDENTIFIED',
        assignmentStatus: 'IDENTIFIED',
        responder: {
          responderId: candidateUser.id,
          name: candidateUser.name,
          role: candidateUser.role,
          department: candidateUser.department || 'Operations',
          email: candidateUser.email,
          state: 'RESPONDER_IDENTIFIED',
        },
        eligibleResponders: eligibleSummary,
        message: `Designated first responder candidate identified: ${candidateUser.name} (${candidateUser.role}). Assignment pending acknowledgment.`,
        explanation: `${candidateUser.role} selected because the incident is ${sev} severity and this user is active and authorized for the incident site/zone.`,
      };
    }

    return {
      incidentId: incId,
      state: 'NO_FIRST_RESPONDER_CONFIGURED',
      status: 'NO_FIRST_RESPONDER_CONFIGURED',
      assignmentStatus: 'NOT_CONFIGURED',
      responder: null,
      eligibleResponders: [],
      message: 'No first responder configured for this zone or site.',
      explanation: `No eligible responder found because no active authorized responder matches the incident's site/zone policy for ${sev} severity.`,
    };
  }

  private formatViolationLabel(violationType?: string, incidentType?: string): string {
    const v = String(violationType || incidentType || 'safety violation').toLowerCase().trim();
    if (v.includes('lone') || v.includes('isolated')) return 'lone-worker incident';
    if (v.includes('helmet') || v.includes('hard_hat') || v.includes('hardhat')) return 'missing-helmet incident';
    if (v.includes('vest') || v.includes('jacket')) return 'missing-vest incident';
    if (v.includes('glove')) return 'missing-gloves incident';
    if (v.includes('shoe') || v.includes('boot') || v.includes('footwear')) return 'missing-protective-footwear incident';
    if (v.includes('restricted') || v.includes('breach') || v.includes('zone_entry') || v.includes('geofence')) return 'restricted-zone breach';
    if (v.includes('emergency') || v.includes('corridor') || v.includes('blockage') || v.includes('exit')) return 'emergency corridor obstruction';
    if (v.includes('fall')) return 'fall hazard incident';
    if (v.includes('fire') || v.includes('smoke') || v.includes('thermal')) return 'thermal hazard incident';
    return `${v.replace(/_/g, '-')} incident`;
  }

  private generateHeadline(inc: any): string {
    const sev = (inc.severity || 'UNKNOWN').toUpperCase();
    const violationLabel = this.formatViolationLabel(inc.violationType, inc.incidentType);
    const zone = inc.zone || inc.zoneId || '';
    const cam = inc.cameraId || (inc as any).camera || '';

    let locationSuffix = '';
    if (zone && zone !== 'Unassigned' && zone.toLowerCase() !== 'zone information unavailable.') {
      locationSuffix = ` in ${zone}`;
    } else if (cam && cam !== 'Unknown' && cam.toLowerCase() !== 'camera information unavailable.') {
      locationSuffix = ` on ${cam}`;
    }

    return `${sev} ${violationLabel} recorded${locationSuffix}`;
  }

  private generateFactualSummary(
    inc: any,
    missingPPE: string[],
    routingDecision: RoutingDecision,
    replayInfo: ReplayDetails,
    workerId: string | null,
    workerName: string | null,
    personId: string | null
  ): string {
    const parts: string[] = [];
    const sevUpper = (inc.severity || 'UNKNOWN').toUpperCase();
    const vType = String(inc.violationType || inc.incidentType || 'safety violation').replace(/_/g, '-');
    const zoneStr = inc.zone || inc.zoneId || 'Unassigned Zone';
    const camStr = inc.cameraId || (inc as any).camera || 'CAM-Unknown';
    const tsStr = inc.timestamp ? new Date(inc.timestamp).toISOString() : new Date().toISOString();

    // Sentence 1: Core incident statement
    parts.push(`A ${sevUpper}-severity ${vType} incident was recorded in ${zoneStr} on ${camStr}. The incident timestamp is ${tsStr}.`);

    // Sentence 2: Missing PPE
    const isPpeViolation = (inc.violationType || '').toLowerCase().includes('ppe') ||
      ['helmet', 'vest', 'glove', 'shoe', 'mask', 'boot'].some((k) => (inc.violationType || '').toLowerCase().includes(k));
    if (missingPPE.length > 0) {
      parts.push(`Missing PPE recorded: ${missingPPE.join(', ')}.`);
    } else if (isPpeViolation) {
      parts.push('PPE violation recorded; specific equipment items not itemized.');
    } else {
      parts.push('PPE information not recorded.');
    }

    // Sentence 3: Worker identity
    if (workerName && workerName !== 'Unidentified Worker') {
      if (workerId && workerId !== 'UNIDENTIFIED') {
        parts.push(`Worker: ${workerName} (${workerId}).`);
      } else {
        parts.push(`Worker: ${workerName}.`);
      }
    } else if (workerId && workerId !== 'UNIDENTIFIED') {
      parts.push(`Worker ID: ${workerId}.`);
    } else if (personId) {
      parts.push(`Person identity not resolved (Track ID: ${personId}).`);
    } else {
      parts.push('Worker identity not available in incident record.');
    }

    // Sentence 4: Response State & Routing
    const resState = inc.responseState || 'UNASSIGNED';
    parts.push(`Current response state: ${resState}.`);

    if (routingDecision.status === 'ROUTED') {
      const delStatus = routingDecision.deliveryStatus || 'DELIVERY_PENDING';
      parts.push(`Delivery status: ${delStatus}.`);
    } else {
      parts.push('Response recipient not configured.');
    }

    // Sentence 5: Evidence
    if (replayInfo.evidenceType === 'VIDEO') {
      parts.push('Snapshot evidence and video replay available.');
    } else if (replayInfo.evidenceType === 'SNAPSHOT') {
      parts.push('Snapshot evidence available; replay video unavailable.');
    } else {
      parts.push('Evidence snapshot not available; replay video unavailable.');
    }

    return parts.join(' ');
  }

  /**
   * Generates a completely factual incident summary derived solely from persisted records.
   */
  public async getIncidentSummary(incidentId: string): Promise<IncidentSummary | null> {
    const inc = await this.getIncident(incidentId);
    if (!inc) return null;

    // Check evidence files
    const replayInfo = await this.getReplayDetails(incidentId);
    const firstResp = await this.resolveFirstResponder(inc);
    const routingDecision = await this.evaluateRoutingPolicy(inc);
    const timelineEvents = await this.getEvidenceTimeline(inc.incidentId);

    // Extract factual missing PPE if present
    let missingPPE: string[] = [];
    if (Array.isArray(inc.missingPPE) && inc.missingPPE.length > 0) {
      missingPPE = [...inc.missingPPE];
    } else {
      const vLower = (inc.violationType || '').toLowerCase();
      if (vLower.includes('vest') || vLower.includes('jacket')) missingPPE.push('safety_vest');
      if (vLower.includes('helmet') || vLower.includes('hard_hat') || vLower.includes('hardhat')) missingPPE.push('helmet');
      if (vLower.includes('glove')) missingPPE.push('gloves');
      if (vLower.includes('footwear') || vLower.includes('shoe') || vLower.includes('boot')) missingPPE.push('safety_shoes');
      if (vLower.includes('mask') || vLower.includes('face_guard')) missingPPE.push('face_mask');
      if (vLower.includes('ear') || vLower.includes('muff')) missingPPE.push('ear_protection');
    }

    const zoneStr = inc.zone || inc.zoneId || 'Unassigned';
    const cameraStr = inc.cameraId || (inc as any).camera || 'Unknown';
    const workerNameStr = inc.workerName || inc.employeeName || null;
    const workerIdStr = (inc.workerId && inc.workerId !== 'UNIDENTIFIED') ? inc.workerId : (inc.employeeId || null);
    const personIdStr = inc.trackId || (inc as any).personId || null;
    const isWorkerResolved = Boolean((workerIdStr && workerIdStr !== 'UNIDENTIFIED') || (workerNameStr && workerNameStr !== 'Unidentified Worker'));

    const headline = this.generateHeadline(inc);
    const factualSummary = this.generateFactualSummary(
      inc,
      missingPPE,
      routingDecision,
      replayInfo,
      workerIdStr,
      workerNameStr,
      personIdStr
    );

    const location: IncidentLocationSummary = {
      siteId: inc.siteId || 'site-rsp-1',
      zoneId: inc.zoneId || (inc.zone ? inc.zone : 'Zone information unavailable.'),
      zone: zoneStr !== 'Unassigned' ? zoneStr : 'Zone information unavailable.',
      cameraId: cameraStr !== 'Unknown' ? cameraStr : 'Camera information unavailable.',
    };

    const subject: IncidentSubjectSummary = {
      workerId: workerIdStr,
      workerName: workerNameStr,
      personId: personIdStr,
      identityStatus: inc.identityStatus || (isWorkerResolved ? 'CONFIRMED' : 'UNCONFIRMED'),
      isResolved: isWorkerResolved,
      displayLabel: isWorkerResolved
        ? (workerNameStr ? `${workerNameStr}${workerIdStr ? ` (${workerIdStr})` : ''}` : `Worker ${workerIdStr}`)
        : (personIdStr ? `Person identity not resolved (${personIdStr})` : 'Person identity not resolved'),
    };

    const detection: IncidentDetectionSummary = {
      missingPPE,
      bbox: inc.boundingBox || null,
      confidence: typeof inc.confidence === 'number' ? inc.confidence : null,
    };

    const response: IncidentResponseDetailsSummary = {
      responseState: (inc.responseState as ResponseState) || 'UNASSIGNED',
      status: inc.status || 'DETECTED',
      routedRecipient: routingDecision.recipient || null,
      targetRoles: routingDecision.targetRoles || [],
      routingPolicy: routingDecision.ruleMatched || routingDecision.policyId || null,
      routingReason: routingDecision.routingReason,
      deliveryStatus: routingDecision.deliveryStatus || 'NOT_CONFIGURED',
      assignedResponder: firstResp.responder,
      responderState: firstResp.state,
      escalationStatus: inc.escalationStatus || 'PENDING',
      escalationTier: inc.escalationTier || 0,
    };

    const evidence: IncidentEvidenceSummary = {
      available: replayInfo.evidenceType !== 'NONE',
      type: replayInfo.evidenceType,
      reference: replayInfo.videoUrl || replayInfo.snapshotUrl || (inc.evidenceImage ? 'data:image' : null),
      replayAvailable: replayInfo.replayAvailable,
      failureReason: replayInfo.evidenceType === 'NONE' ? (inc.evidence?.failureReason || 'FRAME_UNAVAILABLE') : null,
      message: replayInfo.message,
    };

    const dataAvailability: IncidentDataAvailability = {
      workerResolved: isWorkerResolved,
      ppeRecorded: missingPPE.length > 0,
      evidenceAvailable: evidence.available,
      replayAvailable: evidence.replayAvailable,
      routingConfigured: routingDecision.status === 'ROUTED',
      nearMissLinked: Boolean(inc.nearMissId),
      hazardReportLinked: Boolean(inc.hazardReportId),
      timelineEventsCount: timelineEvents.length,
    };

    return {
      incidentId: inc.incidentId,
      headline,
      timestamp: inc.timestamp ? new Date(inc.timestamp).toISOString() : new Date().toISOString(),
      occurredAt: inc.timestamp ? new Date(inc.timestamp).toISOString() : new Date().toISOString(),
      severity: inc.severity || 'medium',
      violationType: inc.violationType || 'general_hazard',
      incidentType: inc.incidentType || 'SAFETY_VIOLATION',
      siteId: inc.siteId || 'site-rsp-1',
      zone: zoneStr,
      zoneId: inc.zoneId || (inc.zone ? inc.zone : 'Unassigned'),
      cameraId: cameraStr,
      camera: cameraStr,
      workerId: workerIdStr || '',
      workerName: workerNameStr || '',
      worker: workerNameStr || workerIdStr || null,
      employeeId: inc.employeeId || null,
      missingPPE,
      riskScore: typeof inc.riskScore === 'number' ? inc.riskScore : 0,
      riskLevel: inc.riskLevel || 'HIGH',
      responseState: (inc.responseState as ResponseState) || 'UNASSIGNED',
      responseStatus: (inc.responseState as ResponseState) || 'UNASSIGNED',
      assignedResponder: firstResp.responder,
      responderState: firstResp.state,
      evidenceAvailable: replayInfo.evidenceType !== 'NONE',
      replayAvailable: replayInfo.replayAvailable,
      relatedNearMissId: inc.nearMissId || null,
      relatedNearMiss: inc.nearMissId ? { nearMissId: inc.nearMissId } : null,
      hazardReportId: inc.hazardReportId || null,
      relatedHazardReport: inc.hazardReportId ? { hazardReportId: inc.hazardReportId } : null,
      escalationStatus: inc.escalationStatus || 'PENDING',
      escalationTier: inc.escalationTier || 0,
      notes: inc.notes,
      stewardName: inc.stewardName,
      resolvedAt: inc.resolvedAt ? new Date(inc.resolvedAt).toISOString() : undefined,
      resolvedBy: inc.resolvedBy,
      factualDescription: factualSummary,
      factualSummary,
      location,
      subject,
      detection,
      response,
      evidence,
      timeline: timelineEvents,
      dataAvailability,
    };
  }

  /**
   * Evaluates incident-level evidence availability honestly without synthetic media.
   */
  public getIncidentEvidence(inc: any): TimelineEvidence {
    if (!inc) {
      return { available: false, type: 'NONE', reference: null };
    }
    const safeId = path.basename(inc.incidentId || inc.id || '');
    const videoPath = path.join(EVIDENCE_DIR, `${safeId}.mp4`);
    const imgPath = path.join(EVIDENCE_DIR, `${safeId}.jpg`);

    const hasVideo = fs.existsSync(videoPath);
    const hasImageFile = fs.existsSync(imgPath);
    const hasBase64Image = Boolean(inc.evidenceImage && inc.evidenceImage.startsWith('data:image/'));

    if (hasVideo) {
      return {
        available: true,
        type: 'VIDEO',
        reference: `/evidence/${safeId}.mp4`,
      };
    }
    if (hasImageFile) {
      return {
        available: true,
        type: 'SNAPSHOT',
        reference: `/evidence/${safeId}.jpg`,
      };
    }
    if (hasBase64Image) {
      return {
        available: true,
        type: 'SNAPSHOT',
        reference: inc.evidenceImage,
      };
    }
    return {
      available: false,
      type: 'NONE',
      reference: null,
    };
  }

  /**
   * Resolves timeline actor information truthfully with RBAC role and type.
   */
  private resolveTimelineActor(actorStr?: string | any, metadata?: any): TimelineActor {
    if (!actorStr && !metadata?.actor) {
      return { id: null, name: null, role: null, type: 'UNKNOWN' };
    }
    const raw = typeof actorStr === 'string' ? actorStr : (metadata?.actor || '');
    const clean = raw.trim();

    // Check if actor matches a known user by name, email, or id
    const users = this.store.users;
    const matchedUser = users.find((u) => 
      u.id === clean || 
      u.name.toLowerCase() === clean.toLowerCase() || 
      u.email.toLowerCase() === clean.toLowerCase() ||
      clean.toLowerCase().includes(u.name.toLowerCase()) ||
      clean.toLowerCase().includes(u.email.toLowerCase())
    );
    if (matchedUser) {
      return {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        type: 'USER',
      };
    }

    // Check if it represents an AI engine
    const upper = clean.toUpperCase();
    if (
      upper.includes('ENGINE') ||
      upper.includes('YOLO') ||
      upper.includes('BYTE_TRACK') ||
      upper.includes('VALIDATOR') ||
      upper.includes('AI')
    ) {
      return {
        id: null,
        name: this.formatActorName(clean),
        role: null,
        type: 'AI',
      };
    }

    // Check if it represents a System service
    if (
      upper.includes('SERVICE') ||
      upper.includes('SYSTEM') ||
      upper.includes('DAEMON') ||
      upper.includes('ROUTER')
    ) {
      return {
        id: null,
        name: this.formatActorName(clean),
        role: null,
        type: 'SYSTEM',
      };
    }

    // If it is another non-empty string, check if it has an explicit role attached
    if (clean.length > 0) {
      return {
        id: null,
        name: clean,
        role: metadata?.role || null,
        type: metadata?.role ? 'USER' : 'UNKNOWN',
      };
    }

    return { id: null, name: null, role: null, type: 'UNKNOWN' };
  }

  private formatActorName(actor: string): string {
    if (!actor) return 'Unknown';
    if (actor === 'BYTE_TRACK_ENGINE') return 'ByteTrack Engine';
    if (actor === 'GEOFENCE_ENGINE') return 'Geofence Engine';
    if (actor === 'PPE_ASSOCIATION_ENGINE') return 'PPE Association Engine';
    if (actor === 'SAFETY_INTELLIGENCE_ENGINE') return 'Safety Intelligence Engine';
    if (actor === 'TEMPORAL_VALIDATOR') return 'Temporal Validator';
    if (actor === 'SYSTEM_AI_ENGINE') return 'System AI Engine';
    if (actor === 'SMART_ESCALATION_SERVICE') return 'Smart Escalation Service';
    if (actor === 'NOTIFICATION_SERVICE') return 'Notification Service';
    return actor;
  }

  /**
   * Extracts event-level evidence strictly from event metadata.
   */
  private extractEventEvidence(rawEvent: any): TimelineEvidence {
    const meta = rawEvent.metadata;
    if (meta && typeof meta === 'object') {
      if (meta.videoUrl || meta.videoPath) {
        return {
          available: true,
          type: 'VIDEO',
          reference: meta.videoUrl || meta.videoPath,
        };
      }
      if (meta.snapshotPath || meta.snapshotUrl || meta.imagePath || meta.evidence || meta.evidenceImage || meta.snapshot) {
        return {
          available: true,
          type: 'SNAPSHOT',
          reference: meta.snapshotPath || meta.snapshotUrl || meta.imagePath || meta.evidence || meta.evidenceImage || meta.snapshot,
        };
      }
    }
    return {
      available: false,
      type: 'NONE',
      reference: null,
    };
  }

  /**
   * Deterministic factual description for timeline events without speculative interpretation.
   */
  private extractEventDescription(rawEvent: any, inc: any): string {
    if (rawEvent.description && typeof rawEvent.description === 'string' && rawEvent.description.trim().length > 0) {
      return rawEvent.description.trim();
    }
    const evtType = (rawEvent.eventType || '').toUpperCase();
    const violation = (inc.violationType || 'Safety violation').replace(/_/g, ' ');
    const zone = inc.zone || 'monitored zone';
    switch (evtType) {
      case 'PPE_VIOLATION_OBSERVED':
        return `${violation} recorded in ${zone}.`;
      case 'ALERT_ROUTED':
        return `Incident alert routed to configured recipient.`;
      case 'INCIDENT_ACKNOWLEDGED':
      case 'FIRST_RESPONDER_ACKNOWLEDGED':
      case 'ACKNOWLEDGED':
        return `Incident acknowledged.`;
      case 'FIRST_RESPONDER_IDENTIFIED':
        return `First responder identified for the incident.`;
      case 'FIRST_RESPONDER_ASSIGNED':
      case 'RESPONDER_ASSIGNED':
        return `Responder assigned to the incident.`;
      case 'RESPONSE_STARTED':
        return `Incident response started.`;
      case 'INCIDENT_ESCALATED':
        return `Incident escalated according to response policy.`;
      case 'INCIDENT_RESOLVED':
      case 'RESOLVED':
        return `Incident marked resolved.`;
      case 'TRACK_IDENTIFIED':
        return `Track identified in ${zone}.`;
      case 'TEMPORAL_CONFIRMATION':
        return `Violation temporally confirmed over persistent window.`;
      case 'GEOFENCE_BREACH_CONFIRMED':
        return `Restricted area breach confirmed in ${zone}.`;
      case 'RISK_SEVERITY_ASSESSED':
        return `Risk severity assessed for ${zone}.`;
      default:
        return `${rawEvent.eventType || 'Lifecycle event'} recorded for incident.`;
    }
  }

  /**
   * Returns chronological evidence timeline report from MongoDB IncidentEventModel.
   * NO FAKE HISTORICAL EVENTS: returns exactly what is persisted.
   */
  public async getEvidenceTimelineReport(incidentId: string): Promise<IncidentEvidenceTimelineReport | null> {
    const inc = await this.getIncident(incidentId);
    if (!inc) return null;

    const incidentEvidence = this.getIncidentEvidence(inc);
    let rawEvents: any[] = [];

    // Query MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        rawEvents = await IncidentEventModel.find({
          $or: [{ incidentId: inc.incidentId }, { incidentId: incidentId }],
        })
          .sort({ timestamp: 1, eventId: 1 })
          .lean();
      } catch (err) {
        console.warn('[SmartIncidentResponseService] Timeline query error:', err);
      }
    }

    // Merge in-memory timeline if present in incident
    if (Array.isArray(inc.timeline)) {
      for (const te of inc.timeline) {
        if (!rawEvents.some((existing) => existing.eventId === te.eventId)) {
          rawEvents.push(te);
        }
      }
    }

    // Sort strictly chronological ascending with deterministic tie-breaker
    rawEvents.sort((a, b) => {
      const tA = new Date(a.timestamp).getTime();
      const tB = new Date(b.timestamp).getTime();
      if (tA !== tB) return tA - tB;
      return (a.eventId || '').localeCompare(b.eventId || '');
    });

    const entries: IncidentEvidenceTimelineEntry[] = rawEvents.map((e: any) => {
      const actor = this.resolveTimelineActor(e.actor, e.metadata);
      const source: TimelineSource = {
        type: e.metadata?.sourceType || (actor.type === 'AI' ? 'COMPUTER_VISION' : actor.type === 'SYSTEM' ? 'SYSTEM_SERVICE' : actor.type === 'USER' ? 'USER_ACTION' : 'INCIDENT_RECORD'),
        cameraId: e.metadata?.cameraId || inc.cameraId || null,
        zoneId: e.metadata?.zoneId || inc.zoneId || null,
        zone: e.metadata?.zone || inc.zone || null,
      };
      const eventEvidence = this.extractEventEvidence(e);
      const description = this.extractEventDescription(e, inc);

      // Clean metadata (strip passwords or tokens if any)
      const cleanMetadata: Record<string, unknown> = {};
      if (e.metadata && typeof e.metadata === 'object') {
        for (const [k, v] of Object.entries(e.metadata)) {
          if (!k.toLowerCase().includes('password') && !k.toLowerCase().includes('token') && !k.toLowerCase().includes('secret')) {
            cleanMetadata[k] = v;
          }
        }
      }

      return {
        eventId: e.eventId || (e._id ? String(e._id) : null),
        incidentId: e.incidentId || inc.incidentId,
        eventType: e.eventType || 'OBSERVATION',
        timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
        actor,
        actorName: actor.name || actor.type,
        source,
        description,
        evidence: eventEvidence,
        incidentEvidence,
        metadata: cleanMetadata,
      };
    });

    const hasAnyEventEvidence = entries.some((e) => e.evidence && e.evidence.available);
    const hasEvidence = incidentEvidence.available || hasAnyEventEvidence;
    const evidenceEventCount = entries.filter((e) => e.evidence && e.evidence.available).length;

    return {
      incidentId: inc.incidentId,
      timeline: entries,
      totalEvents: entries.length,
      firstEventAt: entries.length > 0 ? entries[0].timestamp : null,
      lastEventAt: entries.length > 0 ? entries[entries.length - 1].timestamp : null,
      evidenceEventCount,
      hasEvidence,
      incidentEvidence,
      message: entries.length === 0 ? 'No persisted timeline events are available for this incident.' : null,
    };
  }

  /**
   * Returns chronological evidence timeline entries from MongoDB IncidentEventModel.
   * NO FAKE HISTORICAL EVENTS: returns exactly what is persisted.
   */
  public async getEvidenceTimeline(incidentId: string): Promise<IncidentEvidenceTimelineEntry[]> {
    const report = await this.getEvidenceTimelineReport(incidentId);
    return report ? report.timeline : [];
  }

  /**
   * Resolves the genuine on-disk video file associated with an incident if present.
   * Path traversal protected — path must resolve strictly within EVIDENCE_DIR.
   */
  public getReplayVideoPath(incident: any): string | null {
    if (!incident) return null;
    const safeId = path.basename(incident.incidentId || incident.id || '');
    if (!safeId) return null;

    let candidatePath: string | null = null;
    if (incident.videoPath && typeof incident.videoPath === 'string') {
      candidatePath = path.resolve(EVIDENCE_DIR, path.basename(incident.videoPath));
    } else if (incident.evidence?.videoPath && typeof incident.evidence.videoPath === 'string') {
      candidatePath = path.resolve(EVIDENCE_DIR, path.basename(incident.evidence.videoPath));
    } else {
      candidatePath = path.resolve(EVIDENCE_DIR, `${safeId}.mp4`);
    }

    if (candidatePath && candidatePath.startsWith(EVIDENCE_DIR) && fs.existsSync(candidatePath)) {
      return candidatePath;
    }
    return null;
  }

  /**
   * Evaluates replay and evidence availability honestly without synthetic media.
   */
  public async getReplayDetails(incidentId: string): Promise<ReplayDetails> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      return {
        incidentId,
        available: false,
        evidenceType: 'NONE',
        replayAvailable: false,
        hasReplayVideo: false,
        source: { type: null, cameraId: null, zoneId: null, zone: null },
        incidentTimestamp: null,
        evidence: { reference: null, mimeType: null, sizeBytes: null, durationSeconds: null },
        playback: { playable: false, url: null, mode: 'NONE' },
        message: 'Incident not found.',
        replayNote: 'Incident not found.',
        integrity: { verified: false, hash: null },
        videoUrl: null,
        snapshotUrl: null,
        evidenceSnapshot: null,
        capturedAt: null,
        sha256: null,
        camera: 'Unknown',
        timestamp: new Date().toISOString(),
      };
    }

    const safeId = path.basename(inc.incidentId || incidentId);
    const resolvedVideoPath = this.getReplayVideoPath(inc);
    const imgPath = path.join(EVIDENCE_DIR, `${safeId}.jpg`);

    const hasVideo = Boolean(resolvedVideoPath && fs.existsSync(resolvedVideoPath));
    const hasImageFile = fs.existsSync(imgPath);
    const hasBase64Image = Boolean(inc.evidenceImage && inc.evidenceImage.startsWith('data:image/'));

    const cameraStr = inc.cameraId || (inc as any).camera || null;
    const zoneStr = inc.zone || null;
    const zoneIdStr = inc.zoneId || null;
    const sourceStr = inc.source || 'AI';
    const timestampStr = inc.timestamp ? new Date(inc.timestamp).toISOString() : null;

    const sourceObj: IncidentReplaySource = {
      type: sourceStr,
      cameraId: cameraStr,
      zoneId: zoneIdStr,
      zone: zoneStr,
    };

    const integrityObj: IncidentReplayIntegrity = {
      verified: Boolean(inc.evidenceHash),
      hash: inc.evidenceHash || null,
    };

    if (hasVideo) {
      const stat = fs.statSync(resolvedVideoPath!);
      const mimeType = resolvedVideoPath!.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      const durationSeconds = inc.durationSeconds || inc.evidence?.durationSeconds || null;
      const refPath = `/evidence/${path.basename(resolvedVideoPath!)}`;
      const playUrl = `/api/incidents/${inc.incidentId}/replay/media`;
      const msg = 'Replay video available for this incident.';

      return {
        incidentId: inc.incidentId,
        available: true,
        evidenceType: 'VIDEO',
        replayAvailable: true,
        hasReplayVideo: true,
        source: sourceObj,
        incidentTimestamp: timestampStr,
        evidence: {
          reference: refPath,
          mimeType,
          sizeBytes: stat.size,
          durationSeconds,
        },
        playback: {
          playable: true,
          url: playUrl,
          mode: 'VIDEO',
        },
        message: msg,
        replayNote: msg,
        integrity: integrityObj,
        videoUrl: playUrl,
        snapshotUrl: `/api/incidents/${inc.incidentId}/evidence`,
        evidenceSnapshot: `/api/incidents/${inc.incidentId}/evidence`,
        capturedAt: inc.evidence?.capturedAt || timestampStr,
        sha256: inc.evidenceHash || null,
        camera: cameraStr || 'Unknown',
        timestamp: timestampStr || new Date().toISOString(),
      };
    }

    if (hasImageFile || hasBase64Image) {
      const stat = hasImageFile ? fs.statSync(imgPath) : null;
      const refPath = hasImageFile ? `/evidence/${safeId}.jpg` : 'base64_data';
      const snapUrl = `/api/incidents/${inc.incidentId}/evidence`;
      const msg = 'Snapshot evidence available — video replay unavailable.';

      return {
        incidentId: inc.incidentId,
        available: true,
        evidenceType: 'SNAPSHOT',
        replayAvailable: false,
        hasReplayVideo: false,
        source: sourceObj,
        incidentTimestamp: timestampStr,
        evidence: {
          reference: refPath,
          mimeType: 'image/jpeg',
          sizeBytes: stat ? stat.size : null,
          durationSeconds: null,
        },
        playback: {
          playable: false,
          url: snapUrl,
          mode: 'SNAPSHOT',
        },
        message: msg,
        replayNote: 'Snapshot evidence only — replay video unavailable.',
        integrity: integrityObj,
        videoUrl: null,
        snapshotUrl: snapUrl,
        evidenceSnapshot: snapUrl,
        capturedAt: inc.evidence?.capturedAt || timestampStr,
        sha256: inc.evidenceHash || null,
        camera: cameraStr || 'Unknown',
        timestamp: timestampStr || new Date().toISOString(),
      };
    }

    const noMsg = 'No replay evidence is available for this incident.';
    return {
      incidentId: inc.incidentId,
      available: false,
      evidenceType: 'NONE',
      replayAvailable: false,
      hasReplayVideo: false,
      source: sourceObj,
      incidentTimestamp: timestampStr,
      evidence: {
        reference: null,
        mimeType: null,
        sizeBytes: null,
        durationSeconds: null,
      },
      playback: {
        playable: false,
        url: null,
        mode: 'NONE',
      },
      message: noMsg,
      replayNote: noMsg,
      integrity: integrityObj,
      videoUrl: null,
      snapshotUrl: null,
      evidenceSnapshot: null,
      capturedAt: null,
      sha256: null,
      camera: cameraStr || 'Unknown',
      timestamp: timestampStr || new Date().toISOString(),
    };
  }

  /**
   * Action: Route Incident
   */
  public async routeIncident(incidentId: string, actorUser?: any): Promise<{ success: boolean; decision: RoutingDecision; incident: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      throw new Error('Incident not found');
    }

    const decision = await this.evaluateRoutingPolicy(inc);
    const nowIso = new Date().toISOString();

    const previousState = inc.responseState || 'UNASSIGNED';
    inc.responseState = 'ROUTED';
    inc.routedAt = nowIso;
    inc.routingDecision = decision;
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'ALERT_ROUTED',
      description: `Alert routed to [${decision.targetRoles.join(', ')}]. Recipient count: ${decision.targetUsers.length}. Reason: ${decision.routingReason}`,
      actor: actorUser ? { id: actorUser.id, name: actorUser.name, role: actorUser.role } : 'SMART_RESPONSE_ROUTER',
      metadata: {
        recipientUserId: decision.recipient?.id || null,
        recipientId: decision.recipient?.id || null,
        recipientRole: decision.recipient?.role || null,
        recipientEmail: decision.recipient?.email || null,
        policyId: decision.policyId || decision.ruleMatched || `POLICY-${decision.severity.toUpperCase()}`,
        severity: inc.severity,
        violationType: inc.violationType,
        zone: inc.zone || inc.zoneId,
        camera: inc.cameraId || (inc as any).camera,
        routingReason: decision.routingReason || decision.reason,
        targetRoles: decision.targetRoles,
        recipients: decision.targetUsers.map((u) => u.email),
        status: decision.status,
        routingStatus: decision.status,
        deliveryStatus: decision.deliveryStatus || 'NOT_CONFIGURED',
      },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser?.id || 'system-router',
      userEmail: actorUser?.email || 'router@safevision.ai',
      userRole: actorUser?.role || 'SYSTEM',
      action: 'INCIDENT_ROUTED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: {
        previousState,
        newState: 'ROUTED',
        targetRoles: decision.targetRoles,
        recipientCount: decision.targetUsers.length,
        recipientId: decision.recipient?.id || null,
        recipientRole: decision.recipient?.role || null,
        policyId: decision.policyId || decision.ruleMatched,
        routingStatus: decision.status,
        deliveryStatus: decision.deliveryStatus,
      },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              responseState: 'ROUTED',
              routedAt: new Date(nowIso),
              routingDecision: decision,
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.routed', {
      incidentId: inc.incidentId,
      responseState: 'ROUTED',
      decision,
      incident: inc,
    }, {
      entityType: 'INCIDENT',
      entityId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      targetRoles: decision.targetRoles,
    });

    return { success: true, decision, incident: inc };
  }

  /**
   * Action: Acknowledge Incident
   */
  public async acknowledgeIncident(
    incidentId: string,
    actorUser: any,
    notes?: string,
    version?: number
  ): Promise<{ success: boolean; incident: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      const err: any = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    // Concurrency check
    if (version !== undefined && Number(version) !== inc.version) {
      const err: any = new Error(`Concurrency Conflict: Incident was modified by another user. Current version: ${inc.version}, provided: ${version}.`);
      err.code = 'CONCURRENCY_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // State machine check: Cannot acknowledge resolved incident
    if (inc.status === 'RESOLVED' || inc.responseState === 'RESOLVED') {
      const err: any = new Error('Cannot acknowledge resolved incident.');
      err.code = 'STATE_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // Idempotent: already acknowledged
    if (
      inc.status === 'ACKNOWLEDGED' &&
      inc.responseState === 'ACKNOWLEDGED' &&
      (!inc.assignedResponder || inc.assignedResponder.state === 'RESPONDER_ACKNOWLEDGED')
    ) {
      return { success: true, incident: inc };
    }

    const previousState = inc.responseState || 'UNASSIGNED';
    const nowIso = new Date().toISOString();

    inc.responseState = 'ACKNOWLEDGED';
    inc.status = 'ACKNOWLEDGED';
    inc.escalationStatus = 'ACKNOWLEDGED';
    inc.acknowledgedAt = nowIso;
    inc.acknowledgedBy = `${actorUser.name} (${actorUser.role})`;
    if (notes) inc.notes = notes;
    if (inc.assignedResponder) {
      inc.assignedResponder.state = 'RESPONDER_ACKNOWLEDGED';
    }
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Cancel automated escalation
    this.escalationService.cancelEscalation(inc.incidentId, actorUser.name);

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'FIRST_RESPONDER_ACKNOWLEDGED',
      description: `Incident acknowledged by ${actorUser.name} (${actorUser.role}). Notes: ${notes || 'None provided'}`,
      actor: { id: actorUser.id, name: actorUser.name, role: actorUser.role },
      metadata: { notes },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser.id,
      userEmail: actorUser.email,
      userRole: actorUser.role,
      action: 'INCIDENT_ACKNOWLEDGED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: { previousState, newState: 'ACKNOWLEDGED', notes },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              responseState: 'ACKNOWLEDGED',
              status: 'ACKNOWLEDGED',
              escalationStatus: 'ACKNOWLEDGED',
              acknowledgedAt: new Date(nowIso),
              acknowledgedBy: inc.acknowledgedBy,
              notes: inc.notes,
              assignedResponder: inc.assignedResponder,
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.acknowledged', {
      incidentId: inc.incidentId,
      responseState: 'ACKNOWLEDGED',
      acknowledgedBy: inc.acknowledgedBy,
      incident: inc,
    });

    return { success: true, incident: inc };
  }

  /**
   * Action: Assign Responder
   */
  public async assignResponder(
    incidentId: string,
    responderUserId: string,
    actorUser: any,
    notes?: string,
    source: 'AUTOMATIC_POLICY' | 'MANUAL_OPERATOR' = 'MANUAL_OPERATOR',
    version?: number
  ): Promise<{ success: boolean; incident: any; responder: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      const err: any = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    // Concurrency check
    if (version !== undefined && Number(version) !== inc.version) {
      const err: any = new Error(`Concurrency Conflict: Incident was modified by another user. Current version: ${inc.version}, provided: ${version}.`);
      err.code = 'CONCURRENCY_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // State check: Cannot assign resolved incident
    if (inc.status === 'RESOLVED' || inc.responseState === 'RESOLVED') {
      const err: any = new Error('Cannot assign responder: Incident is already RESOLVED.');
      err.code = 'STATE_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // If already acknowledged:
    if (inc.assignedResponder && inc.assignedResponder.state === 'RESPONDER_ACKNOWLEDGED') {
      if (inc.assignedResponder.responderId === responderUserId) {
        return { success: true, incident: inc, responder: inc.assignedResponder };
      }
      const err: any = new Error('Cannot reassign: Responder has already acknowledged this incident.');
      err.code = 'STATE_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // Find responder from real user directory (DataStore or MongoDB)
    let targetUser = this.store.users.find(
      (u) => u.id === responderUserId || u.email.toLowerCase() === responderUserId.toLowerCase()
    );

    if (!targetUser && mongoose.connection.readyState === 1) {
      try {
        const dbUser = await UserModel.findOne({
          $or: [
            ...(mongoose.isValidObjectId(responderUserId) ? [{ _id: responderUserId }] : []),
            { email: responderUserId.toLowerCase() },
          ],
        }).lean();
        if (dbUser) {
          const d = dbUser as any;
          targetUser = {
            id: d._id.toString(),
            name: d.name,
            email: d.email,
            role: d.role,
            status: d.status,
            siteIds: d.siteIds || [],
            zoneIds: d.zoneIds || [],
            teamIds: [],
            department: d.department || 'Operations',
            shift: 'Shift A',
            permissions: [],
            createdAt: d.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: d.updatedAt?.toISOString() || new Date().toISOString(),
            lastLogin: null,
          };
        }
      } catch (_) {}
    }

    if (!targetUser) {
      const err: any = new Error(`Responder '${responderUserId}' not found in configured user directory.`);
      err.statusCode = 404;
      throw err;
    }

    if (targetUser.status === 'DISABLED' || (targetUser as any).status === 'INACTIVE' || (targetUser as any).active === false) {
      const err: any = new Error(`Cannot assign responder '${targetUser.email}': account is inactive or disabled.`);
      err.statusCode = 400;
      throw err;
    }

    if (targetUser.role === 'EMPLOYEE') {
      const err: any = new Error('Access denied: Employees cannot be assigned as first responders.');
      err.statusCode = 400;
      throw err;
    }

    // Site scope check
    const userSites = (targetUser.siteIds || []).map((s: string) => s.toLowerCase().trim());
    const incSite = (inc.siteId || 'site-rsp-1').toLowerCase().trim();
    if (!userSites.includes('*') && !userSites.includes(incSite)) {
      const err: any = new Error(`Responder '${targetUser.name}' is not authorized for incident site '${inc.siteId || 'site-rsp-1'}'.`);
      err.statusCode = 403;
      throw err;
    }

    // Zone scope check
    if (!this.isUserInZoneScope(targetUser, inc.zone || inc.zoneId)) {
      const err: any = new Error(`Responder '${targetUser.name}' is not authorized for incident zone '${inc.zone}'.`);
      err.statusCode = 403;
      throw err;
    }

    // Idempotency check: Already assigned with same responder
    if (
      inc.assignedResponder &&
      inc.assignedResponder.responderId === targetUser.id &&
      inc.assignedResponder.state === 'RESPONDER_ASSIGNED'
    ) {
      return { success: true, incident: inc, responder: inc.assignedResponder };
    }

    const nowIso = new Date().toISOString();
    const assignedResponder = {
      responderId: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
      department: targetUser.department || 'Operations',
      email: targetUser.email,
      assignedAt: nowIso,
      assignedBy: `${actorUser.name} (${actorUser.role})`,
      state: 'RESPONDER_ASSIGNED' as ResponderState,
      assignmentSource: source || 'MANUAL_OPERATOR',
    };

    const previousState = inc.responseState || 'UNASSIGNED';
    inc.assignedResponder = assignedResponder;
    inc.stewardName = targetUser.name;
    if (inc.responseState === 'UNASSIGNED') {
      inc.responseState = 'ROUTED';
    }
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'FIRST_RESPONDER_ASSIGNED',
      description: `First responder ${targetUser.name} (${targetUser.role}) assigned by ${actorUser.name}.`,
      actor: { id: actorUser.id, name: actorUser.name, role: actorUser.role },
      metadata: { responder: assignedResponder, notes, source: source || 'MANUAL_OPERATOR' },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser.id,
      userEmail: actorUser.email,
      userRole: actorUser.role,
      action: 'FIRST_RESPONDER_ASSIGNED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: {
        responderId: targetUser.id,
        responderEmail: targetUser.email,
        assignedBy: actorUser.email,
        source: source || 'MANUAL_OPERATOR',
      },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              assignedResponder,
              stewardName: targetUser.name,
              responseState: inc.responseState,
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.assigned', {
      incidentId: inc.incidentId,
      assignedResponder,
      incident: inc,
    });

    return { success: true, incident: inc, responder: assignedResponder };
  }

  /**
   * Action: Start Response (IN_PROGRESS)
   */
  public async startResponse(
    incidentId: string,
    actorUser: any,
    notes?: string,
    version?: number
  ): Promise<{ success: boolean; incident: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      const err: any = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    // Concurrency check
    if (version !== undefined && Number(version) !== inc.version) {
      const err: any = new Error(`Concurrency Conflict: Incident was modified by another user. Current version: ${inc.version}, provided: ${version}.`);
      err.code = 'CONCURRENCY_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // State check: Cannot start response on resolved incident
    if (inc.status === 'RESOLVED' || inc.responseState === 'RESOLVED') {
      const err: any = new Error('Cannot start response on resolved incident.');
      err.code = 'STATE_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    // Idempotency: already IN_PROGRESS
    if (inc.responseState === 'IN_PROGRESS') {
      return { success: true, incident: inc };
    }

    const previousState = inc.responseState || 'UNASSIGNED';
    const nowIso = new Date().toISOString();

    inc.responseState = 'IN_PROGRESS';
    inc.status = 'DISPATCHED';
    inc.responseStartedAt = nowIso;
    inc.responseStartedBy = `${actorUser.name} (${actorUser.role})`;
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Cancel automated escalation
    this.escalationService.cancelEscalation(inc.incidentId, actorUser.name);

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'RESPONSE_STARTED',
      description: `Active field response initiated by ${actorUser.name} (${actorUser.role}). Notes: ${notes || 'Action in progress.'}`,
      actor: { id: actorUser.id, name: actorUser.name, role: actorUser.role },
      metadata: { notes },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser.id,
      userEmail: actorUser.email,
      userRole: actorUser.role,
      action: 'RESPONSE_STARTED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: { previousState, newState: 'IN_PROGRESS' },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              responseState: 'IN_PROGRESS',
              status: 'DISPATCHED',
              responseStartedAt: new Date(nowIso),
              responseStartedBy: inc.responseStartedBy,
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.response_started', {
      incidentId: inc.incidentId,
      responseState: 'IN_PROGRESS',
      startedBy: inc.responseStartedBy,
      incident: inc,
    });

    return { success: true, incident: inc };
  }

  /**
   * Action: Resolve Incident
   */
  public async resolveIncident(
    incidentId: string,
    actorUser: any,
    notes?: string,
    resolutionReason?: string
  ): Promise<{ success: boolean; incident: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) throw new Error('Incident not found');

    const previousState = inc.responseState || 'UNASSIGNED';
    const nowIso = new Date().toISOString();

    inc.responseState = 'RESOLVED';
    inc.status = 'RESOLVED';
    inc.escalationStatus = 'RESOLVED';
    inc.resolvedAt = nowIso;
    inc.resolvedBy = `${actorUser.name} (${actorUser.role})`;
    inc.notes = resolutionReason || notes || inc.notes || 'Resolved following compliance check.';
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Cancel any pending automated escalation
    this.escalationService.cancelEscalation(inc.incidentId, actorUser.name);

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'INCIDENT_RESOLVED',
      description: `Incident resolved by ${actorUser.name} (${actorUser.role}). Resolution: ${inc.notes}`,
      actor: { id: actorUser.id, name: actorUser.name, role: actorUser.role },
      metadata: { resolutionNotes: inc.notes },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser.id,
      userEmail: actorUser.email,
      userRole: actorUser.role,
      action: 'INCIDENT_RESOLVED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: { previousState, newState: 'RESOLVED', resolvedBy: inc.resolvedBy },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              responseState: 'RESOLVED',
              status: 'RESOLVED',
              escalationStatus: 'RESOLVED',
              resolvedAt: new Date(nowIso),
              resolvedBy: inc.resolvedBy,
              notes: inc.notes,
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.resolved', {
      incidentId: inc.incidentId,
      responseState: 'RESOLVED',
      resolvedBy: inc.resolvedBy,
      incident: inc,
    });

    return { success: true, incident: inc };
  }

  /**
   * Action: Escalate Incident
   */
  public async escalateIncident(
    incidentId: string,
    actorUser: any,
    notes?: string,
    reason?: string
  ): Promise<{ success: boolean; incident: any }> {
    const inc = await this.getIncident(incidentId);
    if (!inc) {
      const err: any = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    if (inc.status === 'RESOLVED' || inc.responseState === 'RESOLVED') {
      const err: any = new Error('Cannot escalate resolved incident.');
      err.code = 'STATE_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    const previousState = inc.responseState || 'UNASSIGNED';
    const nowIso = new Date().toISOString();

    inc.responseState = 'ESCALATED';
    inc.escalationStatus = 'ESCALATED_L1';
    inc.escalationTier = (inc.escalationTier || 0) + 1;
    inc.escalatedAt = nowIso;
    if (notes) inc.notes = notes;
    inc.version = (inc.version || 1) + 1;
    inc.updatedAt = nowIso;

    // Record timeline event
    await this.timelineService.recordEvent({
      incidentId: inc.incidentId,
      eventType: 'INCIDENT_ESCALATED',
      description: `Incident escalated by ${actorUser.name} (${actorUser.role}). Reason: ${reason || notes || 'Urgent intervention requested.'}`,
      actor: { id: actorUser.id, name: actorUser.name, role: actorUser.role },
      metadata: { reason, notes, tier: inc.escalationTier },
    });

    // Audit log
    AuditLogger.log({
      userId: actorUser.id,
      userEmail: actorUser.email,
      userRole: actorUser.role,
      action: 'INCIDENT_ESCALATED',
      resourceType: 'INCIDENT_RESPONSE',
      resourceId: inc.incidentId,
      siteId: inc.siteId,
      zoneId: inc.zone,
      result: 'SUCCESS',
      metadata: { previousState, newState: 'ESCALATED', reason, tier: inc.escalationTier },
    });

    // Update in MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: inc.incidentId }, { _id: inc._id }] },
          {
            $set: {
              responseState: 'ESCALATED',
              escalationStatus: inc.escalationStatus,
              escalationTier: inc.escalationTier,
              escalatedAt: new Date(nowIso),
              version: inc.version,
              updatedAt: new Date(nowIso),
            },
          }
        );
      } catch (_) {}
    }

    // Emit Socket.IO event
    this.socketService.emitRealtimeEvent('incident.escalated', {
      incidentId: inc.incidentId,
      responseState: 'ESCALATED',
      tier: inc.escalationTier,
      incident: inc,
    });

    return { success: true, incident: inc };
  }

  /**
   * Deterministic Active Incident Queue (Step 15).
   * Priority:
   * 1. Severity: CRITICAL (4) > HIGH (3) > MEDIUM (2) > LOW (1) > INFO (0)
   * 2. Newest unresolved incident first.
   */
  public async getActiveQueue(filters: {
    severity?: string;
    zone?: string;
    cameraId?: string;
    violationType?: string;
    status?: string;
    responseState?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ total: number; incidents: any[]; items?: any[]; message?: string; summary?: any }> {
    const isMongoReady = mongoose.connection.readyState === 1;
    let list: any[] = [];

    const severityWeight: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0,
    };

    if (isMongoReady) {
      try {
        const query: any = {};

        if (filters.severity && filters.severity !== 'All' && filters.severity !== 'All Severity') {
          query.severity = new RegExp(`^${filters.severity}$`, 'i');
        }

        if (filters.zone && filters.zone !== 'All' && filters.zone !== 'All Zones') {
          query.zone = new RegExp(`^${filters.zone}$`, 'i');
        }

        if (filters.cameraId && filters.cameraId !== 'All' && filters.cameraId !== 'All Cameras') {
          query.cameraId = new RegExp(`^${filters.cameraId}$`, 'i');
        }

        if (filters.violationType && filters.violationType !== 'All' && filters.violationType !== 'All Violations') {
          query.violationType = new RegExp(`^${filters.violationType}$`, 'i');
        }

        if (filters.responseState && filters.responseState !== 'All') {
          query.responseState = new RegExp(`^${filters.responseState}$`, 'i');
        }

        if (filters.status && filters.status !== 'All' && filters.status !== 'All Status') {
          query.status = new RegExp(`^${filters.status}$`, 'i');
        } else if (!filters.responseState) {
          // Default: active queue shows open/unresolved incidents
          query.status = { $ne: 'FALSE_POSITIVE' };
        }

        if (filters.search) {
          const s = String(filters.search).trim();
          query.$or = [
            { incidentId: new RegExp(s, 'i') },
            { violationType: new RegExp(s, 'i') },
            { zone: new RegExp(s, 'i') },
            { cameraId: new RegExp(s, 'i') },
            { workerName: new RegExp(s, 'i') },
            { workerId: new RegExp(s, 'i') },
          ];
        }

        const rawDocs = await IncidentModel.find(query).lean();
        list = rawDocs.map((doc: any) => ({
          ...doc,
          id: doc.incidentId || doc._id.toString(),
          timestamp: doc.timestamp ? new Date(doc.timestamp).toISOString() : new Date().toISOString(),
          responseState: doc.responseState || (doc.status === 'RESOLVED' ? 'RESOLVED' : doc.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : doc.status === 'DISPATCHED' ? 'IN_PROGRESS' : 'UNASSIGNED'),
        }));
      } catch (err) {
        console.warn('[SmartIncidentResponseService] Mongo query error in getActiveQueue:', err);
      }
    }

    // Include in-memory test fixtures if not already in list
    for (const mem of this.store.incidents) {
      if (!list.some((existing) => existing.incidentId === mem.incidentId)) {
        list.push({ ...mem });
      }
    }

    // Apply in-memory filtering if fallback occurred
    if (filters.severity && filters.severity !== 'All' && filters.severity !== 'All Severity') {
      list = list.filter((i) => (i.severity || '').toLowerCase() === filters.severity!.toLowerCase());
    }
    if (filters.zone && filters.zone !== 'All' && filters.zone !== 'All Zones') {
      list = list.filter((i) => (i.zone || '').toLowerCase() === filters.zone!.toLowerCase());
    }
    if (filters.cameraId && filters.cameraId !== 'All' && filters.cameraId !== 'All Cameras') {
      list = list.filter((i) => (i.cameraId || '').toLowerCase() === filters.cameraId!.toLowerCase());
    }
    if (filters.violationType && filters.violationType !== 'All' && filters.violationType !== 'All Violations') {
      list = list.filter((i) => (i.violationType || '').toLowerCase() === filters.violationType!.toLowerCase());
    }
    if (filters.responseState && filters.responseState !== 'All') {
      list = list.filter((i) => (i.responseState || '').toUpperCase() === filters.responseState!.toUpperCase());
    }
    if (filters.status && filters.status !== 'All' && filters.status !== 'All Status') {
      list = list.filter((i) => (i.status || '').toUpperCase() === filters.status!.toUpperCase());
    }

    // Deterministic Sort:
    // 1. Severity weight descending
    // 2. Timestamp descending (newest first)
    list.sort((a, b) => {
      const weightA = severityWeight[(a.severity || 'low').toLowerCase()] ?? 0;
      const weightB = severityWeight[(b.severity || 'low').toLowerCase()] ?? 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const total = list.length;
    const offset = Number(filters.offset) || 0;
    const limit = Number(filters.limit) || 50;
    const paginated = list.slice(offset, offset + limit);

    const critical = list.filter((i) => (i.severity || '').toLowerCase() === 'critical').length;
    const high = list.filter((i) => (i.severity || '').toLowerCase() === 'high').length;
    const unassigned = list.filter((i) => (i.responseState || '').toUpperCase() === 'UNASSIGNED').length;
    const inProgress = list.filter((i) => (i.responseState || '').toUpperCase() === 'IN_PROGRESS').length;

    const message = total === 0 ? 'No active incidents matching the specified filters.' : undefined;

    return {
      total,
      incidents: paginated,
      items: paginated,
      message,
      summary: {
        critical,
        high,
        unassigned,
        inProgress,
      },
    };
  }
}
