import "server-only";
import Redis, { type RedisOptions } from "ioredis";
import { serverEnv } from "@/lib/env";

/**
 * Shared Redis connections (Doc8 §5). Server-only.
 *  - `redis`      → cache-aside reads, rate-limit counters, seen-state, session lookups.
 *  - `bullConnection` → BullMQ requires `maxRetriesPerRequest: null`.
 *
 * A module-level singleton avoids exhausting connections under Next.js hot-reload
 * and many serverless instances (pooling discipline, Doc8 §4.1).
 */

declare global {
  var __homzlistRedis: Redis | undefined;
  var __homzlistBull: Redis | undefined;
}

function make(opts?: RedisOptions): Redis {
  const { redisUrl } = serverEnv();
  return new Redis(redisUrl, {
    lazyConnect: true, // don't connect until first use (scaffold-safe)
    enableOfflineQueue: true,
    ...opts,
  });
}

export const redis: Redis = globalThis.__homzlistRedis ?? make();
export const bullConnection: Redis =
  globalThis.__homzlistBull ?? make({ maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalThis.__homzlistRedis = redis;
  globalThis.__homzlistBull = bullConnection;
}
