import mongoose from 'mongoose';
import { ENV } from './env';

export let isMongoConnected = false;
export let isReplicaSetVerified = false;
export let replicaSetName: string | null = null;

export async function connectDB(): Promise<void> {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    });
    isMongoConnected = true;
    console.log(`[SafeVision DB] Connected to MongoDB: ${conn.connection.host}`);

    // Verify Replica Set & Change Stream capability
    try {
      if (conn.connection.db) {
        const helloResult = await conn.connection.db.admin().command({ hello: 1 });
        if (helloResult.setName) {
          isReplicaSetVerified = true;
          replicaSetName = helloResult.setName;
          console.log(`[SafeVision DB] Change Streams VERIFIED: Replica set '${replicaSetName}' active.`);
        } else {
          isReplicaSetVerified = false;
          replicaSetName = null;
          console.warn(`[SafeVision DB] Standalone MongoDB detected. Change Streams NOT verified (requires replica set rs0).`);
        }
      }
    } catch (rsErr: any) {
      isReplicaSetVerified = false;
      console.warn(`[SafeVision DB] Replica set check notice: ${rsErr.message}`);
    }
  } catch (error: any) {
    isMongoConnected = false;
    isReplicaSetVerified = false;
    replicaSetName = null;
    console.warn(`[SafeVision DB] Native MongoDB connection failed (${error.message}).`);
    if (!ENV.DEMO_MODE) {
      console.error(`[SafeVision DB] CRITICAL: DEMO_MODE=false and MongoDB is unavailable: DATABASE OFFLINE.`);
    } else {
      console.warn(`[SafeVision DB] Database is OFFLINE. Operating in DEMO_MODE fallback mode.`);
    }
  }
}
