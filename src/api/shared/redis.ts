import net from 'net';

export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    val: string,
    options?: { ex?: number; nx?: boolean }
  ): Promise<boolean>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ping(): Promise<string>;
  close(): Promise<void>;
  isUsingMemory(): boolean;
}

/**
 * In-Memory Fallback Redis Store.
 * Used automatically during unit tests or when Docker Redis is offline.
 */
export class MemoryRedisStore implements IRedisClient {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private clean(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.clean(key)) return null;
    return this.store.get(key)!.value;
  }

  async set(
    key: string,
    val: string,
    options?: { ex?: number; nx?: boolean }
  ): Promise<boolean> {
    const exists = this.clean(key);
    if (options?.nx && exists) {
      return false; // NX condition failed
    }

    const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : null;
    this.store.set(key, { value: String(val), expiresAt });
    return true;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    if (!this.clean(key)) return -2;
    const entry = this.store.get(key)!;
    if (entry.expiresAt === null) return -1;
    const remainingMs = entry.expiresAt - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : -2;
  }

  async incr(key: string): Promise<number> {
    const current = (await this.get(key)) ?? '0';
    const num = parseInt(current, 10) + 1;
    const existing = this.store.get(key);
    this.store.set(key, {
      value: String(num),
      expiresAt: existing?.expiresAt ?? null,
    });
    return num;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.clean(key)) return 0;
    const entry = this.store.get(key)!;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async close(): Promise<void> {
    this.store.clear();
  }

  isUsingMemory(): boolean {
    return true;
  }
}

/**
 * Native Socket-based RESP Redis Client.
 * Connects directly to local or Docker Redis with zero external npm dependencies.
 */
export class SocketRedisClient implements IRedisClient {
  private socket: net.Socket;
  private buffer = '';
  private queue: Array<{
    resolve: (val: any) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(
    private host: string = '127.0.0.1',
    private port: number = 6379
  ) {
    this.socket = net.createConnection(this.port, this.host);
    this.setupParser();
  }

  private setupParser(): void {
    this.socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.socket.on('error', (err) => {
      while (this.queue.length > 0) {
        this.queue.shift()?.reject(err);
      }
    });
  }

  private processBuffer(): void {
    while (this.buffer.length > 0 && this.queue.length > 0) {
      const lineEnd = this.buffer.indexOf('\r\n');
      if (lineEnd === -1) break;

      const prefix = this.buffer[0];
      if (prefix === '+') {
        const val = this.buffer.slice(1, lineEnd);
        this.buffer = this.buffer.slice(lineEnd + 2);
        this.queue.shift()?.resolve(val);
      } else if (prefix === ':') {
        const val = parseInt(this.buffer.slice(1, lineEnd), 10);
        this.buffer = this.buffer.slice(lineEnd + 2);
        this.queue.shift()?.resolve(val);
      } else if (prefix === '$') {
        const len = parseInt(this.buffer.slice(1, lineEnd), 10);
        if (len === -1) {
          this.buffer = this.buffer.slice(lineEnd + 2);
          this.queue.shift()?.resolve(null);
        } else {
          const totalNeeded = lineEnd + 2 + len + 2;
          if (this.buffer.length < totalNeeded) break;
          const val = this.buffer.slice(lineEnd + 2, lineEnd + 2 + len);
          this.buffer = this.buffer.slice(totalNeeded);
          this.queue.shift()?.resolve(val);
        }
      } else if (prefix === '-') {
        const err = this.buffer.slice(1, lineEnd);
        this.buffer = this.buffer.slice(lineEnd + 2);
        this.queue.shift()?.reject(new Error(err));
      } else {
        break;
      }
    }
  }

  private sendCommand(...args: (string | number)[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      let resp = `*${args.length}\r\n`;
      for (const arg of args) {
        const s = String(arg);
        resp += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
      }
      this.socket.write(resp);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.sendCommand('GET', key);
  }

  async set(
    key: string,
    val: string,
    options?: { ex?: number; nx?: boolean }
  ): Promise<boolean> {
    const args: (string | number)[] = ['SET', key, val];
    if (options?.ex) {
      args.push('EX', options.ex);
    }
    if (options?.nx) {
      args.push('NX');
    }
    const res = await this.sendCommand(...args);
    return res === 'OK';
  }

  async del(key: string): Promise<number> {
    return this.sendCommand('DEL', key);
  }

  async ttl(key: string): Promise<number> {
    return this.sendCommand('TTL', key);
  }

  async incr(key: string): Promise<number> {
    return this.sendCommand('INCR', key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.sendCommand('EXPIRE', key, seconds);
  }

  async ping(): Promise<string> {
    return this.sendCommand('PING');
  }

  async close(): Promise<void> {
    this.socket.end();
  }

  isUsingMemory(): boolean {
    return false;
  }
}

let activeRedisClient: IRedisClient | null = null;

/**
 * Initializes and returns the active Redis client.
 * Connects to Docker Redis (:6379), falling back seamlessly to MemoryRedisStore if offline.
 */
export async function getRedisClient(): Promise<IRedisClient> {
  if (activeRedisClient) {
    return activeRedisClient;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  // Attempt connection with 1500ms timeout
  const candidate = new SocketRedisClient(host, port);
  const connectPromise = new Promise<IRedisClient>((resolve, reject) => {
    (candidate as any).socket.once('connect', () => {
      resolve(candidate);
    });
    (candidate as any).socket.once('error', (err: Error) => {
      reject(err);
    });
  });

  const timeoutPromise = new Promise<IRedisClient>((_, reject) =>
    setTimeout(() => reject(new Error('Redis connection timeout')), 1500)
  );

  try {
    activeRedisClient = await Promise.race([connectPromise, timeoutPromise]);
    console.log(`[Redis] Connected to Docker Redis on ${host}:${port}`);
    return activeRedisClient;
  } catch (_err) {
    candidate.close().catch(() => {});
    console.warn('[Redis] Docker Redis unreachable, using in-memory store.');
    activeRedisClient = new MemoryRedisStore();
    return activeRedisClient;
  }
}

/** Reset active client (used in test teardown) */
export async function closeRedisClient(): Promise<void> {
  if (activeRedisClient) {
    await activeRedisClient.close();
    activeRedisClient = null;
  }
}
