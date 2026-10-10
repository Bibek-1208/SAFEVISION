const mongoose = require('mongoose');

async function testTrends() {
  await mongoose.connect('mongodb://localhost:27017/safevision?replicaSet=rs0');
  const IncidentModel = mongoose.model('Incident', new mongoose.Schema({}, { strict: false }));

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

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: {
          $convert: {
            input: '$timestamp',
            to: 'date',
            onError: null,
            onNull: null,
          }
        }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $group: {
        _id: {
          bucket: {
            $dateToString: {
              date: '$tsDate',
              format: '%Y-%m-%d',
              timezone: '+05:30',
            }
          },
          timeLabel: {
            $dateToString: {
              date: '$tsDate',
              format: '%d %b',
              timezone: '+05:30',
            }
          }
        },
        total: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
      }
    },
    { $sort: { '_id.bucket': 1 } }
  ];

  const results = await IncidentModel.aggregate(pipeline);
  console.log('7D Incident Trends Count:', results.length);
  console.log('Results:', JSON.stringify(results, null, 2));

  // Test violation type aggregation over time
  const violationPipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: {
          $convert: {
            input: '$timestamp',
            to: 'date',
            onError: null,
            onNull: null,
          }
        }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $group: {
        _id: {
          bucket: {
            $dateToString: {
              date: '$tsDate',
              format: '%Y-%m-%d',
              timezone: '+05:30',
            }
          },
          timeLabel: {
            $dateToString: {
              date: '$tsDate',
              format: '%d %b',
              timezone: '+05:30',
            }
          },
          violationType: '$violationType',
        },
        count: { $sum: 1 },
      }
    },
    { $sort: { '_id.bucket': 1, count: -1 } }
  ];

  const vResults = await IncidentModel.aggregate(violationPipeline);
  console.log('7D Violation Trends Count:', vResults.length);
  console.log('Sample Violation Trend:', JSON.stringify(vResults.slice(0, 5), null, 2));

  // Test shift trend aggregation over time (IST)
  const shiftPipeline = [
    { $match: match },
    {
      $addFields: {
        tsDate: {
          $convert: {
            input: '$timestamp',
            to: 'date',
            onError: null,
            onNull: null,
          }
        }
      }
    },
    { $match: { tsDate: { $ne: null } } },
    {
      $project: {
        severity: 1,
        localHour: {
          $hour: {
            date: '$tsDate',
            timezone: '+05:30',
          }
        },
        bucket: {
          $dateToString: {
            date: '$tsDate',
            format: '%Y-%m-%d',
            timezone: '+05:30',
          }
        },
        timeLabel: {
          $dateToString: {
            date: '$tsDate',
            format: '%d %b',
            timezone: '+05:30',
          }
        }
      }
    },
    {
      $project: {
        bucket: 1,
        timeLabel: 1,
        severity: 1,
        shift: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $gte: ['$localHour', 6] },
                    { $lt: ['$localHour', 14] },
                  ]
                },
                then: 'Morning Shift',
              },
              {
                case: {
                  $and: [
                    { $gte: ['$localHour', 14] },
                    { $lt: ['$localHour', 22] },
                  ]
                },
                then: 'Afternoon Shift',
              }
            ],
            default: 'Night Shift',
          }
        }
      }
    },
    {
      $group: {
        _id: {
          bucket: '$bucket',
          timeLabel: '$timeLabel',
          shift: '$shift',
        },
        count: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
      }
    },
    { $sort: { '_id.bucket': 1 } }
  ];

  const sResults = await IncidentModel.aggregate(shiftPipeline);
  console.log('7D Shift Trends Count:', sResults.length);
  console.log('Sample Shift Trend:', JSON.stringify(sResults.slice(0, 5), null, 2));

  await mongoose.disconnect();
}

testTrends().catch(console.error);
