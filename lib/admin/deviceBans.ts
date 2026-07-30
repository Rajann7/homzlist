import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";

/**
 * Device / IP ban enforcement (Doc3 §1.6 — A9's "Ban device/IP", Super only).
 *
 * `device_bans` existed and NOTHING read it. An admin could ban the device behind
 * a fraud attempt, get a toast, and the person would sign in again ten seconds
 * later — the row was a record of an intention, not a control. This is the job
 * behind that button.
 *
 * Banning by HASHED ip (`kind = 'ip_hash'`) is not a compromise, it is the point:
 * HomzList never stores a user's raw address (Doc9 §26), so the ban is keyed on
 * the same salted hash the app computes from the incoming request. The ban is
 * enforceable and the address is still never held.
 *
 * Checked at the OTP gate, which is the only door into an account. A ban is not
 * applied to an already-live session: revoking sessions is a separate, heavier
 * action (A11), and silently logging someone out mid-chat is not what "ban this
 * device" means.
 */

export interface BanHit {
  kind: string;
  reason: string;
  bannedAt: string;
}

/**
 * Is this request coming from a banned device or address?
 *
 * Expired (`expires_at` in the past) and lifted bans do not count — that is what
 * makes a temporary ban temporary.
 */
export async function findActiveBan(headers: Headers): Promise<BanHit | null> {
  const ip = clientIp(headers);
  const ua = headers.get("user-agent") ?? "";
  const candidates = [await hashIp(ip)];
  if (ua) candidates.push(ua);

  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data } = await db
    .from("device_bans")
    .select("kind, value, reason, created_at, expires_at, lifted_at")
    .in("value", candidates)
    .is("lifted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    kind: row.kind as string,
    reason: (row.reason as string) ?? "Banned by an administrator",
    bannedAt: row.created_at as string,
  };
}
