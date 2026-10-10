import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const mongoose = require(path.resolve('./server/node_modules/mongoose'));
const { io } = require(path.resolve('./client/node_modules/socket.io-client'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

const MONGO_URI = 'mongodb://127.0.0.1:27017/safevision?replicaSet=rs0&directConnection=true';
const BACKEND_URL = 'http://localhost:5005';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runVerification() {
  console.log('======================================================================');
  console.log('       SAFEVISION AI — END-TO-END VERIFICATION SUITE                  ');
  console.log('======================================================================');

  // 1. Connect directly to MongoDB Replica Set rs0
  console.log('\n[1/7] Connecting to MongoDB Replica Set (rs0)...');
  await mongoose.connect(MONGO_URI);
  console.log('      [OK] Connected to MongoDB replica set rs0. ReadyState:', mongoose.connection.readyState);

  const incidentsCol = mongoose.connection.collection('incidents');
  const countBefore = await incidentsCol.countDocuments();
  console.log(`      [OK] Current MongoDB 'incidents' collection count: ${countBefore}`);

  // 2. Open Change Stream Listener on MongoDB incidents collection
  console.log('\n[2/7] Initializing MongoDB Change Stream on safevision.incidents...');
  const changeStreamEvents = [];
  let changeStreamError = null;

  const changeStream = incidentsCol.watch([], { fullDocument: 'updateLookup' });
  changeStream.on('change', (change) => {
    console.log(`      >>> [ChangeStream Event Received] op: ${change.operationType}, id: ${change.fullDocument?.incidentId}`);
    changeStreamEvents.push(change);
  });
  changeStream.on('error', (err) => {
    console.error('      [ChangeStream Error]:', err.message);
    changeStreamError = err;
  });
  console.log('      [OK] Change Stream listener active.');

  // 3. Authenticate and Connect Socket.IO Client
  console.log('\n[3/7] Authenticating and Connecting Socket.IO Client...');
  const loginResp = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@safevision.ai', password: 'Password123!' }),
  });
  if (!loginResp.ok) {
    throw new Error(`Login failed with HTTP ${loginResp.status}: ${await loginResp.text()}`);
  }
  const loginData = await loginResp.json();
  const token = loginData.token;
  console.log(`      [OK] Logged in as: ${loginData.user.email} (${loginData.user.role})`);

  const socketEvents = [];
  const socket = io(BACKEND_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket.IO connection timed out after 5s')), 5000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`      [OK] Socket.IO client connected with socket ID: ${socket.id}`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  socket.on('incident.created', (envelope) => {
    console.log(`      >>> [Socket.IO Event Received: incident.created]`, envelope?.payload?.incident?.incidentId || envelope?.incident?.incidentId || envelope);
    socketEvents.push(envelope);
  });

  // 4. Load Real Frame
  console.log('\n[4/7] Loading real test frame from video...');
  const testFramePath = path.resolve(rootDir, 'test_frames/warehouse_managing.jpg');
  if (!fs.existsSync(testFramePath)) {
    throw new Error(`Test frame missing: ${testFramePath}`);
  }
  const frameBuf = fs.readFileSync(testFramePath);
  const frameBase64 = `data:image/jpeg;base64,${frameBuf.toString('base64')}`;
  console.log(`      [OK] Frame loaded: ${frameBuf.length} bytes`);

  // 5. Realtime Paced Streaming Test
  console.log('\n[5/7] Executing Realtime Paced Streaming (22 frames @ 180ms pace = ~3.96s)...');
  let firstCandidateReceived = null;
  let candidateFrameNum = null;
  const framesToSend = 22;

  for (let i = 1; i <= framesToSend; i++) {
    const tStart = Date.now();
    const resp = await fetch(`${BACKEND_URL}/api/detection/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId: 'CAM-01',
        zone: 'Zone A - Factory Floor',
        frameBase64: frameBase64,
      }),
    });

    if (!resp.ok) {
      console.error(`      Frame ${i} HTTP error: ${resp.status}`);
      continue;
    }

    const data = await resp.json();
    const createdIncidents = data.createdIncidents || [];
    const workers = data.trackedWorkers || [];
    const helmetStatus = workers[0]?.helmet?.status || 'UNKNOWN';

    if (createdIncidents.length > 0 && !firstCandidateReceived) {
      firstCandidateReceived = createdIncidents[0];
      candidateFrameNum = i;
      console.log(`      -> Frame ${i}/${framesToSend}: INCIDENT CONFIRMED & CREATED! ID: ${firstCandidateReceived.incidentId}, Type: ${firstCandidateReceived.violationType}, Helmet: ${helmetStatus}`);
    } else if (i % 5 === 0 || i === framesToSend) {
      console.log(`      -> Frame ${i}/${framesToSend}: Worker Track: ${workers[0]?.trackId || 'none'}, Helmet: ${helmetStatus}, Incidents Created: ${createdIncidents.length}`);
    }

    const elapsed = Date.now() - tStart;
    const delay = Math.max(0, 180 - elapsed);
    if (delay > 0) await sleep(delay);
  }

  // Allow events to propagate through Change Stream and Socket.IO
  console.log('\n      Waiting 2.0s for Change Stream and Socket.IO delivery...');
  await sleep(2000);

  // 6. Verify MongoDB persistence & Change Stream & Socket.IO
  console.log('\n[6/7] Verifying Authoritative Incident Persistence & Event Pipeline...');
  const countAfter = await incidentsCol.countDocuments();
  console.log(`      MongoDB Count Before: ${countBefore}`);
  console.log(`      MongoDB Count After:  ${countAfter}`);
  const countDelta = countAfter - countBefore;
  console.log(`      MongoDB Count Delta:  +${countDelta}`);

  let insertedMongoDoc = null;
  if (firstCandidateReceived) {
    insertedMongoDoc = await incidentsCol.findOne({ incidentId: firstCandidateReceived.incidentId });
    console.log('\n      [MONGODB PERSISTED DOCUMENT]:');
    console.log(JSON.stringify({
      _id: insertedMongoDoc?._id,
      incidentId: insertedMongoDoc?.incidentId,
      source: insertedMongoDoc?.source,
      ruleId: insertedMongoDoc?.ruleId,
      trackId: insertedMongoDoc?.trackId,
      violationType: insertedMongoDoc?.violationType,
      severity: insertedMongoDoc?.severity,
      confidence: insertedMongoDoc?.confidence,
      cameraId: insertedMongoDoc?.cameraId,
      zone: insertedMongoDoc?.zone,
      status: insertedMongoDoc?.status,
      timestamp: insertedMongoDoc?.timestamp,
      whyFlagged: insertedMongoDoc?.whyFlagged,
      evidenceHash: insertedMongoDoc?.evidenceHash,
      evidenceImageLength: insertedMongoDoc?.evidenceImage?.length || 0,
    }, null, 2));
  }

  console.log(`\n      Change Stream Insert Events Received: ${changeStreamEvents.length}`);
  if (changeStreamEvents.length > 0) {
    console.log('      First Change Stream Event:');
    console.log('      - Operation:   ', changeStreamEvents[0].operationType);
    console.log('      - Document ID: ', changeStreamEvents[0].fullDocument?.incidentId);
    console.log('      - Violation:   ', changeStreamEvents[0].fullDocument?.violationType);
    console.log('      - Severity:    ', changeStreamEvents[0].fullDocument?.severity);
  }

  console.log(`\n      Socket.IO incident.created Events Received: ${socketEvents.length}`);
  if (socketEvents.length > 0) {
    const firstSocketEvt = socketEvents[0];
    const inc = firstSocketEvt?.payload?.incident || firstSocketEvt?.incident;
    console.log('      First Socket.IO Payload:');
    console.log('      - Incident ID: ', inc?.incidentId);
    console.log('      - Violation:   ', inc?.violationType);
    console.log('      - Track ID:    ', inc?.trackId);
  }

  // 7. Duplicate Prevention Test
  console.log('\n[7/7] Testing Duplicate Prevention Guard (Sending 5 duplicate frames immediately)...');
  let duplicateCreatedCount = 0;
  for (let d = 1; d <= 5; d++) {
    const resp = await fetch(`${BACKEND_URL}/api/detection/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId: 'CAM-01',
        zone: 'Zone A - Factory Floor',
        frameBase64: frameBase64,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if ((data.createdIncidents || []).length > 0) {
        duplicateCreatedCount += data.createdIncidents.length;
      }
    }
    await sleep(100);
  }

  await sleep(1000);
  const countAfterDup = await incidentsCol.countDocuments();
  console.log(`      MongoDB Count After Duplicate Ingestion Attempt: ${countAfterDup}`);
  console.log(`      Duplicate Incidents Created by Backend:          ${duplicateCreatedCount}`);
  const duplicatePrevented = (countAfterDup === countAfter && duplicateCreatedCount === 0);
  console.log(`      [OK] Duplicate Prevention Result:                ${duplicatePrevented ? 'PASS (Zero duplicates)' : 'FAIL'}`);

  // Summary Validation Checks
  const passCriteria = {
    temporalCandidateGenerated: firstCandidateReceived !== null,
    mongoDocPersisted: insertedMongoDoc !== null,
    mongoCountIncreased: countDelta === 1,
    changeStreamTriggered: changeStreamEvents.some((e) => e.operationType === 'insert'),
    socketIoReceived: socketEvents.length > 0,
    duplicatePrevented: duplicatePrevented,
  };

  console.log('\n======================================================================');
  console.log('                    FINAL TEST RESULTS MATRIX                         ');
  console.log('======================================================================');
  console.log(` 1. Temporal Violation Confirmed:      ${passCriteria.temporalCandidateGenerated ? 'PASS' : 'FAIL'} (Frame ${candidateFrameNum})`);
  console.log(` 2. MongoDB Document Persisted:        ${passCriteria.mongoDocPersisted ? 'PASS' : 'FAIL'} (${insertedMongoDoc?.incidentId})`);
  console.log(` 3. MongoDB Count Incremented (+1):    ${passCriteria.mongoCountIncreased ? 'PASS' : 'FAIL'} (${countBefore} -> ${countAfter})`);
  console.log(` 4. MongoDB Change Stream Triggered:   ${passCriteria.changeStreamTriggered ? 'PASS' : 'FAIL'} (${changeStreamEvents.length} insert event(s))`);
  console.log(` 5. Socket.IO incident.created:        ${passCriteria.socketIoReceived ? 'PASS' : 'FAIL'} (${socketEvents.length} event(s))`);
  console.log(` 6. Duplicate Prevention Verified:     ${passCriteria.duplicatePrevented ? 'PASS' : 'FAIL'}`);

  const allPassed = Object.values(passCriteria).every(Boolean);
  console.log('======================================================================');
  console.log(` OVERALL STATUS: ${allPassed ? '>> PASS <<' : '>> FAILED <<'}`);
  console.log('======================================================================');

  // Cleanup
  await changeStream.close();
  socket.disconnect();
  await mongoose.disconnect();

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('\n[FATAL ERROR IN VERIFICATION SUITE]:', err);
  process.exit(1);
});
