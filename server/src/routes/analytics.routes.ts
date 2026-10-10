import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { IncidentModel, NearMissModel } from '../models/mongooseModels';
import { AnalyticsAggregationService, AnalyticsFilter } from '../services/analytics/AnalyticsAggregationService';
import { SafetyScoreService } from '../services/analytics/SafetyScoreService';
import { ZoneSafetyPolicyService } from '../services/safetyIntelligence/ZoneSafetyPolicyService';

const router = Router();
const analyticsService = AnalyticsAggregationService.getInstance();
const safetyScoreService = SafetyScoreService.getInstance();
const zonePolicyService = ZoneSafetyPolicyService.getInstance();

// GET /api/analytics - Comprehensive Safety Analytics Dashboard
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || (req.query.timeRange as string) || 'all';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;

    const data = await analyticsService.getDashboardAnalytics({
      timeframe,
      cameraId,
      zoneId,
    });

    return res.json(data);
  } catch (err: any) {
    console.error('[Analytics] Error computing dashboard analytics:', err);
    return res.status(500).json({ error: 'Failed to compute real-time safety analytics', message: err.message });
  }
});

// GET /api/analytics/trends - Comprehensive Multi-Dimensional Safety Trends
router.get('/trends', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || (req.query.timeRange as string) || '7d';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;
    const violationType = req.query.violationType as string | undefined;
    const severity = req.query.severity as string | undefined;

    const data = await analyticsService.getSafetyTrends({
      timeframe,
      cameraId,
      zoneId,
      violationType,
      severity,
    });

    return res.json(data);
  } catch (err: any) {
    console.error('[Analytics] Error computing safety trends:', err);
    return res.status(500).json({ error: 'Failed to compute safety trends', message: err.message });
  }
});

// GET /api/analytics/zone-comparison - Cross-Zone Risk & Exposure Comparison (Phase 10.3)
router.get('/zone-comparison', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || (req.query.timeRange as string) || '7d';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;
    const violationType = req.query.violationType as string | undefined;
    const severity = req.query.severity as string | undefined;

    const data = await analyticsService.getZoneComparison({
      timeframe,
      cameraId,
      zoneId,
      violationType,
      severity,
    });

    return res.json(data);
  } catch (err: any) {
    console.error('[Analytics] Error computing zone comparison:', err);
    return res.status(500).json({ error: 'Failed to compute zone comparison analytics', message: err.message });
  }
});

// GET /api/analytics/shift-analysis - Plant Operational Shift Safety Analysis (Phase 10.4)
router.get('/shift-analysis', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || (req.query.timeRange as string) || '7d';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;
    const violationType = req.query.violationType as string | undefined;
    const severity = req.query.severity as string | undefined;

    const data = await analyticsService.getShiftAnalysis({
      timeframe,
      cameraId,
      zoneId,
      violationType,
      severity,
    });

    return res.json(data);
  } catch (err: any) {
    console.error('[Analytics] Error computing shift analysis:', err);
    return res.status(500).json({ error: 'Failed to compute shift safety analysis', message: err.message });
  }
});

// GET /api/analytics/safety-summary - Overall System Safety Intelligence Summary
router.get('/safety-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const cameraId = req.query.cameraId as string | undefined;
    const match = analyticsService.buildMatchQuery({ cameraId });

    const [
      activeIncidents,
      criticalIncidents,
      highIncidents,
      totalIncidents,
      nearMissCount,
      avgRiskResult,
      attentionZonesAgg,
    ] = await Promise.all([
      IncidentModel.countDocuments({ ...match, status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] } }),
      IncidentModel.countDocuments({ ...match, severity: 'critical', status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] } }),
      IncidentModel.countDocuments({ ...match, severity: 'high', status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] } }),
      IncidentModel.countDocuments(match),
      NearMissModel.countDocuments(cameraId ? { cameraId } : {}),
      IncidentModel.aggregate([
        { $match: { ...match, status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] }, riskScore: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgRisk: { $avg: '$riskScore' } } },
      ]),
      IncidentModel.aggregate([
        {
          $match: {
            ...match,
            severity: { $in: ['critical', 'high'] },
            status: { $nin: ['RESOLVED', 'FALSE_POSITIVE'] },
          },
        },
        { $group: { _id: '$zone' } },
      ]),
    ]);

    const rawAvgRisk = avgRiskResult.length > 0 && avgRiskResult[0].avgRisk != null ? Math.round(avgRiskResult[0].avgRisk) : 0;
    let overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (criticalIncidents > 0 || rawAvgRisk >= 80) overallRiskLevel = 'CRITICAL';
    else if (highIncidents > 0 || rawAvgRisk >= 60) overallRiskLevel = 'HIGH';
    else if (rawAvgRisk >= 30) overallRiskLevel = 'MODERATE';

    const zonesRequiringAttention = attentionZonesAgg.map((z: any) => z._id).filter(Boolean);

    return res.json({
      overallRiskScore: rawAvgRisk,
      overallRiskLevel,
      activeCriticalCount: criticalIncidents,
      activeHighCount: highIncidents,
      activeNearMissCount: nearMissCount, // Truthful count from MongoDB
      totalActiveIncidents: activeIncidents,
      totalIncidents,
      zonesRequiringAttention,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Analytics] Error computing safety summary:', err);
    return res.status(500).json({ error: 'Failed to compute safety summary', message: err.message });
  }
});

// GET /api/analytics/zones - Data-Driven Zone Risk Matrix
router.get('/zones', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeRange = String(req.query.timeRange || req.query.timeframe || '24h').toLowerCase();
    const cameraId = req.query.cameraId as string | undefined;

    const [zoneMatrix, policies] = await Promise.all([
      analyticsService.getZoneMatrix({
        timeframe: timeRange,
        cameraId,
      }),
      zonePolicyService.listPolicies(),
    ]);

    const zones = zoneMatrix.map((zm) => {
      const policy = policies.find(
        (p) => p.zoneId.toLowerCase() === zm.zoneId.toLowerCase() || p.zoneName.toLowerCase() === zm.zoneName.toLowerCase()
      );

      return {
        zoneId: zm.zoneId,
        zoneName: zm.zoneName,
        status: zm.status,
        riskScore: zm.riskScore,
        riskLevel: zm.riskLevel,
        incidentCount: zm.incidentCount,
        nearMissCount: 0, // Truthful MongoDB count (0 persisted)
        activeIncidentCount: zm.criticalCount + zm.highCount,
        requiredPPE: policy ? policy.requiredPPE : ['helmet', 'safety-vest'],
        cameraStatus: zm.cameras.length > 0 ? `${zm.cameras.length} Camera(s) Linked` : 'NO CAMERAS',
        lastIncidentAt: zm.lastIncidentAt,
      };
    });

    return res.json({
      timeRange,
      cutoff: new Date(Date.now() - (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 1) * 24 * 3600 * 1000).toISOString(),
      zones,
    });
  } catch (err: any) {
    console.error('[Analytics] Error fetching zone analytics:', err);
    return res.status(500).json({ error: 'Failed to fetch zone analytics', message: err.message });
  }
});

// GET /api/analytics/incidents - Aggregated Real Incident Metrics from MongoDB
router.get('/incidents', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || 'all';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;

    const filter = { timeframe, cameraId, zoneId };

    const [severityDist, typeList, zoneList] = await Promise.all([
      analyticsService.getSeverityDistribution(filter),
      analyticsService.getViolationTypeDistribution(filter),
      analyticsService.getZoneMatrix(filter),
    ]);

    const bySeverity: Record<string, number> = {
      critical: severityDist.critical,
      high: severityDist.high,
      medium: severityDist.medium,
      low: severityDist.low,
    };

    const byType: Record<string, number> = {};
    typeList.forEach((t) => {
      byType[t.type] = t.count;
    });

    const byZone: Record<string, number> = {};
    zoneList.forEach((z) => {
      byZone[z.zoneName] = z.incidentCount;
    });

    return res.json({
      total: severityDist.total,
      bySeverity,
      byType,
      byZone,
    });
  } catch (err: any) {
    console.error('[Analytics] Error fetching aggregated incidents:', err);
    return res.status(500).json({ error: 'Failed to fetch incident analytics', message: err.message });
  }
});

// GET /api/analytics/near-misses - Comprehensive Historical Near-Miss Analytics (Phase 10.6)
router.get('/near-misses', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      timeframe = '7d',
      cameraId,
      zoneId,
      severity,
      nearMissType,
      ruleId,
      shift,
      status,
      startDate,
      endDate,
    } = req.query;

    const filter: AnalyticsFilter = {
      timeframe: String(timeframe),
      cameraId: cameraId ? String(cameraId) : undefined,
      zoneId: zoneId ? String(zoneId) : undefined,
      severity: severity ? String(severity) : undefined,
      nearMissType: (nearMissType || ruleId) ? String(nearMissType || ruleId) : undefined,
      ruleId: (ruleId || nearMissType) ? String(ruleId || nearMissType) : undefined,
      shift: shift ? String(shift) : undefined,
      status: status ? String(status) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    };

    const analytics = await analyticsService.getNearMissAnalytics(filter);
    return res.json(analytics);
  } catch (err: any) {
    console.error('[Analytics] Error fetching near-miss analytics:', err);
    return res.status(500).json({ error: 'Failed to fetch near-miss analytics', message: err.message });
  }
});

// GET /api/analytics/risk-trends - Observed Statistical Patterns from MongoDB Aggregations
router.get('/risk-trends', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || 'all';
    const cameraId = req.query.cameraId as string | undefined;

    const filter = { timeframe, cameraId };

    const [totalIncidents, shiftList, zoneList, typeList] = await Promise.all([
      IncidentModel.countDocuments(analyticsService.buildMatchQuery(filter)),
      analyticsService.getShiftAnalytics(filter),
      analyticsService.getZoneMatrix(filter),
      analyticsService.getViolationTypeDistribution(filter),
    ]);

    if (totalIncidents < 3) {
      return res.json({
        status: 'INSUFFICIENT DATA',
        message: 'Insufficient historical data recorded in database to compute reliable safety patterns.',
        patterns: [],
        dataPoints: totalIncidents,
      });
    }

    const patterns: string[] = [];

    // 1. Shift patterns
    const topShift = [...shiftList].sort((a, b) => b.count - a.count)[0];
    if (topShift && topShift.count > 0) {
      patterns.push(`Most recorded safety incidents (${topShift.count}) occurred during ${topShift.shift} (${topShift.hours}).`);
    }

    // 2. Zone patterns
    const topZone = zoneList[0];
    if (topZone && topZone.incidentCount > 0) {
      patterns.push(`${topZone.zoneName} recorded the highest frequency (${topZone.incidentCount} incident${topZone.incidentCount > 1 ? 's' : ''}) in the observation window.`);
    }

    // 3. Violation category patterns
    const topType = typeList[0];
    if (topType && topType.count > 0) {
      const pct = Math.round((topType.count / totalIncidents) * 100);
      patterns.push(`${topType.type} infractions represent ${pct}% (${topType.count}/${totalIncidents}) of all logged events.`);
    }

    return res.json({
      status: 'OBSERVED PATTERNS',
      patterns,
      dataPoints: totalIncidents,
      shiftDistribution: shiftList,
      zoneDistribution: zoneList.slice(0, 5),
    });
  } catch (err: any) {
    console.error('[Analytics] Error computing risk trends:', err);
    return res.status(500).json({ error: 'Failed to compute risk trends', message: err.message });
  }
});

// GET /api/analytics/heatmap - Phase 10.5 Safety Incident Heatmap (Persisted Incident Density Heatmap)
router.get('/heatmap', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || 'all';
    const cameraId = req.query.cameraId as string | undefined;
    const zoneId = req.query.zoneId as string | undefined;
    const severity = req.query.severity as string | undefined;
    const violationType = req.query.violationType as string | undefined;
    const shift = req.query.shift as string | undefined;
    const limit = parseInt(String(req.query.limit || '500'), 10);

    const heatmap = await analyticsService.getSafetyHeatmap(
      { timeframe, cameraId, zoneId, severity, violationType, shift },
      limit
    );

    return res.json(heatmap);
  } catch (err: any) {
    console.error('[Analytics] Error fetching safety heatmap:', err);
    return res.status(500).json({ error: 'Failed to fetch safety heatmap', message: err.message });
  }
});

// GET /api/analytics/cameras - Multi-Camera Analytics Breakdown
router.get('/cameras', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || 'all';
    const cameras = await analyticsService.getCameraAnalytics({ timeframe });
    return res.json({
      totalCamerasWithIncidents: cameras.length,
      cameras,
    });
  } catch (err: any) {
    console.error('[Analytics] Error fetching camera analytics:', err);
    return res.status(500).json({ error: 'Failed to fetch camera analytics', message: err.message });
  }
});

export default router;
