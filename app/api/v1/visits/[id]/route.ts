import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { rescheduleVisit, cancelVisit, setVisitOutcome, confirmVisit } from "@/lib/listings/visits";

/**
 * PATCH /api/v1/visits/:id (Doc7 §101) — reschedule / cancel / outcome / confirm.
 *
 * De-namespaced from the design's `/chat/visits/:id` because chat is Module 6
 * (tracked in PENDING-INTEGRATIONS.md). Either party to the visit may act; the
 * service scopes to (buyer OR poster), so a stranger's id matches nothing → 404.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`visit-act:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  let done = false;
  switch (body.action) {
    case "reschedule": {
      const when = typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime())) return fail("VALIDATION_ERROR", { field: "scheduledAt" });
      done = await rescheduleVisit(params.id, claims.sub, when.toISOString(), typeof body.note === "string" ? body.note : null);
      break;
    }
    case "cancel":
      done = await cancelVisit(params.id, claims.sub, typeof body.reason === "string" ? body.reason : null);
      break;
    case "outcome": {
      const outcome = body.outcome === "done" || body.outcome === "cancelled" ? body.outcome : null;
      if (!outcome) return fail("VALIDATION_ERROR", { field: "outcome" });
      done = await setVisitOutcome(params.id, claims.sub, outcome);
      break;
    }
    case "confirm":
      done = await confirmVisit(params.id, claims.sub);
      break;
    default:
      return fail("VALIDATION_ERROR", { field: "action" });
  }

  if (!done) return fail("NOT_FOUND");
  return ok({ updated: true });
}
