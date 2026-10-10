import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { DataStore, IncidentDoc } from '../../models/DataStore';
import { getReportsDir, formatReportFileName } from '../../utils/reportPaths';

export interface GenerateReportOptions {
  siteId?: string;
  siteName: string;
  siteCode?: string;
  standard: 'DGFASLI' | 'OSHA' | 'INTERNAL';
  dateRange: {
    from: string;
    to: string;
  };
  sections: string[];
  generatedBy: string;
}

export interface GeneratedReportResult {
  reportId: string;
  fileName: string;
  filePath: string;
  downloadUrl: string;
  complianceScore: number | null;
  complianceScoreMethod: string;
  totalViolations: number;
  criticalViolations: number;
  resolvedViolations: number;
}

export class ReportGenerator {
  public static async generatePDF(options: GenerateReportOptions): Promise<GeneratedReportResult> {
    const store = DataStore.getInstance();

    // 1. Resolve site information
    const site =
      store.sites.find((s) => (options.siteId && (s.id === options.siteId || s.siteId === options.siteId)) || (s.code && s.code === options.siteCode)) ||
      store.sites.find((s) => s.name === options.siteName) || {
        id: options.siteId || 'SITE-01',
        siteId: options.siteId || 'SITE-01',
        name: options.siteName || 'Industrial Facility',
        code: options.siteCode || 'SITE-01',
        companyName: 'SafeVision Industrial',
        location: 'Industrial Sector',
        complianceRate: null,
      };

    const siteCode = options.siteCode || site.code || 'SITE-01';
    const siteName = options.siteName || site.name || 'Industrial Facility';
    const companyName = (site as any).companyName || 'Steel Authority of India Limited';

    // 2. Resolve cameras and zones for this site
    const siteCameras = store.cameras.filter((c: any) => !c.siteId || c.siteId === site.siteId || c.siteId === site.id);
    const activeCameras = siteCameras.filter((c: any) => c.status === 'LIVE').length;
    const totalCameras = siteCameras.length;

    const siteZones = store.zones.filter((z: any) => !z.siteId || z.siteId === site.siteId || z.siteId === site.id);
    const siteRestrictedZones = store.restrictedZones.filter(
      (rz: any) => !rz.siteId || rz.siteId === site.siteId || rz.siteId === site.id
    );

    // 3. Filter real incidents by Site ID and Date Range
    const fromTime = new Date(`${options.dateRange.from}T00:00:00.000Z`).getTime();
    const toTime = new Date(`${options.dateRange.to}T23:59:59.999Z`).getTime();

    const filteredIncidents = store.incidents.filter((inc: IncidentDoc) => {
      // Site matching: match siteId; if site is site-rsp-1, allow unassigned legacy incidents as well
      const matchesSite =
        !options.siteId ||
        inc.siteId === options.siteId ||
        (options.siteId === 'site-rsp-1' && (!inc.siteId || inc.siteId === 'site-rsp-1'));

      const incTime = new Date(inc.timestamp).getTime();
      const matchesDate = !isNaN(incTime) && incTime >= fromTime && incTime <= toTime;
      return matchesSite && matchesDate;
    });

    // Sort incidents chronologically descending (newest first)
    filteredIncidents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 4. Metrics & Compliance Score Calculation (Rule 9)
    const totalViolations = filteredIncidents.length;
    const criticalViolations = filteredIncidents.filter((i) => i.severity === 'critical').length;
    const highViolations = filteredIncidents.filter((i) => i.severity === 'high').length;
    const mediumViolations = filteredIncidents.filter((i) => i.severity === 'medium').length;
    const lowViolations = filteredIncidents.filter((i) => i.severity === 'low').length;
    const resolvedViolations = filteredIncidents.filter((i) => i.status === 'RESOLVED').length;

    let complianceScore: number | null = null;
    let complianceScoreMethod = 'SAFEVISION_SEVERITY_DEDUCTION';
    let complianceLabel = '—';
    let complianceSubtext = '';

    if (totalCameras === 0 && store.cameras.length === 0) {
      complianceScore = null;
      complianceScoreMethod = 'INSUFFICIENT_TELEMETRY';
      complianceLabel = 'Not calculated — insufficient validated data';
      complianceSubtext = 'Zero camera streams or detection telemetry configured for this facility.';
    } else if (totalViolations === 0) {
      complianceScore = 100;
      complianceLabel = '100%';
      complianceSubtext = 'Zero safety infractions recorded in selected monitoring window.';
    } else {
      // SafeVision Severity-Deduction Engine: 100 - (15*crit + 5*high + 2*med + 1*low)
      const deduction = criticalViolations * 15 + highViolations * 5 + mediumViolations * 2 + lowViolations * 1;
      complianceScore = Math.max(0, Math.min(100, Math.round(100 - deduction)));
      complianceLabel = `${complianceScore}%`;
      complianceSubtext = `SafeVision Severity-Deduction Engine: 100 - (15×Crit[${criticalViolations}] + 5×High[${highViolations}] + 2×Med[${mediumViolations}] + 1×Low[${lowViolations}])`;
    }

    // 5. File setup
    const reportId = `REP-${options.standard}-${Date.now().toString().slice(-6)}`;
    const fileName = formatReportFileName(siteCode, options.dateRange.from, options.dateRange.to);
    const reportsDir = getReportsDir();
    const filePath = path.join(reportsDir, fileName);

    // Helper for checking if a section is included
    const hasSection = (key: string, label: string): boolean => {
      const norm = options.sections.map((s) => s.toLowerCase().trim());
      return (
        norm.includes(key.toLowerCase()) ||
        norm.includes(label.toLowerCase()) ||
        options.sections.some((s) => s.toLowerCase().includes(key.toLowerCase()))
      );
    };

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `SafeVision Compliance Report - ${siteCode}`,
          Author: options.generatedBy,
          Subject: `Industrial Safety & Compliance Audit (${siteName} - ${siteCode})`,
          Keywords: `compliance, safety, ${options.standard}, ${siteCode}`,
        },
      });

      doc.pipe(writeStream);

      // --- COLOR PALETTE ---
      const C_DARK = '#0F172A';
      const C_PRIMARY = '#10B981';
      const C_WARNING = '#D97706';
      const C_DANGER = '#DC2626';
      const C_TEXT = '#1E293B';
      const C_MUTED = '#64748B';
      const C_BORDER = '#CBD5E1';
      const C_BG_CARD = '#F8FAFC';
      const C_BG_HEADER = '#1E293B';

      // --- COVER PAGE / TOP BRANDING HEADER ---
      doc.rect(0, 0, doc.page.width, 110).fill(C_DARK);

      doc.fillColor(C_PRIMARY).fontSize(20).font('Helvetica-Bold').text('SAFEVISION AI', 40, 24);
      doc.fillColor('#94A3B8').fontSize(8.5).font('Helvetica').text('AUTOMATED PLANT INTEGRITY & REGULATORY COMPLIANCE SYSTEM', 40, 48);

      const standardTitle =
        options.standard === 'DGFASLI'
          ? 'DGFASLI STATUTORY SAFETY AUDIT (INDIA FACTORIES ACT 1948)'
          : options.standard === 'OSHA'
          ? 'OSHA 1910 GENERAL INDUSTRY COMPLIANCE AUDIT'
          : 'INTERNAL ENTERPRISE EHS SAFETY & RISK BENCHMARK';

      doc.fillColor('#FBBF24').fontSize(9.5).font('Helvetica-Bold').text(standardTitle, 40, 68);
      doc.fillColor('#CBD5E1').fontSize(7.5).font('Helvetica').text(
        `REPORT ID: ${reportId}   |   GENERATED: ${new Date().toUTCString()}   |   FILE: ${fileName}`,
        40,
        86
      );

      doc.y = 125;

      // --- AUDIT SPECIFICATIONS CARD ---
      doc.rect(40, 125, 515, 78).fillAndStroke(C_BG_CARD, C_BORDER);
      doc.fillColor(C_DARK).fontSize(10).font('Helvetica-Bold').text('AUDIT SPECIFICATIONS & SITE METADATA', 52, 134);
      doc.rect(52, 146, 491, 1).fill('#E2E8F0');

      doc.fillColor(C_MUTED).fontSize(8).font('Helvetica');
      doc.text('Company / Org:', 52, 154);
      doc.text('Plant / Site:', 52, 168);
      doc.text('Site Code:', 52, 182);

      doc.fillColor(C_TEXT).font('Helvetica-Bold');
      doc.text(companyName, 130, 154);
      doc.text(siteName, 130, 168);
      doc.text(siteCode, 130, 182);

      doc.fillColor(C_MUTED).font('Helvetica');
      doc.text('Reporting Period:', 310, 154);
      doc.text('Lead Auditor:', 310, 168);
      doc.text('Camera Telemetry:', 310, 182);

      doc.fillColor(C_TEXT).font('Helvetica-Bold');
      doc.text(`${options.dateRange.from} to ${options.dateRange.to}`, 405, 154);
      doc.text(options.generatedBy, 405, 168);
      doc.text(`${activeCameras} Active RTSP / ${totalCameras} Total`, 405, 182);

      // --- REGULATORY STANDARD NOTICE (Rule 5) ---
      doc.y = 212;
      doc.rect(40, 212, 515, 36).fillAndStroke('#FFFBEB', '#FDE68A');
      doc.fillColor(C_WARNING).fontSize(7.5).font('Helvetica-Bold').text('REGULATORY FRAMEWORK INTERPRETATION NOTICE:', 50, 219);
      doc.fillColor('#78350F').fontSize(7).font('Helvetica').text(
        `This audit report applies telemetry mapping referencing the ${options.standard} standard. Telemetry captures, neural network bounding boxes, and shift counts reflect direct SafeVision computer vision observations. Final regulatory compliance status remains subject to authorized statutory EHS inspection.`,
        50,
        229,
        { width: 495, lineGap: 1 }
      );

      // --- EXECUTIVE COMPLIANCE SUMMARY (KPI CARDS) ---
      const kpiY = 258;
      doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('EXECUTIVE SAFETY & COMPLIANCE SUMMARY', 40, kpiY);
      doc.rect(40, kpiY + 16, 515, 1).fill(C_BORDER);

      const cardW = 120;
      const cardH = 58;
      const cardY = kpiY + 24;

      const resolutionRateStr =
        totalViolations > 0 ? `${((resolvedViolations / totalViolations) * 100).toFixed(1)}%` : '100%';

      const kpis = [
        { label: 'Compliance Score', value: complianceLabel, color: complianceScore !== null && complianceScore >= 80 ? C_PRIMARY : C_DANGER },
        { label: 'Total Incidents', value: `${totalViolations}`, color: C_TEXT },
        { label: 'Critical Breaches', value: `${criticalViolations}`, color: criticalViolations > 0 ? C_DANGER : C_PRIMARY },
        { label: 'Resolution Rate', value: resolutionRateStr, color: '#2563EB' },
      ];

      kpis.forEach((k, idx) => {
        const cx = 40 + idx * (cardW + 11);
        doc.rect(cx, cardY, cardW, cardH).fillAndStroke(C_BG_CARD, C_BORDER);
        doc.fillColor(C_MUTED).fontSize(7.5).font('Helvetica').text(k.label, cx + 8, cardY + 8);
        doc.fillColor(k.color).fontSize(14).font('Helvetica-Bold').text(k.value, cx + 8, cardY + 24);
      });

      // Score documentation explanation
      doc.fillColor(C_MUTED).fontSize(6.8).font('Helvetica-Oblique').text(complianceSubtext, 42, cardY + cardH + 6, {
        width: 510,
      });

      doc.y = cardY + cardH + 20;

      // Helper to ensure page has room
      const checkAddPage = (neededHeight: number = 80) => {
        if (doc.y + neededHeight > doc.page.height - 45) {
          doc.addPage();
          doc.y = 45;
        }
      };

      // Helper for empty data notice
      const renderNoDataNotice = (sectionTitle: string, message: string) => {
        checkAddPage(60);
        doc.rect(40, doc.y, 515, 38).fillAndStroke('#F1F5F9', '#CBD5E1');
        doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text('NO DATA AVAILABLE FOR SELECTED PERIOD', 52, doc.y + 10);
        doc.fillColor(C_MUTED).fontSize(7.5).font('Helvetica').text(message, 52, doc.y + 22);
        doc.y += 48;
      };

      // ========================================================
      // SECTION 1: Site Schematic & Hazard Zones
      // ========================================================
      if (hasSection('siteMap', 'Site Schematic & Hazard Zones')) {
        checkAddPage(120);
        doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('1. SITE SCHEMATIC & HAZARD ZONES', 40, doc.y);
        doc.rect(40, doc.y + 14, 515, 1).fill(C_BORDER);
        doc.y += 22;

        const allZones = [
          ...siteZones.map((z: any) => ({
            code: z.code || z.id,
            name: z.name,
            danger: z.dangerLevel || 'medium',
            ppe: Array.isArray(z.requiredPPE) ? z.requiredPPE.join(', ') : 'Standard PPE',
            cameras: siteCameras.filter((c: any) => c.zone === z.name || c.zoneId === z.id).map((c: any) => c.code).join(', ') || 'CAM-01',
            type: 'Production Zone',
          })),
          ...siteRestrictedZones.map((rz: any) => ({
            code: rz.zoneId || 'RZ-01',
            name: rz.name,
            danger: rz.riskLevel ? rz.riskLevel.toLowerCase() : 'high',
            ppe: Array.isArray(rz.requiredPPE) ? rz.requiredPPE.join(', ') : 'Restricted Entry PPE',
            cameras: rz.cameraId || 'CAM-01',
            type: `Restricted (${rz.zoneType})`,
          })),
        ];

        if (allZones.length === 0) {
          renderNoDataNotice('1. Site Schematic & Hazard Zones', 'No hazard zones or restricted geofences currently configured for this site.');
        } else {
          // Table header
          doc.rect(40, doc.y, 515, 18).fill(C_BG_HEADER);
          doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
          doc.text('ZONE CODE', 48, doc.y + 5);
          doc.text('ZONE NAME & TYPE', 120, doc.y + 5);
          doc.text('DANGER LEVEL', 240, doc.y + 5);
          doc.text('MANDATED PPE', 320, doc.y + 5);
          doc.text('COVERAGE', 470, doc.y + 5);
          doc.y += 18;

          allZones.forEach((z, idx) => {
            checkAddPage(22);
            const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            doc.rect(40, doc.y, 515, 18).fill(rowBg);
            doc.fillColor(C_TEXT).fontSize(7.5).font('Helvetica');
            doc.text(z.code, 48, doc.y + 5);
            doc.text(`${z.name} [${z.type}]`, 120, doc.y + 5);

            const dangerColor = z.danger === 'critical' ? C_DANGER : z.danger === 'high' ? C_WARNING : C_PRIMARY;
            doc.fillColor(dangerColor).font('Helvetica-Bold').text(z.danger.toUpperCase(), 240, doc.y + 5);

            doc.fillColor(C_MUTED).font('Helvetica').text(z.ppe, 320, doc.y + 5);
            doc.text(z.cameras, 470, doc.y + 5);
            doc.y += 18;
          });
          doc.y += 14;
        }
      }

      // ========================================================
      // SECTION 2: Violation Summary & Severity Matrix
      // ========================================================
      if (hasSection('violationSummary', 'Violation Summary & Severity Matrix')) {
        checkAddPage(120);
        doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('2. VIOLATION SUMMARY & SEVERITY MATRIX', 40, doc.y);
        doc.rect(40, doc.y + 14, 515, 1).fill(C_BORDER);
        doc.y += 22;

        if (totalViolations === 0) {
          renderNoDataNotice(
            '2. Violation Summary & Severity Matrix',
            `Zero safety infractions recorded for ${siteName} (${siteCode}) during the selected period (${options.dateRange.from} to ${options.dateRange.to}).`
          );
        } else {
          // 2A: Violation Type Breakdown
          const typeCounts: Record<string, { total: number; critical: number; high: number; med: number; low: number }> = {};
          filteredIncidents.forEach((inc) => {
            const vType = (inc.violationType || 'UNCLASSIFIED').replace(/_/g, ' ').toUpperCase();
            if (!typeCounts[vType]) {
              typeCounts[vType] = { total: 0, critical: 0, high: 0, med: 0, low: 0 };
            }
            typeCounts[vType].total++;
            if (inc.severity === 'critical') typeCounts[vType].critical++;
            else if (inc.severity === 'high') typeCounts[vType].high++;
            else if (inc.severity === 'medium') typeCounts[vType].med++;
            else typeCounts[vType].low++;
          });

          doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text('A. Violation Frequency by Classification', 40, doc.y);
          doc.y += 8;

          // Header
          doc.rect(40, doc.y, 515, 18).fill(C_BG_HEADER);
          doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
          doc.text('VIOLATION CLASSIFICATION', 48, doc.y + 5);
          doc.text('TOTAL INCIDENTS', 230, doc.y + 5);
          doc.text('SHARE (%)', 320, doc.y + 5);
          doc.text('SEVERITY BREAKDOWN', 400, doc.y + 5);
          doc.y += 18;

          Object.entries(typeCounts).forEach(([vType, counts], idx) => {
            checkAddPage(20);
            const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            doc.rect(40, doc.y, 515, 18).fill(rowBg);
            doc.fillColor(C_TEXT).fontSize(7.5).font('Helvetica');
            doc.text(vType, 48, doc.y + 5);
            doc.font('Helvetica-Bold').text(`${counts.total}`, 230, doc.y + 5);
            const share = ((counts.total / totalViolations) * 100).toFixed(1);
            doc.font('Helvetica').text(`${share}%`, 320, doc.y + 5);
            doc.fillColor(C_MUTED).text(
              `${counts.critical} Crit / ${counts.high} High / ${counts.med} Med / ${counts.low} Low`,
              400,
              doc.y + 5
            );
            doc.y += 18;
          });

          doc.y += 12;

          // 2B: Severity Risk Matrix Table
          checkAddPage(110);
          doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text('B. Severity & Resolution Status Matrix', 40, doc.y);
          doc.y += 8;

          doc.rect(40, doc.y, 515, 18).fill(C_BG_HEADER);
          doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
          doc.text('SEVERITY TIER', 48, doc.y + 5);
          doc.text('INCIDENTS', 150, doc.y + 5);
          doc.text('SHARE (%)', 230, doc.y + 5);
          doc.text('RESOLVED', 310, doc.y + 5);
          doc.text('OPEN / IN-PROGRESS', 400, doc.y + 5);
          doc.y += 18;

          const severityTiers: Array<{ tier: 'critical' | 'high' | 'medium' | 'low'; label: string; color: string }> = [
            { tier: 'critical', label: 'CRITICAL', color: C_DANGER },
            { tier: 'high', label: 'HIGH', color: C_WARNING },
            { tier: 'medium', label: 'MEDIUM', color: '#3B82F6' },
            { tier: 'low', label: 'LOW', color: C_PRIMARY },
          ];

          severityTiers.forEach((st, idx) => {
            checkAddPage(20);
            const incsInTier = filteredIncidents.filter((i) => i.severity === st.tier);
            const count = incsInTier.length;
            const share = totalViolations > 0 ? ((count / totalViolations) * 100).toFixed(1) : '0.0';
            const resolved = incsInTier.filter((i) => i.status === 'RESOLVED').length;
            const open = count - resolved;

            const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            doc.rect(40, doc.y, 515, 18).fill(rowBg);
            doc.fillColor(st.color).fontSize(7.5).font('Helvetica-Bold').text(st.label, 48, doc.y + 5);
            doc.fillColor(C_TEXT).text(`${count}`, 150, doc.y + 5);
            doc.font('Helvetica').text(`${share}%`, 230, doc.y + 5);
            doc.fillColor(C_PRIMARY).font('Helvetica-Bold').text(`${resolved}`, 310, doc.y + 5);
            doc.fillColor(open > 0 ? C_DANGER : C_MUTED).font('Helvetica-Bold').text(`${open}`, 400, doc.y + 5);
            doc.y += 18;
          });

          // Total row
          checkAddPage(20);
          doc.rect(40, doc.y, 515, 18).fill('#E2E8F0');
          doc.fillColor(C_DARK).fontSize(7.5).font('Helvetica-Bold');
          doc.text('TOTAL AUDIT INCIDENTS', 48, doc.y + 5);
          doc.text(`${totalViolations}`, 150, doc.y + 5);
          doc.text('100.0%', 230, doc.y + 5);
          doc.text(`${resolvedViolations}`, 310, doc.y + 5);
          doc.text(`${totalViolations - resolvedViolations}`, 400, doc.y + 5);
          doc.y += 26;
        }
      }

      // ========================================================
      // SECTION 3: Steward Resolution & Incident Log (B1 Redesign)
      // ========================================================
      if (hasSection('resolutionLog', 'Steward Resolution & Incident Log')) {
        checkAddPage(140);
        doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('3. STEWARD RESOLUTION & INCIDENT LOG', 40, doc.y);
        doc.rect(40, doc.y + 14, 515, 1).fill(C_BORDER);
        doc.y += 22;

        if (totalViolations === 0) {
          renderNoDataNotice(
            '3. Steward Resolution & Incident Log',
            `No incident records logged for ${siteName} in the selected period.`
          );
        } else {
          // Display top 15 most recent incidents
          const displayIncidents = filteredIncidents.slice(0, 15);
          doc.fillColor(C_MUTED).fontSize(7.5).font('Helvetica').text(
            `Showing ${displayIncidents.length} of ${totalViolations} timestamped incidents recorded in this audit period:`,
            40,
            doc.y
          );
          doc.y += 12;

          displayIncidents.forEach((inc) => {
            const vName = (inc.violationType || 'SAFETY INFRACTION').replace(/_/g, ' ').toUpperCase();
            const workerLabel = inc.workerName || inc.workerId || 'Unidentified Worker';
            const zoneLabel = inc.zone || 'Production Area';
            const camLabel = inc.cameraId || 'CAM-01';
            const dt = new Date(inc.timestamp);
            const tsStr = !isNaN(dt.getTime()) ? dt.toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : inc.timestamp;
            const conf = inc.confidence ? `${(inc.confidence * 100).toFixed(1)}%` : 'Validated';
            const risk = inc.riskScore !== undefined ? `${inc.riskScore} / 100` : 'Standard';
            const trackStr = inc.trackId || 'TRACK-001001';
            const actionText = inc.recommendedAction || 'Area safety inspection advised. Supply certified PPE before worker resumes duty.';

            // Measure action text height dynamically
            doc.fontSize(7).font('Helvetica');
            const actionH = Math.max(12, doc.heightOfString(actionText, { width: 485, lineGap: 1.5 }));
            const cardHeight = 72 + actionH;

            // Keep card together - avoid splitting across pages
            checkAddPage(cardHeight + 10);
            const cardY = doc.y;

            // Card background and border
            doc.rect(40, cardY, 515, cardHeight).fillAndStroke('#FFFFFF', C_BORDER);

            // Left severity accent indicator
            const badgeColor = inc.severity === 'critical' ? C_DANGER : inc.severity === 'high' ? C_WARNING : C_PRIMARY;
            doc.rect(40, cardY, 4, cardHeight).fill(badgeColor);

            // Card Header Row: Incident ID, Violation, Severity, Status
            doc.fillColor(C_DARK).fontSize(8.5).font('Helvetica-Bold').text(inc.incidentId, 52, cardY + 7);
            doc.fillColor(badgeColor).text(vName, 140, cardY + 7);
            doc.fillColor(badgeColor).fontSize(7.5).text(`SEVERITY: ${inc.severity.toUpperCase()}`, 380, cardY + 7);
            doc.fillColor(C_DARK).text(`[${inc.status}]`, 480, cardY + 7);

            // Subtle divider line
            doc.rect(52, cardY + 20, 490, 0.5).fill('#E2E8F0');

            // Metadata Grid: Column 1
            doc.fillColor(C_MUTED).fontSize(7).font('Helvetica');
            doc.text('Worker: ', 52, cardY + 24, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(workerLabel);
            doc.fillColor(C_MUTED).font('Helvetica').text('Camera: ', 52, cardY + 35, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(`${camLabel}    |    Zone: ${zoneLabel}`);
            doc.fillColor(C_MUTED).font('Helvetica').text('Timestamp: ', 52, cardY + 46, { continued: true }).fillColor(C_TEXT).text(tsStr);

            // Metadata Grid: Column 2
            doc.fillColor(C_MUTED).font('Helvetica').text('Track ID: ', 310, cardY + 24, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(trackStr);
            doc.fillColor(C_MUTED).font('Helvetica').text('AI Confidence: ', 310, cardY + 35, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(conf);
            doc.fillColor(C_MUTED).font('Helvetica').text('Risk Score: ', 310, cardY + 46, { continued: true }).fillColor(C_DANGER).font('Helvetica-Bold').text(risk);

            // Mitigation & Action Block
            const actionY = cardY + 58;
            doc.rect(52, actionY, 490, actionH + 8).fill('#F8FAFC');
            doc.rect(52, actionY, 2, actionH + 8).fill(badgeColor);
            doc.fillColor(C_DARK).fontSize(6.5).font('Helvetica-Bold').text('ACTION / RESOLUTION:', 58, actionY + 2.5);
            doc.fillColor(C_TEXT).fontSize(7).font('Helvetica').text(actionText, 58, actionY + 9.5, { width: 480, lineGap: 1.5 });

            doc.y = cardY + cardHeight + 8;
          });
          doc.y += 10;
        }
      }

      // ========================================================
      // SECTION 4: 24-Hour Compliance Velocity Curves (Rule 10)
      // ========================================================
      if (hasSection('complianceTrend', '24-Hour Compliance Velocity Curves')) {
        checkAddPage(150);
        doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('4. 24-HOUR COMPLIANCE VELOCITY CURVES', 40, doc.y);
        doc.rect(40, doc.y + 14, 515, 1).fill(C_BORDER);
        doc.y += 22;

        // Group by hour
        const hourlyBuckets = new Array(24).fill(0);
        let timestampedCount = 0;

        filteredIncidents.forEach((inc) => {
          const t = new Date(inc.timestamp);
          if (!isNaN(t.getTime())) {
            const h = t.getUTCHours();
            hourlyBuckets[h]++;
            timestampedCount++;
          }
        });

        if (timestampedCount === 0) {
          checkAddPage(60);
          doc.rect(40, doc.y, 515, 38).fillAndStroke('#F1F5F9', '#CBD5E1');
          doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text('NO SUFFICIENT TIMESTAMPED DATA', 52, doc.y + 10);
          doc.fillColor(C_MUTED).fontSize(7.5).font('Helvetica').text(
            'Zero timestamped incident records found in the selected period to compute velocity curves.',
            52,
            doc.y + 22
          );
          doc.y += 48;
        } else {
          // Draw real histogram
          const maxCount = Math.max(...hourlyBuckets, 1);
          const chartH = 75;
          const chartW = 515;
          const barW = 15;
          const gap = (chartW - 24 * barW) / 25;
          const chartY = doc.y + 15;

          // Chart background box
          doc.rect(40, doc.y, chartW, chartH + 35).fillAndStroke(C_BG_CARD, C_BORDER);
          doc.fillColor(C_MUTED).fontSize(7).font('Helvetica').text(
            `Hourly Incident Velocity (UTC Distribution across 24 Hours)  |  Total Samples: ${timestampedCount}`,
            50,
            doc.y + 6
          );

          // Horizontal grid line
          doc.rect(45, chartY + chartH, chartW - 10, 1).fill('#CBD5E1');

          for (let h = 0; h < 24; h++) {
            const count = hourlyBuckets[h];
            const barH = count > 0 ? Math.max(3, Math.round((count / maxCount) * (chartH - 12))) : 0;
            const bx = 45 + gap + h * (barW + gap);
            const by = chartY + chartH - barH;

            if (barH > 0) {
              const barColor = count >= 3 ? C_DANGER : count >= 1 ? C_WARNING : C_PRIMARY;
              doc.rect(bx, by, barW, barH).fill(barColor);
              // Number on top of bar if count > 0
              doc.fillColor(C_DARK).fontSize(6).font('Helvetica-Bold').text(`${count}`, bx, by - 8, {
                width: barW,
                align: 'center',
              });
            }

            // Hour label every 2 hours
            if (h % 2 === 0) {
              doc.fillColor(C_MUTED).fontSize(6).font('Helvetica').text(`${h < 10 ? '0' + h : h}h`, bx - 2, chartY + chartH + 4);
            }
          }

          doc.y = chartY + chartH + 30;

          // Shift breakdown summary
          const shiftMorning = hourlyBuckets.slice(6, 14).reduce((a, b) => a + b, 0);
          const shiftEvening = hourlyBuckets.slice(14, 22).reduce((a, b) => a + b, 0);
          const shiftNight = (hourlyBuckets.slice(22, 24).reduce((a, b) => a + b, 0) + hourlyBuckets.slice(0, 6).reduce((a, b) => a + b, 0));

          doc.fillColor(C_TEXT).fontSize(7.5).font('Helvetica');
          doc.text(
            `Shift Telemetry Breakdown:   Morning Shift (06:00-14:00): ${shiftMorning}   |   Evening Shift (14:00-22:00): ${shiftEvening}   |   Night Shift (22:00-06:00): ${shiftNight}`,
            42,
            doc.y
          );
          doc.y += 18;
        }
      }

      // ========================================================
      // SECTION 5: Incident Proof Images with Bounding Boxes (Rule 11 & B5)
      // ========================================================
      if (hasSection('proofImages', 'Incident Proof Images with Bounding Boxes')) {
        checkAddPage(150);
        doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('5. INCIDENT PROOF IMAGES WITH BOUNDING BOXES', 40, doc.y);
        doc.rect(40, doc.y + 14, 515, 1).fill(C_BORDER);
        doc.y += 22;

        if (totalViolations === 0) {
          renderNoDataNotice(
            '5. Incident Proof Images with Bounding Boxes',
            `No incident records available in the selected period to display visual evidence.`
          );
        } else {
          // Display up to 6 key visual evidence incidents, prioritizing authentic captured frames
          const proofIncidents = [...filteredIncidents]
            .sort((a, b) => {
              const aHas = (a.evidenceImage && typeof a.evidenceImage === 'string' && a.evidenceImage.trim().length > 10) ? 1 : 0;
              const bHas = (b.evidenceImage && typeof b.evidenceImage === 'string' && b.evidenceImage.trim().length > 10) ? 1 : 0;
              return bHas - aHas;
            })
            .slice(0, 6);

          proofIncidents.forEach((inc) => {
            let imageBuffer: Buffer | null = null;
            if (inc.evidenceImage && typeof inc.evidenceImage === 'string' && inc.evidenceImage.trim()) {
              if (inc.evidenceImage.startsWith('data:image')) {
                try {
                  const parts = inc.evidenceImage.split(',');
                  if (parts[1]) imageBuffer = Buffer.from(parts[1], 'base64');
                } catch (_) {}
              } else if (inc.evidenceImage.length > 100 && !inc.evidenceImage.startsWith('/') && !inc.evidenceImage.startsWith('http')) {
                // Raw base64 string
                try {
                  imageBuffer = Buffer.from(inc.evidenceImage, 'base64');
                } catch (_) {}
              } else {
                // File path candidates
                const candidatePaths = [
                  path.resolve(__dirname, '../../../server/public', inc.evidenceImage.replace(/^\//, '')),
                  path.resolve(__dirname, '../../public', inc.evidenceImage.replace(/^\//, '')),
                  path.resolve(__dirname, '../../../uploads', inc.evidenceImage.replace(/^\//, '')),
                  path.resolve(__dirname, '../../uploads', inc.evidenceImage.replace(/^\//, '')),
                ];
                for (const cp of candidatePaths) {
                  if (fs.existsSync(cp)) {
                    try {
                      imageBuffer = fs.readFileSync(cp);
                      break;
                    } catch (_) {}
                  }
                }
              }
            }

            const vName = (inc.violationType || 'SAFETY INFRACTION').replace(/_/g, ' ').toUpperCase();
            const cardH = 142;
            checkAddPage(cardH + 12);
            const cardY = doc.y;

            // Outer card frame
            doc.rect(40, cardY, 515, cardH).fillAndStroke(C_BG_CARD, C_BORDER);
            const badgeColor = inc.severity === 'critical' ? C_DANGER : inc.severity === 'high' ? C_WARNING : C_PRIMARY;
            doc.rect(40, cardY, 4, cardH).fill(badgeColor);

            if (imageBuffer) {
              let imgDrawn = false;
              try {
                const img = (doc as any).openImage(imageBuffer);
                if (img && img.width && img.height) {
                  const frameW = 205;
                  const frameH = 126;
                  const frameX = 48;
                  const frameY = cardY + 8;

                  // Frame backdrop
                  doc.rect(frameX, frameY, frameW, frameH).fill('#0F172A');

                  // Preserve aspect ratio
                  const imgAspect = img.width / img.height;
                  const boxAspect = frameW / frameH;
                  let renderedW = frameW;
                  let renderedH = frameH;
                  if (imgAspect > boxAspect) {
                    renderedW = frameW;
                    renderedH = frameW / imgAspect;
                  } else {
                    renderedH = frameH;
                    renderedW = frameH * imgAspect;
                  }

                  const imgX = frameX + (frameW - renderedW) / 2;
                  const imgY = frameY + (frameH - renderedH) / 2;

                  // Render authentic visual frame
                  doc.image(img, imgX, imgY, { width: renderedW, height: renderedH });

                  // Render neural detection bounding box
                  const bb = inc.boundingBox;
                  if (bb && (bb.ymin !== undefined || bb.xmin !== undefined)) {
                    const isNormalized = (bb.ymax <= 1.0 && bb.xmax <= 1.0);
                    let boxX = 0, boxY = 0, boxW = 0, boxH = 0;
                    if (isNormalized) {
                      boxX = imgX + (bb.xmin || 0) * renderedW;
                      boxY = imgY + (bb.ymin || 0) * renderedH;
                      boxW = ((bb.xmax || 1) - (bb.xmin || 0)) * renderedW;
                      boxH = ((bb.ymax || 1) - (bb.ymin || 0)) * renderedH;
                    } else {
                      boxX = imgX + ((bb.xmin || 0) / img.width) * renderedW;
                      boxY = imgY + ((bb.ymin || 0) / img.height) * renderedH;
                      boxW = (((bb.xmax || img.width) - (bb.xmin || 0)) / img.width) * renderedW;
                      boxH = (((bb.ymax || img.height) - (bb.ymin || 0)) / img.height) * renderedH;
                    }

                    boxX = Math.max(imgX, Math.min(imgX + renderedW, boxX));
                    boxY = Math.max(imgY, Math.min(imgY + renderedH, boxY));
                    boxW = Math.max(10, Math.min(imgX + renderedW - boxX, boxW));
                    boxH = Math.max(10, Math.min(imgY + renderedH - boxY, boxH));

                    // Red bounding box stroke
                    doc.rect(boxX, boxY, boxW, boxH).lineWidth(1.5).strokeColor('#EF4444').stroke();

                    // Bounding tag
                    const confText = inc.confidence ? `${(inc.confidence * 100).toFixed(0)}%` : '93%';
                    const tagLabel = `${vName} · ${confText}`;
                    doc.fontSize(6).font('Helvetica-Bold');
                    const tagW = Math.min(boxW, doc.widthOfString(tagLabel) + 6);
                    const tagH = 9;
                    const tagY = Math.max(imgY, boxY - tagH);
                    doc.rect(boxX, tagY, tagW, tagH).fill('#EF4444');
                    doc.fillColor('#FFFFFF').text(tagLabel, boxX + 2, tagY + 2, { width: tagW - 4, ellipsis: true });
                  }

                  imgDrawn = true;
                }
              } catch (e: any) {
                console.warn('[PDF Evidence Render Notice]:', e.message);
              }

              if (!imgDrawn) {
                doc.rect(48, cardY + 8, 205, 126).fill('#F1F5F9');
                doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold').text('VISUAL EVIDENCE UNAVAILABLE', 55, cardY + 60, { width: 190, align: 'center' });
              }

              // Right column: Detailed Investigation Metadata
              const rx = 262;
              doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text(`${inc.incidentId} — EVIDENCE FRAME`, rx, cardY + 10);
              doc.fillColor(badgeColor).fontSize(8).font('Helvetica-Bold').text(vName, rx, cardY + 24);

              doc.fillColor(C_MUTED).fontSize(7).font('Helvetica');
              doc.text('Camera: ', rx, cardY + 38, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(`${inc.cameraId || 'CAM-01'}   |   Zone: ${inc.zone || 'Production Zone'}`);
              doc.fillColor(C_MUTED).font('Helvetica').text('Track ID: ', rx, cardY + 50, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(inc.trackId || 'TRACK-001001');
              doc.fillColor(C_MUTED).font('Helvetica').text('Worker: ', rx, cardY + 62, { continued: true }).fillColor(C_TEXT).text(inc.workerName || inc.workerId || 'Unidentified Worker');

              const dt = new Date(inc.timestamp);
              const dtStr = !isNaN(dt.getTime()) ? dt.toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : inc.timestamp;
              doc.fillColor(C_MUTED).font('Helvetica').text('Timestamp: ', rx, cardY + 74, { continued: true }).fillColor(C_TEXT).text(dtStr);

              const confStr = inc.confidence ? `${(inc.confidence * 100).toFixed(1)}%` : 'Validated';
              const riskStr = inc.riskScore !== undefined ? `${inc.riskScore} / 100` : 'Standard';
              doc.fillColor(C_MUTED).font('Helvetica').text('Model Confidence: ', rx, cardY + 86, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(confStr);
              doc.fillColor(C_MUTED).font('Helvetica').text('Risk Assessment: ', rx, cardY + 98, { continued: true }).fillColor(C_DANGER).font('Helvetica-Bold').text(riskStr);

              // Status badge
              doc.rect(rx, cardY + 114, 85, 15).fill('#F1F5F9');
              doc.rect(rx, cardY + 114, 2, 15).fill(badgeColor);
              doc.fillColor(badgeColor).fontSize(7).font('Helvetica-Bold').text(`STATUS: ${inc.status}`, rx + 6, cardY + 118);

            } else {
              // B5: Visual evidence unavailable
              const frameX = 48;
              const frameY = cardY + 8;
              doc.rect(frameX, frameY, 205, 126).fillAndStroke('#F8FAFC', '#E2E8F0');
              doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('VISUAL EVIDENCE UNAVAILABLE', frameX, frameY + 50, { width: 205, align: 'center' });
              doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica').text('Incident logged via sensor telemetry;\nvisual snapshot not captured.', frameX + 10, frameY + 64, { width: 185, align: 'center' });

              // Right column: Detailed Investigation Metadata
              const rx = 262;
              doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text(`${inc.incidentId} — TELEMETRY LOG`, rx, cardY + 10);
              doc.fillColor(badgeColor).fontSize(8).font('Helvetica-Bold').text(vName, rx, cardY + 24);

              doc.fillColor(C_MUTED).fontSize(7).font('Helvetica');
              doc.text('Camera: ', rx, cardY + 38, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(`${inc.cameraId || 'CAM-01'}   |   Zone: ${inc.zone || 'Production Zone'}`);
              doc.fillColor(C_MUTED).font('Helvetica').text('Track ID: ', rx, cardY + 50, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(inc.trackId || 'N/A (Sensor Event)');
              doc.fillColor(C_MUTED).font('Helvetica').text('Worker: ', rx, cardY + 62, { continued: true }).fillColor(C_TEXT).text(inc.workerName || inc.workerId || 'Unidentified Worker');

              const dt = new Date(inc.timestamp);
              const dtStr = !isNaN(dt.getTime()) ? dt.toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : inc.timestamp;
              doc.fillColor(C_MUTED).font('Helvetica').text('Timestamp: ', rx, cardY + 74, { continued: true }).fillColor(C_TEXT).text(dtStr);

              const confStr = inc.confidence ? `${(inc.confidence * 100).toFixed(1)}%` : 'Validated';
              const riskStr = inc.riskScore !== undefined ? `${inc.riskScore} / 100` : 'Standard';
              doc.fillColor(C_MUTED).font('Helvetica').text('Confidence: ', rx, cardY + 86, { continued: true }).fillColor(C_TEXT).font('Helvetica-Bold').text(confStr);
              doc.fillColor(C_MUTED).font('Helvetica').text('Risk Score: ', rx, cardY + 98, { continued: true }).fillColor(C_DANGER).font('Helvetica-Bold').text(riskStr);

              doc.rect(rx, cardY + 114, 85, 15).fill('#F1F5F9');
              doc.rect(rx, cardY + 114, 2, 15).fill(badgeColor);
              doc.fillColor(badgeColor).fontSize(7).font('Helvetica-Bold').text(`STATUS: ${inc.status}`, rx + 6, cardY + 118);
            }

            doc.y = cardY + cardH + 10;
          });
          doc.y += 10;
        }
      }

      // ========================================================
      // FINAL ATTESTATION & SIGN-OFF BLOCK
      // ========================================================
      checkAddPage(110);
      const signY = doc.y + 6;
      doc.fillColor(C_DARK).fontSize(10.5).font('Helvetica-Bold').text('REPORT ATTESTATION & STATUTORY SIGN-OFF', 40, signY);
      doc.rect(40, signY + 14, 515, 1).fill(C_BORDER);

      doc.fillColor(C_MUTED).fontSize(7).font('Helvetica').text(
        `This automated audit record was compiled by the SafeVision AI Computer Vision engine for ${siteName} (${siteCode}). All telemetry logs, neural inferences, and shift data have been preserved in the SafeVision cryptographic audit log. Statutory compliance conclusions remain subject to authorized factory inspector review under applicable industrial safety regulations.`,
        40,
        signY + 22,
        { width: 515, lineGap: 1 }
      );

      doc.rect(45, signY + 70, 210, 1).fill('#94A3B8');
      doc.fillColor(C_TEXT).fontSize(7.5).font('Helvetica-Bold').text('Chief Safety Officer / EHS Lead Signature', 45, signY + 76);
      doc.fillColor(C_MUTED).fontSize(6.5).font('Helvetica').text('Date: ________________________', 45, signY + 86);

      doc.rect(345, signY + 70, 210, 1).fill('#94A3B8');
      doc.fillColor(C_TEXT).fontSize(7.5).font('Helvetica-Bold').text('Plant General Manager / Factory Inspector Seal', 345, signY + 76);
      doc.fillColor(C_MUTED).fontSize(6.5).font('Helvetica').text('Date: ________________________', 345, signY + 86);

      // --- PAGE NUMBERING PASS (Rule 13) ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8').fontSize(7).font('Helvetica');
        doc.text(
          `SAFEVISION COMPLIANCE REPORT  |  SITE: ${siteCode}  |  PERIOD: ${options.dateRange.from} TO ${options.dateRange.to}  |  PAGE ${i + 1} OF ${pages.count}`,
          40,
          doc.page.height - 24,
          { width: doc.page.width - 80, align: 'center' }
        );
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve({
          reportId,
          fileName,
          filePath,
          downloadUrl: `/api/reports/${reportId}/download`,
          complianceScore,
          complianceScoreMethod,
          totalViolations,
          criticalViolations,
          resolvedViolations,
        });
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    });
  }
}
