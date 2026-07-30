import "server-only";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { lookupWhitelist, recordLoginAttempt } from "@/lib/admin/auth";
import { signAdminToken, setAdminCookie, startAdminSession } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

export const loginUrl = (params: Record<string, string>) => {
  const base = (publicEnv.adminUrl || "http://account.localhost:3000").replace(/\/$/, "");
  const q = new URLSearchParams(params).toString();
  return `${base}/login${q ? `?${q}` : ""}`;
};

/**
 * Shared tail of both sign-in modes. Everything from the whitelist check onward
 * is identical for live Google and DEV mode — the only difference upstream is
 * who vouched for the address.
 */
export async function finishAdminLogin(email: string, googleSub: string, googleName: string) {
  const found = await lookupWhitelist(email);

  if ("denied" in found) {
    await recordLoginAttempt(
      email,
      found.denied === "revoked" ? "denied_revoked" : "denied_not_whitelisted",
    );
    return NextResponse.redirect(
      loginUrl({ error: found.denied === "revoked" ? "revoked" : "unauthorized", email }),
    );
  }

  const seat = found.hit;
  const db = createServiceClient();

  // One Google identity per seat. A seat whose google_sub is already set to a
  // DIFFERENT subject means two Google accounts are claiming one whitelist entry
  // — refuse rather than quietly re-link, so an address handed to someone else
  // cannot inherit the previous holder's seat.
  const { data: current } = await db
    .from("staff")
    .select("google_sub")
    .eq("profile_id", seat.id)
    .maybeSingle();

  if (current?.google_sub && current.google_sub !== googleSub) {
    await recordLoginAttempt(email, "denied_revoked");
    return NextResponse.redirect(loginUrl({ error: "revoked", email }));
  }
  if (!current?.google_sub) {
    await db.from("staff").update({ google_sub: googleSub }).eq("profile_id", seat.id);
  }

  const jti = await startAdminSession(seat.id);
  const token = await signAdminToken({
    sub: seat.id,
    level: seat.level,
    email: seat.email,
    name: seat.name || googleName,
    jti,
  });
  setAdminCookie(token);

  await recordLoginAttempt(email, "granted");
  await audit({
    actor: { id: seat.id, email: seat.email, name: seat.name || googleName, level: seat.level, jti },
    action: "login",
    entityType: "session",
    entityId: null,
    entityLabel: seat.email,
    summary: `Signed in to the admin panel as ${seat.level}`,
  });

  const base = (publicEnv.adminUrl || "http://account.localhost:3000").replace(/\/$/, "");
  return NextResponse.redirect(base + "/");
}
