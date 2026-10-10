import { IncidentModel, RestrictedZoneModel, EmergencyZoneModel, ZoneModel, NearMissModel } from '../../models/mongooseModels';
import { DataStore } from '../../models/DataStore';

export interface AnalyticsFilter {
  timeframe?: 'today' | '24h' | 'week' | '7d' | 'month' | '30d' | 'all' | string;
  startDate?: Date | string;
  endDate?: Date | string;
  cameraId?: string;
  zoneId?: string;
  violationType?: string;
  severity?: string;
  shift?: string;
  nearMissType?: string;
  ruleId?: string;
  status?: string;
}

export interface TimeSeriesPoint {
  bucket: string;
  time: string;
  incidents: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  compliance: number | null;
}

export interface SeverityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ViolationTypeDistribution {
  type: string;
  count: number;
  severity: string;
  fill: string;
}

export interface ZoneAnalytics {
  zoneId: string;
  zoneName: string;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topViolations: string[];
  cameras: string[];
  lastIncidentAt: Date | string | null;
  compliance: number | null;
  riskScore: number | null;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA';
  status: 'ACTIVE_DATA' | 'NO DATA';
}

export interface CameraAnalytics {
  cameraId: string;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  zones: string[];
  lastIncidentAt: Date | string | null;
}

export interface ShiftAnalytics {
  shift: string;
  hours: string;
  count: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  compliance: number | null;
}

export interface HeatmapPoint {
  incidentId?: string;
  cameraId: string;
  zoneId: string;
  zone?: string;
  x: number;
  y: number;
  severity: string;
  violationType: string;
  timestamp: Date | string;
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
  points: HeatmapPoint[];
}

export interface RepeatViolationItem {
  workerId: string;
  name: string;
  department: string;
  tier: string;
  count: number;
  lastViolation: Date | string | null;
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

// ==========================================
// Phase 10.6: Near-Miss Analytics Interfaces
// ==========================================
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

export interface NearMissAnalyticsResponse {
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
  // Phase 10.1 Backward-Compatibility
  total: number;
  nearMisses: any[];
  status: 'ACTIVE_DATA' | 'NO_DATA';
  message?: string;
}

export class AnalyticsAggregationService {
  private static instance: AnalyticsAggregationService;

  public static getInstance(): AnalyticsAggregationService {
    if (!AnalyticsAggregationService.instance) {
      AnalyticsAggregationService.instance = new AnalyticsAggregationService();
    }
    return AnalyticsAggregationService.instance;
  }

  /**
   * Helper to build MongoDB $match query from common filter parameters.
   */
  public buildMatchQuery(filter: AnalyticsFilter = {}): Record<string, any> {
    const match: Record<string, any> = {};
    const andClauses: any[] = [];

    let cutoffMs = 0;
    const now = Date.now();
    const tf = (filter.timeframe || 'all').toLowerCase();

    if (filter.startDate && filter.endDate) {
      const s = new Date(filter.startDate);
      const e = new Date(filter.endDate);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        andClauses.push({
          $or: [{ timestamp: { $gte: s } }, { timestamp: { $gte: s.toISOString() } }],
        });
        andClauses.push({
          $or: [{ timestamp: { $lte: e } }, { timestamp: { $lte: e.toISOString() } }],
        });
      }
    } else if (filter.startDate) {
      const s = new Date(filter.startDate);
      if (!isNaN(s.getTime())) {
        andClauses.push({
          $or: [{ timestamp: { $gte: s } }, { timestamp: { $gte: s.toISOString() } }],
        });
      }
    } else if (filter.endDate) {
      const e = new Date(filter.endDate);
      if (!isNaN(e.getTime())) {
        andClauses.push({
          $or: [{ timestamp: { $lte: e } }, { timestamp: { $lte: e.toISOString() } }],
        });
      }
    } else if (tf === 'today' || tf === '24h') {
      cutoffMs = now - 24 * 60 * 60 * 1000;
    } else if (tf === 'week' || tf === '7d') {
      cutoffMs = now - 7 * 24 * 60 * 60 * 1000;
    } else if (tf === 'month' || tf === '30d') {
      cutoffMs = now - 30 * 24 * 60 * 60 * 1000;
    }

    if (cutoffMs > 0 && andClauses.length === 0) {
      const cutoffDate = new Date(cutoffMs);
      andClauses.push({
        $or: [
          { timestamp: { $gte: cutoffDate } },
          { timestamp: { $gte: cutoffDate.toISOString() } },
        ],
      });
    }

    if (filter.cameraId && filter.cameraId !== 'all') {
      match.cameraId = filter.cameraId;
    }

    if (filter.zoneId && filter.zoneId !== 'all') {
      andClauses.push({
        $or: [
          { zoneId: filter.zoneId },
          { zone: filter.zoneId },
        ],
      });
    }

    if (filter.violationType && filter.violationType !== 'all') {
      match.violationType = filter.violationType;
    }

    if (filter.severity && filter.severity !== 'all') {
      match.severity = filter.severity;
    }

    if (andClauses.length > 0) {
      match.$and = andClauses;
    }

    return match;
  }

  /**
   * A. Time-Series Incident Aggregation (IST Timezone: +05:30)
   */
  public async getTimeSeries(
    filter: AnalyticsFilter = {},
    unit: 'hour' | 'day' | 'week' = 'hour'
  ): Promise<TimeSeriesPoint[]> {
    const match = this.buildMatchQuery(filter);

    const formatString = unit === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
    const labelFormat = unit === 'hour' ? '%H:00' : '%d %b';

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date: '$tsDate',
                format: formatString,
                timezone: '+05:30',
              },
            },
            timeLabel: {
              $dateToString: {
                date: '$tsDate',
                format: labelFormat,
                timezone: '+05:30',
              },
            },
          },
          count: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.bucket': 1 } },
      {
        $project: {
          _id: 0,
          bucket: '$_id.bucket',
          time: '$_id.timeLabel',
          incidents: '$count',
          criticalCount: 1,
          highCount: 1,
          mediumCount: 1,
          lowCount: 1,
        },
      },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    // If unit is 'hour' and timeframe is 24h/today, provide continuous 2-hour timeline intervals
    const tf = (filter.timeframe || '24h').toLowerCase();
    if (unit === 'hour' && (tf === '24h' || tf === 'today')) {
      const standardHours = [
        '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
        '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'
      ];
      const hourMap: Record<string, { count: number; crit: number; high: number; med: number; low: number }> = {};
      standardHours.forEach(h => {
        hourMap[h] = { count: 0, crit: 0, high: 0, med: 0, low: 0 };
      });

      results.forEach((r: any) => {
        const timePart = r.time; // e.g. "09:00"
        const hourNum = parseInt(timePart.split(':')[0], 10);
        if (!isNaN(hourNum)) {
          const bucketHour = Math.floor(hourNum / 2) * 2;
          const bucketKey = `${bucketHour.toString().padStart(2, '0')}:00`;
          if (hourMap[bucketKey]) {
            hourMap[bucketKey].count += r.incidents;
            hourMap[bucketKey].crit += r.criticalCount;
            hourMap[bucketKey].high += r.highCount;
            hourMap[bucketKey].med += r.mediumCount;
            hourMap[bucketKey].low += r.lowCount;
          }
        }
      });

      return standardHours.map(time => ({
        bucket: time,
        time,
        incidents: hourMap[time].count,
        criticalCount: hourMap[time].crit,
        highCount: hourMap[time].high,
        mediumCount: hourMap[time].med,
        lowCount: hourMap[time].low,
        compliance: null, // Denominator unavailable; truthful null
      }));
    }

    return results.map((r: any) => ({
      ...r,
      compliance: null, // Denominator unavailable; truthful null
    }));
  }

  /**
   * B. Real Severity Distribution
   */
  public async getSeverityDistribution(filter: AnalyticsFilter = {}): Promise<SeverityDistribution> {
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 },
        },
      },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    const dist: SeverityDistribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      total: 0,
    };

    results.forEach((r: any) => {
      const sev = String(r._id || '').toLowerCase();
      if (sev in dist) {
        (dist as any)[sev] = r.count;
      }
      dist.total += r.count;
    });

    return dist;
  }

  /**
   * C. Real Violation Type Distribution
   */
  public async getViolationTypeDistribution(filter: AnalyticsFilter = {}): Promise<ViolationTypeDistribution[]> {
    const match = this.buildMatchQuery(filter);

    const severityColors: Record<string, string> = {
      critical: '#EF4444',
      high: '#FBBF24',
      medium: '#3B82F6',
      low: '#34D399',
    };

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: '$violationType',
          count: { $sum: 1 },
          severities: { $push: '$severity' },
        },
      },
      { $sort: { count: -1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    return results.map((r: any) => {
      const formattedType = String(r._id || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
      // Determine predominant severity
      const counts: Record<string, number> = {};
      (r.severities || []).forEach((s: string) => {
        counts[s] = (counts[s] || 0) + 1;
      });
      let topSev = 'medium';
      let maxCnt = 0;
      Object.entries(counts).forEach(([sev, cnt]) => {
        if (cnt > maxCnt) {
          maxCnt = cnt;
          topSev = sev;
        }
      });

      return {
        type: formattedType,
        count: r.count,
        severity: topSev,
        fill: severityColors[topSev] || '#94A3B8',
      };
    });
  }

  /**
   * D. Real Zone Matrix Aggregation
   */
  public async getZoneMatrix(filter: AnalyticsFilter = {}): Promise<ZoneAnalytics[]> {
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: {
            zoneId: { $ifNull: ['$zoneId', '$zone'] },
            zoneName: '$zone',
          },
          incidentCount: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
          lastIncidentAt: { $max: '$timestamp' },
          types: { $push: '$violationType' },
          cameras: { $addToSet: '$cameraId' },
          avgRiskScore: { $avg: '$riskScore' },
        },
      },
      { $sort: { incidentCount: -1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    // Fetch live camera-linked zones for name resolution
    const [restrictedZones, emergencyZones] = await Promise.all([
      RestrictedZoneModel.find({}).lean(),
      EmergencyZoneModel.find({}).lean(),
    ]);

    const zoneNameMap: Record<string, string> = {};
    restrictedZones.forEach((rz: any) => {
      zoneNameMap[rz.id] = rz.name;
    });
    emergencyZones.forEach((ez: any) => {
      zoneNameMap[ez.id] = ez.name;
    });

    return results.map((r: any) => {
      const rawZoneId = r._id.zoneId || r._id.zoneName || 'UNKNOWN_ZONE';
      const resolvedName = zoneNameMap[rawZoneId] || r._id.zoneName || rawZoneId;

      // Calculate distinct top violations
      const typeFreq: Record<string, number> = {};
      (r.types || []).forEach((t: string) => {
        typeFreq[t] = (typeFreq[t] || 0) + 1;
      });
      const topViolations = Object.entries(typeFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k.replace(/_/g, ' '));

      const riskScore = r.avgRiskScore ? Math.round(r.avgRiskScore) : null;
      let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA' = 'LOW';
      if (r.criticalCount > 0 || (riskScore && riskScore >= 80)) riskLevel = 'CRITICAL';
      else if (r.highCount > 0 || (riskScore && riskScore >= 60)) riskLevel = 'HIGH';
      else if (riskScore && riskScore >= 30) riskLevel = 'MODERATE';

      return {
        zoneId: rawZoneId,
        zoneName: resolvedName,
        incidentCount: r.incidentCount,
        criticalCount: r.criticalCount,
        highCount: r.highCount,
        mediumCount: r.mediumCount,
        lowCount: r.lowCount,
        topViolations,
        cameras: r.cameras || [],
        lastIncidentAt: r.lastIncidentAt,
        compliance: null, // Denominator unavailable; truthful null
        riskScore,
        riskLevel,
        status: r.incidentCount > 0 ? 'ACTIVE_DATA' : 'NO DATA',
      };
    });
  }

  /**
   * E. Camera Analytics (Multi-Camera, supports CAM-4 and future 8/16 cameras)
   */
  public async getCameraAnalytics(filter: AnalyticsFilter = {}): Promise<CameraAnalytics[]> {
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: '$cameraId',
          incidentCount: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
          zones: { $addToSet: '$zone' },
          lastIncidentAt: { $max: '$timestamp' },
        },
      },
      { $sort: { incidentCount: -1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    return results.map((r: any) => ({
      cameraId: r._id || 'UNKNOWN_CAMERA',
      incidentCount: r.incidentCount,
      criticalCount: r.criticalCount,
      highCount: r.highCount,
      mediumCount: r.mediumCount,
      lowCount: r.lowCount,
      zones: r.zones || [],
      lastIncidentAt: r.lastIncidentAt,
    }));
  }

  /**
   * F. Phase 10.5 — Safety Incident Heatmap (Persisted Incident Density Heatmap)
   * Deterministic 20x20 normalized grid over camera frame, with truthful accounting
   * of spatial vs excluded incidents, shift classification (+05:30 IST),
   * top hotspots, zone context, and previous-period trend.
   */
  public async getSafetyHeatmap(
    filter: AnalyticsFilter = {},
    limit: number = 500
  ): Promise<SafetyHeatmapResponse> {
    const GRID_SIZE = 20;
    const match = this.buildMatchQuery(filter);

    // Initial pipeline stages
    const pipeline: any[] = [{ $match: match }];

    // Add tsDate conversion
    pipeline.push({
      $addFields: {
        tsDate: {
          $convert: {
            input: '$timestamp',
            to: 'date',
            onError: null,
            onNull: null,
          },
        },
      },
    });

    // If shift filter is provided, calculate localHour in IST (+05:30) and match
    const shiftStr = (filter.shift || '').toLowerCase().trim();
    if (shiftStr && shiftStr !== 'all') {
      pipeline.push({
        $addFields: {
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
        },
      });

      if (shiftStr.includes('morn')) {
        pipeline.push({
          $match: {
            localHour: { $gte: 6, $lt: 14 },
          },
        });
      } else if (shiftStr.includes('aft')) {
        pipeline.push({
          $match: {
            localHour: { $gte: 14, $lt: 22 },
          },
        });
      } else if (shiftStr.includes('nigh')) {
        pipeline.push({
          $match: {
            $or: [{ localHour: { $gte: 22 } }, { localHour: { $lt: 6 } }],
          },
        });
      }
    }

    // Add validation of bounding box
    pipeline.push({
      $addFields: {
        hasValidBbox: {
          $and: [
            { $in: [{ $type: '$boundingBox.xmin' }, ['double', 'int', 'long', 'decimal']] },
            { $in: [{ $type: '$boundingBox.ymin' }, ['double', 'int', 'long', 'decimal']] },
            { $in: [{ $type: '$boundingBox.xmax' }, ['double', 'int', 'long', 'decimal']] },
            { $in: [{ $type: '$boundingBox.ymax' }, ['double', 'int', 'long', 'decimal']] },
            { $gte: ['$boundingBox.xmax', '$boundingBox.xmin'] },
            { $gte: ['$boundingBox.ymax', '$boundingBox.ymin'] },
          ],
        },
      },
    });

    // Facet aggregation for totalCount, spatialCount, cells, zoneBreakdown, points
    pipeline.push({
      $facet: {
        totalCount: [{ $count: 'count' }],
        spatialCount: [{ $match: { hasValidBbox: true } }, { $count: 'count' }],
        cells: [
          { $match: { hasValidBbox: true } },
          {
            $project: {
              rawXmin: '$boundingBox.xmin',
              rawYmin: '$boundingBox.ymin',
              rawXmax: '$boundingBox.xmax',
              rawYmax: '$boundingBox.ymax',
              maxDim: { $max: ['$boundingBox.xmax', '$boundingBox.ymax'] },
            },
          },
          {
            $project: {
              normX: {
                $switch: {
                  branches: [
                    {
                      case: { $lte: ['$maxDim', 1.05] },
                      then: { $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] },
                    },
                    {
                      case: { $lte: ['$maxDim', 100.0] },
                      then: { $divide: [{ $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] }, 100.0] },
                    },
                  ],
                  default: { $divide: [{ $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] }, 640.0] },
                },
              },
              normY: {
                $switch: {
                  branches: [
                    {
                      case: { $lte: ['$maxDim', 1.05] },
                      then: { $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] },
                    },
                    {
                      case: { $lte: ['$maxDim', 100.0] },
                      then: { $divide: [{ $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] }, 100.0] },
                    },
                  ],
                  default: { $divide: [{ $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] }, 480.0] },
                },
              },
            },
          },
          {
            $project: {
              clampedX: { $max: [0.0, { $min: [0.9999, '$normX'] }] },
              clampedY: { $max: [0.0, { $min: [0.9999, '$normY'] }] },
            },
          },
          {
            $project: {
              cellX: { $floor: { $multiply: ['$clampedX', GRID_SIZE] } },
              cellY: { $floor: { $multiply: ['$clampedY', GRID_SIZE] } },
            },
          },
          {
            $group: {
              _id: { x: '$cellX', y: '$cellY' },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        zoneBreakdown: [
          {
            $project: {
              hasValidBbox: 1,
              resolvedZone: { $ifNull: ['$zoneId', '$zone', 'General Area'] },
            },
          },
          {
            $group: {
              _id: '$resolvedZone',
              totalCount: { $sum: 1 },
              spatialCount: { $sum: { $cond: ['$hasValidBbox', 1, 0] } },
            },
          },
          { $sort: { totalCount: -1 } },
          { $limit: 10 },
        ],
        points: [
          { $match: { hasValidBbox: true } },
          { $sort: { timestamp: -1 } },
          { $limit: Math.max(1, Math.min(1000, limit)) },
          {
            $project: {
              rawXmin: '$boundingBox.xmin',
              rawYmin: '$boundingBox.ymin',
              rawXmax: '$boundingBox.xmax',
              rawYmax: '$boundingBox.ymax',
              maxDim: { $max: ['$boundingBox.xmax', '$boundingBox.ymax'] },
              incidentId: 1,
              cameraId: 1,
              zoneId: { $ifNull: ['$zoneId', '$zone', ''] },
              zone: 1,
              severity: 1,
              violationType: 1,
              timestamp: 1,
            },
          },
          {
            $project: {
              incidentId: 1,
              cameraId: 1,
              zoneId: 1,
              zone: 1,
              severity: 1,
              violationType: 1,
              timestamp: 1,
              x: {
                $switch: {
                  branches: [
                    {
                      case: { $lte: ['$maxDim', 1.05] },
                      then: { $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] },
                    },
                    {
                      case: { $lte: ['$maxDim', 100.0] },
                      then: { $divide: [{ $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] }, 100.0] },
                    },
                  ],
                  default: { $divide: [{ $divide: [{ $add: ['$rawXmin', '$rawXmax'] }, 2.0] }, 640.0] },
                },
              },
              y: {
                $switch: {
                  branches: [
                    {
                      case: { $lte: ['$maxDim', 1.05] },
                      then: { $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] },
                    },
                    {
                      case: { $lte: ['$maxDim', 100.0] },
                      then: { $divide: [{ $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] }, 100.0] },
                    },
                  ],
                  default: { $divide: [{ $divide: [{ $add: ['$rawYmin', '$rawYmax'] }, 2.0] }, 480.0] },
                },
              },
            },
          },
        ],
      },
    });

    const [aggResult] = await IncidentModel.aggregate(pipeline);

    const totalIncidentCount = aggResult?.totalCount?.[0]?.count || 0;
    const spatialIncidentCount = aggResult?.spatialCount?.[0]?.count || 0;
    const excludedIncidentCount = Math.max(0, totalIncidentCount - spatialIncidentCount);

    const rawCells: Array<{ _id: { x: number; y: number }; count: number }> = aggResult?.cells || [];
    const maxCellCount = rawCells.length > 0 ? Math.max(...rawCells.map((c) => c.count)) : 0;

    const cells: HeatmapCell[] = rawCells.map((rc) => {
      const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(rc._id.x)));
      const y = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(rc._id.y)));
      const count = rc.count;
      const density = maxCellCount > 0 ? Number((count / maxCellCount).toFixed(4)) : 0;
      return {
        x,
        y,
        count,
        density,
        normXStart: Number((x / GRID_SIZE).toFixed(4)),
        normXEnd: Number(((x + 1) / GRID_SIZE).toFixed(4)),
        normYStart: Number((y / GRID_SIZE).toFixed(4)),
        normYEnd: Number(((y + 1) / GRID_SIZE).toFixed(4)),
      };
    });

    const topHotspots: SpatialHotspot[] = cells.slice(0, 5).map((c, idx) => ({
      rank: idx + 1,
      cellX: c.x,
      cellY: c.y,
      label: `Frame Region (X: ${c.normXStart.toFixed(2)}–${c.normXEnd.toFixed(2)}, Y: ${c.normYStart.toFixed(2)}–${c.normYEnd.toFixed(2)})`,
      count: c.count,
      density: c.density,
    }));

    const zoneContext: ZoneSpatialContext[] = (aggResult?.zoneBreakdown || []).map((z: any) => ({
      zoneId: String(z._id || 'Unknown Zone'),
      zoneName: String(z._id || 'Unknown Zone'),
      totalCount: z.totalCount || 0,
      spatialCount: z.spatialCount || 0,
    }));

    const points: HeatmapPoint[] = (aggResult?.points || []).map((p: any) => ({
      incidentId: p.incidentId,
      cameraId: p.cameraId,
      zoneId: p.zoneId || p.zone || '',
      zone: p.zone,
      x: Number((p.x || 0).toFixed(4)),
      y: Number((p.y || 0).toFixed(4)),
      severity: p.severity,
      violationType: p.violationType,
      timestamp: p.timestamp,
    }));

    // Previous period trend calculation
    const tf = (filter.timeframe || 'all').toLowerCase();
    const trend = await this.computeSpatialHeatmapTrend(filter, spatialIncidentCount, tf);

    return {
      timeframe: filter.timeframe || 'all',
      grid: {
        rows: GRID_SIZE,
        columns: GRID_SIZE,
      },
      cells,
      totalIncidentCount,
      spatialIncidentCount,
      excludedIncidentCount,
      maxCellCount,
      cameraId: filter.cameraId && filter.cameraId !== 'all' ? filter.cameraId : 'ALL',
      topHotspots,
      trend,
      zoneContext,
      filters: {
        cameraId: filter.cameraId && filter.cameraId !== 'all' ? filter.cameraId : null,
        zoneId: filter.zoneId && filter.zoneId !== 'all' ? filter.zoneId : null,
        severity: filter.severity && filter.severity !== 'all' ? filter.severity : null,
        violationType: filter.violationType && filter.violationType !== 'all' ? filter.violationType : null,
        shift: filter.shift && filter.shift !== 'all' ? filter.shift : null,
      },
      totalPoints: spatialIncidentCount,
      points,
    };
  }

  private async computeSpatialHeatmapTrend(
    filter: AnalyticsFilter,
    currentCount: number,
    timeframe: string
  ): Promise<HeatmapTrend> {
    const now = Date.now();
    let periodMs = 0;
    if (timeframe === 'today' || timeframe === '24h') {
      periodMs = 24 * 60 * 60 * 1000;
    } else if (timeframe === 'week' || timeframe === '7d') {
      periodMs = 7 * 24 * 60 * 60 * 1000;
    } else if (timeframe === 'month' || timeframe === '30d') {
      periodMs = 30 * 24 * 60 * 60 * 1000;
    }

    if (periodMs === 0) {
      return {
        currentCount,
        previousCount: 0,
        changeCount: 0,
        changePercent: null,
        direction: 'stable',
        statement: 'Observing all historical persisted spatial incidents.',
      };
    }

    const prevStart = new Date(now - 2 * periodMs);
    const prevEnd = new Date(now - periodMs);

    const prevFilter: AnalyticsFilter = {
      ...filter,
      timeframe: undefined,
      startDate: prevStart,
      endDate: prevEnd,
    };

    const prevMatch = this.buildMatchQuery(prevFilter);
    const prevPipeline: any[] = [
      { $match: prevMatch },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
    ];

    const shiftStr = (filter.shift || '').toLowerCase().trim();
    if (shiftStr && shiftStr !== 'all') {
      prevPipeline.push({
        $addFields: {
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
        },
      });

      if (shiftStr.includes('morn')) {
        prevPipeline.push({
          $match: { localHour: { $gte: 6, $lt: 14 } },
        });
      } else if (shiftStr.includes('aft')) {
        prevPipeline.push({
          $match: { localHour: { $gte: 14, $lt: 22 } },
        });
      } else if (shiftStr.includes('nigh')) {
        prevPipeline.push({
          $match: { $or: [{ localHour: { $gte: 22 } }, { localHour: { $lt: 6 } }] },
        });
      }
    }

    prevPipeline.push(
      {
        $match: {
          'boundingBox.xmin': { $exists: true, $ne: null },
          'boundingBox.ymin': { $exists: true, $ne: null },
          'boundingBox.xmax': { $exists: true, $ne: null },
          'boundingBox.ymax': { $exists: true, $ne: null },
        },
      },
      { $count: 'count' }
    );

    const [prevRes] = await IncidentModel.aggregate(prevPipeline);
    const previousCount = prevRes?.count || 0;
    const changeCount = currentCount - previousCount;

    let changePercent: number | null = null;
    let statement = '';
    let direction: 'increase' | 'decrease' | 'stable' = 'stable';

    if (previousCount === 0) {
      changePercent = null;
      if (currentCount === 0) {
        statement = 'No spatial incidents recorded in current or previous period.';
        direction = 'stable';
      } else {
        statement = `Spatial incidents increased from 0 to ${currentCount}.`;
        direction = 'increase';
      }
    } else {
      changePercent = Number((((currentCount - previousCount) / previousCount) * 100).toFixed(1));
      if (changeCount > 0) {
        direction = 'increase';
        statement = `Spatial incidents increased by +${changeCount} (${changePercent}%).`;
      } else if (changeCount < 0) {
        direction = 'decrease';
        statement = `Spatial incidents decreased by ${changeCount} (${changePercent}%).`;
      } else {
        direction = 'stable';
        statement = 'Spatial incident frequency remained stable compared to previous period.';
      }
    }

    return {
      currentCount,
      previousCount,
      changeCount,
      changePercent,
      direction,
      statement,
    };
  }

  /**
   * Spatial Heatmap Data Extraction (Centroid x, y from BoundingBox)
   * Backward compatible endpoint delegates to getSafetyHeatmap
   */
  public async getSpatialHeatmapData(
    filter: AnalyticsFilter = {},
    limit: number = 500
  ): Promise<HeatmapPoint[]> {
    const heatmap = await this.getSafetyHeatmap(filter, limit);
    return heatmap.points;
  }

  /**
   * G. Deterministic Shift Analytics in Plant Local Timezone (UTC+05:30)
   * Shifts:
   * - Morning: 06:00 - 14:00
   * - Afternoon: 14:00 - 22:00
   * - Night: 22:00 - 06:00
   */
  public async getShiftAnalytics(filter: AnalyticsFilter = {}): Promise<ShiftAnalytics[]> {
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $project: {
          severity: 1,
          timestamp: 1,
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $project: {
          severity: 1,
          timestamp: 1,
          shift: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 6] },
                      { $lt: ['$localHour', 14] },
                    ],
                  },
                  then: 'Morning Shift (06:00 - 14:00)',
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 14] },
                      { $lt: ['$localHour', 22] },
                    ],
                  },
                  then: 'Afternoon Shift (14:00 - 22:00)',
                },
              ],
              default: 'Night Shift (22:00 - 06:00)',
            },
          },
        },
      },
      {
        $group: {
          _id: '$shift',
          incidentCount: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
        },
      },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    const shiftMap: Record<string, any> = {};
    results.forEach((r: any) => {
      shiftMap[r._id] = r;
    });

    const SHIFT_TEMPLATES = [
      { shift: 'Morning Shift', hours: '06:00 - 14:00', key: 'Morning Shift (06:00 - 14:00)' },
      { shift: 'Afternoon Shift', hours: '14:00 - 22:00', key: 'Afternoon Shift (14:00 - 22:00)' },
      { shift: 'Night Shift', hours: '22:00 - 06:00', key: 'Night Shift (22:00 - 06:00)' },
    ];

    return SHIFT_TEMPLATES.map(t => {
      const data = shiftMap[t.key];
      const count = data ? data.incidentCount : 0;
      return {
        shift: t.shift,
        hours: t.hours,
        count,
        criticalCount: data ? data.criticalCount : 0,
        highCount: data ? data.highCount : 0,
        mediumCount: data ? data.mediumCount : 0,
        lowCount: data ? data.lowCount : 0,
        compliance: null, // Denominator unavailable; truthful null
      };
    });
  }

  /**
   * H. Real Repeat Violations (Tracked Persons & Verified Employees)
   * No invented worker records!
   */
  public async getRepeatViolations(filter: AnalyticsFilter = {}): Promise<RepeatViolationItem[]> {
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $project: {
          identityKey: {
            $cond: [
              { $and: [{ $ne: ['$employeeId', null] }, { $ne: ['$employeeId', ''] }] },
              '$employeeId',
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$workerId', null] },
                      { $ne: ['$workerId', 'UNIDENTIFIED'] },
                      { $ne: ['$workerId', ''] },
                    ],
                  },
                  '$workerId',
                  {
                    $cond: [
                      { $and: [{ $ne: ['$trackId', null] }, { $ne: ['$trackId', ''] }] },
                      { $concat: ['Tracked person: ', '$trackId'] },
                      'Unidentified worker',
                    ],
                  },
                ],
              },
            ],
          },
          workerName: 1,
          employeeId: 1,
          trackId: 1,
          timestamp: 1,
        },
      },
      {
        $group: {
          _id: '$identityKey',
          count: { $sum: 1 },
          lastViolation: { $max: '$timestamp' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    return results.map((r: any) => {
      const id = r._id;
      const isTracked = String(id).startsWith('Tracked person:');
      const isUnidentified = id === 'Unidentified worker';

      let name = id;
      let department = 'CCTV Visual Telemetry';
      let tier = 'Dynamic Tracking';

      if (isTracked) {
        name = id;
        department = 'Automated ByteTrack Cluster';
        tier = 'CCTV Tracker ID';
      } else if (isUnidentified) {
        name = 'Unidentified Personnel';
        department = 'Unassigned';
        tier = 'Unclassified';
      } else {
        name = `Worker ${id}`;
        department = 'Operations';
        tier = 'Plant Personnel';
      }

      return {
        workerId: id,
        name,
        department,
        tier,
        count: r.count,
        lastViolation: r.lastViolation,
      };
    });
  }

  /**
   * I. Real Comprehensive Analytics Payload (for GET /api/analytics)
   */
  public async getDashboardAnalytics(filter: AnalyticsFilter = {}): Promise<any> {
    const [
      complianceHourly,
      violationsByType,
      violationsByZone,
      incidentsByShift,
      severityDist,
      repeatViolations,
      allIncidentsCount,
      activeCriticalCount,
      activeWarningCount,
      resolvedIncidents,
    ] = await Promise.all([
      this.getTimeSeries(filter, 'hour'),
      this.getViolationTypeDistribution(filter),
      this.getZoneMatrix(filter),
      this.getShiftAnalytics(filter),
      this.getSeverityDistribution(filter),
      this.getRepeatViolations(filter),
      IncidentModel.countDocuments(this.buildMatchQuery(filter)),
      IncidentModel.countDocuments({
        ...this.buildMatchQuery(filter),
        severity: 'critical',
        status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] },
      }),
      IncidentModel.countDocuments({
        ...this.buildMatchQuery(filter),
        severity: { $in: ['high', 'medium'] },
        status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] },
      }),
      IncidentModel.find({
        ...this.buildMatchQuery(filter),
        status: 'RESOLVED',
        resolvedAt: { $exists: true, $ne: null },
      }).select('timestamp resolvedAt').lean(),
    ]);

    // Compute Resolution Statistics
    const totalCount = allIncidentsCount;
    const resolvedCount = resolvedIncidents.length;
    const resolutionRatePercent = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : null;

    let averageResponseTimeMin: number | null = null;
    if (resolvedCount > 0) {
      const totalDiffMinutes = resolvedIncidents.reduce((acc: number, inc: any) => {
        const start = new Date(inc.timestamp).getTime();
        const end = new Date(inc.resolvedAt).getTime();
        const diffMin = Math.max(0, (end - start) / 60000);
        return acc + diffMin;
      }, 0);
      averageResponseTimeMin = Math.round((totalDiffMinutes / resolvedCount) * 10) / 10;
    }

    // Safety Index (calculated from actual severity penalty deductions)
    const penalty = (severityDist.critical * 15) + (severityDist.high * 5) + (severityDist.medium * 2);
    const safetyIndex = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    let status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL' | 'NO_DATA' = 'OPTIMAL';
    if (totalCount === 0) status = 'NO_DATA';
    else if (safetyIndex < 60 || severityDist.critical > 0) status = 'CRITICAL';
    else if (safetyIndex < 85) status = 'MODERATE';

    const kpis = {
      averageResponseTimeMin,
      resolutionRatePercent,
      activeCriticalCount,
      activeWarningCount,
      overallCompliance: null, // Denominator unavailable; truthful null
      safetyIndex,
      status,
      totalIncidents: totalCount,
    };

    const scoreReport = {
      score: safetyIndex,
      status,
      message: `${totalCount} real safety incidents aggregated from MongoDB across cameras.`,
      totalIncidents: totalCount,
      criticalCount: severityDist.critical,
      highCount: severityDist.high,
      mediumCount: severityDist.medium,
      ppeComplianceRate: null, // Denominator unavailable; truthful null
      auditedPeriod: filter.timeframe || 'all',
    };

    return {
      complianceHourly,
      violationsByType,
      violationsByZone,
      incidentsByShift,
      kpis,
      scoreReport,
      repeatViolations,
    };
  }

  /**
   * Helper to determine timeframe bucket unit and formatting
   */
  public determineTimeframeBucket(timeframe: string = '7d'): {
    unit: 'hour' | 'day' | 'week';
    formatString: string;
    labelFormat: string;
    durationMs: number;
  } {
    const tf = (timeframe || '7d').toLowerCase();
    if (tf === 'today' || tf === '24h') {
      return {
        unit: 'hour',
        formatString: '%Y-%m-%d %H:00',
        labelFormat: '%H:00',
        durationMs: 24 * 60 * 60 * 1000,
      };
    }
    if (tf === 'week' || tf === '7d') {
      return {
        unit: 'day',
        formatString: '%Y-%m-%d',
        labelFormat: '%d %b',
        durationMs: 7 * 24 * 60 * 60 * 1000,
      };
    }
    if (tf === 'month' || tf === '30d') {
      return {
        unit: 'day',
        formatString: '%Y-%m-%d',
        labelFormat: '%d %b',
        durationMs: 30 * 24 * 60 * 60 * 1000,
      };
    }
    return {
      unit: 'day',
      formatString: '%Y-%m-%d',
      labelFormat: '%d %b',
      durationMs: 0,
    };
  }

  /**
   * J. Real Historical Incident Volume Trends
   */
  public async getIncidentTrends(filter: AnalyticsFilter = {}): Promise<IncidentTrendPoint[]> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.formatString,
                timezone: '+05:30',
              },
            },
            timeLabel: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.labelFormat,
                timezone: '+05:30',
              },
            },
          },
          total: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          high: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          medium: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          low: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
          info: {
            $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.bucket': 1 } },
      {
        $project: {
          _id: 0,
          bucket: '$_id.bucket',
          timeLabel: '$_id.timeLabel',
          total: 1,
          critical: 1,
          high: 1,
          medium: 1,
          low: 1,
          info: 1,
        },
      },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    // Continuous timeline padding for standard ranges
    const now = Date.now();
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const resultMap = new Map<string, any>();
    results.forEach((r: any) => resultMap.set(r.bucket, r));

    if (tf === '24h' || tf === 'today') {
      const continuous: IncidentTrendPoint[] = [];
      for (let i = 23; i >= 0; i--) {
        const ms = now - i * 3600 * 1000;
        const istMs = ms + (5.5 * 3600 * 1000);
        const istD = new Date(istMs);
        const y = istD.getUTCFullYear();
        const m = String(istD.getUTCMonth() + 1).padStart(2, '0');
        const d = String(istD.getUTCDate()).padStart(2, '0');
        const h = String(istD.getUTCHours()).padStart(2, '0');
        const bucketKey = `${y}-${m}-${d} ${h}:00`;
        const timeLabel = `${h}:00`;

        const existing = resultMap.get(bucketKey);
        continuous.push({
          bucket: bucketKey,
          timeLabel,
          total: existing ? existing.total : 0,
          critical: existing ? existing.critical : 0,
          high: existing ? existing.high : 0,
          medium: existing ? existing.medium : 0,
          low: existing ? existing.low : 0,
          info: existing ? existing.info : 0,
          compliance: null,
        });
      }
      return continuous;
    }

    if (tf === '7d' || tf === 'week') {
      const continuous: IncidentTrendPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const ms = now - i * 24 * 3600 * 1000;
        const istMs = ms + (5.5 * 3600 * 1000);
        const istD = new Date(istMs);
        const y = istD.getUTCFullYear();
        const m = String(istD.getUTCMonth() + 1).padStart(2, '0');
        const d = String(istD.getUTCDate()).padStart(2, '0');
        const bucketKey = `${y}-${m}-${d}`;
        const timeLabel = `${d} ${MONTH_NAMES[istD.getUTCMonth()]}`;

        const existing = resultMap.get(bucketKey);
        continuous.push({
          bucket: bucketKey,
          timeLabel,
          total: existing ? existing.total : 0,
          critical: existing ? existing.critical : 0,
          high: existing ? existing.high : 0,
          medium: existing ? existing.medium : 0,
          low: existing ? existing.low : 0,
          info: existing ? existing.info : 0,
          compliance: null,
        });
      }
      return continuous;
    }

    if (tf === '30d' || tf === 'month') {
      const continuous: IncidentTrendPoint[] = [];
      for (let i = 29; i >= 0; i--) {
        const ms = now - i * 24 * 3600 * 1000;
        const istMs = ms + (5.5 * 3600 * 1000);
        const istD = new Date(istMs);
        const y = istD.getUTCFullYear();
        const m = String(istD.getUTCMonth() + 1).padStart(2, '0');
        const d = String(istD.getUTCDate()).padStart(2, '0');
        const bucketKey = `${y}-${m}-${d}`;
        const timeLabel = `${d} ${MONTH_NAMES[istD.getUTCMonth()]}`;

        const existing = resultMap.get(bucketKey);
        continuous.push({
          bucket: bucketKey,
          timeLabel,
          total: existing ? existing.total : 0,
          critical: existing ? existing.critical : 0,
          high: existing ? existing.high : 0,
          medium: existing ? existing.medium : 0,
          low: existing ? existing.low : 0,
          info: existing ? existing.info : 0,
          compliance: null,
        });
      }
      return continuous;
    }

    return results.map((r: any) => ({
      ...r,
      compliance: null,
    }));
  }

  /**
   * K. Real Historical Severity Trends
   */
  public async getSeverityTrends(filter: AnalyticsFilter = {}): Promise<SeverityTrendPoint[]> {
    const incTrends = await this.getIncidentTrends(filter);
    return incTrends.map((t) => ({
      bucket: t.bucket,
      timeLabel: t.timeLabel,
      critical: t.critical,
      high: t.high,
      medium: t.medium,
      low: t.low,
      info: t.info,
      total: t.total,
    }));
  }

  /**
   * L. Real Historical Violation Type Trends
   */
  public async getViolationTrends(filter: AnalyticsFilter = {}): Promise<ViolationTrendSeries> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.formatString,
                timezone: '+05:30',
              },
            },
            timeLabel: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.labelFormat,
                timezone: '+05:30',
              },
            },
            violationType: '$violationType',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.bucket': 1, count: -1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    // Extract distinct types & counts
    const typeTotals: Record<string, number> = {};
    results.forEach((r: any) => {
      const vt = r._id.violationType || 'unknown';
      typeTotals[vt] = (typeTotals[vt] || 0) + r.count;
    });

    const COLOR_PALETTE: Record<string, string> = {
      missing_helmet: '#EF4444',
      missing_vest: '#F59E0B',
      restricted_zone: '#8B5CF6',
      unverified_person_in_restricted_zone: '#EC4899',
      emergency_route_blockage: '#DC2626',
      emergency_exit_blockage: '#E11D48',
      worker_isolated: '#3B82F6',
      lone_worker: '#0284C7',
      no_gloves: '#10B981',
      no_safety_footwear: '#059669',
      smoke: '#6B7280',
      fire: '#B91C1C',
      worker_fall: '#7C3AED',
      unsafe_crowding: '#D97706',
    };

    const FALLBACK_COLORS = ['#38BDF8', '#34D399', '#F472B6', '#A78BFA', '#FBBF24', '#60A5FA'];
    let fallbackIdx = 0;

    const types = Object.entries(typeTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        count,
        color: COLOR_PALETTE[type] || FALLBACK_COLORS[(fallbackIdx++) % FALLBACK_COLORS.length],
      }));

    // Pivot into timeline
    // Get continuous baseline from incident trends
    const incidentBase = await this.getIncidentTrends(filter);
    const bucketItemMap = new Map<string, Record<string, any>>();

    incidentBase.forEach((base) => {
      bucketItemMap.set(base.bucket, {
        bucket: base.bucket,
        timeLabel: base.timeLabel,
        total: base.total,
      });
    });

    results.forEach((r: any) => {
      const bKey = r._id.bucket;
      const vType = r._id.violationType || 'unknown';
      const item = bucketItemMap.get(bKey);
      if (item) {
        item[vType] = r.count;
      } else {
        bucketItemMap.set(bKey, {
          bucket: bKey,
          timeLabel: r._id.timeLabel,
          total: r.count,
          [vType]: r.count,
        });
      }
    });

    const timeline = Array.from(bucketItemMap.values()).map((item) => {
      const copy = { ...item };
      types.forEach((t) => {
        if (copy[t.type] === undefined) {
          copy[t.type] = 0;
        }
      });
      return copy;
    });

    return {
      timeline,
      types,
    };
  }

  /**
   * M. Real Historical Zone Trends
   */
  public async getZoneTrends(filter: AnalyticsFilter = {}): Promise<ZoneTrendSeries> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.formatString,
                timezone: '+05:30',
              },
            },
            timeLabel: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.labelFormat,
                timezone: '+05:30',
              },
            },
            zoneId: { $ifNull: ['$zoneId', '$zone'] },
            zoneName: '$zone',
          },
          count: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          high: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          medium: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          low: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.bucket': 1, count: -1 } },
    ];

    const [results, restrictedZones, emergencyZones] = await Promise.all([
      IncidentModel.aggregate(pipeline),
      RestrictedZoneModel.find({}).lean(),
      EmergencyZoneModel.find({}).lean(),
    ]);

    const zoneNameMap: Record<string, string> = {};
    restrictedZones.forEach((rz: any) => {
      zoneNameMap[rz.id] = rz.name;
    });
    emergencyZones.forEach((ez: any) => {
      zoneNameMap[ez.id] = ez.name;
    });

    const zoneTotals: Record<string, { zoneName: string; total: number }> = {};
    results.forEach((r: any) => {
      const zId = r._id.zoneId || r._id.zoneName || 'UNKNOWN_ZONE';
      const resolvedName = zoneNameMap[zId] || r._id.zoneName || zId;
      if (!zoneTotals[zId]) {
        zoneTotals[zId] = { zoneName: resolvedName, total: 0 };
      }
      zoneTotals[zId].total += r.count;
    });

    const zones = Object.entries(zoneTotals)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([zoneId, info]) => ({
        zoneId,
        zoneName: info.zoneName,
        totalIncidents: info.total,
      }));

    const incidentBase = await this.getIncidentTrends(filter);
    const bucketItemMap = new Map<string, Record<string, any>>();

    incidentBase.forEach((base) => {
      bucketItemMap.set(base.bucket, {
        bucket: base.bucket,
        timeLabel: base.timeLabel,
        total: base.total,
      });
    });

    results.forEach((r: any) => {
      const bKey = r._id.bucket;
      const zId = r._id.zoneId || r._id.zoneName || 'UNKNOWN_ZONE';
      const resolvedName = zoneNameMap[zId] || r._id.zoneName || zId;
      const item = bucketItemMap.get(bKey);
      if (item) {
        item[resolvedName] = (item[resolvedName] || 0) + r.count;
      } else {
        bucketItemMap.set(bKey, {
          bucket: bKey,
          timeLabel: r._id.timeLabel,
          total: r.count,
          [resolvedName]: r.count,
        });
      }
    });

    const timeline = Array.from(bucketItemMap.values()).map((item) => {
      const copy = { ...item };
      zones.forEach((z) => {
        if (copy[z.zoneName] === undefined) {
          copy[z.zoneName] = 0;
        }
      });
      return copy;
    });

    return {
      timeline,
      zones,
    };
  }

  /**
   * N. Real Historical Camera Trends
   */
  public async getCameraTrends(filter: AnalyticsFilter = {}): Promise<CameraTrendSeries> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.formatString,
                timezone: '+05:30',
              },
            },
            timeLabel: {
              $dateToString: {
                date: '$tsDate',
                format: bucketInfo.labelFormat,
                timezone: '+05:30',
              },
            },
            cameraId: '$cameraId',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.bucket': 1, count: -1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    const camTotals: Record<string, number> = {};
    results.forEach((r: any) => {
      const cId = r._id.cameraId || 'UNKNOWN';
      camTotals[cId] = (camTotals[cId] || 0) + r.count;
    });

    const cameras = Object.entries(camTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([cameraId, totalIncidents]) => ({
        cameraId,
        totalIncidents,
      }));

    const incidentBase = await this.getIncidentTrends(filter);
    const bucketItemMap = new Map<string, Record<string, any>>();

    incidentBase.forEach((base) => {
      bucketItemMap.set(base.bucket, {
        bucket: base.bucket,
        timeLabel: base.timeLabel,
        total: base.total,
      });
    });

    results.forEach((r: any) => {
      const bKey = r._id.bucket;
      const cId = r._id.cameraId || 'UNKNOWN';
      const item = bucketItemMap.get(bKey);
      if (item) {
        item[cId] = (item[cId] || 0) + r.count;
      } else {
        bucketItemMap.set(bKey, {
          bucket: bKey,
          timeLabel: r._id.timeLabel,
          total: r.count,
          [cId]: r.count,
        });
      }
    });

    const timeline = Array.from(bucketItemMap.values()).map((item) => {
      const copy = { ...item };
      cameras.forEach((c) => {
        if (copy[c.cameraId] === undefined) {
          copy[c.cameraId] = 0;
        }
      });
      return copy;
    });

    return {
      timeline,
      cameras,
    };
  }

  /**
   * O. Real Historical Shift Trends (Plant Local Timezone: +05:30)
   */
  public async getShiftTrends(filter: AnalyticsFilter = {}): Promise<ShiftTrendSeries> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);
    const match = this.buildMatchQuery(filter);

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          tsDate: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $project: {
          severity: 1,
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
          bucket: {
            $dateToString: {
              date: '$tsDate',
              format: bucketInfo.formatString,
              timezone: '+05:30',
            },
          },
          timeLabel: {
            $dateToString: {
              date: '$tsDate',
              format: bucketInfo.labelFormat,
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $project: {
          bucket: 1,
          timeLabel: 1,
          severity: 1,
          shift: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 6] },
                      { $lt: ['$localHour', 14] },
                    ],
                  },
                  then: 'Morning Shift',
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 14] },
                      { $lt: ['$localHour', 22] },
                    ],
                  },
                  then: 'Afternoon Shift',
                },
              ],
              default: 'Night Shift',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            bucket: '$bucket',
            timeLabel: '$timeLabel',
            shift: '$shift',
          },
          count: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          high: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          medium: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          low: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.bucket': 1 } },
    ];

    const results = await IncidentModel.aggregate(pipeline);

    // Compute period totals
    const periodShiftCounts: Record<string, { count: number; crit: number; high: number; med: number; low: number }> = {
      'Morning Shift': { count: 0, crit: 0, high: 0, med: 0, low: 0 },
      'Afternoon Shift': { count: 0, crit: 0, high: 0, med: 0, low: 0 },
      'Night Shift': { count: 0, crit: 0, high: 0, med: 0, low: 0 },
    };

    results.forEach((r: any) => {
      const s = r._id.shift;
      if (periodShiftCounts[s]) {
        periodShiftCounts[s].count += r.count;
        periodShiftCounts[s].crit += r.critical;
        periodShiftCounts[s].high += r.high;
        periodShiftCounts[s].med += r.medium;
        periodShiftCounts[s].low += r.low;
      }
    });

    const SHIFT_TEMPLATES = [
      { shift: 'Morning Shift', hours: '06:00 - 14:00' },
      { shift: 'Afternoon Shift', hours: '14:00 - 22:00' },
      { shift: 'Night Shift', hours: '22:00 - 06:00' },
    ];

    const shifts: ShiftTrendPoint[] = SHIFT_TEMPLATES.map((t) => ({
      shift: t.shift,
      hours: t.hours,
      count: periodShiftCounts[t.shift].count,
      critical: periodShiftCounts[t.shift].crit,
      high: periodShiftCounts[t.shift].high,
      medium: periodShiftCounts[t.shift].med,
      low: periodShiftCounts[t.shift].low,
      compliance: null, // Truthful null
    }));

    // Form timeline
    const incidentBase = await this.getIncidentTrends(filter);
    const bucketItemMap = new Map<string, Record<string, any>>();

    incidentBase.forEach((base) => {
      bucketItemMap.set(base.bucket, {
        bucket: base.bucket,
        timeLabel: base.timeLabel,
        total: base.total,
        morning: 0,
        afternoon: 0,
        night: 0,
      });
    });

    results.forEach((r: any) => {
      const bKey = r._id.bucket;
      const s = r._id.shift;
      const item = bucketItemMap.get(bKey);
      if (item) {
        if (s === 'Morning Shift') item.morning += r.count;
        else if (s === 'Afternoon Shift') item.afternoon += r.count;
        else if (s === 'Night Shift') item.night += r.count;
      }
    });

    const timeline = Array.from(bucketItemMap.values()).map((item) => ({
      bucket: item.bucket,
      timeLabel: item.timeLabel,
      total: item.total,
      morning: item.morning || 0,
      afternoon: item.afternoon || 0,
      night: item.night || 0,
    }));

    return {
      shifts,
      timeline,
    };
  }

  /**
   * P. Mathematical Trend Direction Calculation (Current vs Previous Equivalent Window)
   */
  public async getTrendDirectionSummary(filter: AnalyticsFilter = {}): Promise<DirectionSummary> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const now = Date.now();

    let curStartMs: number | null = null;
    let curEndMs: number | null = null;
    let prevStartMs: number | null = null;
    let prevEndMs: number | null = null;

    if (tf === '24h' || tf === 'today') {
      curEndMs = now;
      curStartMs = now - 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 24 * 3600 * 1000;
    } else if (tf === 'week' || tf === '7d') {
      curEndMs = now;
      curStartMs = now - 7 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 7 * 24 * 3600 * 1000;
    } else if (tf === 'month' || tf === '30d') {
      curEndMs = now;
      curStartMs = now - 30 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 30 * 24 * 3600 * 1000;
    }

    let currentCount = 0;
    let previousCount = 0;

    const baseFilterNoTime = {
      cameraId: filter.cameraId,
      zoneId: filter.zoneId,
      violationType: filter.violationType,
      severity: filter.severity,
    };

    if (curStartMs !== null && curEndMs !== null && prevStartMs !== null && prevEndMs !== null) {
      const curMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(curStartMs),
        endDate: new Date(curEndMs),
      });
      const prevMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(prevStartMs),
        endDate: new Date(prevEndMs),
      });

      [currentCount, previousCount] = await Promise.all([
        IncidentModel.countDocuments(curMatch),
        IncidentModel.countDocuments(prevMatch),
      ]);
    } else {
      // 'all' timeframe: split recorded time range into two equal halves
      const allMatch = this.buildMatchQuery(baseFilterNoTime);
      const minMax = await IncidentModel.aggregate([
        { $match: allMatch },
        {
          $addFields: {
            tsDate: {
              $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { tsDate: { $ne: null } } },
        {
          $group: {
            _id: null,
            min: { $min: '$tsDate' },
            max: { $max: '$tsDate' },
            total: { $sum: 1 },
          },
        },
      ]);

      if (minMax.length > 0 && minMax[0].total > 1) {
        const minMs = new Date(minMax[0].min).getTime();
        const maxMs = new Date(minMax[0].max).getTime();
        const midMs = minMs + (maxMs - minMs) / 2;

        prevStartMs = minMs;
        prevEndMs = midMs;
        curStartMs = midMs;
        curEndMs = maxMs;

        const prevMatch = this.buildMatchQuery({
          ...baseFilterNoTime,
          startDate: new Date(minMs),
          endDate: new Date(midMs),
        });
        const curMatch = this.buildMatchQuery({
          ...baseFilterNoTime,
          startDate: new Date(midMs),
          endDate: new Date(maxMs),
        });

        [currentCount, previousCount] = await Promise.all([
          IncidentModel.countDocuments(curMatch),
          IncidentModel.countDocuments(prevMatch),
        ]);
      } else {
        currentCount = minMax.length > 0 ? minMax[0].total : 0;
        previousCount = 0;
      }
    }

    const changeCount = currentCount - previousCount;
    let changePercent: number | null = null;
    let direction: 'increase' | 'decrease' | 'stable' = 'stable';
    let statement = '';

    if (currentCount === 0 && previousCount === 0) {
      direction = 'stable';
      changePercent = 0;
      statement = 'No incidents recorded in either observation period.';
    } else if (previousCount === 0) {
      direction = 'increase';
      changePercent = null;
      statement = `Recorded incidents increased from 0 to ${currentCount} compared with the previous period.`;
    } else {
      changePercent = Math.round(((currentCount - previousCount) / previousCount) * 100);
      if (changeCount > 0) {
        direction = 'increase';
        statement = `Recorded incidents increased by ${Math.abs(changePercent)}% (${previousCount} → ${currentCount}) compared with the previous period.`;
      } else if (changeCount < 0) {
        direction = 'decrease';
        statement = `Recorded incidents decreased by ${Math.abs(changePercent)}% (${previousCount} → ${currentCount}) compared with the previous period.`;
      } else {
        direction = 'stable';
        statement = `Recorded incidents remained stable at ${currentCount} compared with the previous period.`;
      }
    }

    return {
      currentCount,
      previousCount,
      changeCount,
      changePercent,
      direction,
      statement,
      timeframe: tf,
      currentPeriodStart: curStartMs ? new Date(curStartMs).toISOString() : null,
      currentPeriodEnd: curEndMs ? new Date(curEndMs).toISOString() : null,
      previousPeriodStart: prevStartMs ? new Date(prevStartMs).toISOString() : null,
      previousPeriodEnd: prevEndMs ? new Date(prevEndMs).toISOString() : null,
    };
  }

  /**
   * Q. Comprehensive Safety Trends Aggregation (for GET /api/analytics/trends)
   */
  public async getSafetyTrends(filter: AnalyticsFilter = {}): Promise<SafetyTrendsResponse> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const bucketInfo = this.determineTimeframeBucket(tf);

    const [
      incidentTrend,
      severityTrend,
      violationTrends,
      zoneTrends,
      cameraTrends,
      shiftTrends,
      directionSummary,
      totalIncidents,
    ] = await Promise.all([
      this.getIncidentTrends(filter),
      this.getSeverityTrends(filter),
      this.getViolationTrends(filter),
      this.getZoneTrends(filter),
      this.getCameraTrends(filter),
      this.getShiftTrends(filter),
      this.getTrendDirectionSummary(filter),
      IncidentModel.countDocuments(this.buildMatchQuery(filter)),
    ]);

    return {
      timeframe: tf,
      bucketUnit: bucketInfo.unit,
      incidentTrend,
      severityTrend,
      violationTrends,
      zoneTrends,
      cameraTrends,
      shiftTrends,
      directionSummary,
      filtersApplied: {
        timeframe: tf,
        cameraId: filter.cameraId,
        zoneId: filter.zoneId,
        violationType: filter.violationType,
        severity: filter.severity,
      },
      totalIncidents,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * R. Phase 10.3: Zone Comparison & Exposure Analytics (Native MongoDB Aggregations)
   */
  public async getZoneComparison(filter: AnalyticsFilter = {}): Promise<ZoneComparisonResponse> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const now = Date.now();

    let curStartMs: number | null = null;
    let curEndMs: number | null = null;
    let prevStartMs: number | null = null;
    let prevEndMs: number | null = null;

    if (tf === '24h' || tf === 'today') {
      curEndMs = now;
      curStartMs = now - 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 24 * 3600 * 1000;
    } else if (tf === 'week' || tf === '7d') {
      curEndMs = now;
      curStartMs = now - 7 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 7 * 24 * 3600 * 1000;
    } else if (tf === 'month' || tf === '30d') {
      curEndMs = now;
      curStartMs = now - 30 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 30 * 24 * 3600 * 1000;
    }

    const baseFilterNoTime = {
      cameraId: filter.cameraId,
      zoneId: filter.zoneId,
      violationType: filter.violationType,
      severity: filter.severity,
    };

    let curMatch: Record<string, any>;
    let prevMatch: Record<string, any> | null = null;

    if (curStartMs !== null && curEndMs !== null && prevStartMs !== null && prevEndMs !== null) {
      curMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(curStartMs),
        endDate: new Date(curEndMs),
      });
      prevMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(prevStartMs),
        endDate: new Date(prevEndMs),
      });
    } else {
      // 'all' timeframe: match all for current, and split historical range for trend baseline
      curMatch = this.buildMatchQuery(filter);
      const minMax = await IncidentModel.aggregate([
        { $match: curMatch },
        {
          $addFields: {
            tsDate: {
              $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { tsDate: { $ne: null } } },
        {
          $group: {
            _id: null,
            min: { $min: '$tsDate' },
            max: { $max: '$tsDate' },
            total: { $sum: 1 },
          },
        },
      ]);

      if (minMax.length > 0 && minMax[0].total > 1) {
        const minMs = new Date(minMax[0].min).getTime();
        const maxMs = new Date(minMax[0].max).getTime();
        const midMs = minMs + (maxMs - minMs) / 2;
        prevMatch = this.buildMatchQuery({
          ...baseFilterNoTime,
          startDate: new Date(minMs),
          endDate: new Date(midMs),
        });
      }
    }

    const curPipeline: any[] = [
      { $match: curMatch },
      {
        $group: {
          _id: {
            zoneId: { $ifNull: ['$zoneId', '$zone'] },
            zoneName: '$zone',
          },
          incidentCount: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] },
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] },
          },
          infoCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] },
          },
          latestIncident: { $max: '$timestamp' },
          cameras: { $addToSet: '$cameraId' },
          types: { $push: '$violationType' },
          avgRiskScore: { $avg: '$riskScore' },
        },
      },
      { $sort: { incidentCount: -1 } },
    ];

    const prevPipeline: any[] = prevMatch
      ? [
          { $match: prevMatch },
          {
            $group: {
              _id: {
                zoneId: { $ifNull: ['$zoneId', '$zone'] },
                zoneName: '$zone',
              },
              incidentCount: { $sum: 1 },
            },
          },
        ]
      : [];

    const [curResults, prevResults, restrictedZones, emergencyZones] = await Promise.all([
      IncidentModel.aggregate(curPipeline),
      prevMatch ? IncidentModel.aggregate(prevPipeline) : Promise.resolve([]),
      RestrictedZoneModel.find({}).lean(),
      EmergencyZoneModel.find({}).lean(),
    ]);

    const zoneNameMap: Record<string, string> = {};
    const zoneConfiguredCameraMap: Record<string, string[]> = {};

    restrictedZones.forEach((rz: any) => {
      const id = rz.zoneId || rz.id;
      const name = rz.name || id;
      zoneNameMap[id] = name;
      if (rz.cameraId) {
        if (!zoneConfiguredCameraMap[id]) zoneConfiguredCameraMap[id] = [];
        if (!zoneConfiguredCameraMap[id].includes(rz.cameraId)) {
          zoneConfiguredCameraMap[id].push(rz.cameraId);
        }
      }
    });

    emergencyZones.forEach((ez: any) => {
      const id = ez.zoneId || ez.id;
      const name = ez.name || id;
      zoneNameMap[id] = name;
      if (ez.cameraId) {
        if (!zoneConfiguredCameraMap[id]) zoneConfiguredCameraMap[id] = [];
        if (!zoneConfiguredCameraMap[id].includes(ez.cameraId)) {
          zoneConfiguredCameraMap[id].push(ez.cameraId);
        }
      }
    });

    const prevCountMap: Record<string, number> = {};
    prevResults.forEach((r: any) => {
      const zId = r._id.zoneId || r._id.zoneName || 'UNKNOWN_ZONE';
      prevCountMap[zId] = (prevCountMap[zId] || 0) + r.incidentCount;
      if (r._id.zoneName && r._id.zoneName !== zId) {
        prevCountMap[r._id.zoneName] = (prevCountMap[r._id.zoneName] || 0) + r.incidentCount;
      }
    });

    const zones: ZoneComparisonItem[] = curResults.map((r: any) => {
      const rawZoneId = r._id.zoneId || r._id.zoneName || 'UNKNOWN_ZONE';
      const resolvedName = zoneNameMap[rawZoneId] || r._id.zoneName || rawZoneId;

      const evidenceCameras = (r.cameras || []).filter((c: any) => Boolean(c) && c !== 'UNKNOWN');
      const configuredCameras = zoneConfiguredCameraMap[rawZoneId] || [];
      const combinedCameras = Array.from(new Set([...evidenceCameras, ...configuredCameras]));

      const typeFreq: Record<string, number> = {};
      (r.types || []).forEach((t: string) => {
        if (t) typeFreq[t] = (typeFreq[t] || 0) + 1;
      });
      const violationTypes = Object.entries(typeFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({
          type,
          count,
        }));

      const currentCount = r.incidentCount;
      const previousCount = prevCountMap[rawZoneId] ?? (r._id.zoneName ? prevCountMap[r._id.zoneName] : 0) ?? 0;
      const changeCount = currentCount - previousCount;
      let direction: 'increase' | 'decrease' | 'stable' = 'stable';
      let changePercent: number | null = null;

      if (currentCount > previousCount) {
        direction = 'increase';
      } else if (currentCount < previousCount) {
        direction = 'decrease';
      } else {
        direction = 'stable';
      }

      if (previousCount > 0) {
        changePercent = Math.round(((currentCount - previousCount) / previousCount) * 100);
      } else {
        changePercent = null;
      }

      const riskScore = r.avgRiskScore ? Math.round(r.avgRiskScore) : null;
      let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA' = 'LOW';
      if (r.criticalCount > 0 || (riskScore && riskScore >= 80)) riskLevel = 'CRITICAL';
      else if (r.highCount > 0 || (riskScore && riskScore >= 60)) riskLevel = 'HIGH';
      else if (riskScore && riskScore >= 30) riskLevel = 'MODERATE';
      else if (r.incidentCount > 0) riskLevel = 'LOW';
      else riskLevel = 'NO DATA';

      return {
        zoneId: rawZoneId,
        zoneName: resolvedName,
        incidentCount: r.incidentCount,
        severity: {
          critical: r.criticalCount || 0,
          high: r.highCount || 0,
          medium: r.mediumCount || 0,
          low: r.lowCount || 0,
          info: r.infoCount || 0,
        },
        cameras: combinedCameras,
        violationTypes,
        latestIncident: r.latestIncident ? new Date(r.latestIncident).toISOString() : null,
        riskScore,
        riskLevel,
        trend: {
          direction,
          currentCount,
          previousCount,
          changeCount,
          changePercent,
        },
      };
    });

    const ranking: ZoneRankingItem[] = zones
      .slice()
      .sort((a, b) => b.incidentCount - a.incidentCount)
      .map((z, idx) => ({
        rank: idx + 1,
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        incidentCount: z.incidentCount,
        criticalCount: z.severity.critical,
        highCount: z.severity.high,
        mediumCount: z.severity.medium,
        lowCount: z.severity.low,
        latestIncident: z.latestIncident,
        trendDirection: z.trend.direction,
        changeCount: z.trend.changeCount,
      }));

    let highestIncidentZone: { zoneId: string; zoneName: string; count: number } | null = null;
    let highestCriticalZone: { zoneId: string; zoneName: string; count: number } | null = null;
    let worseningZonesCount = 0;
    let improvingZonesCount = 0;
    let stableZonesCount = 0;

    if (zones.length > 0) {
      const sortedByInc = [...zones].sort((a, b) => b.incidentCount - a.incidentCount);
      highestIncidentZone = {
        zoneId: sortedByInc[0].zoneId,
        zoneName: sortedByInc[0].zoneName,
        count: sortedByInc[0].incidentCount,
      };

      const sortedByCrit = [...zones].sort((a, b) => b.severity.critical - a.severity.critical);
      if (sortedByCrit[0].severity.critical > 0) {
        highestCriticalZone = {
          zoneId: sortedByCrit[0].zoneId,
          zoneName: sortedByCrit[0].zoneName,
          count: sortedByCrit[0].severity.critical,
        };
      }

      zones.forEach((z) => {
        if (z.trend.direction === 'increase') worseningZonesCount++;
        else if (z.trend.direction === 'decrease') improvingZonesCount++;
        else stableZonesCount++;
      });
    }

    const totalIncidents = zones.reduce((sum, z) => sum + z.incidentCount, 0);

    return {
      timeframe: tf,
      zones,
      ranking,
      summary: {
        totalMonitoredZones: zones.length,
        activeZonesWithIncidents: zones.filter((z) => z.incidentCount > 0).length,
        highestIncidentZone,
        highestCriticalZone,
        worseningZonesCount,
        improvingZonesCount,
        stableZonesCount,
      },
      filtersApplied: {
        timeframe: tf,
        cameraId: filter.cameraId,
        zoneId: filter.zoneId,
        violationType: filter.violationType,
        severity: filter.severity,
      },
      totalIncidents,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * S. Phase 10.4: Shift Analysis & Exposure Analytics (Native MongoDB Aggregations)
   */
  public async getShiftAnalysis(filter: AnalyticsFilter = {}): Promise<ShiftAnalysisResponse> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const now = Date.now();

    let curStartMs: number | null = null;
    let curEndMs: number | null = null;
    let prevStartMs: number | null = null;
    let prevEndMs: number | null = null;

    if (tf === '24h' || tf === 'today') {
      curEndMs = now;
      curStartMs = now - 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 24 * 3600 * 1000;
    } else if (tf === 'week' || tf === '7d') {
      curEndMs = now;
      curStartMs = now - 7 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 7 * 24 * 3600 * 1000;
    } else if (tf === 'month' || tf === '30d') {
      curEndMs = now;
      curStartMs = now - 30 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 30 * 24 * 3600 * 1000;
    }

    const baseFilterNoTime = {
      cameraId: filter.cameraId,
      zoneId: filter.zoneId,
      violationType: filter.violationType,
      severity: filter.severity,
    };

    let curMatch: Record<string, any>;
    let prevMatch: Record<string, any> | null = null;

    if (curStartMs !== null && curEndMs !== null && prevStartMs !== null && prevEndMs !== null) {
      curMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(curStartMs),
        endDate: new Date(curEndMs),
      });
      prevMatch = this.buildMatchQuery({
        ...baseFilterNoTime,
        startDate: new Date(prevStartMs),
        endDate: new Date(prevEndMs),
      });
    } else {
      // 'all' timeframe: match all for current, and split historical range for trend baseline
      curMatch = this.buildMatchQuery(filter);
      const minMax = await IncidentModel.aggregate([
        { $match: curMatch },
        {
          $addFields: {
            tsDate: {
              $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { tsDate: { $ne: null } } },
        {
          $group: {
            _id: null,
            min: { $min: '$tsDate' },
            max: { $max: '$tsDate' },
            total: { $sum: 1 },
          },
        },
      ]);

      if (minMax.length > 0 && minMax[0].total > 1) {
        const minMs = new Date(minMax[0].min).getTime();
        const maxMs = new Date(minMax[0].max).getTime();
        const midMs = minMs + (maxMs - minMs) / 2;
        prevMatch = this.buildMatchQuery({
          ...baseFilterNoTime,
          startDate: new Date(minMs),
          endDate: new Date(midMs),
        });
      }
    }

    // 1. Fetch zone definitions for zone name resolution
    const [restrictedZones, emergencyZones] = await Promise.all([
      RestrictedZoneModel.find({ isDeleted: { $ne: true } }).lean(),
      EmergencyZoneModel.find({ isDeleted: { $ne: true } }).lean(),
    ]);

    const zoneNameMap = new Map<string, string>();
    restrictedZones.forEach((z: any) => {
      if (z.zoneId && z.name) zoneNameMap.set(z.zoneId, z.name);
    });
    emergencyZones.forEach((ez: any) => {
      if (ez.zoneId && ez.name) zoneNameMap.set(ez.zoneId, ez.name);
    });

    // 2. Execute MongoDB aggregation pipeline for current observation window
    const curPipeline: any[] = [
      { $match: curMatch },
      {
        $addFields: {
          tsDate: {
            $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $project: {
          severity: 1,
          timestamp: 1,
          zoneId: { $ifNull: ['$zoneId', '$zone'] },
          zoneName: '$zone',
          cameraId: 1,
          violationType: { $ifNull: ['$violationType', '$type'] },
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $project: {
          severity: 1,
          timestamp: 1,
          zoneId: 1,
          zoneName: 1,
          cameraId: 1,
          violationType: 1,
          shift: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 6] },
                      { $lt: ['$localHour', 14] },
                    ],
                  },
                  then: 'Morning Shift',
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 14] },
                      { $lt: ['$localHour', 22] },
                    ],
                  },
                  then: 'Afternoon Shift',
                },
              ],
              default: 'Night Shift',
            },
          },
        },
      },
      {
        $group: {
          _id: '$shift',
          incidentCount: { $sum: 1 },
          criticalCount: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
          highCount: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
          mediumCount: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
          lowCount: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
          infoCount: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } },
          latestIncident: { $max: '$timestamp' },
          violations: { $push: '$violationType' },
          cameras: { $push: '$cameraId' },
          zones: {
            $push: {
              zoneId: '$zoneId',
              zoneName: '$zoneName',
            },
          },
        },
      },
    ];

    // 3. Execute prior period aggregation if baseline exists
    let prevResults: any[] = [];
    if (prevMatch) {
      const prevPipeline: any[] = [
        { $match: prevMatch },
        {
          $addFields: {
            tsDate: {
              $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { tsDate: { $ne: null } } },
        {
          $project: {
            localHour: {
              $hour: {
                date: '$tsDate',
                timezone: '+05:30',
              },
            },
          },
        },
        {
          $project: {
            shift: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $gte: ['$localHour', 6] },
                        { $lt: ['$localHour', 14] },
                      ],
                    },
                    then: 'Morning Shift',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$localHour', 14] },
                        { $lt: ['$localHour', 22] },
                      ],
                    },
                    then: 'Afternoon Shift',
                  },
                ],
                default: 'Night Shift',
              },
            },
          },
        },
        {
          $group: {
            _id: '$shift',
            count: { $sum: 1 },
          },
        },
      ];
      prevResults = await IncidentModel.aggregate(prevPipeline);
    }

    const [curResults, shiftTrends] = await Promise.all([
      IncidentModel.aggregate(curPipeline),
      this.getShiftTrends(filter),
    ]);

    const prevCountMap: Record<string, number> = {};
    prevResults.forEach((r: any) => {
      prevCountMap[r._id] = r.count;
    });

    const curShiftMap = new Map<string, any>();
    curResults.forEach((r: any) => {
      curShiftMap.set(r._id, r);
    });

    const SHIFT_TEMPLATES: Array<{
      shift: 'Morning Shift' | 'Afternoon Shift' | 'Night Shift';
      hours: string;
    }> = [
      { shift: 'Morning Shift', hours: '06:00 - 14:00' },
      { shift: 'Afternoon Shift', hours: '14:00 - 22:00' },
      { shift: 'Night Shift', hours: '22:00 - 06:00' },
    ];

    const shifts: ShiftAnalysisItem[] = SHIFT_TEMPLATES.map((t) => {
      const data = curShiftMap.get(t.shift);
      const incidentCount = data ? data.incidentCount : 0;
      const criticalCount = data ? data.criticalCount : 0;
      const highCount = data ? data.highCount : 0;
      const mediumCount = data ? data.mediumCount : 0;
      const lowCount = data ? data.lowCount : 0;
      const infoCount = data ? data.infoCount : 0;
      const latestIncident = data?.latestIncident ? new Date(data.latestIncident).toISOString() : null;

      // Violation breakdown
      const vMap = new Map<string, number>();
      if (data?.violations) {
        data.violations.forEach((v: string) => {
          if (v && v.trim()) {
            const clean = v.trim();
            vMap.set(clean, (vMap.get(clean) || 0) + 1);
          }
        });
      }
      const violationTypes = Array.from(vMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Camera breakdown
      const cMap = new Map<string, number>();
      if (data?.cameras) {
        data.cameras.forEach((c: string) => {
          if (c && c.trim()) {
            const clean = c.trim();
            cMap.set(clean, (cMap.get(clean) || 0) + 1);
          }
        });
      }
      const cameras = Array.from(cMap.entries())
        .map(([cameraId, count]) => ({ cameraId, count }))
        .sort((a, b) => b.count - a.count);

      // Zone breakdown
      const zMap = new Map<string, { zoneName: string; count: number }>();
      if (data?.zones) {
        data.zones.forEach((z: any) => {
          if (z && z.zoneId) {
            const existing = zMap.get(z.zoneId);
            if (existing) {
              existing.count += 1;
              if (!existing.zoneName && z.zoneName) existing.zoneName = z.zoneName;
            } else {
              zMap.set(z.zoneId, { zoneName: z.zoneName || z.zoneId, count: 1 });
            }
          }
        });
      }
      const zones = Array.from(zMap.entries())
        .map(([zoneId, d]) => ({
          zoneId,
          zoneName: zoneNameMap.get(zoneId) || d.zoneName || zoneId,
          count: d.count,
        }))
        .sort((a, b) => b.count - a.count);

      // Reusing Phase 10.3 deterministic Severity Exposure Index calculation
      let exposureIndex: number | null = null;
      let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'NO DATA' = 'NO DATA';
      if (incidentCount > 0) {
        const severityWeightSum = criticalCount * 10 + highCount * 5 + mediumCount * 2 + lowCount * 1;
        const avgSeverityScore = severityWeightSum / Math.max(1, incidentCount);
        const volumeScore = Math.min(50, incidentCount * 2);
        exposureIndex = Math.min(100, Math.floor(avgSeverityScore * 10 + volumeScore));
        if (exposureIndex >= 75) riskLevel = 'CRITICAL';
        else if (exposureIndex >= 50) riskLevel = 'HIGH';
        else if (exposureIndex >= 25) riskLevel = 'MODERATE';
        else riskLevel = 'LOW';
      } else {
        exposureIndex = 0;
        riskLevel = 'NO DATA';
      }

      // Trend calculations with zero-baseline honesty
      const previousCount = prevCountMap[t.shift] !== undefined ? prevCountMap[t.shift] : 0;
      const changeCount = incidentCount - previousCount;
      const changePercent =
        previousCount === 0
          ? null
          : Number((((incidentCount - previousCount) / previousCount) * 100).toFixed(1));
      const direction: 'increase' | 'decrease' | 'stable' =
        incidentCount > previousCount ? 'increase' : incidentCount < previousCount ? 'decrease' : 'stable';

      return {
        shift: t.shift,
        hours: t.hours,
        incidentCount,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        infoCount,
        latestIncident,
        violationTypes,
        zones,
        cameras,
        compliance: null, // Denominator unavailable; truthful null
        exposureIndex,
        riskLevel,
        trend: {
          currentCount: incidentCount,
          previousCount,
          changeCount,
          changePercent,
          direction,
        },
      };
    });

    let highestIncidentShift: { shift: string; hours: string; incidentCount: number } | null = null;
    let highestCriticalShift: { shift: string; hours: string; criticalCount: number } | null = null;
    let mostWorseningShift: { shift: string; hours: string; changeCount: number } | null = null;

    let maxIncidents = 0;
    let maxCritical = 0;
    let maxWorsening = 0;

    shifts.forEach((s) => {
      if (s.incidentCount > maxIncidents) {
        maxIncidents = s.incidentCount;
        highestIncidentShift = {
          shift: s.shift,
          hours: s.hours,
          incidentCount: s.incidentCount,
        };
      }
      if (s.criticalCount > maxCritical) {
        maxCritical = s.criticalCount;
        highestCriticalShift = {
          shift: s.shift,
          hours: s.hours,
          criticalCount: s.criticalCount,
        };
      }
      if (s.trend.direction === 'increase' && s.trend.changeCount > maxWorsening) {
        maxWorsening = s.trend.changeCount;
        mostWorseningShift = {
          shift: s.shift,
          hours: s.hours,
          changeCount: s.trend.changeCount,
        };
      }
    });

    const totalIncidents = shifts.reduce((sum, s) => sum + s.incidentCount, 0);

    return {
      timeframe: tf,
      shifts,
      timeline: shiftTrends.timeline || [],
      summary: {
        highestIncidentShift,
        highestCriticalShift,
        mostWorseningShift,
        totalShiftsMonitored: 3,
      },
      filtersApplied: {
        timeframe: tf,
        cameraId: filter.cameraId,
        zoneId: filter.zoneId,
        violationType: filter.violationType,
        severity: filter.severity,
      },
      totalIncidents,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Helper to build MongoDB $match query specifically for NearMiss collection.
   */
  public buildNearMissMatchQuery(
    filter: AnalyticsFilter = {},
    startMs?: number | null,
    endMs?: number | null
  ): Record<string, any> {
    const match: Record<string, any> = {};
    const andClauses: any[] = [];

    if (startMs !== undefined && endMs !== undefined && startMs !== null && endMs !== null) {
      andClauses.push({
        $or: [
          { timestamp: { $gte: new Date(startMs), $lte: new Date(endMs) } },
          { timestamp: { $gte: new Date(startMs).toISOString(), $lte: new Date(endMs).toISOString() } },
        ],
      });
    } else if (startMs !== undefined && startMs !== null) {
      andClauses.push({
        $or: [
          { timestamp: { $gte: new Date(startMs) } },
          { timestamp: { $gte: new Date(startMs).toISOString() } },
        ],
      });
    } else if (endMs !== undefined && endMs !== null) {
      andClauses.push({
        $or: [
          { timestamp: { $lte: new Date(endMs) } },
          { timestamp: { $lte: new Date(endMs).toISOString() } },
        ],
      });
    }

    if (filter.cameraId && filter.cameraId !== 'all') {
      match.cameraId = filter.cameraId;
    }

    if (filter.zoneId && filter.zoneId !== 'all') {
      andClauses.push({
        $or: [{ zoneId: filter.zoneId }, { zone: filter.zoneId }],
      });
    }

    if (filter.severity && filter.severity !== 'all') {
      match.severity = { $regex: new RegExp(`^${filter.severity}$`, 'i') };
    }

    const typeParam = filter.nearMissType || filter.ruleId || filter.violationType;
    if (typeParam && typeParam !== 'all') {
      match.ruleId = { $regex: new RegExp(`^${typeParam}$`, 'i') };
    }

    if (filter.status && filter.status !== 'all') {
      const st = filter.status.toLowerCase();
      if (st === 'resolved') {
        match.resolved = true;
      } else if (st === 'open' || st === 'active' || st === 'unresolved') {
        match.resolved = { $ne: true };
      } else if (st === 'confirmed') {
        match.identityStatus = 'CONFIRMED';
      } else if (st === 'unconfirmed') {
        match.identityStatus = 'UNCONFIRMED';
      }
    }

    if (andClauses.length > 0) {
      match.$and = andClauses;
    }

    return match;
  }

  /**
   * Phase 10.6: Near-Miss Historical Analytics Aggregation
   * Truthful analytics derived strictly from persisted MongoDB near-miss documents.
   */
  public async getNearMissAnalytics(filter: AnalyticsFilter = {}): Promise<NearMissAnalyticsResponse> {
    const tf = (filter.timeframe || '7d').toLowerCase();
    const now = Date.now();

    let curStartMs: number | null = null;
    let curEndMs: number | null = null;
    let prevStartMs: number | null = null;
    let prevEndMs: number | null = null;

    if (filter.startDate && filter.endDate) {
      const s = new Date(filter.startDate).getTime();
      const e = new Date(filter.endDate).getTime();
      if (!isNaN(s) && !isNaN(e)) {
        curStartMs = s;
        curEndMs = e;
        const duration = e - s;
        prevEndMs = s;
        prevStartMs = s - duration;
      }
    } else if (filter.startDate) {
      const s = new Date(filter.startDate).getTime();
      if (!isNaN(s)) {
        curStartMs = s;
        curEndMs = now;
      }
    } else if (tf === 'today' || tf === '24h') {
      curEndMs = now;
      curStartMs = now - 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 24 * 3600 * 1000;
    } else if (tf === 'week' || tf === '7d') {
      curEndMs = now;
      curStartMs = now - 7 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 7 * 24 * 3600 * 1000;
    } else if (tf === 'month' || tf === '30d') {
      curEndMs = now;
      curStartMs = now - 30 * 24 * 3600 * 1000;
      prevEndMs = curStartMs;
      prevStartMs = curStartMs - 30 * 24 * 3600 * 1000;
    } else {
      // 'all' timeframe: current matches all persisted records
      curStartMs = null;
      curEndMs = null;
      prevStartMs = null;
      prevEndMs = null;
    }

    const curMatch = this.buildNearMissMatchQuery(filter, curStartMs, curEndMs);

    // Normalize shift filter if requested
    let normalizedShift: string | null = null;
    if (filter.shift && filter.shift !== 'all') {
      const sLower = filter.shift.toLowerCase();
      if (sLower.includes('morning')) {
        normalizedShift = 'Morning Shift';
      } else if (sLower.includes('afternoon')) {
        normalizedShift = 'Afternoon Shift';
      } else if (sLower.includes('night')) {
        normalizedShift = 'Night Shift';
      } else {
        normalizedShift = filter.shift;
      }
    }

    // Determine timeline formatting based on timeframe
    const timelineFormat = (tf === '24h' || tf === 'today') ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
    const timelineLabelFormat = (tf === '24h' || tf === 'today') ? '%H:00' : '%d %b';

    // 1. Fetch zone definitions for resolving zone names
    const [restrictedZones, emergencyZones, standardZones] = await Promise.all([
      RestrictedZoneModel.find({ isDeleted: { $ne: true } }).lean(),
      EmergencyZoneModel.find({ isDeleted: { $ne: true } }).lean(),
      ZoneModel.find({}).lean(),
    ]);

    const zoneNameMap = new Map<string, string>();
    standardZones.forEach((z: any) => {
      if (z.zoneId && z.name) zoneNameMap.set(z.zoneId, z.name);
    });
    restrictedZones.forEach((rz: any) => {
      if (rz.zoneId && rz.name) zoneNameMap.set(rz.zoneId, rz.name);
    });
    emergencyZones.forEach((ez: any) => {
      if (ez.zoneId && ez.name) zoneNameMap.set(ez.zoneId, ez.name);
    });

    // 2. Build current period aggregation pipeline with $facet
    const curPipeline: any[] = [
      { $match: curMatch },
      {
        $addFields: {
          tsDate: {
            $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
          },
        },
      },
      { $match: { tsDate: { $ne: null } } },
      {
        $addFields: {
          localHour: {
            $hour: {
              date: '$tsDate',
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $addFields: {
          computedShift: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 6] },
                      { $lt: ['$localHour', 14] },
                    ],
                  },
                  then: 'Morning Shift',
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$localHour', 14] },
                      { $lt: ['$localHour', 22] },
                    ],
                  },
                  then: 'Afternoon Shift',
                },
              ],
              default: 'Night Shift',
            },
          },
        },
      },
      ...(normalizedShift ? [{ $match: { computedShift: normalizedShift } }] : []),
      {
        $facet: {
          total: [{ $count: 'count' }],
          bySeverity: [
            {
              $group: {
                _id: { $toUpper: '$severity' },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          byType: [
            {
              $group: {
                _id: { $ifNull: ['$ruleId', 'UNKNOWN'] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          byZone: [
            {
              $group: {
                _id: '$zoneId',
                count: { $sum: 1 },
                criticalCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'CRITICAL'] }, 1, 0] } },
                highCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'HIGH'] }, 1, 0] } },
                mediumCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'MEDIUM'] }, 1, 0] } },
                lowCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'LOW'] }, 1, 0] } },
              },
            },
            { $sort: { count: -1 } },
          ],
          byCamera: [
            {
              $group: {
                _id: '$cameraId',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          byShift: [
            {
              $group: {
                _id: '$computedShift',
                count: { $sum: 1 },
              },
            },
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: timelineFormat,
                    date: '$tsDate',
                    timezone: '+05:30',
                  },
                },
                timeLabel: {
                  $first: {
                    $dateToString: {
                      format: timelineLabelFormat,
                      date: '$tsDate',
                      timezone: '+05:30',
                    },
                  },
                },
                count: { $sum: 1 },
                criticalCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'CRITICAL'] }, 1, 0] } },
                highCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'HIGH'] }, 1, 0] } },
                mediumCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'MEDIUM'] }, 1, 0] } },
                lowCount: { $sum: { $cond: [{ $eq: [{ $toUpper: '$severity' }, 'LOW'] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ],
          recent: [
            { $sort: { timestamp: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ];

    // 3. Build previous period count query
    let prevCountPromise: Promise<number> = Promise.resolve(0);
    if (prevStartMs !== null && prevEndMs !== null) {
      const prevMatch = this.buildNearMissMatchQuery(filter, prevStartMs, prevEndMs);
      const prevPipeline: any[] = [
        { $match: prevMatch },
        {
          $addFields: {
            tsDate: {
              $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { tsDate: { $ne: null } } },
        {
          $addFields: {
            localHour: {
              $hour: {
                date: '$tsDate',
                timezone: '+05:30',
              },
            },
          },
        },
        {
          $addFields: {
            computedShift: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $gte: ['$localHour', 6] },
                        { $lt: ['$localHour', 14] },
                      ],
                    },
                    then: 'Morning Shift',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$localHour', 14] },
                        { $lt: ['$localHour', 22] },
                      ],
                    },
                    then: 'Afternoon Shift',
                  },
                ],
                default: 'Night Shift',
              },
            },
          },
        },
        ...(normalizedShift ? [{ $match: { computedShift: normalizedShift } }] : []),
        { $count: 'count' },
      ];
      prevCountPromise = NearMissModel.aggregate(prevPipeline).then((res) => (res.length > 0 ? res[0].count : 0));
    }

    // 4. Execute aggregation in parallel
    const [aggResult, prevCount] = await Promise.all([
      NearMissModel.aggregate(curPipeline),
      prevCountPromise,
    ]);

    const facets = aggResult[0] || {};
    const totalNearMisses = facets.total?.[0]?.count || 0;

    // 5. Calculate trend direction and change percentage
    let changePercent: number | null = null;
    let direction: 'increase' | 'decrease' | 'stable' = 'stable';

    if (prevCount === 0) {
      changePercent = null;
      if (totalNearMisses > 0) {
        direction = 'increase';
      } else {
        direction = 'stable';
      }
    } else {
      changePercent = Math.round(((totalNearMisses - prevCount) / prevCount) * 1000) / 10;
      if (totalNearMisses > prevCount) {
        direction = 'increase';
      } else if (totalNearMisses < prevCount) {
        direction = 'decrease';
      } else {
        direction = 'stable';
      }
    }

    // 6. Format severity breakdown
    const bySeverity: NearMissSeverityItem[] = (facets.bySeverity || []).map((item: any) => ({
      severity: item._id,
      count: item.count,
      percentage: totalNearMisses > 0 ? Math.round((item.count / totalNearMisses) * 1000) / 10 : null,
    }));

    // 7. Format type breakdown
    const byType: NearMissTypeItem[] = (facets.byType || []).map((item: any) => ({
      type: item._id,
      count: item.count,
    }));

    // 8. Format zone breakdown
    const byZone: NearMissZoneItem[] = (facets.byZone || []).map((item: any) => ({
      zoneId: item._id,
      zoneName: zoneNameMap.get(item._id) || item._id,
      count: item.count,
      severity: {
        critical: item.criticalCount || 0,
        high: item.highCount || 0,
        medium: item.mediumCount || 0,
        low: item.lowCount || 0,
      },
    }));

    // 9. Format camera breakdown
    const byCamera: NearMissCameraItem[] = (facets.byCamera || []).map((item: any) => ({
      cameraId: item._id,
      count: item.count,
    }));

    // 10. Format shift breakdown
    const shiftCountMap = new Map<string, number>();
    (facets.byShift || []).forEach((item: any) => {
      shiftCountMap.set(item._id, item.count);
    });

    const SHIFT_TEMPLATES = [
      { shift: 'Morning Shift', hours: '06:00 - 14:00' },
      { shift: 'Afternoon Shift', hours: '14:00 - 22:00' },
      { shift: 'Night Shift', hours: '22:00 - 06:00' },
    ];

    const byShift: NearMissShiftItem[] = SHIFT_TEMPLATES.map((tmpl) => ({
      shift: tmpl.shift,
      hours: tmpl.hours,
      count: shiftCountMap.get(tmpl.shift) || 0,
    }));

    // 11. Format timeline
    const timeline: NearMissTimelinePoint[] = (facets.timeline || []).map((item: any) => ({
      bucket: item._id,
      timeLabel: item.timeLabel || item._id,
      count: item.count,
      criticalCount: item.criticalCount || 0,
      highCount: item.highCount || 0,
      mediumCount: item.mediumCount || 0,
      lowCount: item.lowCount || 0,
    }));

    // 12. Format recent near-misses
    const recent: NearMissRecentItem[] = (facets.recent || []).map((doc: any) => {
      const hasEv = Boolean(doc.evidence && String(doc.evidence).trim().length > 0);
      return {
        nearMissId: doc.nearMissId,
        timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : String(doc.timestamp),
        cameraId: doc.cameraId,
        zoneId: doc.zoneId,
        zoneName: zoneNameMap.get(doc.zoneId) || doc.zoneId,
        type: doc.ruleId || 'UNSPECIFIED',
        ruleId: doc.ruleId || 'UNSPECIFIED',
        severity: doc.severity,
        riskScore: typeof doc.riskScore === 'number' ? doc.riskScore : null,
        status: doc.resolved ? 'resolved' : 'open',
        resolved: Boolean(doc.resolved),
        evidence: hasEv ? String(doc.evidence) : null,
        hasEvidence: hasEv,
        triggerConditions: Array.isArray(doc.triggerConditions) ? doc.triggerConditions : [],
        identityStatus: doc.identityStatus || 'UNCONFIRMED',
        employeeId: doc.employeeId || null,
        incidentId: doc.incidentId || null,
        trackId: doc.trackId || null,
      };
    });

    return {
      timeframe: tf,
      totalNearMisses,
      previousPeriodNearMisses: prevCount,
      changePercent,
      direction,
      bySeverity,
      byType,
      byZone,
      byCamera,
      byShift,
      timeline,
      recent,
      filters: {
        cameraId: filter.cameraId || null,
        zoneId: filter.zoneId || null,
        severity: filter.severity || null,
        nearMissType: filter.nearMissType || filter.ruleId || null,
        shift: filter.shift || null,
        status: filter.status || null,
      },
      // Backward-compatibility for Phase 10.1
      total: totalNearMisses,
      nearMisses: recent,
      status: totalNearMisses === 0 ? 'NO_DATA' : 'ACTIVE_DATA',
      message: totalNearMisses === 0 ? 'No near-miss records have been persisted for the selected timeframe.' : undefined,
    };
  }
}


