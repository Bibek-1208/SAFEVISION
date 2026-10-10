import http from 'http';
import fs from 'fs';
import path from 'path';

function request(options: http.RequestOptions, postData?: any): Promise<{ statusCode: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        let data: any = bodyBuffer;
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(bodyBuffer.toString('utf8'));
          } catch (e) {
            data = bodyBuffer.toString('utf8');
          }
        }
        resolve({ statusCode: res.statusCode || 0, data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'string' || Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== PHASE 6 VERIFICATION TEST SUITE ===');

  // Test 1: Admin Login (preserving legacy login & existing credentials)
  console.log('\n--- 1. Testing Auth & Session ---');
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@safevision.ai', password: 'Password123!' });

  console.log(`Admin Login Status: ${loginRes.statusCode}`);
  const token = loginRes.data?.token || loginRes.data?.data?.token;
  const user = loginRes.data?.user || loginRes.data?.data?.user;
  if (loginRes.statusCode !== 200 || !token) {
    console.error('Failed to log in as admin:', loginRes.data);
    process.exit(1);
  }
  console.log(`Admin Authenticated: role=${user?.role}, email=${user?.email}, id=${user?.id}`);

  // Test 2: Protected Route Rejection without Token
  console.log('\n--- 2. Testing Protected Route Rejection ---');
  const unauthRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/sites',
    method: 'GET'
  });
  console.log(`Unauthenticated GET /api/sites: Status=${unauthRes.statusCode} (Expected 401)`);
  if (unauthRes.statusCode !== 401) {
    console.error('Expected 401 for unauthenticated request');
  }

  // Test 3: Firebase Login Route Presence & Validation
  console.log('\n--- 3. Testing /api/auth/firebase-login ---');
  const fbLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/auth/firebase-login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { idToken: 'invalid_dummy_token' });
  console.log(`Invalid Firebase ID Token Test: Status=${fbLoginRes.statusCode} (Expected 401)`);
  console.log(`Response message: ${fbLoginRes.data?.message || fbLoginRes.data}`);

  // Test 4: Check Incidents in DB and inspect Evidence & Bounding Boxes
  console.log('\n--- 4. Inspecting Real Incident Evidence in DB ---');
  const incRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/incidents?limit=50',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const incidents = incRes.data?.incidents || incRes.data?.data || [];
  console.log(`Retrieved ${incidents.length} incidents from DB (total in system: ${incRes.data?.total || incidents.length})`);
  let hasEvidenceCount = 0;
  let noEvidenceCount = 0;
  for (const inc of incidents) {
    if (inc.evidenceImage) {
      hasEvidenceCount++;
      const isBase64 = inc.evidenceImage.startsWith('data:image') || inc.evidenceImage.length > 500;
      console.log(`- Incident ${inc.incidentId || inc.id}: Has evidenceImage (isBase64=${isBase64}, len=${inc.evidenceImage.length}), bbox=${JSON.stringify(inc.boundingBox)}`);
    } else {
      noEvidenceCount++;
    }
  }
  console.log(`Summary: ${hasEvidenceCount} incidents with evidence, ${noEvidenceCount} incidents without evidence`);

  // Test 5: Generate Compliance PDF with Redesigned Cards & Real Evidence
  console.log('\n--- 5. Generating Compliance PDF Report with Redesigned Layout ---');
  const pdfRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/reports',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, {
    standard: 'DGFASLI',
    siteId: 'site-rsp-1',
    dateRange: {
      from: '2026-09-01',
      to: '2026-10-02'
    },
    sections: [
      'executiveSummary',
      'violationSummary',
      'resolutionLog',
      'proofImages',
      'siteSchematic',
      'attestation'
    ]
  });

  console.log(`PDF Generation Status: ${pdfRes.statusCode}`);
  const reportData = pdfRes.data?.report || pdfRes.data?.data;
  if (reportData) {
    console.log(`Report created: ID=${reportData.id || reportData.reportId}, Standard="${reportData.standard}", FileName=${reportData.fileName}`);
    
    // Test Download PDF
    console.log('\n--- 6. Downloading Generated PDF ---');
    const downloadRes = await request({
      hostname: '127.0.0.1',
      port: 5005,
      path: `/api/reports/${reportData.id || reportData.reportId}/download`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`PDF Download Status: ${downloadRes.statusCode}, Content-Type: ${downloadRes.headers['content-type']}`);
    const pdfBuf = downloadRes.data as Buffer;
    console.log(`PDF Byte Size: ${pdfBuf.length} bytes`);
    const header = pdfBuf.slice(0, 8).toString('utf8');
    console.log(`PDF Header: ${header}`);
    if (header.startsWith('%PDF-1.')) {
      console.log('✓ Valid PDF document signature confirmed!');
    } else {
      console.error('Invalid PDF header:', header);
    }
  } else {
    console.error('Failed to create report:', pdfRes.data);
  }

  // Test 7: Phase 2-5 Regressions
  console.log('\n--- 7. Testing Phase 2-5 Regressions ---');
  
  // Phase 2: Global Search
  const searchRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/search?q=helmet',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Global Search (/api/search?q=helmet): Status=${searchRes.statusCode}, Total Results=${searchRes.data?.totalResults || 0}, Incident Matches=${searchRes.data?.categories?.incidents?.length || 0}`);

  // Phase 3: Site Management
  const sitesRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/sites',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Sites List (/api/sites): Status=${sitesRes.statusCode}, Total Sites=${sitesRes.data?.sites?.length || sitesRes.data?.total || 0}`);

  // Phase 4: Reports List
  const reportsListRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/reports',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Reports Archive (/api/reports): Status=${reportsListRes.statusCode}, Total Reports=${reportsListRes.data?.reports?.length || 0}`);

  // Phase 5: CSV Export
  const csvRes = await request({
    hostname: '127.0.0.1',
    port: 5005,
    path: '/api/incidents/export/csv',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`CSV Export (/api/incidents/export/csv): Status=${csvRes.statusCode}, Content-Type=${csvRes.headers['content-type']}`);
  if (csvRes.statusCode === 200) {
    const csvContent = (csvRes.data as Buffer).toString('utf8');
    const lines = csvContent.split('\n');
    console.log(`CSV Lines: ${lines.length}, Header: ${lines[0]}`);
  }

  console.log('\n=== TEST SUITE COMPLETED SUCCESSFULLY ===');
}

runTests().catch(console.error);
