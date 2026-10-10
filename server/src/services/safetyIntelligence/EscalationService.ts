import { DataStore, EscalationPolicyDoc, IncidentDoc } from '../../models/DataStore';
import { EscalationPolicyModel, IncidentModel } from '../../models/mongooseModels';
import { SocketService } from '../socket/SocketService';
import { NotificationService } from '../notifications/NotificationService';
import { IncidentTimelineService } from './IncidentTimelineService';
import mongoose from 'mongoose';

export class EscalationService {
  private static instance: EscalationService;
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();
  private notificationService = NotificationService.getInstance();
  private timelineService = IncidentTimelineService.getInstance();

  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): EscalationService {
    if (!EscalationService.instance) {
      EscalationService.instance = new EscalationService();
    }
    return EscalationService.instance;
  }

  /**
   * Retrieves escalation policy for a given severity.
   */
  public async getPolicy(severity: string, siteId: string = 'site-rsp-1'): Promise<EscalationPolicyDoc | null> {
    const mem = this.store.escalationPolicies.find(
      (p) => p.severity.toLowerCase() === severity.toLowerCase() && p.siteId === siteId && p.enabled
    );
    if (mem) return mem;

    if (mongoose.connection.readyState === 1) {
      try {
        const dbDoc = await EscalationPolicyModel.findOne({
          severity: severity.toLowerCase(),
          siteId,
          enabled: true,
        });
        if (dbDoc) {
          const doc = dbDoc.toObject() as unknown as EscalationPolicyDoc;
          this.store.escalationPolicies.push(doc);
          return doc;
        }
      } catch (_) {}
    }

    return null;
  }

  /**
   * Registers an incident for smart multi-tier escalation.
   */
  public async registerIncident(incident: IncidentDoc): Promise<void> {
    if (incident.status === 'ACKNOWLEDGED' || incident.status === 'RESOLVED' || incident.status === 'FALSE_POSITIVE') {
      return;
    }

    const policy = await this.getPolicy(incident.severity, incident.siteId || 'site-rsp-1');
    if (!policy || !policy.tiers || policy.tiers.length === 0) {
      return;
    }

    // Initialize Tier 1 immediately
    const tier1 = policy.tiers[0];
    incident.escalationStatus = 'PENDING';
    incident.escalationTier = 1;

    await this.timelineService.recordEvent(
      incident.incidentId,
      'ESCALATION_TIER_INITIATED',
      `Alert routed to Tier 1 [${tier1.role}] with ${tier1.timeoutSeconds}s acknowledgment timeout.`,
      'SMART_ESCALATION_SERVICE',
      { tier: 1, role: tier1.role, timeoutSeconds: tier1.timeoutSeconds }
    );

    // Schedule next tier escalation if unacknowledged
    this.scheduleNextTier(incident.incidentId, policy, 1);
  }

  /**
   * Cancels escalation immediately when acknowledged or resolved.
   */
  public cancelEscalation(incidentId: string, actor: string = 'SUPERVISOR'): void {
    const timer = this.activeTimers.get(incidentId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(incidentId);
    }

    const inc = this.store.incidents.find((i) => i.incidentId === incidentId || i.id === incidentId);
    if (inc) {
      inc.escalationStatus = 'ACKNOWLEDGED';
    }

    this.timelineService.recordEvent(
      incidentId,
      'ESCALATION_CANCELLED',
      `Escalation halted: Incident acknowledged by ${actor}.`,
      actor
    );
  }

  private scheduleNextTier(incidentId: string, policy: EscalationPolicyDoc, currentTierIndex: number): void {
    const currentTier = policy.tiers[currentTierIndex - 1];
    if (!currentTier || !currentTier.timeoutSeconds) return;

    // Clear existing timer if any
    const existing = this.activeTimers.get(incidentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.activeTimers.delete(incidentId);

      const inc = this.store.incidents.find((i) => i.incidentId === incidentId || i.id === incidentId);
      if (
        !inc ||
        inc.status === 'ACKNOWLEDGED' ||
        inc.status === 'RESOLVED' ||
        inc.status === 'FALSE_POSITIVE' ||
        inc.responseState === 'ACKNOWLEDGED' ||
        inc.responseState === 'IN_PROGRESS' ||
        inc.responseState === 'RESOLVED' ||
        inc.assignedResponder?.state === 'RESPONDER_ACKNOWLEDGED'
      ) {
        return;
      }

      const nextTierIndex = currentTierIndex + 1;
      const nextTier = policy.tiers[nextTierIndex - 1];

      if (nextTier) {
        inc.escalationTier = nextTier.tier;
        inc.escalationStatus = nextTier.tier === 2 ? 'ESCALATED_L1' : 'ESCALATED_L2';
        inc.escalatedAt = new Date().toISOString();

        // 1. Record event
        await this.timelineService.recordEvent(
          incidentId,
          'INCIDENT_ESCALATED',
          `Unacknowledged timeout expired (${currentTier.timeoutSeconds}s). Escalated to Tier ${nextTier.tier} [${nextTier.role}].`,
          'SMART_ESCALATION_SERVICE',
          { fromTier: currentTier.tier, toTier: nextTier.tier, targetRole: nextTier.role }
        );

        // 2. Dispatch multi-channel notification
        this.notificationService.notifyIncident(inc);

        // 3. Emit realtime escalation event
        this.socketService.emitRealtimeEvent('incident.escalated', {
          incidentId,
          tier: nextTier.tier,
          role: nextTier.role,
          incident: inc,
        });

        // 4. Update in MongoDB
        if (mongoose.connection.readyState === 1) {
          try {
            await IncidentModel.findOneAndUpdate(
              { $or: [{ incidentId }, { id: incidentId }] },
              {
                $set: {
                  escalationTier: nextTier.tier,
                  escalationStatus: inc.escalationStatus,
                  escalatedAt: new Date(inc.escalatedAt),
                },
              }
            );
          } catch (_) {}
        }

        // Schedule next tier if more tiers exist
        this.scheduleNextTier(incidentId, policy, nextTierIndex);
      }
    }, currentTier.timeoutSeconds * 1000);

    this.activeTimers.set(incidentId, timer);
  }
}
