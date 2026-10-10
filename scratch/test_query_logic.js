const mongoose = require('mongoose');

async function testCompleteServiceLogic() {
  await mongoose.connect('mongodb://localhost:27017/safevision?replicaSet=rs0');
  const IncidentModel = mongoose.model('Incident', new mongoose.Schema({}, { strict: false }));
  const RestrictedZoneModel = mongoose.model('RestrictedZone', new mongoose.Schema({}, { strict: false }));
  const EmergencyZoneModel = mongoose.model('EmergencyZone', new mongoose.Schema({}, { strict: false }));

  // Helper function to build query
  function buildMatchQuery(filter = {}) {
    const match = {};
    const andClauses = [];
    const now = Date.now();
    const tf = (filter.timeframe || 'all').toLowerCase();

    if (filter.startDate && filter.endDate) {
      const s = new Date(filter.startDate);
      const e = new Date(filter.endDate);
      andClauses.push({
        $or: [{ timestamp: { $gte: s } }, { timestamp: { $gte: s.toISOString() } }],
      });
      andClauses.push({
        $or: [{ timestamp: { $lte: e } }, { timestamp: { $lte: e.toISOString() } }],
      });
    } else if (filter.startDate) {
      const s = new Date(filter.startDate);
      andClauses.push({
        $or: [{ timestamp: { $gte: s } }, { timestamp: { $gte: s.toISOString() } }],
      });
    } else if (filter.endDate) {
      const e = new Date(filter.endDate);
      andClauses.push({
        $or: [{ timestamp: { $lte: e } }, { timestamp: { $lte: e.toISOString() } }],
      });
    } else if (tf === 'today' || tf === '24h') {
      const cutoff = new Date(now - 24 * 3600 * 1000);
      andClauses.push({
        $or: [{ timestamp: { $gte: cutoff } }, { timestamp: { $gte: cutoff.toISOString() } }],
      });
    } else if (tf === 'week' || tf === '7d') {
      const cutoff = new Date(now - 7 * 24 * 3600 * 1000);
      andClauses.push({
        $or: [{ timestamp: { $gte: cutoff } }, { timestamp: { $gte: cutoff.toISOString() } }],
      });
    } else if (tf === 'month' || tf === '30d') {
      const cutoff = new Date(now - 30 * 24 * 3600 * 1000);
      andClauses.push({
        $or: [{ timestamp: { $gte: cutoff } }, { timestamp: { $gte: cutoff.toISOString() } }],
      });
    }

    if (filter.cameraId && filter.cameraId !== 'all') {
      match.cameraId = filter.cameraId;
    }
    if (filter.zoneId && filter.zoneId !== 'all') {
      andClauses.push({
        $or: [{ zoneId: filter.zoneId }, { zone: filter.zoneId }],
      });
    }
    if (filter.violationType && filter.violationType !== 'all') {
      match.violationType = filter.violationType;
    }
    if (filter.severity && filter.severity !== 'all') {
      match.severity = filter.severity;
    }
    if (andClauses.length > 0) {
      match.$and = andClauses;
    }
    return match;
  }

  // Test 7d query
  const q7d = buildMatchQuery({ timeframe: '7d' });
  const c7d = await IncidentModel.countDocuments(q7d);
  console.log('7D Match Count:', c7d);

  // Test 7d with cameraId CAM-4
  const qCam4 = buildMatchQuery({ timeframe: '7d', cameraId: 'CAM-4' });
  const cCam4 = await IncidentModel.countDocuments(qCam4);
  console.log('7D CAM-4 Match Count:', cCam4);

  // Test 7d with nonexistent camera CAM-NONEXISTENT
  const qNone = buildMatchQuery({ timeframe: '7d', cameraId: 'CAM-NONEXISTENT' });
  const cNone = await IncidentModel.countDocuments(qNone);
  console.log('7D CAM-NONEXISTENT Match Count:', cNone);

  // Test All timeframe
  const qAll = buildMatchQuery({ timeframe: 'all' });
  const cAll = await IncidentModel.countDocuments(qAll);
  console.log('All Match Count:', cAll);

  await mongoose.disconnect();
}

testCompleteServiceLogic().catch(console.error);
