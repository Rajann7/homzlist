import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { markRead, dismiss } from "@/lib/notifications/inbox";
import { runAction } from "@/lib/notifications/actions";

/**
 * PATCH  /api/v1/notifications/:id  — mark one read, or run its inline action
 * DELETE /api/v1/notifications/:id  — swipe-to-dismiss
 *
 * Every path is scoped to the caller's own profile inside the service layer, so
 * an id belonging to somebody else matches nothing and comes back 404 — the
 * same answer as an id that does not exist (Doc9 §7: no enumeration signal).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`notif-act:${claims.sub}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* mark-read has no body */ }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) return ok({ read: (await markRead(claims.sub, [params.id])) > 0 });

  const res = await runAction(claims.sub, params.id, action);
  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "already_taken") return fail("LISTING_STATE_LOCKED", { alreadyTaken: true });
    if (res.reason === "not_supported") return fail("VALIDATION_ERROR", { field: "action" });
    // `failed` means the underlying thing is no longer actionable — the number
    // request was already answered, the listing already sold. That is a state
    // conflict, not a server fault, so it must not be a 500.
    return fail("LISTING_STATE_LOCKED", { notActionable: true });
  }
  return ok({ text: res.text ?? null, toast: res.toast ?? null, dismissed: !!res.dismissed });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`notif-dismiss:${claims.sub}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const done = await dismiss(claims.sub, params.id);
  if (!done) return fail("NOT_FOUND");
  return ok({ dismissed: true });
}
