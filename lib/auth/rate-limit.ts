import "server-only";
import { kv } from "@/lib/kv";
import { devAffordancesAllowed } from "@/lib/env";

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
 * OTP number-lock is ignored. It refuses to engage in the production band, so
 * this can never disarm the limits on the real site even if the env var leaks
 * into that environment — a staging deploy (APP_ENV=staging) is the one place a
 * deployed server will honour it, which is the environment it exists for.
 */
export const rateLimitDisabled =
  devAffordancesAllowed() &&
  (process.env.DISABLE_RATE_LIMIT === "1" || process.env.DISABLE_RATE_LIMIT === "true");

/**
 * The admin-editable rules, cached in-process.
 *
 * `rate_limits` held 13 rows that nothing read: every caller hardcoded its own
 * numbers, so A22's "Limits & velocity" tab was a table of editable values that
 * changed nothing — the same defect 0096 recorded for `number_patterns`.
 *
 * A caller now names its rule, and the row wins over the hardcoded numbers when
 * it exists and is active. The hardcoded values stay as the FALLBACK, so a rule
 * that is deleted, disabled, or unreachable because the database is down leaves
 * the endpoint protected rather than open. A limiter that fails open is worse
 * than one that cannot be tuned.
 */
interface Rule {
  max_requests: number;
  window_seconds: number;
  is_active: boolean;
}
let ruleCache: { at: number; rules: Map<string, Rule> } | null = null;
const RULE_TTL_MS = 60_000;

/** Called by A22's save path so an admin's edit is live on the next request. */
export function invalidateRateRules(): void {
  ruleCache = null;
}

async function ruleFor(key: string): Promise<Rule | null> {
  if (!ruleCache || Date.now() - ruleCache.at > RULE_TTL_MS) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const { data } = await createServiceClient()
        .from("rate_limits")
        .select("key, max_requests, window_seconds, is_active");
      const rules = new Map<string, Rule>();
      for (const r of (data ?? []) as (Rule & { key: string })[]) rules.set(r.key, r);
      ruleCache = { at: Date.now(), rules };
    } catch {
      // Fall back to the caller's numbers rather than failing the request.
      return null;
    }
  }
  const rule = ruleCache.rules.get(key);
  return rule && rule.is_active ? rule : null;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  /** The `rate_limits.key` this call is governed by, when there is one. */
  rule?: string,
): Promise<RateResult> {
  if (rateLimitDisabled) return { allowed: true, remaining: limit, retryAfterSec: 0 };

  let effectiveLimit = limit;
  let effectiveWindow = windowSec;
  if (rule) {
    const configured = await ruleFor(rule);
    if (configured) {
      effectiveLimit = configured.max_requests;
      effectiveWindow = configured.window_seconds;
    }
  }

  const redisKey = `rl:${key}`;
  const count = await kv.incr(redisKey);
  if (count === 1) await kv.expire(redisKey, effectiveWindow);
  const ttl = await kv.ttl(redisKey);
  const retryAfterSec = ttl > 0 ? ttl : effectiveWindow;
  const allowed = count <= effectiveLimit;

  // Only blocks are counted (migration 0110). A row per allowed request would
  // be a write on the hot path of every endpoint on the site, and the number
  // A22 prints is "how often did this limit actually stop someone".
  if (!allowed && rule) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      await createServiceClient().rpc("hz_record_rate_block", { p_key: rule });
    } catch {
      /* a counter is never worth failing a request over */
    }
  }

  return { allowed, remaining: Math.max(0, effectiveLimit - count), retryAfterSec };
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
