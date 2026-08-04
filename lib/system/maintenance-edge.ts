/**
 * The Edge half of maintenance mode — the only part middleware.ts can use.
 *
 * NOT "server-only": this is imported by middleware, which runs on the Edge
 * runtime where `@supabase/supabase-js` (require) and `ioredis` (TCP) are both
 * unavailable. The read therefore goes over PostgREST with plain `fetch`, the
 * same way app/api/og/route.tsx reads a listing.
 *
 * Three properties this has to have, and each one is a decision:
 *
 *  · FAIL OPEN. A Supabase blip must not put the whole site into a maintenance
 *    page nobody asked for. Any error, any timeout → not in maintenance.
 *
 *  · CHEAP. The flag is cached in the isolate for 10 seconds, and the check
 *    only runs for WRITES (see middleware). A read-heavy site therefore pays
 *    nothing, and a write pays one cached fetch.
 *
 *    The cost of that cache is a PROPAGATION DELAY: flipping maintenance on
 *    freezes writes within ~10 seconds, not instantly. That is the right trade
 *    — the alternative is a database round trip on every write for ever — and
 *    it is fine for what maintenance is for, which is a planned window rather
 *    than an emergency stop. If you need writes to stop *now*, revoke at the
 *    database instead of relying on this.
 *
 *  · BOUNDED. A 1.2s timeout with an AbortController, because a hanging fetch
 *    in middleware hangs the request, and "the database is slow" must not
 *    become "every write times out".
 */

export interface EdgeMaintenance {
  enabled: boolean;
  message: string | null;
  eta: string | null;
}

const OFF: EdgeMaintenance = { enabled: false, message: null, eta: null };

const TTL_MS = 10_000;
const TIMEOUT_MS = 1_200;

// Per-isolate cache. Edge isolates are short-lived and many, which is fine —
// the worst case is each one making one call every 10 seconds.
let cache: { at: number; value: EdgeMaintenance } | null = null;
let inFlight: Promise<EdgeMaintenance> | null = null;

export async function edgeMaintenanceState(): Promise<EdgeMaintenance> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  // Concurrent writes during a cache miss share one fetch rather than each
  // opening their own.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) return OFF;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/rest/v1/rpc/hz_maintenance_public`, {
        method: "POST",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: "{}",
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) return OFF;
      const json = (await res.json()) as EdgeMaintenance | null;
      const value: EdgeMaintenance = {
        enabled: Boolean(json?.enabled),
        message: json?.message ?? null,
        eta: json?.eta ?? null,
      };
      cache = { at: Date.now(), value };
      return value;
    } catch {
      return OFF; // fail open — never wall the site because of a network blip
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}
