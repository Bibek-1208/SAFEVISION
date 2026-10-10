import path from 'path';
import fs from 'fs';

/**
 * Robust resolution of the uploads/reports directory across source, dist, tests, and CLI execution.
 */
export function getReportsDir(): string {
  let baseDir = __dirname;
  while (!fs.existsSync(path.join(baseDir, 'package.json')) && path.dirname(baseDir) !== baseDir) {
    baseDir = path.dirname(baseDir);
  }
  const reportsDir = path.join(baseDir, 'uploads', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  return reportsDir;
}

/**
 * Generates the standardized compliance PDF filename according to Rule 12:
 * SafeVision_Compliance_<SITE_CODE>_<START>_<END>.pdf
 */
export function formatReportFileName(siteCode: string, fromDate: string, toDate: string): string {
  const cleanCode = (siteCode || 'SITE-01').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanFrom = (fromDate || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  const cleanTo = (toDate || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  return `SafeVision_Compliance_${cleanCode}_${cleanFrom}_${cleanTo}.pdf`;
}
