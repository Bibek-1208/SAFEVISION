const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json !== null ? json : data,
          raw: data,
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('SAFEVISION PHASE 5 AUTOMATED VERIFICATION SUITE');
  console.log('==================================================');

  // 0. Authenticate
  const loginRes = await request(
    {
      hostname: '127.0.0.1',
      port: 5005,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@test.local', password: 'Test@1234' }
  );

  if (loginRes.status !== 200 || !loginRes.body.token) {
    throw new Error(`Login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  const token = loginRes.body.token;
  console.log(`[AUTH] Admin authenticated successfully. User: ${loginRes.body.user.email} (${loginRes.body.user.role})`);

  // 1. Search existing incident (e.g. "helmet")
  console.log('\n--- 1. Search Existing Incident ("helmet") ---');
  const incSearchRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/search?q=helmet',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`Search status: ${incSearchRes.status}`);
  const incCats = incSearchRes.body.categories || {};
  const incidentsList = incCats.incidents || [];
  console.log(`Matched incidents: ${incidentsList.length}`);
  if (incidentsList.length > 0) {
    const firstInc = incidentsList[0];
    console.log('Sample matched incident:', {
      id: firstInc.id,
      title: firstInc.title,
      subtitle: firstInc.subtitle,
      badge: firstInc.badge,
      url: firstInc.url,
      violationType: firstInc.violationType,
      confidence: firstInc.confidence,
      trackId: firstInc.trackId,
    });
  }
  const pass1 = incSearchRes.status === 200 && incidentsList.length > 0;
  console.log(`Result: ${pass1 ? 'PASS' : 'FAIL'}`);

  // 2. Search existing camera (e.g. "CAM")
  console.log('\n--- 2. Search Existing Camera ("CAM") ---');
  const camSearchRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/search?q=CAM',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const camList = camSearchRes.body.categories?.cameras || [];
  console.log(`Matched cameras: ${camList.length}`);
  if (camList.length > 0) {
    console.log('Sample camera result:', camList[0]);
  }
  const pass2 = camSearchRes.status === 200 && camList.length > 0;
  console.log(`Result: ${pass2 ? 'PASS' : 'FAIL'}`);

  // 3. Search existing site (e.g. "Rourkela")
  console.log('\n--- 3. Search Existing Site ("Rourkela") ---');
  const siteSearchRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/search?q=Rourkela',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const siteList = siteSearchRes.body.categories?.sites || [];
  console.log(`Matched sites: ${siteList.length}`);
  if (siteList.length > 0) {
    console.log('Sample site result:', siteList[0]);
  }
  const pass3 = siteSearchRes.status === 200 && siteList.length > 0;
  console.log(`Result: ${pass3 ? 'PASS' : 'FAIL'}`);

  // 4. Search nonexistent term
  console.log('\n--- 4. Search Nonexistent Term ("xyznonexistentterm999") ---');
  const noneSearchRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/search?q=xyznonexistentterm999',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const totalResultsNone = noneSearchRes.body.totalResults || 0;
  console.log(`Total results for nonexistent term: ${totalResultsNone}`);
  const pass4 = noneSearchRes.status === 200 && totalResultsNone === 0;
  console.log(`Result: ${pass4 ? 'PASS' : 'FAIL'}`);

  // 5. Open incident from search
  console.log('\n--- 5. Open Incident From Search (e.g. INC-7726273) ---');
  const targetIncidentId = 'INC-7726273';
  const incDetailRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: `/api/incidents/${targetIncidentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const inc = incDetailRes.body.incident;
  console.log('Incident loaded:', {
    incidentId: inc?.incidentId,
    source: inc?.source,
    violationType: inc?.violationType,
    hasEvidence: !!inc?.evidenceImage,
    evidencePrefix: inc?.evidenceImage ? inc.evidenceImage.substring(0, 35) : null,
    boundingBox: inc?.boundingBox,
    trackId: inc?.trackId,
    camera: inc?.cameraId,
    zone: inc?.zone,
    timestamp: inc?.timestamp,
    riskScore: inc?.riskScore,
    temporalConfig: inc?.temporalConfigUsed,
  });
  const pass5 = incDetailRes.status === 200 && inc?.incidentId === targetIncidentId;
  console.log(`Result: ${pass5 ? 'PASS' : 'FAIL'}`);

  // 6. Verify incident data
  console.log('\n--- 6. Verify Incident Data ---');
  const pass6 =
    inc.incidentId &&
    inc.zone &&
    inc.cameraId &&
    inc.timestamp &&
    inc.riskScore !== undefined &&
    inc.violationType;
  console.log(`Fields present: id=${inc.incidentId}, zone=${inc.zone}, cam=${inc.cameraId}, time=${inc.timestamp}, risk=${inc.riskScore}`);
  console.log(`Result: ${pass6 ? 'PASS' : 'FAIL'}`);

  // 7. Verify evidence behavior
  console.log('\n--- 7. Verify Real Evidence Behavior ---');
  const hasRealEvidence = inc.evidenceImage && inc.evidenceImage.startsWith('data:image');
  const hasRealBbox =
    inc.boundingBox &&
    typeof inc.boundingBox.ymin === 'number' &&
    typeof inc.boundingBox.ymax === 'number' &&
    typeof inc.boundingBox.xmin === 'number' &&
    typeof inc.boundingBox.xmax === 'number';
  console.log(`Real base64 evidence frame: ${hasRealEvidence ? 'YES (' + inc.evidenceImage.length + ' chars)' : 'NO'}`);
  console.log(`Real bounding box coordinates: ${hasRealBbox ? JSON.stringify(inc.boundingBox) : 'NO'}`);
  const pass7 = hasRealEvidence && hasRealBbox;
  console.log(`Result: ${pass7 ? 'PASS' : 'FAIL'}`);

  // 8. Export CSV
  console.log('\n--- 8. Export CSV (GET /api/incidents/export/csv) ---');
  const csvRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/incidents/export/csv?siteId=site-rsp-1',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`HTTP Status: ${csvRes.status}`);
  console.log(`Content-Type: ${csvRes.headers['content-type']}`);
  console.log(`Content-Disposition: ${csvRes.headers['content-disposition']}`);
  const pass8 =
    csvRes.status === 200 &&
    csvRes.headers['content-type']?.includes('text/csv') &&
    csvRes.headers['content-disposition']?.includes('SafeVision_Incidents_RSP-ZB-01');
  console.log(`Result: ${pass8 ? 'PASS' : 'FAIL'}`);

  // 9. Validate CSV response & filename
  console.log('\n--- 9. Validate CSV Response & Filename ---');
  const cdHeader = csvRes.headers['content-disposition'] || '';
  const filenameMatch = cdHeader.match(/filename="?([^";]+)"?/);
  const exportedFilename = filenameMatch ? filenameMatch[1] : '';
  console.log(`Extracted Filename: ${exportedFilename}`);
  const pass9 = exportedFilename.startsWith('SafeVision_Incidents_RSP-ZB-01_');
  console.log(`Result: ${pass9 ? 'PASS' : 'FAIL'}`);

  // 10. Open CSV & parse
  console.log('\n--- 10. Open CSV & Inspect ---');
  const rows = csvRes.raw.split('\r\n').filter(Boolean);
  console.log(`Total CSV rows: ${rows.length}`);
  const pass10 = rows.length > 1;
  console.log(`Result: ${pass10 ? 'PASS' : 'FAIL'}`);

  // 11. Verify row contents & headers
  console.log('\n--- 11. Verify Row Contents & Columns ---');
  const expectedHeaders = [
    'Incident ID',
    'Timestamp',
    'Site',
    'Camera',
    'Zone',
    'Violation Type',
    'Severity',
    'Confidence',
    'Track ID',
    'Duration',
    'Temporal State',
    'Risk Score',
    'Status',
    'Worker',
    'Resolution',
    'Source',
  ];
  const actualHeader = rows[0];
  console.log(`Actual Header: ${actualHeader}`);
  const allHeadersMatch = expectedHeaders.every((h) => actualHeader.includes(h));
  console.log(`Headers check: ${allHeadersMatch ? 'MATCH' : 'MISMATCH'}`);
  console.log(`Sample data row 1: ${rows[1]}`);
  const pass11 = allHeadersMatch && rows.length >= 64;
  console.log(`Result: ${pass11 ? 'PASS' : 'FAIL'}`);

  // 12. Test empty incident period
  console.log('\n--- 12. Test Empty Incident Period ---');
  const emptyCsvRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/incidents/export/csv?siteId=site-rsp-1&startDate=2015-01-01&endDate=2015-01-02',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`Empty CSV Status: ${emptyCsvRes.status}`);
  console.log(`Empty Filename: ${emptyCsvRes.headers['content-disposition']}`);
  const emptyRows = emptyCsvRes.raw.split('\r\n').filter(Boolean);
  console.log(`Empty CSV row count: ${emptyRows.length}`);
  const pass12 = emptyCsvRes.status === 200 && emptyRows.length === 1 && emptyRows[0].includes('Incident ID');
  console.log(`Result: ${pass12 ? 'PASS' : 'FAIL'}`);

  console.log('\n==================================================');
  console.log('SUMMARY OF BACKEND ACCEPTANCE CHECKS:');
  console.log(`1. Search Incident:     ${pass1 ? 'PASS' : 'FAIL'}`);
  console.log(`2. Search Camera:       ${pass2 ? 'PASS' : 'FAIL'}`);
  console.log(`3. Search Site:         ${pass3 ? 'PASS' : 'FAIL'}`);
  console.log(`4. Search Nonexistent:  ${pass4 ? 'PASS' : 'FAIL'}`);
  console.log(`5. Open Incident:       ${pass5 ? 'PASS' : 'FAIL'}`);
  console.log(`6. Incident Data:       ${pass6 ? 'PASS' : 'FAIL'}`);
  console.log(`7. Evidence Behavior:   ${pass7 ? 'PASS' : 'FAIL'}`);
  console.log(`8. Export CSV:          ${pass8 ? 'PASS' : 'FAIL'}`);
  console.log(`9. Validate Filename:   ${pass9 ? 'PASS' : 'FAIL'}`);
  console.log(`10. Open CSV:           ${pass10 ? 'PASS' : 'FAIL'}`);
  console.log(`11. Row Contents:       ${pass11 ? 'PASS' : 'FAIL'}`);
  console.log(`12. Empty Period:       ${pass12 ? 'PASS' : 'FAIL'}`);
  console.log('==================================================');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
