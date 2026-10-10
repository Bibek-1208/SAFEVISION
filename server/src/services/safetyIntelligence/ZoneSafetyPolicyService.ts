import { DataStore, ZoneSafetyPolicyDoc } from '../../models/DataStore';
import { ZoneSafetyPolicyModel } from '../../models/mongooseModels';
import { SocketService } from '../socket/SocketService';
import { AuditLogger } from '../../security/AuditLogger';
import mongoose from 'mongoose';

export class ZoneSafetyPolicyService {
  private static instance: ZoneSafetyPolicyService;
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();

  private constructor() {}

  public static getInstance(): ZoneSafetyPolicyService {
    if (!ZoneSafetyPolicyService.instance) {
      ZoneSafetyPolicyService.instance = new ZoneSafetyPolicyService();
    }
    return ZoneSafetyPolicyService.instance;
  }

  /**
   * Normalizes PPE class / violation name to standard keys: 'helmet', 'safety-vest', 'gloves', 'shoes'.
   */
  public normalizePPEType(type: string): string {
    const lower = (type || '').toLowerCase().trim();
    if (lower.includes('helmet') || lower.includes('hard hat') || lower === 'head') return 'helmet';
    if (lower.includes('vest') || lower.includes('safety-vest') || lower.includes('hi-vis')) return 'safety-vest';
    if (lower.includes('glove')) return 'gloves';
    if (lower.includes('shoe') || lower.includes('boot') || lower.includes('footwear')) return 'shoes';
    return lower;
  }

  /**
   * Retrieves policy for a zone by zoneId, zone code, or zone name.
   */
  public async getPolicyForZone(zoneIdentifier: string, siteId: string = 'site-rsp-1'): Promise<ZoneSafetyPolicyDoc> {
    const query = (zoneIdentifier || '').toLowerCase().trim();

    // 1. Try finding in DataStore memory
    const memPolicy = this.store.zoneSafetyPolicies.find(
      (p) =>
        p.zoneId.toLowerCase() === query ||
        p.policyId.toLowerCase() === query ||
        p.zoneName.toLowerCase() === query ||
        p.zoneName.toLowerCase().includes(query) ||
        query.includes(p.zoneName.toLowerCase())
    );

    if (memPolicy) {
      return memPolicy;
    }

    // 2. Try MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const dbDoc = await ZoneSafetyPolicyModel.findOne({
          $or: [
            { zoneId: query },
            { policyId: query },
            { zoneName: new RegExp(`^${query}$`, 'i') },
          ],
        });
        if (dbDoc) {
          const doc = dbDoc.toObject() as unknown as ZoneSafetyPolicyDoc;
          // Cache in memory
          this.store.zoneSafetyPolicies.push(doc);
          return doc;
        }
      } catch (err) {
        console.warn(`[ZoneSafetyPolicyService] DB query error:`, err);
      }
    }

    // 3. Fallback default policy for unassigned or general zones
    return {
      id: `default-${zoneIdentifier}`,
      policyId: `POLICY-DEFAULT-${zoneIdentifier.toUpperCase()}`,
      zoneId: zoneIdentifier,
      siteId,
      zoneName: zoneIdentifier,
      requiredPPE: ['helmet', 'safety-vest'],
      riskWeights: {
        ppeWeight: 35,
        hazardWeight: 25,
        zoneWeight: 20,
        persistenceWeight: 15,
        contextualWeight: 5,
      },
      enabled: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM_FALLBACK',
    };
  }

  /**
   * Evaluates if a given PPE item is required by the zone policy.
   * If not required, violation must NOT be created.
   */
  public async isPPERequired(zoneIdentifier: string, violationOrItem: string): Promise<boolean> {
    const policy = await this.getPolicyForZone(zoneIdentifier);
    if (!policy.enabled) return false;

    const normalized = this.normalizePPEType(violationOrItem);
    const requiredNormalized = policy.requiredPPE.map((p) => this.normalizePPEType(p));

    return requiredNormalized.includes(normalized);
  }

  /**
   * Lists all active zone safety policies.
   */
  public async listPolicies(): Promise<ZoneSafetyPolicyDoc[]> {
    if (mongoose.connection.readyState === 1) {
      try {
        const dbDocs = await ZoneSafetyPolicyModel.find({});
        if (dbDocs && dbDocs.length > 0) {
          return dbDocs.map((d) => d.toObject() as unknown as ZoneSafetyPolicyDoc);
        }
      } catch (_) {}
    }
    return this.store.zoneSafetyPolicies;
  }

  /**
   * Updates or creates a zone safety policy, enforcing optimistic concurrency and broadcasting via Socket.IO.
   */
  public async upsertPolicy(
    policyData: Partial<ZoneSafetyPolicyDoc> & { zoneName: string; zoneId: string },
    actor: string = 'SUPERVISOR'
  ): Promise<ZoneSafetyPolicyDoc> {
    const nowIso = new Date().toISOString();
    let existingIndex = this.store.zoneSafetyPolicies.findIndex(
      (p) => p.zoneId.toLowerCase() === policyData.zoneId.toLowerCase() || p.policyId === policyData.policyId
    );

    let updatedPolicy: ZoneSafetyPolicyDoc;

    if (existingIndex >= 0) {
      const existing = this.store.zoneSafetyPolicies[existingIndex];
      // Optimistic concurrency check
      if (policyData.version !== undefined && policyData.version !== existing.version) {
        throw new Error(
          `Optimistic concurrency conflict: Policy version mismatch (Client: ${policyData.version}, Server: ${existing.version})`
        );
      }

      updatedPolicy = {
        ...existing,
        ...policyData,
        version: existing.version + 1,
        updatedAt: nowIso,
        updatedBy: actor,
      };
      this.store.zoneSafetyPolicies[existingIndex] = updatedPolicy;
    } else {
      updatedPolicy = {
        id: `zsp-${Date.now()}`,
        policyId: policyData.policyId || `POLICY-${policyData.zoneId.toUpperCase()}`,
        zoneId: policyData.zoneId,
        siteId: policyData.siteId || 'site-rsp-1',
        zoneName: policyData.zoneName,
        requiredPPE: policyData.requiredPPE || ['helmet', 'safety-vest'],
        restrictedAreas: policyData.restrictedAreas || [],
        hazardTypes: policyData.hazardTypes || [],
        severityRules: policyData.severityRules || [],
        riskWeights: policyData.riskWeights || {
          ppeWeight: 35,
          hazardWeight: 25,
          zoneWeight: 20,
          persistenceWeight: 15,
          contextualWeight: 5,
        },
        enabled: policyData.enabled !== false,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      };
      this.store.zoneSafetyPolicies.push(updatedPolicy);
    }

    // Persist to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await ZoneSafetyPolicyModel.findOneAndUpdate(
          { zoneId: updatedPolicy.zoneId },
          { $set: updatedPolicy },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn('[ZoneSafetyPolicyService] Failed to persist policy to MongoDB:', err);
      }
    }

    // Broadcast realtime event
    this.socketService.emitRealtimeEvent(
      'policy.updated',
      { policy: updatedPolicy },
      {
        entityType: 'zone_safety_policy',
        entityId: updatedPolicy.policyId,
        siteId: updatedPolicy.siteId,
        zoneId: updatedPolicy.zoneId,
        version: updatedPolicy.version,
      }
    );

    return updatedPolicy;
  }
}
