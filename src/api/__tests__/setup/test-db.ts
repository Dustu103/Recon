import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;
let isUsingDocker = false;

const DOCKER_TEST_URI = 'mongodb://127.0.0.1:27017/recon_test';

/**
 * Connects to Docker MongoDB (1ms) if running, else falls back to MongoMemoryServer.
 */
export async function connectTestDb(): Promise<string> {
  if (mongoose.connection.readyState !== 0) {
    return mongoose.connection.host;
  }

  // 1. Try connecting to local Docker MongoDB first (1ms latency)
  try {
    await mongoose.connect(DOCKER_TEST_URI, {
      serverSelectionTimeoutMS: 1500,
    });
    isUsingDocker = true;
    process.env.MONGODB_URI = DOCKER_TEST_URI;
    return DOCKER_TEST_URI;
  } catch (_err) {
    // Docker MongoDB offline, fall back to in-memory
  }

  // 2. Fallback: MongoMemoryServer
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    await mongoose.connect(uri);
    isUsingDocker = false;
    return uri;
  }

  return mongod.getUri();
}

/**
 * Clears all documents between test cases.
 */
export async function clearTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
}

/**
 * Disconnects cleanly.
 */
export async function closeTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}
