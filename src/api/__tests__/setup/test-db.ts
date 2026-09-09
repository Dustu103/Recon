import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

/**
 * Connects to an in-memory MongoDB instance for integration tests.
 * Only spun up on demand by tests that actually need database persistence.
 */
export async function connectTestDb(): Promise<string> {
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  }
  return mongod.getUri();
}

/**
 * Clears all documents from collections between tests.
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
 * Disconnects and stops the in-memory MongoDB server.
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
