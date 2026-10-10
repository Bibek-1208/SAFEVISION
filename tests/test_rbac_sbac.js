// Automated RBAC & SBAC Verification Test Suite for SafeVision AI
const BASE_URL = 'http://127.0.0.1:5005';

async function runTests() {
  console.log('=====================================================');
  console.log('  SAFEVISION AI - ENTERPRISE RBAC & SBAC TEST SUITE  ');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Test Unauthenticated Requests
  console.log('--- 1. Testing Unauthenticated Access ---');
  const unauthRes = await fetch(`${BASE_URL}/api/incidents`);
  assert(unauthRes.status === 401, `Unauthenticated GET /api/incidents returns 401 (got ${unauthRes.status})`);

  // 2. Test Admin Login and Admin Capabilities
  console.log('\n--- 2. Testing ADMIN (admin@test.local) ---');
  const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'Test@1234' }),
  }).then((r) => r.json());

  assert(adminLogin.user?.role === 'ADMIN', `Admin role resolved as ADMIN`);
  assert(Boolean(adminLogin.token), `Admin received signed JWT token`);

  const adminUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  });
  assert(adminUsersRes.status === 200, `Admin can access GET /api/admin/users (200 OK)`);

  const adminLogsRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  });
  assert(adminLogsRes.status === 200, `Admin can access GET /api/admin/audit-logs (200 OK)`);

  // 3. Test Plant Manager (manager@test.local)
  console.log('\n--- 3. Testing PLANT_MANAGER (manager@test.local) ---');
  const mgrLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@test.local', password: 'Test@1234' }),
  }).then((r) => r.json());

  assert(mgrLogin.user?.role === 'PLANT_MANAGER', `Role resolved as PLANT_MANAGER`);

  // Plant manager trying admin route
  const mgrAdminRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${mgrLogin.token}` },
  });
  assert(mgrAdminRes.status === 403, `Plant Manager blocked from GET /api/admin/users (403 Forbidden, got ${mgrAdminRes.status})`);

  // Plant manager viewing plant-wide reports
  const mgrReportsRes = await fetch(`${BASE_URL}/api/reports`, {
    headers: { Authorization: `Bearer ${mgrLogin.token}` },
  });
  assert(mgrReportsRes.status === 200, `Plant Manager can access GET /api/reports (200 OK)`);

  // 4. Test Safety Officer (officer@test.local)
  console.log('\n--- 4. Testing SAFETY_OFFICER (officer@test.local) ---');
  const officerLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'officer@test.local', password: 'Test@1234' }),
  }).then((r) => r.json());

  assert(officerLogin.user?.role === 'SAFETY_OFFICER', `Role resolved as SAFETY_OFFICER`);

  // Safety officer trying admin route
  const officerAdminRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${officerLogin.token}` },
  });
  assert(officerAdminRes.status === 403, `Safety Officer blocked from GET /api/admin/users (403 Forbidden)`);

  // Safety officer can access incidents
  const officerIncRes = await fetch(`${BASE_URL}/api/incidents`, {
    headers: { Authorization: `Bearer ${officerLogin.token}` },
  });
  assert(officerIncRes.status === 200, `Safety Officer can access GET /api/incidents (200 OK)`);

  // 5. Test Supervisor (supervisor@test.local) - SBAC Zone Isolation
  console.log('\n--- 5. Testing SUPERVISOR (supervisor@test.local) ---');
  const supLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'supervisor@test.local', password: 'Test@1234' }),
  }).then((r) => r.json());

  assert(supLogin.user?.role === 'SUPERVISOR', `Role resolved as SUPERVISOR`);
  assert(
    supLogin.user?.zoneIds?.includes('ZONE-A') && supLogin.user?.zoneIds?.includes('ZONE-B'),
    `Supervisor scoped strictly to Zone A and Zone B`
  );

  // Supervisor querying scoped incidents
  const supIncRes = await fetch(`${BASE_URL}/api/incidents`, {
    headers: { Authorization: `Bearer ${supLogin.token}` },
  }).then((r) => r.json());

  const allAuthorized = supIncRes.incidents.every((i) =>
    i.zone.includes('Furnace') || i.zone.includes('Assembly')
  );
  assert(allAuthorized, `Supervisor incidents list automatically filtered by backend to Zone A & B only`);

  // Supervisor attempting to query unauthorized zone (Loading Dock)
  const supUnauthorizedZone = await fetch(`${BASE_URL}/api/incidents?zone=Loading%20Dock%20%26%20Logistics`, {
    headers: { Authorization: `Bearer ${supLogin.token}` },
  });
  assert(
    supUnauthorizedZone.status === 403,
    `Supervisor querying unauthorized Zone C returns 403 Forbidden (got ${supUnauthorizedZone.status})`
  );

  // Supervisor attempting to resolve an incident (forbidden - only acknowledge/escalate allowed)
  const firstIncId = supIncRes.incidents[0]?.id;
  if (firstIncId) {
    const supResolveRes = await fetch(`${BASE_URL}/api/incidents/${firstIncId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supLogin.token}`,
      },
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    assert(
      supResolveRes.status === 403,
      `Supervisor attempting to resolve incident returns 403 Forbidden (got ${supResolveRes.status})`
    );
  }

  // Supervisor viewing authorized CCTV camera feeds (Restored access)
  const supCctvRes = await fetch(`${BASE_URL}/api/cameras`, {
    headers: { Authorization: `Bearer ${supLogin.token}` },
  });
  assert(
    supCctvRes.status === 200,
    `Supervisor can view authorized CCTV camera feeds (200 OK, got ${supCctvRes.status})`
  );
  if (supCctvRes.status === 200) {
    const supCameras = await supCctvRes.json();
    assert(Array.isArray(supCameras.cameras), `Supervisor received scoped camera feed list`);
  }

  // Supervisor attempting to configure/create a new camera (Forbidden - CAMERA_MANAGE required)
  const supAddCamRes = await fetch(`${BASE_URL}/api/cameras`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supLogin.token}`,
    },
    body: JSON.stringify({
      name: 'Unauthorized Camera',
      code: 'CAM-UNAUTH-01',
      zone: 'Furnace Bay',
      streamUrl: 'rtsp://127.0.0.1:8554/unauth',
    }),
  });
  assert(
    supAddCamRes.status === 403,
    `Supervisor blocked from creating camera feeds without CAMERA_MANAGE (403 Forbidden, got ${supAddCamRes.status})`
  );

  // 6. Test Employee (employee@test.local)
  console.log('\n--- 6. Testing EMPLOYEE (employee@test.local) ---');
  const empLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employee@test.local', password: 'Test@1234' }),
  }).then((r) => r.json());

  assert(empLogin.user?.role === 'EMPLOYEE', `Role resolved as EMPLOYEE`);

  // Employee attempting to view CCTV cameras (Strictly Forbidden!)
  const empCctvRes = await fetch(`${BASE_URL}/api/cameras`, {
    headers: { Authorization: `Bearer ${empLogin.token}` },
  });
  assert(
    empCctvRes.status === 403,
    `Employee attempting to view CCTV streams returns 403 Forbidden (got ${empCctvRes.status})`
  );

  // Employee submitting a hazard report
  const hazardRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${empLogin.token}`,
    },
    body: JSON.stringify({
      zoneId: 'ZONE-A',
      zoneName: 'Furnace Bay',
      hazardType: 'OIL_SPILL',
      description: 'Hydraulic oil slick near ladle transit track.',
      severity: 'high',
    }),
  });
  assert(hazardRes.status === 201, `Employee can successfully submit hazard report (201 Created)`);

  // Employee verifying profile photoURL presence in GET /api/auth/me
  const empMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${empLogin.token}` },
  }).then((r) => r.json());
  assert(empMeRes.user && 'photoURL' in empMeRes.user, `GET /api/auth/me returns photoURL attribute`);

  // 7. Verify Audit Trail Contains Entries
  console.log('\n--- 7. Verifying Audit Log Records ---');
  const logsCheck = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  }).then((r) => r.json());

  assert(logsCheck.auditLogs?.length > 0, `Audit log captured security events (count: ${logsCheck.auditLogs?.length})`);
  const deniedLogs = logsCheck.auditLogs.filter((l) => l.result === 'DENIED');
  assert(deniedLogs.length > 0, `Audit log recorded security access denials (count: ${deniedLogs.length})`);

  console.log('\n=====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('=====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
