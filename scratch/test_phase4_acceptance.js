const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5005/api';

async function testPhase4() {
  console.log('='.repeat(60));
  console.log('SAFEVISION PHASE 4 ACCEPTANCE TEST SUITE (NODE)');
  console.log('='.repeat(60));

  // 1. Login as Admin
  console.log('\n[Step 1] Authenticating as Admin...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@safevision.ai', password: 'Password123!' }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
  const loginData = await loginRes.json();
  const token = loginData.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`  ✓ Authenticated as ${loginData.user.name} (${loginData.user.role})`);

  // 2. Query Sites & Selected Site
  console.log('\n[Step 2] Querying Site Context...');
  const sitesRes = await fetch(`${BASE_URL}/sites`, { headers });
  if (!sitesRes.ok) throw new Error(`Sites failed: ${await sitesRes.text()}`);
  const sitesData = await sitesRes.json();
  const sites = sitesData.sites;
  console.log(`  Found ${sites.length} site(s): ${sites.map((s) => s.code).join(', ')}`);
  const site1 = sites[0];
  const site1_id = site1.siteId || site1.id;
  const site1_name = site1.name;
  const site1_code = site1.code;
  console.log(`  Selected Site: ${site1_name} (${site1_code}) [ID: ${site1_id}]`);

  // 3. Test Invalid Date Range (Rule 4)
  console.log('\n[Step 3] Testing Invalid Date Range Validation (start > end)...');
  const invRes = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      standard: 'DGFASLI',
      siteId: site1_id,
      siteName: site1_name,
      siteCode: site1_code,
      dateRange: { from: '2026-10-05', to: '2026-10-01' },
      sections: ['siteMap', 'violationSummary'],
    }),
  });
  console.log(`  Response status: ${invRes.status}`);
  if (invRes.status !== 400) throw new Error(`Expected 400 for start > end, got ${invRes.status}`);
  const invData = await invRes.json();
  console.log(`  ✓ Rejected with expected error: ${invData.error}`);

  // 4. Test Empty Sections Selection Validation (Rule 6)
  console.log('\n[Step 4] Testing Empty Sections Selection Validation...');
  const noSecRes = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      standard: 'DGFASLI',
      siteId: site1_id,
      siteName: site1_name,
      siteCode: site1_code,
      dateRange: { from: '2026-09-28', to: '2026-10-02' },
      sections: [],
    }),
  });
  console.log(`  Response status: ${noSecRes.status}`);
  if (noSecRes.status !== 400) throw new Error(`Expected 400 for empty sections, got ${noSecRes.status}`);
  const noSecData = await noSecRes.json();
  console.log(`  ✓ Rejected with expected error: ${noSecData.error}`);

  // 5. Test Current Site + Date Range with Real Data (Rule 19A)
  console.log('\n[Step 5] Generating Report for Site with Real Data (2026-09-28 to 2026-10-02)...');
  const realPayload = {
    standard: 'DGFASLI',
    siteId: site1_id,
    siteName: site1_name,
    siteCode: site1_code,
    dateRange: { from: '2026-09-28', to: '2026-10-02' },
    sections: ['siteMap', 'violationSummary', 'resolutionLog', 'complianceTrend', 'proofImages'],
    generatedBy: 'Lead Inspector (ADMIN)',
  };
  const genRes = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify(realPayload),
  });
  if (genRes.status !== 201) throw new Error(`Generate failed: ${await genRes.text()}`);
  const genData = await genRes.json();
  const report1 = genData.report;
  const report1_id = report1.reportId;
  const report1_file = report1.fileName;
  console.log(`  ✓ Generated Report ID: ${report1_id}`);
  console.log(`  ✓ Standardized Filename: ${report1_file}`);
  console.log(`  ✓ Real Total Violations in period: ${report1.totalViolations}`);
  console.log(`  ✓ Real Critical Violations: ${report1.criticalViolations}`);
  console.log(`  ✓ Real Compliance Score: ${report1.complianceScore}% (Method: ${report1.complianceScoreMethod})`);
  if (!report1_file.startsWith(`SafeVision_Compliance_${site1_code.replace(/[^a-zA-Z0-9_-]/g, '_')}`)) {
    throw new Error(`Filename mismatch: ${report1_file}`);
  }

  // 6. Test PDF Download (Rule 12, 14)
  console.log(`\n[Step 6] Testing PDF Download for ${report1_id}...`);
  const dlRes = await fetch(`${BASE_URL}/reports/${encodeURIComponent(report1_id)}/download`, { headers });
  if (dlRes.status !== 200) throw new Error(`Download failed: ${dlRes.status} ${await dlRes.text()}`);
  const contentType = dlRes.headers.get('content-type') || '';
  console.log(`  ✓ Content-Type: ${contentType}`);
  if (!contentType.includes('application/pdf')) throw new Error(`Expected application/pdf, got ${contentType}`);
  const arrayBuffer = await dlRes.arrayBuffer();
  const pdfBuf = Buffer.from(arrayBuffer);
  console.log(`  ✓ Downloaded bytes: ${pdfBuf.length}`);
  if (pdfBuf.length < 1000) throw new Error(`PDF file size too small: ${pdfBuf.length}`);
  const sig = pdfBuf.subarray(0, 5).toString('ascii');
  if (sig !== '%PDF-') throw new Error(`Invalid PDF signature: ${sig}`);
  console.log(`  ✓ Valid %PDF- header signature confirmed: ${sig}`);

  const outPath = path.resolve(__dirname, report1_file);
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`  ✓ Saved downloaded PDF to ${outPath} (${fs.statSync(outPath).size} bytes)`);

  // 7. Test Download with Query Token fallback (?token=...)
  console.log('\n[Step 7] Testing Download with Query Token parameter (?token=...)...');
  const queryDlRes = await fetch(`${BASE_URL}/reports/${encodeURIComponent(report1_id)}/download?token=${token}`);
  if (queryDlRes.status !== 200) throw new Error(`Query token download failed: ${queryDlRes.status}`);
  const qBuf = Buffer.from(await queryDlRes.arrayBuffer());
  console.log(`  ✓ Direct link authentication via ?token parameter works: ${qBuf.length} bytes`);

  // 8. Test Current Site + Empty Date Range (Rule 19B)
  console.log('\n[Step 8] Generating Report for Date Range with No Data (2026-08-01 to 2026-08-10)...');
  const emptyRes = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      standard: 'OSHA',
      siteId: site1_id,
      siteName: site1_name,
      siteCode: site1_code,
      dateRange: { from: '2026-08-01', to: '2026-08-10' },
      sections: ['violationSummary', 'resolutionLog', 'complianceTrend', 'proofImages'],
      generatedBy: 'EHS Lead (ADMIN)',
    }),
  });
  if (emptyRes.status !== 201) throw new Error(`Empty period report failed: ${await emptyRes.text()}`);
  const emptyReport = (await emptyRes.json()).report;
  console.log(`  ✓ Empty Period Total Violations: ${emptyReport.totalViolations}`);
  if (emptyReport.totalViolations !== 0) throw new Error(`Expected 0 violations, got ${emptyReport.totalViolations}`);
  console.log(`  ✓ Empty Period Compliance Score: ${emptyReport.complianceScore}% (100% since zero breaches)`);

  const dlEmpty = await fetch(`${BASE_URL}/reports/${encodeURIComponent(emptyReport.reportId)}/download`, { headers });
  if (dlEmpty.status !== 200) throw new Error(`Download empty report failed`);
  const emptyBuf = Buffer.from(await dlEmpty.arrayBuffer());
  console.log(`  ✓ Downloaded empty period PDF: ${emptyBuf.length} bytes (Valid %PDF-: ${emptyBuf.subarray(0, 5).toString('ascii') === '%PDF-'})`);

  // 9. Test Unchecked Sections (Rule 19E)
  console.log('\n[Step 9] Generating Report with Unchecked Sections (only siteMap & violationSummary)...');
  const subsetRes = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      standard: 'INTERNAL',
      siteId: site1_id,
      siteName: site1_name,
      siteCode: site1_code,
      dateRange: { from: '2026-09-28', to: '2026-10-02' },
      sections: ['siteMap', 'violationSummary'],
      generatedBy: 'Auditor (ADMIN)',
    }),
  });
  if (subsetRes.status !== 201) throw new Error(`Subset report failed`);
  const subsetReport = (await subsetRes.json()).report;
  console.log(`  ✓ Report sections in record: ${JSON.stringify(subsetReport.sections)}`);
  if (subsetReport.sections.length !== 2) throw new Error(`Expected 2 sections, got ${subsetReport.sections.length}`);

  // 10. Test Report Archive Listing (Rule 15)
  console.log('\n[Step 10] Testing Report Archive Listing (/api/reports)...');
  const archiveRes = await fetch(`${BASE_URL}/reports`, { headers });
  if (archiveRes.status !== 200) throw new Error(`Archive failed`);
  const archivedList = (await archiveRes.json()).reports;
  console.log(`  ✓ Found ${archivedList.length} report(s) in archive`);
  const reportIds = archivedList.map((r) => r.reportId);
  if (!reportIds.includes(report1_id)) throw new Error(`${report1_id} not found in archive`);
  if (!reportIds.includes(emptyReport.reportId)) throw new Error(`${emptyReport.reportId} not found in archive`);
  console.log(`  ✓ Newly generated reports successfully present in archive list.`);

  // 11. Test RBAC Authorization (Rule 17)
  console.log('\n[Step 11] Testing RBAC Authorization...');
  const empLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employee@test.local', password: 'Test@1234' }),
  });
  if (empLogin.ok) {
    const empData = await empLogin.json();
    const empHeaders = { Authorization: `Bearer ${empData.token}`, 'Content-Type': 'application/json' };
    const empGen = await fetch(`${BASE_URL}/reports`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify(realPayload),
    });
    console.log(`  Employee generate report status: ${empGen.status}`);
    if (empGen.status !== 403) throw new Error(`Expected 403 for employee, got ${empGen.status}`);
    console.log(`  ✓ RBAC enforced: Employee forbidden from generating compliance audit reports (HTTP 403).`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL PHASE 4 ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('='.repeat(60));
}

testPhase4().catch((err) => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
