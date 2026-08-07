import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { proposeVisit, visitAction } from "@/lib/chat/thread";
import { flagEnabled } from "@/lib/system/flags";

/**
 * POST /api/v1/chat/threads/:id/visit (Doc7 §100-101) — the in-chat visit.
 *
 *   no action / "propose"  → propose a slot (creates the visit + its card)
 *   "confirm"              → the other side agrees; writes the confirmed card
 *   "reschedule"           → new slot, back to `proposed`
 *   "cancel"               → calls it off
 *   "outcome"              → after the slot passes: done / didn't happen
 *
 * The card used to render a date and nothing else, so a visit proposed in chat
 * could only ever be managed from the separate My-Visits screen — and the
 * `visit_confirmed` card the design draws was never written by anything.
 * Every branch runs through lib/listings/visits, so there is ONE state machine.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-visit:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const action = typeof body.action === "string" ? body.action : "propose";
  if (action === "propose") {
    // A22 Feature flags → Visit scheduler. Off = no NEW visits proposed; existing
    // ones can still be confirmed/cancelled below, so nothing in flight is stranded.
    if (!(await flagEnabled("visits", { userId: auth.id })))
      return fail("FORBIDDEN");
    const res = await proposeVisit(params.id, auth.id, typeof body.scheduledAt === "string" ? body.scheduledAt : "");
    if (!res.ok) return res.reason === "not_found" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR", { reason: res.reason });
    return ok({ proposed: true });
  }
  if (action !== "confirm" && action !== "reschedule" && action !== "cancel" && action !== "outcome") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }

  const res = await visitAction(params.id, auth.id, {
    action,
    scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    outcome: body.outcome === "done" || body.outcome === "cancelled" ? body.outcome : undefined,
  });
  if (!res.ok) return res.reason === "not_found" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR", { reason: res.reason });
  return ok({ updated: true, action });
}
