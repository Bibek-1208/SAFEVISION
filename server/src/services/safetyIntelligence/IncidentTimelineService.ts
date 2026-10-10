import { DataStore, IncidentEventDoc, IncidentDoc } from '../../models/DataStore';
import { IncidentEventModel, IncidentModel } from '../../models/mongooseModels';
import { SocketService } from '../socket/SocketService';
import mongoose from 'mongoose';

export class IncidentTimelineService {
  private static instance: IncidentTimelineService;
  private store = DataStore.getInstance();
  private socketService = SocketService.getInstance();

  private constructor() {}

  public static getInstance(): IncidentTimelineService {
    if (!IncidentTimelineService.instance) {
      IncidentTimelineService.instance = new IncidentTimelineService();
    }
    return IncidentTimelineService.instance;
  }

  /**
   * Records a genuine real-time system lifecycle event for an incident.
   */
  public async recordEvent(
    incidentIdOrParams: string | { incidentId: string; eventType: string; description?: string; title?: string; actor?: any; metadata?: Record<string, any> },
    eventType?: string,
    description?: string,
    actor: string = 'SYSTEM_AI_ENGINE',
    metadata?: Record<string, any>
  ): Promise<IncidentEventDoc> {
    let finalIncidentId = '';
    let finalEventType = 'OBSERVATION';
    let finalDescription = '';
    let finalActor = 'SYSTEM_AI_ENGINE';
    let finalMetadata: Record<string, any> | undefined = undefined;

    if (typeof incidentIdOrParams === 'object') {
      finalIncidentId = incidentIdOrParams.incidentId;
      finalEventType = incidentIdOrParams.eventType || 'OBSERVATION';
      finalDescription = incidentIdOrParams.description || incidentIdOrParams.title || '';
      finalActor = typeof incidentIdOrParams.actor === 'object' ? incidentIdOrParams.actor.name || incidentIdOrParams.actor.role || 'USER' : (incidentIdOrParams.actor || 'SYSTEM_AI_ENGINE');
      finalMetadata = incidentIdOrParams.metadata;
    } else {
      finalIncidentId = incidentIdOrParams;
      finalEventType = eventType || 'OBSERVATION';
      finalDescription = description || '';
      finalActor = actor;
      finalMetadata = metadata;
    }

    const nowIso = new Date().toISOString();
    const eventDoc: IncidentEventDoc = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventId: `EVT-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`,
      incidentId: finalIncidentId,
      eventType: finalEventType,
      timestamp: nowIso,
      description: finalDescription,
      actor: finalActor,
      metadata: finalMetadata,
    };

    // 1. Append to DataStore memory incidentEvents
    this.store.incidentEvents.push(eventDoc);

    // 2. Append to target incident timeline array in DataStore
    const inc = this.store.incidents.find((i) => i.id === finalIncidentId || i.incidentId === finalIncidentId);
    if (inc) {
      if (!inc.timeline) inc.timeline = [];
      inc.timeline.push(eventDoc);
    }

    // 3. Persist to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await IncidentEventModel.create({
          eventId: eventDoc.eventId,
          incidentId: eventDoc.incidentId,
          eventType: eventDoc.eventType,
          timestamp: new Date(eventDoc.timestamp),
          description: eventDoc.description,
          actor: eventDoc.actor,
          metadata: eventDoc.metadata,
        });

        // Also push into IncidentModel.timeline
        await IncidentModel.findOneAndUpdate(
          { $or: [{ incidentId: finalIncidentId }, { id: finalIncidentId }] },
          { $push: { timeline: eventDoc } }
        );
      } catch (err) {
        console.warn('[IncidentTimelineService] MongoDB persistence error:', err);
      }
    }

    // 4. Emit realtime update via Socket.IO
    this.socketService.emitRealtimeEvent('incident.event_added', {
      incidentId: finalIncidentId,
      event: eventDoc,
    });

    return eventDoc;
  }

  /**
   * Retrieves chronological event timeline for an incident.
   */
  public async getTimeline(incidentId: string): Promise<IncidentEventDoc[]> {
    const inc = this.store.incidents.find((i) => i.id === incidentId || i.incidentId === incidentId);
    if (inc && inc.timeline && inc.timeline.length > 0) {
      return [...inc.timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const dbEvents = await IncidentEventModel.find({ incidentId }).sort({ timestamp: 1 });
        if (dbEvents && dbEvents.length > 0) {
          return dbEvents.map((e) => e.toObject() as unknown as IncidentEventDoc);
        }
      } catch (_) {}
    }

    return this.store.incidentEvents
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}
