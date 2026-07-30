import { NextResponse, type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { buildAuthUrl, googleMode } from "@/lib/admin/google";
import { requestMeta } from "@/lib/admin/session";

/**
 * GET /api/v1/admin/auth/google/start — begin admin sign-in (A1's only button).
 *
 * In live mode this 302s to Google. In DEV mode there is nowhere to send them,
 * so it reports the mode and the login screen collects the address itself; the
 * whitelist check is identical either way (see /callback and lib/admin/auth).
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  // Doc9 §23: the login entry point is the tightest rate limit in the zone, per IP.
  const { ip } = requestMeta();
  const limited = await rateLimit(`admin-login:${ip}`, 20, 600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  if (googleMode() === "dev") return ok({ mode: "dev" as const });
  return NextResponse.redirect(buildAuthUrl());
}
