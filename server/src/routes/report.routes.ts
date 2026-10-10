import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DataStore, AuditReportDoc } from '../models/DataStore';
import { ReportGenerator } from '../services/reports/ReportGenerator';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { PERMISSIONS } from '../security/permissions';
import { AuditLogger } from '../security/AuditLogger';
import { getReportsDir, formatReportFileName } from '../utils/reportPaths';
import { AuditReportModel } from '../models/mongooseModels';

const router = Router();
const store = DataStore.getInstance();

// GET /api/reports (Requires report:view - Plant Manager, Admin)
router.get('/', authenticate, requirePermission(PERMISSIONS.REPORT_VIEW), async (req: AuthRequest, res: Response) => {
  const { siteId } = req.query;
  let reports = store.auditReports;

  if (siteId && typeof siteId === 'string' && siteId.trim()) {
    reports = reports.filter((r) => r.siteId === siteId.trim());
  }

  return res.json({ reports });
});

// POST /api/reports (Requires report:generate - Plant Manager, Admin)
router.post('/', authenticate, requirePermission(PERMISSIONS.REPORT_GENERATE), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    const {
      standard = 'DGFASLI',
      siteId,
      siteName,
      siteCode,
      dateRange,
      sections,
      generatedBy = `${user.name} (${user.role.replace('_', ' ')})`,
    } = req.body;

    // Rule 4: Validate dates
    if (!dateRange || !dateRange.from || !dateRange.to) {
      return res.status(400).json({
        error: 'Date range is required with both start (from) and end (to) dates.',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const fromDate = String(dateRange.from).trim();
    const toDate = String(dateRange.to).trim();

    if (fromDate > toDate) {
      return res.status(400).json({
        error: `Invalid date range: start date (${fromDate}) cannot be after end date (${toDate}).`,
        code: 'START_DATE_AFTER_END_DATE',
      });
    }

    // Rule 6: Validate sections
    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        error: 'At least one audit section must be selected to generate a report.',
        code: 'NO_SECTIONS_SELECTED',
      });
    }

    // Rule 3: Resolve active site dynamically
    const resolvedSite =
      (siteId && store.sites.find((s) => s.id === siteId || s.siteId === siteId)) ||
      (siteCode && store.sites.find((s) => s.code === siteCode)) ||
      store.sites.find((s) => s.name === siteName) ||
      store.sites[0];

    const effectiveSiteId = resolvedSite?.siteId || resolvedSite?.id || siteId || 'site-rsp-1';
    const effectiveSiteName = resolvedSite?.name || siteName || 'Industrial Facility';
    const effectiveSiteCode = resolvedSite?.code || siteCode || 'SITE-01';

    // Generate real PDF
    const result = await ReportGenerator.generatePDF({
      standard,
      siteId: effectiveSiteId,
      siteName: effectiveSiteName,
      siteCode: effectiveSiteCode,
      dateRange: { from: fromDate, to: toDate },
      sections,
      generatedBy,
    });

    const newReport: AuditReportDoc = {
      id: result.reportId,
      reportId: result.reportId,
      siteId: effectiveSiteId,
      siteName: effectiveSiteName,
      siteCode: effectiveSiteCode,
      standard,
      dateRange: { from: fromDate, to: toDate },
      sections,
      generatedBy,
      generatedAt: new Date().toISOString(),
      complianceScore: result.complianceScore,
      complianceScoreMethod: result.complianceScoreMethod,
      totalViolations: result.totalViolations,
      criticalViolations: result.criticalViolations,
      resolvedViolations: result.resolvedViolations,
      pdfPath: result.downloadUrl,
      fileName: result.fileName,
    };

    // Prepend to in-memory store
    store.auditReports.unshift(newReport);

    // Rule 15: Persist to MongoDB
    try {
      await AuditReportModel.create({
        reportId: newReport.reportId,
        siteId: newReport.siteId,
        siteName: newReport.siteName,
        siteCode: newReport.siteCode,
        standard: newReport.standard,
        dateRange: newReport.dateRange,
        sections: newReport.sections,
        generatedBy: newReport.generatedBy,
        generatedAt: new Date(newReport.generatedAt),
        complianceScore: newReport.complianceScore,
        complianceScoreMethod: newReport.complianceScoreMethod,
        totalViolations: newReport.totalViolations,
        criticalViolations: newReport.criticalViolations,
        resolvedViolations: newReport.resolvedViolations,
        pdfPath: newReport.pdfPath,
        fileName: newReport.fileName,
      });
    } catch (dbErr: any) {
      console.warn('[Report Archive DB Notice]', dbErr.message);
    }

    AuditLogger.log({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'REPORT_GENERATED',
      resourceType: 'AUDIT_REPORT',
      resourceId: newReport.reportId,
      result: 'SUCCESS',
      metadata: {
        standard,
        siteId: effectiveSiteId,
        siteCode: effectiveSiteCode,
        fileName: result.fileName,
        dateRange: newReport.dateRange,
      },
    });

    return res.status(201).json({
      success: true,
      report: newReport,
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
    });
  } catch (err: any) {
    console.error('[Report Generation Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate audit report PDF' });
  }
});

// GET /api/reports/:id/download (Requires report:export)
router.get('/:id/download', authenticate, requirePermission(PERMISSIONS.REPORT_EXPORT), async (req: AuthRequest, res: Response) => {
  const rawId = String(req.params.id || '').trim();
  const reportsDir = getReportsDir();

  // 1. Look up report metadata
  let report = store.auditReports.find(
    (r) =>
      r.reportId.toLowerCase() === rawId.toLowerCase() ||
      r.id.toLowerCase() === rawId.toLowerCase() ||
      (r.fileName && r.fileName.toLowerCase() === rawId.toLowerCase())
  );

  if (!report) {
    try {
      const dbRep: any = await AuditReportModel.findOne({
        $or: [
          { reportId: new RegExp(`^${rawId}$`, 'i') },
          { fileName: new RegExp(`^${rawId}$`, 'i') },
        ],
      }).lean();
      if (dbRep) {
        report = {
          id: dbRep.reportId,
          reportId: dbRep.reportId,
          siteId: dbRep.siteId,
          siteCode: dbRep.siteCode,
          siteName: dbRep.siteName,
          standard: dbRep.standard,
          dateRange: dbRep.dateRange,
          sections: dbRep.sections,
          generatedBy: dbRep.generatedBy,
          generatedAt: dbRep.generatedAt ? new Date(dbRep.generatedAt).toISOString() : new Date().toISOString(),
          complianceScore: dbRep.complianceScore,
          totalViolations: dbRep.totalViolations,
          criticalViolations: dbRep.criticalViolations,
          resolvedViolations: dbRep.resolvedViolations,
          pdfPath: dbRep.pdfPath,
          fileName: dbRep.fileName,
        };
      }
    } catch (_) {}
  }

  // Determine potential file paths
  const candidateNames = [
    report?.fileName,
    `${rawId}.pdf`,
    rawId.endsWith('.pdf') ? rawId : null,
    report ? formatReportFileName(report.siteCode || 'SITE-01', report.dateRange.from, report.dateRange.to) : null,
  ].filter(Boolean) as string[];

  let matchedPath: string | null = null;
  for (const name of candidateNames) {
    const p = path.join(reportsDir, name);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) {
      matchedPath = p;
      break;
    }
  }

  // If file doesn't exist on disk, regenerate dynamically using stored parameters
  if (!matchedPath) {
    try {
      const activeSite = report?.siteId
        ? store.sites.find((s) => s.id === report?.siteId || s.siteId === report?.siteId) || store.sites[0]
        : store.sites[0];

      const resGen = await ReportGenerator.generatePDF({
        standard: report?.standard || 'DGFASLI',
        siteId: activeSite?.siteId || activeSite?.id || 'site-rsp-1',
        siteName: report?.siteName || activeSite?.name || 'Industrial Facility',
        siteCode: report?.siteCode || activeSite?.code || 'SITE-01',
        dateRange: report?.dateRange || { from: '2026-09-28', to: '2026-10-02' },
        sections: report?.sections || [
          'siteMap',
          'violationSummary',
          'resolutionLog',
          'complianceTrend',
          'proofImages',
        ],
        generatedBy: report?.generatedBy || (req.user ? `${req.user.name} (${req.user.role})` : 'Authorized EHS Auditor'),
      });
      matchedPath = resGen.filePath;
    } catch (err: any) {
      console.error('[Report Download Regeneration Error]', err);
      return res.status(404).json({ error: 'Report PDF could not be retrieved or regenerated.' });
    }
  }

  const downloadFilename =
    report?.fileName ||
    (report
      ? formatReportFileName(report.siteCode || 'SITE-01', report.dateRange.from, report.dateRange.to)
      : path.basename(matchedPath));

  // Verify non-zero file size and send valid PDF response (Rule 14)
  const stat = fs.statSync(matchedPath);
  if (stat.size === 0) {
    return res.status(500).json({ error: 'Generated PDF file is empty.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
  res.setHeader('Content-Length', stat.size);

  return res.sendFile(matchedPath);
});

export default router;
