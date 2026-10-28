import { Redis as RedisClient } from "ioredis";

export interface RoutingStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number, onlyIfMissing?: boolean): Promise<boolean>;
  delete(key: string): Promise<number>;
  deleteIfValue(key: string, value: string): Promise<boolean>;
  increment(key: string, ttlMs: number): Promise<number>;
  ping(): Promise<string>;
  close(): Promise<void>;
}

type Entry = { value: string; expiresAt: number };

export class MemoryRoutingStore implements RoutingStore {
  private values = new Map<string, Entry>();

  async get(key: string) {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number, onlyIfMissing = false) {
    if (onlyIfMissing && await this.get(key) !== null) return false;
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  async delete(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }

  async deleteIfValue(key: string, value: string) {
    if (await this.get(key) !== value) return false;
    this.values.delete(key);
    return true;
  }

  async increment(key: string, ttlMs: number) {
    const current = Number(await this.get(key) ?? 0) + 1;
    await this.set(key, String(current), ttlMs);
    return current;
  }

  async ping() { return "PONG"; }
  async close() { this.values.clear(); }
}

export class RedisRoutingStore implements RoutingStore {
  private readonly redis: RedisClient;

  constructor(url: string) {
    this.redis = new RedisClient(url, { connectTimeout: 5_000, maxRetriesPerRequest: 1 });
  }

  get(key: string) { return this.redis.get(key); }

  async set(key: string, value: string, ttlMs: number, onlyIfMissing = false) {
    const result = onlyIfMissing
      ? await this.redis.set(key, value, "PX", ttlMs, "NX")
      : await this.redis.set(key, value, "PX", ttlMs);
    return result === "OK";
  }

  async delete(key: string) { return this.redis.del(key); }

  async deleteIfValue(key: string, value: string) {
    const result = await this.redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      key,
      value,
    );
    return Number(result) === 1;
  }

  async increment(key: string, ttlMs: number) {
    const result = await this.redis.eval(
      "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return value",
      1,
      key,
      String(ttlMs),
    );
    return Number(result);
  }

  ping() { return this.redis.ping(); }

  async close() {
    await this.redis.quit();
  }
}
