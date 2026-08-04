import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { peekRefreshSession } from "@/lib/auth/session";
import { readPool, writePool, type PoolEntry } from "@/lib/auth/account-pool";
import { getProfileById, getCityName, type FullProfile } from "@/lib/profile/service";

/**
 * GET /api/v1/auth/accounts — the accounts signed in on THIS device, for the
 * P9 S1 "Switch account" sheet.
 *
 * Every row is a live Supabase read (name/username/photo/role/city) keyed off a
 * refresh session that is verified against KV first. Nothing is remembered in
 * the browser: a revoked, expired, suspended or deleted account is dropped from
 * the pool here, so it can never be switched into.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function row(p: FullProfile, current: boolean) {
  const cityName = await getCityName(p.city_id);
  const roleLabel = p.role ? p.role[0].toUpperCase() + p.role.slice(1) : "";
  return {
    id: p.id,
    username: p.username ?? "",
    name: p.name ?? "",
    photoUrl: p.photo_url,
    // Same "Broker · Rajkot" secondary line the design shows, composed server-side.
    roleCity: [roleLabel, cityName].filter(Boolean).join(" · "),
    current,
  };
}

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const active = await getProfileById(claims.sub);
  if (!active) return fail("UNAUTHORIZED");

  const pool = await readPool();
  const alive: PoolEntry[] = [];
  const accounts = [await row(active, true)];

  for (const e of pool) {
    if (e.profileId === claims.sub) continue; // the active account is never a background one
    if (!(await peekRefreshSession(e.token))) continue; // revoked / expired
    const p = await getProfileById(e.profileId);
    if (!p || !p.is_registered || p.state === "deleted" || p.state === "suspended") continue;
    alive.push(e);
    accounts.push(await row(p, false));
  }

  // Self-healing: prune anything that no longer resolves.
  if (alive.length !== pool.length) await writePool(alive);

  return ok({ accounts });
}
