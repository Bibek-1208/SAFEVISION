import crypto from 'crypto';
import { DataStore, AuditLogDoc } from '../models/DataStore';
import { SocketService } from '../services/socket/SocketService';

export interface AuditLogInput {
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  siteId?: string;
  zoneId?: string;
  ipAddress?: string;
  userAgent?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  metadata?: Record<string, any>;
  before?: any;
  after?: any;
}

export class AuditLogger {
  private static store = DataStore.getInstance();
  private static readonly GENESIS_HASH = '0'.repeat(64);

  public static async log(entry: AuditLogInput): Promise<AuditLogDoc> {
    const id = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    
    // Most recent log is at index 0 of auditLogs
    const previousHash = AuditLogger.store.auditLogs.length > 0 
      ? AuditLogger.store.auditLogs[0].currentHash 
      : AuditLogger.GENESIS_HASH;

    // Deep clone snapshots to freeze their values immutably at signing time
    const beforeSnapshot = entry.before !== undefined ? JSON.parse(JSON.stringify(entry.before)) : undefined;
    const afterSnapshot = entry.after !== undefined ? JSON.parse(JSON.stringify(entry.after)) : undefined;

    const payload = JSON.stringify({
      id,
      timestamp,
      userId: entry.userId,
      userEmail: entry.userEmail,
      userRole: entry.userRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId || 'N/A',
      result: entry.result,
      previousHash,
      before: beforeSnapshot,
      after: afterSnapshot,
    });

    const currentHash = crypto.createHash('sha256').update(payload).digest('hex');

    const logDoc: AuditLogDoc = {
      id,
      userId: entry.userId,
      userEmail: entry.userEmail,
      userRole: entry.userRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId || 'N/A',
      siteId: entry.siteId,
      zoneId: entry.zoneId,
      timestamp,
      ipAddress: entry.ipAddress || '127.0.0.1',
      userAgent: entry.userAgent || 'SafeVision-Core',
      result: entry.result,
      metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : {},
      before: beforeSnapshot,
      after: afterSnapshot,
      previousHash,
      currentHash,
    };

    AuditLogger.store.auditLogs.unshift(logDoc);
    console.log(`[AuditLog] ${logDoc.action} | User: ${logDoc.userEmail} (${logDoc.userRole}) | Result: ${logDoc.result} | Hash: ${currentHash.substring(0, 8)}...`);
    
    try {
      SocketService.getInstance().emitAuditNew(logDoc);
    } catch {
      // Socket not ready or optional
    }

    return logDoc;
  }

  public static getLogs(filter?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    limit?: number;
  }): AuditLogDoc[] {
    let logs = [...AuditLogger.store.auditLogs];

    if (filter?.userId) {
      logs = logs.filter((l) => l.userId === filter.userId);
    }
    if (filter?.action) {
      logs = logs.filter((l) => l.action === filter.action);
    }
    if (filter?.resourceType) {
      logs = logs.filter((l) => l.resourceType === filter.resourceType);
    }

    return logs.slice(0, filter?.limit || 100);
  }

  public static verifyIntegrity(): {
    verified: boolean;
    totalLogs: number;
    tamperedAt?: string;
    reason?: string;
  } {
    const logs = [...AuditLogger.store.auditLogs];
    if (logs.length === 0) {
      return { verified: true, totalLogs: 0 };
    }

    // Chronological order from oldest to newest
    const chronological = [...logs].reverse();
    let expectedPreviousHash = AuditLogger.GENESIS_HASH;

    for (let i = 0; i < chronological.length; i++) {
      const log = chronological[i];

      if (log.previousHash !== expectedPreviousHash) {
        return {
          verified: false,
          totalLogs: logs.length,
          tamperedAt: log.id,
          reason: `Chain broken at log #${i + 1} (${log.id}): expected previousHash ${expectedPreviousHash.substring(0, 10)}... but found ${log.previousHash.substring(0, 10)}...`,
        };
      }

      const payload = JSON.stringify({
        id: log.id,
        timestamp: log.timestamp,
        userId: log.userId,
        userEmail: log.userEmail,
        userRole: log.userRole,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        result: log.result,
        previousHash: log.previousHash,
        before: log.before,
        after: log.after,
      });

      const recalculated = crypto.createHash('sha256').update(payload).digest('hex');
      if (recalculated !== log.currentHash) {
        return {
          verified: false,
          totalLogs: logs.length,
          tamperedAt: log.id,
          reason: `Hash mismatch at log #${i + 1} (${log.id}): payload content was modified after signing`,
        };
      }

      expectedPreviousHash = log.currentHash;
    }

    return { verified: true, totalLogs: logs.length };
  }
}
