import "server-only";
import { kv } from "@/lib/kv";

/** Redis fixed-window rate limiter (Doc9 §13 — no CAPTCHA; lockout + counters). */
export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const redisKey = `rl:${key}`;
  const count = await kv.incr(redisKey);
  if (count === 1) await kv.expire(redisKey, windowSec);
  const ttl = await kv.ttl(redisKey);
  const retryAfterSec = ttl > 0 ? ttl : windowSec;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
}

export async function counterValue(key: string): Promise<number> {
  const v = await kv.get(`rl:${key}`);
  return v ? parseInt(v, 10) : 0;
}

/** Hash an IP for privacy-preserving per-IP limits / logs (Doc9 §19). */
export async function hashIp(ip: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  // Pepper the hash with a server-only secret so a leaked `listing_views`
  // export (or any table holding these) can't be reversed against the small
  // IPv4 + common-UA space by rainbow table (Doc9 — no de-anonymisable PII in
  // analytics). Falls back to unpeppered only if the secret isn't set, so dev
  // without the env var still works.
  const pepper = process.env.HASH_PEPPER ?? process.env.JWT_ACCESS_SECRET ?? "";
  return createHash("sha256").update(`${pepper}|${ip}`).digest("hex").slice(0, 16);
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}
