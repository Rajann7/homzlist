import "server-only";
import { kv } from "@/lib/kv";

/** Redis fixed-window rate limiter (Doc9 §13 — no CAPTCHA; lockout + counters). */
export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * TEMPORARY dev kill switch — see docs/RATE-LIMIT-OFF.md for how to turn it back on.
 *
 * Browser-driven testing hammers the same IP and the same login over and over,
 * so the per-IP / per-number counters trip long before a test run finishes. With
 * `DISABLE_RATE_LIMIT=1` in .env.local every limiter reports "allowed" and the
 * OTP number-lock is ignored. It refuses to engage when NODE_ENV is production,
 * so this can never disarm the limits on a deployed server even if the env var
 * leaks into that environment.
 */
export const rateLimitDisabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.DISABLE_RATE_LIMIT === "1" || process.env.DISABLE_RATE_LIMIT === "true");

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  if (rateLimitDisabled) return { allowed: true, remaining: limit, retryAfterSec: 0 };
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
