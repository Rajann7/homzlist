import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getInbox, markAllRead, clearAll } from "@/lib/notifications/inbox";

/**
 * GET    /api/v1/notifications        — the P11 S7 list (Doc4 §61, Doc7 §16)
 * PATCH  /api/v1/notifications        — mark ALL read (the ⋯ sheet)
 * DELETE /api/v1/notifications        — clear all (the ⋯ sheet, double-confirmed)
 *
 * Auth-only, and always scoped to the caller's own profile: there is no id in
 * the path, so one user can never read or clear another's notifications.
 * A guest has no inbox at all — 401, not an empty list, because the screen is
 * behind the bell which is itself auth-only.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`notif-list:${claims.sub}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  // Unknown filters fall back to "all" rather than erroring — a stale client
  // must never be able to blank the screen.
  return ok(await getInbox(claims.sub, { filter }));
}

export async function PATCH() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`notif-readall:${claims.sub}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  return ok({ marked: await markAllRead(claims.sub) });
}

export async function DELETE() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`notif-clear:${claims.sub}`, 30, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  return ok({ cleared: await clearAll(claims.sub) });
}
