import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { kv } from "@/lib/kv";
import type { AdminIdentity } from "./guard";

/**
 * A31 — impersonation. Template 1759-1765, Doc5 A31, Doc9.
 *
 * The design's overlay is a warning banner and an Exit button; what makes it
 * more than a picture is all here:
 *
 *  · ONE LIVE SESSION PER ADMIN. Starting a second one ends the first, so
 *    "who was Priya viewing at 3pm" has exactly one answer.
 *  · IT EXPIRES BY ITSELF. `expires_at` is 30 minutes out. A crashed browser
 *    must not leave a live impersonation on the record forever — and the banner
 *    reads its elapsed time from `started_at`, not from a client timer.
 *  · READ-ONLY IS THE SERVER'S JOB. `assertNotImpersonating()` is called by the
 *    user-side mutation guard, so a send, a payment or a message is refused at
 *    the API even if the UI forgets to disable a button. Doc9's "no send even
 *    in impersonation" is not a CSS state.
 *
 * The handoff to the user app is a ONE-SHOT token, hashed in KV, exchanged at
 * the seller host for its own host-only cookie by a top-level navigation. It is
 * never a cross-site iframe cookie, and the token itself is never stored.
 */

const db = () => createServiceClient();

export const IMP_COOKIE = "hz_imp";
const TTL_MIN = 30;
const tokenKey = (hash: string) => `imp:tok:${hash}`;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export type LiveImpersonation = {
  id: string;
  profileId: string;
  profileName: string | null;
  startedAt: string;
  expiresAt: string | null;
};

/** The admin's own live session, if any — what the banner renders from. */
export async function liveImpersonation(me: AdminIdentity): Promise<LiveImpersonation | null> {
  const { data } = await db()
    .from("impersonation_sessions")
    .select("id, profile_id, started_at, expires_at")
    .eq("staff_id", me.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as
    | { id: string; profile_id: string; started_at: string; expires_at: string | null }
    | null;
  if (!row) return null;

  // Expired but never closed: close it now rather than reporting it live.
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await db()
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "expired" })
      .eq("id", row.id);
    return null;
  }

  const { data: p } = await db()
    .from("profiles")
    .select("name")
    .eq("id", row.profile_id)
    .maybeSingle();

  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: (p as { name: string | null } | null)?.name ?? null,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

export type StartResult =
  | { ok: true; session: LiveImpersonation; token: string }
  | { ok: false; reason: "not_found" | "bad_state"; message?: string };

export async function startImpersonation(
  profileId: string,
  me: AdminIdentity,
  reason: string | null,
): Promise<StartResult> {
  const { data: profile } = await db()
    .from("profiles")
    .select("id, name, state")
    .eq("id", profileId)
    .maybeSingle();
  const p = profile as { id: string; name: string | null; state: string } | null;
  if (!p) return { ok: false, reason: "not_found" };
  if (p.state === "deleted")
    return { ok: false, reason: "bad_state", message: "This account is deleted" };

  // One live session per admin.
  await db()
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString(), ended_reason: "superseded" })
    .eq("staff_id", me.id)
    .is("ended_at", null);

  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000).toISOString();
  const { data, error } = await db()
    .from("impersonation_sessions")
    .insert({
      staff_id: me.id,
      staff_name: me.name,
      profile_id: profileId,
      reason: reason?.trim()?.slice(0, 300) ?? null,
      expires_at: expiresAt,
    })
    .select("id, started_at, expires_at")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "bad_state", message: error?.message };
  const row = data as { id: string; started_at: string; expires_at: string };

  // One-shot handoff. Only the HASH is stored, and it is deleted on first use.
  const token = randomBytes(32).toString("base64url");
  await kv.set(
    tokenKey(hash(token)),
    JSON.stringify({ sessionId: row.id, profileId, staffId: me.id }),
    TTL_MIN * 60,
  );

  return {
    ok: true,
    token,
    session: {
      id: row.id,
      profileId,
      profileName: p.name,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    },
  };
}

export async function endImpersonation(
  me: AdminIdentity,
): Promise<{ ok: boolean; minutes: number }> {
  const live = await liveImpersonation(me);
  if (!live) return { ok: false, minutes: 0 };
  await db()
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString(), ended_reason: "exited" })
    .eq("id", live.id)
    .is("ended_at", null);
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(live.startedAt).getTime()) / 60_000),
  );
  return { ok: true, minutes };
}

/** Exchange the one-shot token at the seller host. Consumed on first use. */
export async function consumeToken(
  token: string,
): Promise<{ sessionId: string; profileId: string; staffId: string } | null> {
  const key = tokenKey(hash(token));
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.del(key);
  const parsed = JSON.parse(raw) as { sessionId: string; profileId: string; staffId: string };

  const { data } = await db()
    .from("impersonation_sessions")
    .select("id, profile_id, ended_at, expires_at")
    .eq("id", parsed.sessionId)
    .maybeSingle();
  const row = data as
    | { id: string; profile_id: string; ended_at: string | null; expires_at: string | null }
    | null;
  if (!row || row.ended_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return parsed;
}

/**
 * The user-side half: is THIS request an impersonated view?
 *
 * Read from the seller host's own host-only cookie, and re-verified against the
 * row every time — ending the session in the panel stops the impersonated tab
 * on its next request, it does not wait for a cookie to expire.
 */
export async function impersonationContext(): Promise<{
  sessionId: string;
  profileId: string;
  staffName: string;
  startedAt: string;
} | null> {
  const value = (await cookies()).get(IMP_COOKIE)?.value;
  if (!value) return null;
  const { data } = await db()
    .from("impersonation_sessions")
    .select("id, profile_id, staff_name, started_at, ended_at, expires_at")
    .eq("id", value)
    .maybeSingle();
  const row = data as
    | {
        id: string;
        profile_id: string;
        staff_name: string;
        started_at: string;
        ended_at: string | null;
        expires_at: string | null;
      }
    | null;
  if (!row || row.ended_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    sessionId: row.id,
    profileId: row.profile_id,
    staffName: row.staff_name,
    startedAt: row.started_at,
  };
}

export class ImpersonationReadOnlyError extends Error {
  constructor() {
    super("read-only impersonation session");
  }
}

/**
 * Called by the user-side write guard. Doc9: no send, no payment, no message —
 * ever, and enforced at the API rather than by hiding a button.
 */
export async function assertNotImpersonating(): Promise<void> {
  const ctx = await impersonationContext();
  if (ctx) throw new ImpersonationReadOnlyError();
}
