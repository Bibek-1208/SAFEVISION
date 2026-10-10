const mongoose = require('mongoose');

async function testAllPipelines() {
  await mongoose.connect('mongodb://localhost:27017/safevision?replicaSet=rs0');
  const IncidentModel = mongoose.model('Incident', new mongoose.Schema({}, { strict: false }));
  const RestrictedZoneModel = mongoose.model('RestrictedZone', new mongoose.Schema({}, { strict: false }));
  const EmergencyZoneModel = mongoose.model('EmergencyZone', new mongoose.Schema({}, { strict: false }));

  console.log('Connected to DB');

  // Test 1: Incident Trends with continuous daily buckets for 7d
  const now = Date.now();
  const tf = '7d';
  const cutoffMs = now - 7 * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs);

  const match = {
    $or: [
      { timestamp: { $gte: cutoffDate } },
      { timestamp: { $gte: cutoffDate.toISOString() } },
    ]
  };

  const incPipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: {
          $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null }
        }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { date: '$tsDate', format: '%Y-%m-%d', timezone: '+05:30' } },
          timeLabel: { $dateToString: { date: '$tsDate', format: '%d %b', timezone: '+05:30' } }
        },
        total: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
        info: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } },
      }
    },
    { $sort: { '_id.bucket': 1 } }
  ];

  const incResults = await IncidentModel.aggregate(incPipeline);
  console.log('Incident Trends:', incResults.length, 'buckets');

  // Test 2: Zone Trends
  const zonePipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: { $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null } }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { date: '$tsDate', format: '%Y-%m-%d', timezone: '+05:30' } },
          timeLabel: { $dateToString: { date: '$tsDate', format: '%d %b', timezone: '+05:30' } },
          zoneId: { $ifNull: ['$zoneId', '$zone'] },
          zoneName: '$zone'
        },
        count: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
      }
    },
    { $sort: { '_id.bucket': 1, count: -1 } }
  ];

  const zoneResults = await IncidentModel.aggregate(zonePipeline);
  console.log('Zone Trends:', zoneResults.length, 'entries');

  // Test 3: Camera Trends
  const camPipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: { $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null } }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { date: '$tsDate', format: '%Y-%m-%d', timezone: '+05:30' } },
          timeLabel: { $dateToString: { date: '$tsDate', format: '%d %b', timezone: '+05:30' } },
          cameraId: '$cameraId'
        },
        count: { $sum: 1 },
      }
    },
    { $sort: { '_id.bucket': 1, count: -1 } }
  ];

  const camResults = await IncidentModel.aggregate(camPipeline);
  console.log('Camera Trends:', camResults.length, 'entries');

  await mongoose.disconnect();
  console.log('SUCCESS: All aggregation pipelines validated!');
}

testAllPipelines().catch(console.error);
