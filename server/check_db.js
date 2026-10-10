const mongoose = require('mongoose');

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/safevision';
  await mongoose.connect(uri);
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    const count = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(c.name + ': ' + count);
  }
  const incs = await mongoose.connection.db.collection('incidents').find({ cameraId: 'CAM-4' }).sort({ timestamp: -1 }).limit(10).toArray();
  console.log('\nRecent CAM-4 incidents: ' + incs.length);
  for (const i of incs) {
    console.log(JSON.stringify({
      id: i.incidentId || i._id,
      status: i.status,
      violationType: i.violationType,
      incidentType: i.incidentType,
      timestamp: i.timestamp,
      cameraSessionId: i.cameraSessionId,
      evidenceUrl: i.evidenceUrl,
      source: i.source
    }, null, 2));
  }
  await mongoose.disconnect();
}

check().catch(console.error);
