import "server-only";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { lookupWhitelist, recordLoginAttempt } from "@/lib/admin/auth";
import { signAdminToken, setAdminCookie, startAdminSession } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

/**
 * Where the panel lives, as a base URL with no trailing slash.
 *
 * `NEXT_PUBLIC_ADMIN_URL` carries a port (3000 by default), so a dev server that
 * had to take another port — autoPort in .claude/launch.json does exactly that —
 * used to be thrown back to :3000 the moment it signed in, onto a server that is
 * either dead or somebody else's. So when a request is in hand, the base follows
 * the host the request ACTUALLY arrived on.
 *
 * It is not an open redirect: the request's host is only trusted when its
 * hostname matches the configured admin hostname, so a spoofed Host header falls
 * back to env. Only the port — the one part that legitimately moves in dev — can
 * come from the request.
 */
export function adminBase(req?: Request): string {
  const configured = (publicEnv.adminUrl || "http://account.localhost:3000").replace(/\/$/, "");
  if (!req) return configured;
  // The Host header, NOT req.url: Next normalises a rewritten request's url to
  // the bound origin, so req.url reads "http://localhost:50674/…" and has already
  // lost the `account.` label the browser actually asked for.
  const host = req.headers.get("host");
  if (!host) return configured;
  try {
    const want = new URL(configured);
    if (host.split(":")[0].toLowerCase() === want.hostname) {
      const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || want.protocol.replace(":", "");
      return `${proto}://${host}`;
    }
  } catch {
    /* fall through to the configured base */
  }
  return configured;
}

export const loginUrl = (params: Record<string, string>, req?: Request) => {
  const q = new URLSearchParams(params).toString();
  return `${adminBase(req)}/login${q ? `?${q}` : ""}`;
};

/**
 * Shared tail of both sign-in modes. Everything from the whitelist check onward
 * is identical for live Google and DEV mode — the only difference upstream is
 * who vouched for the address.
 */
export async function finishAdminLogin(
  email: string,
  googleSub: string,
  googleName: string,
  req?: Request,
) {
  const found = await lookupWhitelist(email);

  if ("denied" in found) {
    await recordLoginAttempt(
      email,
      found.denied === "revoked" ? "denied_revoked" : "denied_not_whitelisted",
    );
    return NextResponse.redirect(
      loginUrl({ error: found.denied === "revoked" ? "revoked" : "unauthorized", email }, req),
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
    return NextResponse.redirect(loginUrl({ error: "revoked", email }, req));
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

  return NextResponse.redirect(adminBase(req) + "/");
}
