// End-to-End Live Geofence Hotfix Verification Test Suite
// Verifies: Real Camera -> Real Track Point -> Active Zone -> Point-in-Polygon ->
// Temporal Confirmation -> Risk & Severity -> MongoDB Incident -> Socket.IO -> Realtime Feed

const { io } = require('../client/node_modules/socket.io-client');

const BASE_URL = 'http://127.0.0.1:5005';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ray-casting algorithm to test if (px, py) is inside polygon
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Compute polygon centroid
function getPolygonCentroid(polygon) {
  let cx = 0, cy = 0;
  for (const pt of polygon) {
    cx += pt.x;
    cy += pt.y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

async function runHotfixVerification() {
  console.log('===============================================================');
  console.log('  SAFEVISION AI — PHASE 9.1 GEOFENCE ENGINE HOTFIX VERIFICATION');
  console.log('===============================================================\n');

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

  // 1. Authenticate as Admin
  console.log('--- Step 1: Admin Authentication ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'Test@1234' }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.ok && Boolean(loginData.token), 'Admin authenticated successfully');
  const token = loginData.token;

  // 2. Camera Verification
  console.log('\n--- Step 2: Camera Verification ---');
  const camRes = await fetch(`${BASE_URL}/api/cameras`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const camData = await camRes.json();
  const cameras = camData.cameras || camData || [];
  assert(cameras.length > 0, `Found ${cameras.length} camera(s) in system`);

  const activeCam = cameras.find((c) => c.code === 'VHJV') || cameras[0];
  const cameraId = activeCam.code || activeCam.cameraId || activeCam.id;
  console.log(`[INFO] Testing with Camera: ${cameraId} (${activeCam.name || activeCam.zone})`);
  assert(Boolean(cameraId), `Target Camera ID resolved: ${cameraId}`);

  // 3. Zone Persistence & Coordinates Verification
  console.log('\n--- Step 3: Zone Persistence & Polygon Verification ---');
  const zoneRes = await fetch(`${BASE_URL}/api/restricted-zones?cameraId=${cameraId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const zoneData = await zoneRes.json();
  const zones = zoneData.zones || zoneData || [];
  assert(zones.length > 0, `Active restricted zone found for camera ${cameraId} (found ${zones.length})`);

  let targetZone = zones.find((z) => z.enabled) || zones[0];
  if (!targetZone) {
    console.log('[INFO] No active zone found, creating standard test zone...');
    const createRes = await fetch(`${BASE_URL}/api/restricted-zones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cameraId,
        zoneName: 'Hotfix Test Zone',
        zoneType: 'RESTRICTED',
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.8, y: 0.8 },
          { x: 0.2, y: 0.8 },
        ],
        enabled: true,
        riskLevel: 'HIGH',
        unknownIdentityPolicy: 'FLAG_UNKNOWN',
      }),
    });
    const createdData = await createRes.json();
    targetZone = createdData.zone || createdData;
  }

  assert(Boolean(targetZone.polygon && targetZone.polygon.length >= 3), 'Zone contains valid polygon (>= 3 points)');
  const coordsValid = targetZone.polygon.every((pt) => pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1);
  assert(coordsValid, 'Polygon coordinates are strictly normalized within [0, 1]');
  console.log(`[INFO] Zone ID: ${targetZone.zoneId}, Name: ${targetZone.zoneName}, Camera: ${targetZone.cameraId}`);
  console.log(`[INFO] Polygon vertices:`, JSON.stringify(targetZone.polygon));

  // 4. Socket.IO Connection Setup
  console.log('\n--- Step 4: Socket.IO Setup ---');
  const socketEvents = {
    detections: [],
    breaches: [],
    incidents: [],
  };

  const socket = io(BASE_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log(`[INFO] Socket.IO connected with ID: ${socket.id}`);
      resolve();
    });
  });

  socket.on('camera:detections', (data) => {
    if (data.cameraId === cameraId) {
      socketEvents.detections.push(data);
    }
  });

  socket.on('zone:breach', (data) => {
    if (data.cameraId === cameraId) {
      socketEvents.breaches.push(data);
    }
  });

  socket.on('incident.created', (data) => {
    socketEvents.incidents.push(data);
  });

  socket.on('new-incident', (data) => {
    socketEvents.incidents.push(data);
  });

  // 5. TEST OUTSIDE POLYGON: Point Outside -> NO VIOLATION
  console.log('\n--- Step 5: Test Outside Polygon (Negative Case) ---');
  // Find point outside polygon: if centroid is (cx, cy), outside could be (0.05, 0.05) or (0.95, 0.95)
  let outsidePoint = { x: 0.05, y: 0.05 };
  if (pointInPolygon(outsidePoint, targetZone.polygon)) {
    outsidePoint = { x: 0.95, y: 0.05 };
  }
  const isOutside = !pointInPolygon(outsidePoint, targetZone.polygon);
  assert(isOutside, `Reference point (${outsidePoint.x}, ${outsidePoint.y}) is OUTSIDE polygon`);

  // Construct track with bottom-center at outsidePoint
  // refX = (xmin + xmax) / 2 = outsidePoint.x
  // refY = ymax = outsidePoint.y
  const outW = 0.06;
  const outH = 0.08;
  const outsideTrack = {
    trackId: 701,
    label: 'person',
    confidence: 0.92,
    bbox: {
      xmin: Math.max(0, outsidePoint.x - outW / 2),
      ymin: Math.max(0, outsidePoint.y - outH),
      xmax: Math.min(1, outsidePoint.x + outW / 2),
      ymax: outsidePoint.y,
    },
  };

  const outPostRes = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: Date.now(),
      detections: [outsideTrack],
      frameWidth: 1920,
      frameHeight: 1080,
    }),
  });
  const outPostData = await outPostRes.json();
  assert(outPostRes.ok, 'POST /api/detection/camera-detections succeeded for outside track');
  assert(
    !outPostData.geofenceBreaches || outPostData.geofenceBreaches.length === 0,
    'No geofence breach reported for outside track'
  );

  // 6. TEST INSIDE POLYGON: Point Inside -> BREACH + TEMPORAL CONFIRMATION + INCIDENT
  console.log('\n--- Step 6: Test Inside Polygon (Positive Case) ---');
  const centroid = getPolygonCentroid(targetZone.polygon);
  const isInside = pointInPolygon(centroid, targetZone.polygon);
  assert(isInside, `Centroid point (${centroid.x.toFixed(3)}, ${centroid.y.toFixed(3)}) is INSIDE polygon`);

  const inW = 0.08;
  const inH = 0.15;
  const insideTrack = {
    trackId: 801,
    label: 'person',
    confidence: 0.95,
    bbox: {
      xmin: Math.max(0, centroid.x - inW / 2),
      ymin: Math.max(0, centroid.y - inH),
      xmax: Math.min(1, centroid.x + inW / 2),
      ymax: centroid.y,
    },
  };

  console.log(`[INFO] Sending sustained detections inside zone for trackId 801 across 1.5 seconds...`);
  // Send 6 frames over 1.5s (250ms apart) to satisfy the temporal confirmation window (>= 1000ms)
  let lastBreachPayload = null;
  for (let i = 0; i < 7; i++) {
    const postRes = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId,
        timestamp: Date.now(),
        detections: [insideTrack],
        frameWidth: 1920,
        frameHeight: 1080,
      }),
    });
    const resData = await postRes.json();
    if (resData.geofenceBreaches && resData.geofenceBreaches.length > 0) {
      lastBreachPayload = resData.geofenceBreaches[0];
    }
    await sleep(250);
  }

  assert(Boolean(lastBreachPayload), 'Geofence breach detected in live POST /api/detection/camera-detections response');
  if (lastBreachPayload) {
    console.log(`[INFO] Breach status: ${lastBreachPayload.breachStatus}, IsConfirmed: ${lastBreachPayload.isConfirmed}, Duration: ${lastBreachPayload.durationMs}ms`);
    assert(lastBreachPayload.isConfirmed === true, 'Breach reached TEMPORAL CONFIRMATION (duration >= 1000ms)');
    assert(lastBreachPayload.trackId === 801, `Breach trackId matches 801`);
    assert(lastBreachPayload.zoneId === targetZone.zoneId, `Breach zoneId matches ${targetZone.zoneId}`);
  }

  // Allow short delay for async incident persistence and socket events
  await sleep(1000);

  // 7. Verify MongoDB Incident Creation
  console.log('\n--- Step 7: MongoDB Incident Verification ---');
  const incRes = await fetch(`${BASE_URL}/api/incidents?cameraId=${cameraId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const incData = await incRes.json();
  const incidents = incData.incidents || incData || [];
  const geofenceIncident = incidents.find(
    (inc) =>
      inc.trackId === 801 &&
      (inc.violationType === 'restricted_zone' ||
        inc.violationType === 'unverified_person_in_restricted_zone' ||
        inc.violationType.includes('restricted_zone'))
  );

  assert(Boolean(geofenceIncident), 'Authoritative geofence incident persisted in MongoDB');
  if (geofenceIncident) {
    console.log(`[INFO] Incident ID: ${geofenceIncident.incidentId}`);
    console.log(`[INFO] Violation Type: ${geofenceIncident.violationType}`);
    console.log(`[INFO] Risk Score: ${geofenceIncident.riskScore} (${geofenceIncident.riskLevel})`);
    console.log(`[INFO] Severity: ${geofenceIncident.severity}`);
    console.log(`[INFO] Why Flagged:`, geofenceIncident.whyFlagged);

    assert(geofenceIncident.riskScore > 0, `Risk score calculated: ${geofenceIncident.riskScore}`);
    assert(Boolean(geofenceIncident.severity), `Severity evaluated: ${geofenceIncident.severity}`);
    assert(geofenceIncident.status === 'DETECTED', `Incident status is DETECTED`);
    assert(geofenceIncident.cameraId === cameraId, `CameraId matches: ${geofenceIncident.cameraId}`);
  }

  // 8. Verify Socket.IO Realtime Events
  console.log('\n--- Step 8: Socket.IO Realtime Delivery Verification ---');
  assert(socketEvents.detections.length > 0, `Received ${socketEvents.detections.length} 'camera:detections' event(s)`);
  const detectionsWithBreach = socketEvents.detections.filter((d) => d.geofenceBreaches && d.geofenceBreaches.length > 0);
  assert(detectionsWithBreach.length > 0, `Socket.IO 'camera:detections' payload contains geofenceBreaches array`);

  const confirmedBreachEvent = socketEvents.breaches.find((b) => b.isConfirmed || b.breachStatus === 'CONFIRMED');
  console.log(`[INFO] Received ${socketEvents.breaches.length} 'zone:breach' event(s)`);
  assert(socketEvents.breaches.length > 0, `Received real-time 'zone:breach' Socket.IO event(s)`);

  assert(socketEvents.incidents.length > 0, `Received real-time incident event(s) via Socket.IO (${socketEvents.incidents.length} event(s))`);

  // 9. Negative Test: Disabled Zone -> No Breach
  console.log('\n--- Step 9: Disabled Zone Verification (Negative Test) ---');
  // Disable zone
  await fetch(`${BASE_URL}/api/restricted-zones/${targetZone.id || targetZone._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: false }),
  });
  console.log(`[INFO] Zone ${targetZone.zoneId} disabled`);

  // Send track 999 inside disabled zone
  const disabledTestRes = await fetch(`${BASE_URL}/api/detection/camera-detections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cameraId,
      timestamp: Date.now(),
      detections: [{
        trackId: 999,
        label: 'person',
        confidence: 0.95,
        bbox: insideTrack.bbox,
      }],
      frameWidth: 1920,
      frameHeight: 1080,
    }),
  });
  const disabledTestData = await disabledTestRes.json();
  const breachesWithDisabled = disabledTestData.geofenceBreaches || [];
  assert(
    breachesWithDisabled.length === 0,
    'No geofence breach triggered when zone is disabled'
  );

  // Re-enable zone to preserve configuration
  await fetch(`${BASE_URL}/api/restricted-zones/${targetZone.id || targetZone._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: true }),
  });
  console.log(`[INFO] Zone ${targetZone.zoneId} re-enabled`);

  // Disconnect socket
  socket.disconnect();

  console.log('\n===============================================================');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed === 0) {
    console.log('>>> ALL HOTFIX VERIFICATION CHECKS PASSED <<<');
    process.exit(0);
  } else {
    console.error('>>> HOTFIX VERIFICATION FAILED <<<');
    process.exit(1);
  }
}

runHotfixVerification().catch((err) => {
  console.error('[FATAL ERROR IN TEST]:', err);
  process.exit(1);
});
