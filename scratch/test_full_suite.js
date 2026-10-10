const mongoose = require('mongoose');

async function testFullSuite() {
  await mongoose.connect('mongodb://localhost:27017/safevision?replicaSet=rs0');
  const IncidentModel = mongoose.model('Incident', new mongoose.Schema({}, { strict: false }));
  const RestrictedZoneModel = mongoose.model('RestrictedZone', new mongoose.Schema({}, { strict: false }));
  const EmergencyZoneModel = mongoose.model('EmergencyZone', new mongoose.Schema({}, { strict: false }));

  // Test Camera and Zone models
  const [restrictedZones, emergencyZones] = await Promise.all([
    RestrictedZoneModel.find({}).lean(),
    EmergencyZoneModel.find({}).lean(),
  ]);

  const zoneNameMap = {};
  restrictedZones.forEach(z => { zoneNameMap[z.id] = z.name; });
  emergencyZones.forEach(z => { zoneNameMap[z.id] = z.name; });

  console.log('Restricted Zones count:', restrictedZones.length);
  console.log('Emergency Zones count:', emergencyZones.length);

  // Direction Summary Test for '7d'
  const now = Date.now();
  const currentStart = now - 7 * 24 * 3600 * 1000;
  const prevStart = now - 14 * 24 * 3600 * 1000;
  const prevEnd = currentStart;

  const currentMatch = {
    $or: [
      { timestamp: { $gte: new Date(currentStart), $lte: new Date(now) } },
      { timestamp: { $gte: new Date(currentStart).toISOString(), $lte: new Date(now).toISOString() } },
    ]
  };

  const prevMatch = {
    $or: [
      { timestamp: { $gte: new Date(prevStart), $lt: new Date(prevEnd) } },
      { timestamp: { $gte: new Date(prevStart).toISOString(), $lt: new Date(prevEnd).toISOString() } },
    ]
  };

  const [currentCount, prevCount] = await Promise.all([
    IncidentModel.countDocuments(currentMatch),
    IncidentModel.countDocuments(prevMatch),
  ]);

  console.log({ currentCount, prevCount });

  await mongoose.disconnect();
}

testFullSuite().catch(console.error);
