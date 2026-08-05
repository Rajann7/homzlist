import "server-only";

/**
 * KV abstraction for auth/cache state (OTP sessions, rate-limit counters,
 * refresh sessions, cache). Backed by Redis in prod (Doc8 §5). A dev-only
 * in-memory driver lets the app run without a local Redis — set
 * `KV_DRIVER=memory` in .env.local. The in-memory store is per-process and
 * NON-durable (dev only); BullMQ/queues always need real Redis.
 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSec: number): Promise<void>;
  ttl(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /**
   * Keys matching a glob. Used by A22's "Clear rate-limit blocks".
   *
   * The Redis driver uses SCAN, not KEYS: `KEYS *` is O(N) and BLOCKS the
   * server for the whole scan, which on a production instance holding every
   * session and counter is an outage triggered from an admin button.
   */
  scanKeys(pattern: string, limit?: number): Promise<string[]>;
}

class MemoryKV implements KV {
  private store = new Map<string, { v: string; exp: number | null }>();
  private sets = new Map<string, Set<string>>();
  private alive(key: string): boolean {
    const e = this.store.get(key);
    if (!e) return false;
    if (e.exp !== null && e.exp < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
  async get(key: string) {
    return this.alive(key) ? this.store.get(key)!.v : null;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.store.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }
  async del(...keys: string[]) {
    keys.forEach((k) => {
      this.store.delete(k);
      this.sets.delete(k);
    });
  }
  async incr(key: string) {
    const cur = this.alive(key) ? parseInt(this.store.get(key)!.v, 10) || 0 : 0;
    const next = cur + 1;
    const exp = this.store.get(key)?.exp ?? null;
    this.store.set(key, { v: String(next), exp });
    return next;
  }
  async expire(key: string, ttlSec: number) {
    const e = this.store.get(key);
    if (e) e.exp = Date.now() + ttlSec * 1000;
  }
  async ttl(key: string) {
    const e = this.store.get(key);
    if (!e || e.exp === null) return e ? -1 : -2;
    return Math.max(0, Math.ceil((e.exp - Date.now()) / 1000));
  }
  async exists(key: string) {
    return this.alive(key) ? 1 : 0;
  }
  async sadd(key: string, member: string) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    this.sets.get(key)!.add(member);
  }
  async srem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
  }
  async smembers(key: string) {
    return Array.from(this.sets.get(key) ?? []);
  }
  async scanKeys(pattern: string, limit = 10_000) {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const out: string[] = [];
    for (const k of this.store.keys()) {
      if (re.test(k) && this.alive(k)) out.push(k);
      if (out.length >= limit) break;
    }
    return out;
  }
}

class RedisKV implements KV {
  private client() {
    return require("@/lib/redis").redis as import("ioredis").Redis;
  }
  async get(key: string) {
    return this.client().get(key);
  }
  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.client().set(key, value, "EX", ttlSec);
    else await this.client().set(key, value);
  }
  async del(...keys: string[]) {
    if (keys.length) await this.client().del(...keys);
  }
  async incr(key: string) {
    return this.client().incr(key);
  }
  async expire(key: string, ttlSec: number) {
    await this.client().expire(key, ttlSec);
  }
  async ttl(key: string) {
    return this.client().ttl(key);
  }
  async exists(key: string) {
    return this.client().exists(key);
  }
  async sadd(key: string, member: string) {
    await this.client().sadd(key, member);
  }
  async srem(key: string, member: string) {
    await this.client().srem(key, member);
  }
  async smembers(key: string) {
    return this.client().smembers(key);
  }
  async scanKeys(pattern: string, limit = 10_000) {
    const redis = this.client();
    const out: string[] = [];
    let cursor = "0";
    do {
      // COUNT is a hint per iteration, not a total — SCAN yields between
      // iterations, which is the whole point of using it over KEYS.
      const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
      cursor = next;
      out.push(...batch);
    } while (cursor !== "0" && out.length < limit);
    // SCAN can return the same key twice across iterations.
    return [...new Set(out)].slice(0, limit);
  }
}

declare global {
  var __homzlistKV: KV | undefined;
}

function makeKV(): KV {
  const driver = process.env.KV_DRIVER ?? "redis";
  return driver === "memory" ? new MemoryKV() : new RedisKV();
}

export const kv: KV = globalThis.__homzlistKV ?? makeKV();
if (process.env.NODE_ENV !== "production") globalThis.__homzlistKV = kv;
