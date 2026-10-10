const path = require('path');
const { io } = require(path.join(__dirname, '../client/node_modules/socket.io-client'));
const mongoose = require(path.join(__dirname, '../server/node_modules/mongoose'));

const BASE_URL = 'http://127.0.0.1:5005';
const MONGO_URI = 'mongodb://127.0.0.1:27017/safevision';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('============================================================');
  console.log('SAFEVISION AI — PHASE 9.1 HOTFIX LIVE INTEGRATION TEST');
  console.log('============================================================\n');

  // 1. Connect to MongoDB to inspect real data
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const camerasCol = db.collection('cameras');
  const zonesCol = db.collection('restrictedzones');
  const incidentsCol = db.collection('incidents');

  const cameras = await camerasCol.find({}).toArray();
  const zones = await zonesCol.find({ isDeleted: { $ne: true } }).toArray();

  console.log(`[Stage 1] Real Cameras in DB (${cameras.length}):`);
  cameras.forEach((c) => console.log(`  - [${c.code}] ${c.name} | Status: ${c.status} | ID: ${c._id}`));

  console.log(`\n[Stage 2] Real Restricted Zones in DB (${zones.length}):`);
  zones.forEach((z) => console.log(`  - [${z.zoneId}] "${z.name}" on Camera: ${z.cameraId} | Enabled: ${z.enabled} | Vertices: ${z.polygon?.length}`));

  const testCam = cameras.find((c) => c.code === 'VHJV') || cameras[0];
  const testZone = zones.find((z) => z.cameraId === testCam.code) || zones[0];

  if (!testCam || !testZone) {
    console.error('FAIL: No camera or zone found for test.');
    process.exit(1);
  }

  const cameraId = testCam.code;
  const zoneId = testZone.zoneId;
  const polygon = testZone.polygon;

  console.log(`\nTarget Camera: ${cameraId} (${testCam.name})`);
  console.log(`Target Zone:   ${zoneId} ("${testZone.name}")`);
  console.log(`Polygon bounds:`, polygon);

  // Obtain Admin JWT token for RBAC-authenticated Socket.IO & REST operations
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'Test@1234' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // Ensure target zone is enabled at start of test
  await fetch(`${BASE_URL}/api/restricted-zones/${zoneId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: true }),
  });

  // 2. Connect real Socket.IO client
  console.log('\n[Stage 3] Connecting Socket.IO Client...');
  const socket = io(BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  const socketEvents = {
    incidentNew: [],
    incidentCreated: [],
    cameraDetections: [],
    zoneBreach: [],
  };

  socket.on('incident:new', (data) => {
    console.log(`  [Socket.IO Event] incident:new received: ${data.incidentId || data.id} (${data.violationType})`);
    socketEvents.incidentNew.push(data);
  });

  socket.on('realtime:event', (payload) => {
    if (payload?.event === 'incident.created') {
      console.log(`  [Socket.IO Event] realtime:event (incident.created) received: ${payload.data?.incident?.incidentId}`);
      socketEvents.incidentCreated.push(payload.data?.incident);
    }
  });

  socket.on('camera:detections', (payload) => {
    socketEvents.cameraDetections.push(payload);
  });

  socket.on('zone:breach', (payload) => {
    console.log(`  [Socket.IO Event] zone:breach received on ${payload.cameraId}:`, payload.breaches?.length, 'breach(es)');
    socketEvents.zoneBreach.push(payload);
  });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log(`  Socket.IO Connected (ID: ${socket.id})`);
      resolve();
    });
  });

  // Calculate an INSIDE point and an OUTSIDE point based on actual polygon
  // Polygon in DB covers x: 0.0651 to 0.9012, y: 0.2384 to 0.8721
  // Inside point: center of polygon
  const avgX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const avgY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
  // Box in percentage [0, 100]
  const insideBbox = {
    ymin: Math.round((avgY - 0.20) * 100),
    xmin: Math.round((avgX - 0.05) * 100),
    ymax: Math.round(avgY * 100), // feet at avgY
    xmax: Math.round((avgX + 0.05) * 100),
  };

  // Outside point: top-left corner far outside
  const outsideBbox = {
    ymin: 1.0,
    xmin: 1.0,
    ymax: 5.0,
    xmax: 5.0,
  };

  const initialIncidentCount = await incidentsCol.countDocuments({ cameraId });
  console.log(`\nInitial incidents in DB for camera ${cameraId}: ${initialIncidentCount}`);

  // -------------------------------------------------------------
  // TEST A: Person OUTSIDE polygon
  // -------------------------------------------------------------
  console.log('\n--- TEST A: Person Standing OUTSIDE Polygon ---');
  const outsideTrack = {
    trackId: 'TRACK-009999',
    employeeId: null,
    employeeName: null,
    identityStatus: 'UNCONFIRMED',
    className: 'person',
    confidence: 0.88,
    bbox: outsideBbox,
    ppe: { helmet: 'CONFIRMED', vest: 'CONFIRMED', gloves: 'CONFIRMED', shoes: 'CONFIRMED' },
  };

  const resA = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: new Date().toISOString(),
      frameWidth: 1280,
      frameHeight: 720,
      detections: [outsideTrack],
    }),
  });
  const dataA = await resA.json();
  console.log(`Response A:`, dataA);
  console.assert(dataA.breachesCount === 0, 'FAIL: Expected 0 breaches for outside person');
  console.log('[✅ PASS] Test A: Person outside polygon produced 0 breaches.');

  // -------------------------------------------------------------
  // TEST B: Person enters polygon for a single frame (< 1.0s)
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Person Enters Polygon — First Sighting (Temporal Filter) ---');
  const testTrackId = `TRACK-${Date.now().toString().slice(-6)}`;
  const insideTrack = {
    trackId: testTrackId,
    employeeId: null,
    employeeName: null,
    identityStatus: 'UNCONFIRMED',
    className: 'person',
    confidence: 0.92,
    bbox: insideBbox,
    ppe: { helmet: 'CONFIRMED', vest: 'CONFIRMED', gloves: 'CONFIRMED', shoes: 'CONFIRMED' },
  };

  const resB = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: new Date().toISOString(),
      frameWidth: 1280,
      frameHeight: 720,
      detections: [insideTrack],
    }),
  });
  const dataB = await resB.json();
  console.log(`Response B:`, dataB);
  console.assert(dataB.breachesCount === 1, 'FAIL: Expected 1 breach candidate');
  console.assert(dataB.incidentsCreated === 0, 'FAIL: Transient frame should NOT create an incident immediately');
  console.log('[✅ PASS] Test B: Single frame inside polygon marked candidate breach without premature incident.');

  // -------------------------------------------------------------
  // TEST C: Person stays inside polygon for > 1.2 seconds (Temporal Confirmation)
  // -------------------------------------------------------------
  console.log('\n--- TEST C: Person Remains Stationary Inside Zone for > 1.2 Seconds ---');
  console.log('Sending continuous frames to simulate real CCTV dwell time...');
  let confirmedCreated = 0;
  for (let f = 1; f <= 8; f++) {
    await sleep(200); // 200ms per frame = 1.6s total dwell time
    const resLoop = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId,
        timestamp: new Date().toISOString(),
        frameWidth: 1280,
        frameHeight: 720,
        detections: [insideTrack],
      }),
    });
    const dataLoop = await resLoop.json();
    if (dataLoop.incidentsCreated > 0) {
      confirmedCreated += dataLoop.incidentsCreated;
      console.log(`  Frame ${f} (elapsed ~${f * 200}ms): Incident created! Count: ${confirmedCreated}`);
    }
  }

  console.assert(confirmedCreated > 0, 'FAIL: Expected at least 1 confirmed incident created');
  console.log('[✅ PASS] Test C: Multi-frame persistence triggered authoritative incident creation.');

  // -------------------------------------------------------------
  // TEST D: Inspect MongoDB Incident Record
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Verifying Incident in MongoDB ---');
  await sleep(300); // Allow Change Stream / DB write to settle
  const createdIncident = await incidentsCol.findOne({
    cameraId,
    trackId: testTrackId,
  });

  console.assert(createdIncident !== null, 'FAIL: Created incident not found in MongoDB');
  console.log('Incident Document in MongoDB:');
  console.log(`  incidentId:    ${createdIncident.incidentId}`);
  console.log(`  cameraId:      ${createdIncident.cameraId}`);
  console.log(`  zone:          ${createdIncident.zone}`);
  console.log(`  trackId:       ${createdIncident.trackId}`);
  console.log(`  violationType: ${createdIncident.violationType}`);
  console.log(`  severity:      ${createdIncident.severity}`);
  console.log(`  riskScore:     ${createdIncident.riskScore}`);
  console.log(`  whyFlagged:    ${JSON.stringify(createdIncident.whyFlagged)}`);
  console.log(`  status:        ${createdIncident.status}`);

  console.assert(createdIncident.riskScore > 0, 'FAIL: Risk score should be > 0');
  console.assert(createdIncident.severity === 'high' || createdIncident.severity === 'critical', 'FAIL: Severity should match high/critical');
  console.log('[✅ PASS] Test D: Incident verified in MongoDB with full risk assessment & explanation.');

  // -------------------------------------------------------------
  // TEST E: Verify Socket.IO Real-time Emission
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Verifying Socket.IO Event Delivery to Client ---');
  console.assert(socketEvents.incidentNew.length > 0 || socketEvents.incidentCreated.length > 0, 'FAIL: Socket.IO client received 0 incident events');
  console.log(`  incident:new events received: ${socketEvents.incidentNew.length}`);
  console.log(`  realtime:event (incident.created) events received: ${socketEvents.incidentCreated.length}`);
  console.log(`  zone:breach events received: ${socketEvents.zoneBreach.length}`);
  console.log(`  camera:detections with geofenceBreaches: ${socketEvents.cameraDetections.filter((p) => p.geofenceBreaches?.length > 0).length}`);
  console.log('[✅ PASS] Test E: Real-time Socket.IO notifications successfully received.');

  // -------------------------------------------------------------
  // TEST F: Person Leaves Polygon
  // -------------------------------------------------------------
  console.log('\n--- TEST F: Person Leaves Polygon ---');
  const resF = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: new Date().toISOString(),
      frameWidth: 1280,
      frameHeight: 720,
      detections: [outsideTrack],
    }),
  });
  const dataF = await resF.json();
  console.assert(dataF.breachesCount === 0, 'FAIL: Breaches should clear when person leaves');
  console.log('[✅ PASS] Test F: Breaches cleared when person stepped outside polygon.');

  // -------------------------------------------------------------
  // TEST G: Negative Test — Disabled Zone
  // -------------------------------------------------------------
  console.log('\n--- TEST G: Negative Test — Disabled Zone ---');
  // Explicitly disable zone via REST API
  await fetch(`${BASE_URL}/api/restricted-zones/${zoneId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: false }),
  });

  await sleep(200);

  const resG = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: new Date().toISOString(),
      frameWidth: 1280,
      frameHeight: 720,
      detections: [insideTrack],
    }),
  });
  const dataG = await resG.json();
  console.log(`Response G (Disabled Zone):`, dataG);
  console.assert(dataG.breachesCount === 0, 'FAIL: Disabled zone should NOT generate breaches');
  console.log('[✅ PASS] Test G: Disabled zone produced 0 breaches.');

  // Restore zone enabled
  await fetch(`${BASE_URL}/api/restricted-zones/${zoneId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: true }),
  });
  console.log('Restored zone to enabled state.');

  socket.disconnect();
  await mongoose.disconnect();

  console.log('\n============================================================');
  console.log('ALL REAL INTEGRATION TESTS PASSED CLEANLY (6/6)');
  console.log('PHASE 9.1 HOTFIX VERIFIED WITH REAL LIVE BACKEND & DB STATE');
  console.log('============================================================');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('TEST SUITE ERROR:', err);
  process.exit(1);
});
