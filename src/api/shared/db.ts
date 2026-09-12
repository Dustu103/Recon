import mongoose from 'mongoose';

/**
 * Manages Mongoose connection lifecycle with pooling, safe disconnect,
 * and automatic in-memory MongoDB fallback in development.
 */
export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  let mongoUri = uri || process.env.MONGODB_URI;

  if (!mongoUri && process.env.NODE_ENV !== 'production') {
    const pkg = 'mongodb-memory-server';
    const { MongoMemoryServer } = await (import(pkg) as Promise<any>);
    const mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;
    console.log(`[Database] In-memory MongoDB spawned at ${mongoUri}`);
  }

  if (!mongoUri) {
    throw new Error('[Database] MONGODB_URI is not defined in environment');
  }

  try {
    return await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 2000,
    });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Database] Connection to ${mongoUri} failed (${err.message}). Starting in-memory MongoDB server for local dev...`
      );
      const pkg = 'mongodb-memory-server';
      const { MongoMemoryServer } = await (import(pkg) as Promise<any>);
      const mongod = await MongoMemoryServer.create();
      const inMemoryUri = mongod.getUri();
      process.env.MONGODB_URI = inMemoryUri;
      console.log(`[Database] In-memory MongoDB connected at ${inMemoryUri}`);
      return await mongoose.connect(inMemoryUri);
    }
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
