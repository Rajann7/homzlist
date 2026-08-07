/**
 * Feature flags — the read side the whole app gates on (A22 Settings → Feature
 * flags). Until now `feature_flags` was written by the admin panel and read by
 * NOTHING, so every toggle was inert. This is the single reader.
 *
 * SAFETY CONTRACT — a flag can never take a working feature down by accident:
 *   • an unknown key returns TRUE (a feature whose flag row was never seeded
 *     keeps working exactly as before this file existed),
 *   • a database error returns the cached value, or TRUE if nothing is cached,
 *   • only an EXPLICIT `enabled = false` (or a scope the viewer is outside of)
 *     turns a feature off.
 * So wiring a gate is non-breaking: with the flag on — its shipped state for
 * everything live — behaviour is unchanged; turning it off in the panel is what
 * newly takes effect.
 */
import { createServiceClient } from "@/lib/supabase/server";

export interface FlagContext {
  role?: string | null;
  cityId?: string | null;
  userId?: string | null;
  isStaff?: boolean;
}

interface FlagRow {
  enabled: boolean;
  scope: string;
  scope_value: string | null;
}

let cache: { at: number; map: Map<string, FlagRow> } | null = null;
const TTL_MS = 60_000;

/** Called by A22's flag save path so an admin toggle is live on the next request. */
export function invalidateFlags(): void {
  cache = null;
}

async function loadFlags(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const { data } = await createServiceClient()
      .from("feature_flags")
      .select("key, enabled, scope, scope_value");
    const map = new Map<string, FlagRow>();
    for (const r of (data ?? []) as (FlagRow & { key: string })[])
      map.set(r.key, { enabled: r.enabled, scope: r.scope, scope_value: r.scope_value });
    cache = { at: Date.now(), map };
    return map;
  } catch {
    // Never fail a request over a flag read — keep the last good map, or an
    // empty one (→ every key resolves TRUE via the unknown-key rule).
    return cache?.map ?? new Map();
  }
}

/** Deterministic 0–99 bucket for percentage rollouts (stable per seed). */
function bucket(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100;
  return h;
}

/** Is `key` enabled for this viewer? See the safety contract above. */
export async function flagEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  const f = (await loadFlags()).get(key);
  if (!f) return true; // unknown key → never hide a working feature
  if (!f.enabled) return false;
  switch (f.scope) {
    case "all":
      return true;
    case "staff":
      return ctx.isStaff === true;
    case "role":
      return !f.scope_value || f.scope_value === ctx.role;
    case "city":
      return !f.scope_value || f.scope_value === ctx.cityId;
    case "percent": {
      const pct = Number(f.scope_value ?? "100");
      if (!Number.isFinite(pct)) return true;
      return bucket(ctx.userId ?? "anon") < pct;
    }
    default:
      return true;
  }
}

/** The whole flag map resolved for a viewer — for the client config endpoint. */
export async function resolvedFlags(ctx: FlagContext = {}): Promise<Record<string, boolean>> {
  const map = await loadFlags();
  const out: Record<string, boolean> = {};
  for (const key of map.keys()) out[key] = await flagEnabled(key, ctx);
  return out;
}
