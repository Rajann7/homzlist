import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signAccess, COOKIE } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeToken, IMP_COOKIE } from "@/lib/admin/impersonation";

/**
 * GET /api/v1/impersonate/enter?token=… — the A31 handoff, ON THE SELLER HOST.
 *
 * Why a top-level navigation and not an iframe: the user session cookie is
 * host-only to seller.*, and a cross-site iframe would need SameSite=None to
 * carry it. A new tab makes the whole thing first-party, which is both simpler
 * and the only version that behaves the same in dev, staging and production.
 *
 * What it mints is a REAL access token for that profile — so what the admin
 * sees is genuinely the user's app, not a mock of it (Doc5 A31: "full user-app
 * shell") — carrying an `imp` claim. That claim is what middleware.ts refuses
 * every non-GET /api call on, so this session can read everything and write
 * nothing. It deliberately does NOT set a refresh cookie: the view dies with
 * its 15-minute token and cannot renew itself into a full session.
 *
 * The token is single-use and stored only as a hash, so this URL cannot be
 * replayed out of a browser history or a shared link.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const home = new URL("/", req.url);

  const claim = token ? await consumeToken(token) : null;
  if (!claim) {
    // Expired, already used, or ended in the panel. Land on login rather than
    // a blank error — the admin's next move is to start a fresh session.
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("id, role, is_registered")
    .eq("id", claim.profileId)
    .maybeSingle();
  const profile = data as { id: string; role: string | null; is_registered: boolean } | null;
  if (!profile) return NextResponse.redirect(new URL("/login", req.url));

  const access = await signAccess({
    sub: profile.id,
    role: profile.role,
    registered: profile.is_registered,
    imp: claim.sessionId,
  });

  const jar = await cookies();
  const secure = url.protocol === "https:";
  jar.set(COOKIE.ACCESS, access, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  // Host-only, and re-verified against the row on every read: ending the
  // session in the panel stops this tab on its next request.
  jar.set(IMP_COOKIE, claim.sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 30 * 60,
  });

  return NextResponse.redirect(home);
}
