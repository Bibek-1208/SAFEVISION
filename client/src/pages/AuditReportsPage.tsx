import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Building2,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Award,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { AuditReport } from '../types';

export const AuditReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { currentSite } = useSite();

  // Dynamic default dates (Last 14 days up to today)
  const defaultTo = new Date().toISOString().split('T')[0];
  const defaultFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [standard, setStandard] = useState<'DGFASLI' | 'OSHA' | 'INTERNAL'>('DGFASLI');
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [sections, setSections] = useState({
    siteMap: true,
    violationSummary: true,
    resolutionLog: true,
    complianceTrend: true,
    proofImages: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{ report: AuditReport; downloadUrl: string; fileName?: string } | null>(null);
  const [pastReports, setPastReports] = useState<AuditReport[]>([]);

  const fetchReports = async () => {
    try {
      const res = await api.getReports();
      setPastReports(Array.isArray(res?.reports) ? res.reports : []);
    } catch (err) {
      console.error(err);
      setPastReports([]);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerate = async () => {
    setValidationError(null);

    // Rule 4: Validate date inputs
    if (!fromDate || !toDate) {
      setValidationError('Please specify both start (from) and end (to) dates.');
      return;
    }

    if (fromDate > toDate) {
      setValidationError(`Invalid date range: start date (${fromDate}) cannot be after end date (${toDate}).`);
      return;
    }

    // Rule 6: Validate section selection
    const selectedSectionsList = Object.entries(sections)
      .filter(([_, val]) => val)
      .map(([key]) => key);

    if (selectedSectionsList.length === 0) {
      setValidationError('Please select at least one audit section to include in the compliance report.');
      return;
    }

    setIsGenerating(true);
    setGeneratedResult(null);

    try {
      // Rule 3: Use active site context dynamically
      const effectiveSiteId = currentSite?.siteId || currentSite?.id;
      const effectiveSiteName = currentSite?.name || 'Industrial Facility';
      const effectiveSiteCode = currentSite?.code || 'SITE-01';

      const res = await api.generateReport({
        standard,
        siteId: effectiveSiteId,
        siteName: effectiveSiteName,
        siteCode: effectiveSiteCode,
        dateRange: { from: fromDate, to: toDate },
        sections: selectedSectionsList,
        generatedBy: user ? `${user.name} (${user.role.replace('_', ' ')})` : 'Authorized EHS Auditor',
      });

      setGeneratedResult(res);
      await fetchReports();
    } catch (err: any) {
      setValidationError(err.message || 'Error compiling audit report PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (reportId: string, filename?: string) => {
    setIsDownloading(true);
    try {
      await api.downloadReportPdf(reportId, filename);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto text-gray-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#181818] border border-[#2B2B2B] p-4 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-safe" />
            <h1 className="text-base font-bold font-mono text-white">
              AUDIT REPORT FRAMEWORK & EXPORT
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-safe/20 text-safe font-bold">
              PDF COMPLIANCE ENGINE
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            Active Plant: <span className="text-white font-bold">{currentSite?.name || 'Industrial Site'}</span> ({currentSite?.code || 'SITE-01'})
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
          <ShieldCheck className="w-4 h-4 text-safe" />
          <span>CRYPTOGRAPHIC EVIDENCE WATERMARKING ACTIVE</span>
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-200 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Generator Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-8 hud-panel p-6 rounded-xl border border-[#2B2B2B] space-y-5 text-left">
          <div className="border-b border-[#2A2A2A] pb-3">
            <h2 className="text-sm font-bold text-white font-mono">
              Generate Compliance Report
            </h2>
            <p className="text-xs text-gray-400 font-mono">
              Create official safety and compliance reports mapped to real database telemetry
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reporting Standard Selector */}
            <div>
              <label className="block text-xs font-mono text-gray-400 font-bold mb-1.5">
                REPORTING STANDARD REFERENCE *
              </label>
              <select
                value={standard}
                onChange={(e) => setStandard(e.target.value as any)}
                className="w-full bg-[#161616] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
              >
                <option value="DGFASLI">DGFASLI (India - Factories Act 1948 Reference)</option>
                <option value="OSHA">OSHA (US 29 CFR 1910 General Industry Reference)</option>
                <option value="INTERNAL">Internal Enterprise EHS Risk Benchmark</option>
              </select>
            </div>

            {/* Date Range Picker */}
            <div>
              <label className="block text-xs font-mono text-gray-400 font-bold mb-1.5">
                DATE RANGE *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setValidationError(null);
                  }}
                  className="bg-[#161616] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setValidationError(null);
                  }}
                  className="bg-[#161616] border border-[#2E2E2E] focus:border-safe rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>
          </div>

          {/* Include Sections Checklist */}
          <div>
            <label className="block text-xs font-mono text-gray-400 font-bold mb-2">
              INCLUDE AUDIT SECTIONS
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              {[
                { key: 'siteMap', label: 'Site Schematic & Hazard Zones' },
                { key: 'violationSummary', label: 'Violation Summary & Severity Matrix' },
                { key: 'resolutionLog', label: 'Steward Resolution & Incident Log' },
                { key: 'complianceTrend', label: '24-Hour Compliance Velocity Curves' },
                { key: 'proofImages', label: 'Incident Proof Images with Bounding Boxes' },
              ].map((sec) => (
                <label
                  key={sec.key}
                  className="flex items-center gap-2.5 p-2.5 bg-[#181818] border border-[#2A2A2A] rounded-lg cursor-pointer hover:border-gray-500 transition"
                >
                  <input
                    type="checkbox"
                    checked={(sections as any)[sec.key]}
                    onChange={(e) => {
                      setSections({ ...sections, [sec.key]: e.target.checked });
                      setValidationError(null);
                    }}
                    className="accent-safe w-4 h-4 rounded"
                  />
                  <span className="text-gray-300">{sec.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Generation Action Box */}
        <div className="lg:col-span-4 hud-panel p-6 rounded-xl border border-[#2B2B2B] flex flex-col justify-between text-left">
          <div>
            <div className="w-12 h-12 rounded-xl bg-safe/10 border border-safe/40 flex items-center justify-center text-safe mb-4">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white font-mono">
              Ready to Generate
            </h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Your official report will query verified database records for the selected site and date period, compiling neural bounding boxes and compliance analytics.
            </p>

            <div className="mt-4 p-3 bg-[#181818] border border-[#282828] rounded-lg text-xs font-mono space-y-1.5 text-gray-400">
              <div className="flex justify-between">
                <span>TARGET FORMAT:</span>
                <span className="text-white font-bold">PDF (A4 Document)</span>
              </div>
              <div className="flex justify-between">
                <span>PLANT UNIT:</span>
                <span className="text-safe font-bold">{currentSite?.code || 'SITE-01'}</span>
              </div>
              <div className="flex justify-between">
                <span>REGULATORY TIER:</span>
                <span className="text-emerald-400 font-bold">{standard} TEMPLATE</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            {generatedResult ? (
              <div className="space-y-3">
                <div className="p-3 bg-safe/20 border border-safe text-safe text-xs font-mono font-bold rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Report PDF Generated Successfully!</span>
                </div>
                <button
                  onClick={() => handleDownload(generatedResult.report.reportId, generatedResult.fileName)}
                  disabled={isDownloading}
                  className="w-full py-3 bg-safe hover:bg-safe-light text-black font-mono font-extrabold text-xs rounded-lg transition flex items-center justify-center gap-2 shadow-glow-safe disabled:opacity-50"
                >
                  {isDownloading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      FETCHING PDF STREAM...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      DOWNLOAD COMPLIANCE PDF
                    </>
                  )}
                </button>
                <div className="text-center">
                  <button
                    onClick={() => setGeneratedResult(null)}
                    className="text-[11px] font-mono text-gray-400 hover:text-white underline"
                  >
                    Configure Another Report
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-3 bg-safe hover:bg-safe-light text-black font-mono font-extrabold text-xs tracking-wider rounded-lg transition flex items-center justify-center gap-2 shadow-glow-safe disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    COMPILING AUDIT PDF...
                  </>
                ) : (
                  <>
                    GENERATE COMPLIANCE PDF →
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Past Reports Table (Rule 15) */}
      <div className="hud-panel rounded-xl p-4 border border-[#2B2B2B]">
        <h3 className="text-xs font-mono font-bold text-gray-200 mb-3 uppercase">
          Generated Audit Filings Archive
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#181818] text-gray-400 text-[10px] uppercase border-b border-[#262626]">
              <tr>
                <th className="p-3">Report ID</th>
                <th className="p-3">Regulatory Standard</th>
                <th className="p-3">Audit Scope</th>
                <th className="p-3">Date Range</th>
                <th className="p-3">Compliance Score</th>
                <th className="p-3">Generated Date</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {(pastReports || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-xs font-mono text-gray-500">
                    No generated reports available. Select a date range and click "Generate Compliance PDF" to create one.
                  </td>
                </tr>
              ) : (
                (pastReports || []).map((rep) => (
                  <tr key={rep.id} className="hover:bg-[#202020]">
                    <td className="p-3 font-bold text-white">{rep.reportId}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-safe/20 text-safe border border-safe/30">
                        {rep.standard}
                      </span>
                    </td>
                    <td className="p-3 text-gray-300">
                      {rep.siteName} {rep.siteCode ? `(${rep.siteCode})` : ''}
                    </td>
                    <td className="p-3 text-gray-400">
                      {rep.dateRange?.from || '—'} to {rep.dateRange?.to || '—'}
                    </td>
                    <td className="p-3 text-safe font-bold">
                      {rep.complianceScore !== null && rep.complianceScore !== undefined
                        ? `${rep.complianceScore}%`
                        : 'N/A'}
                    </td>
                    <td className="p-3 text-gray-400">
                      {new Date(rep.generatedAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDownload(rep.reportId, rep.fileName)}
                        className="text-safe hover:text-safe-light font-bold flex items-center justify-end gap-1 ml-auto transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
