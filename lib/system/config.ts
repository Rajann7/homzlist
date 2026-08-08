import "server-only";

/**
 * Runtime durations the operator can tune from admin Settings → "Sessions &
 * content" (migration 0133, table `system_durations`). Two things read this:
 * the session layer (how long a login lasts) and the story row (how long a new
 * listing/project shows).
 *
 * SAFETY CONTRACT — mirrors lib/system/flags.ts, because a bad read here must
 * never log everyone out or hide every story:
 *   • a missing/zero/garbage row falls back to the code DEFAULT below,
 *   • a database error returns the cached value, or the defaults if nothing is
 *     cached,
 *   • the value is clamped to the row's own [min,max] band as a second guard
 *     (the save path clamps too).
 * So this is non-breaking: with the seeded rows it behaves exactly like the old
 * hard-coded constants; only an explicit admin edit changes anything.
 */
import { createServiceClient } from "@/lib/supabase/server";

/** Code defaults — used when the DB has no row or cannot be read. */
const DEFAULTS: Record<string, number> = {
  session_ttl: 7 * 24 * 60 * 60, // 7 days
  story_window: 30 * 24 * 60 * 60, // 30 days
};

interface DurationRow {
  seconds: number;
  min_seconds: number;
  max_seconds: number;
}

let cache: { at: number; map: Map<string, DurationRow> } | null = null;
const TTL_MS = 30_000;

/** Called by the admin save path so an edit is live on the next request. */
export function invalidateDurations(): void {
  cache = null;
}

async function load(): Promise<Map<string, DurationRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const { data } = await createServiceClient()
      .from("system_durations")
      .select("key, seconds, min_seconds, max_seconds");
    const map = new Map<string, DurationRow>();
    for (const r of (data ?? []) as (DurationRow & { key: string })[])
      map.set(r.key, { seconds: Number(r.seconds), min_seconds: Number(r.min_seconds), max_seconds: Number(r.max_seconds) });
    cache = { at: Date.now(), map };
    return map;
  } catch {
    // Never fail an auth op or a feed read over this — keep the last good map,
    // or an empty one (→ every key resolves to its code default).
    return cache?.map ?? new Map();
  }
}

async function durationSec(key: string): Promise<number> {
  const fallback = DEFAULTS[key] ?? 0;
  const row = (await load()).get(key);
  if (!row || !Number.isFinite(row.seconds) || row.seconds <= 0) return fallback;
  // Second guard: clamp to the row's own band even if a bad value slipped in.
  const lo = Number.isFinite(row.min_seconds) ? row.min_seconds : row.seconds;
  const hi = Number.isFinite(row.max_seconds) ? row.max_seconds : row.seconds;
  return Math.min(Math.max(row.seconds, lo), hi);
}

/** How long a signed-in session lasts (refresh-token lifetime), in seconds. */
export async function sessionTtlSec(): Promise<number> {
  return durationSec("session_ttl");
}

/** How long a newly-live listing/project stays a story, in milliseconds. */
export async function storyWindowMs(): Promise<number> {
  return (await durationSec("story_window")) * 1000;
}
