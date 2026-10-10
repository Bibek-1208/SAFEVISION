import mongoose from 'mongoose';
import { CameraModel } from './src/models/mongooseModels';

async function checkMongoCameras() {
  await mongoose.connect('mongodb://127.0.0.1:27017/safevision');
  const cams = await CameraModel.find({});
  console.log(`Total cameras in MongoDB: ${cams.length}`);
  cams.forEach((c) => {
    console.log(`- [${c.code}] ${c.name} (${c.zone}) - status: ${c.status}, enabled: ${c.enabled}, streamUrl: ${c.streamUrl ? '[CONFIGURED]' : '[NONE]'}`);
  });
  await mongoose.disconnect();
}

checkMongoCameras().catch((e) => {
  console.error(e);
  process.exit(1);
});
