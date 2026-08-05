import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isStaff, moderate, moderationHistory, type ModerationSubject } from "@/lib/listings/moderation";
import { approveBoost, rejectBoost, stopBoost, pauseBoost, resumeBoost, boostReviewHistory } from "@/lib/billing/boost";

/**
 * POST /api/v1/admin/moderate/:subject/:id — Approve / Request changes / Reject.
 * GET  — the decision history for one item.
 *
 * Staff-gated by the `staff` table, not by a role on the seller profile: a
 * moderator is not a kind of seller. A non-staff caller gets 404, not 403, so
 * the existence of the endpoint isn't confirmable by probing (Doc9 §API1).
 *
 * `boost` is a different state machine from the listing one and is handled
 * separately (Doc2 §13): approve starts the paid window, reject hands the row to
 * the refund sweep, and pause/resume are the admin-hide pair. It is here rather
 * than in its own route so there is exactly ONE staff gate to audit.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS = ["listing", "requirement", "project", "boost"];
/**
 * `reject` refunds in full and is therefore only valid on a boost that never ran;
 * `stop` ends a live one WITHOUT a refund (Doc2 §13's fraud case). Keeping them as
 * two actions is what stops a moderator refunding ₹1,499 of already-delivered
 * placement with one click.
 */
const BOOST_ACTIONS = ["approve", "reject", "stop", "pause", "resume"] as const;

async function gate(subject: string, id: string) {
  const claims = await getCurrentUser();
  if (!claims) return { err: fail("NOT_FOUND") };
  if (!SUBJECTS.includes(subject) || !UUID_RE.test(id)) return { err: fail("NOT_FOUND") };
  if (!(await isStaff(claims.sub))) return { err: fail("NOT_FOUND") };
  return { actorId: claims.sub };
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ subject: string; id: string }> }
) {
  const params = await props.params;
  const g = await gate(params.subject, params.id);
  if (g.err) return g.err;

  const limited = await rateLimit(`moderate:${g.actorId}`, 600, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  // ---- boost decisions (Doc2 §13) ------------------------------------------
  if (params.subject === "boost") {
    const act = body.action;
    if (typeof act !== "string" || !BOOST_ACTIONS.includes(act as (typeof BOOST_ACTIONS)[number])) {
      return fail("VALIDATION_ERROR", { field: "action" });
    }
    const reason = typeof body.reason === "string" ? body.reason : "";

    const res =
      act === "approve" ? await approveBoost(params.id, g.actorId!)
      : act === "reject" ? await rejectBoost(params.id, g.actorId!, reason)
      : act === "stop" ? await stopBoost(params.id, g.actorId!, reason)
      : act === "pause" ? await pauseBoost(params.id, g.actorId!, reason || null)
      : await resumeBoost(params.id, g.actorId!);

    if (!res.ok) {
      if (res.reason === "not_found") return fail("NOT_FOUND");
      if (res.reason === "validation") return fail("VALIDATION_ERROR", { field: "reason" });
      // `ineligible` means the subject went sold/hidden while it waited — the
      // boost has just been rejected + queued for refund, so tell the moderator
      // what actually happened instead of a bare conflict.
      if (res.reason === "ineligible") {
        return fail("LISTING_STATE_LOCKED", { autoRejected: true, refunding: true });
      }
      if (res.reason === "city_cap") return fail("LISTING_STATE_LOCKED", { cityCapReached: true });
      return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
    }
    return ok(res);
  }

  const action = body.action;
  if (action !== "approve" && action !== "request_changes" && action !== "reject") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }

  // Per-field notes: keys are field names, values are the moderator's note.
  const notes =
    body.notes && typeof body.notes === "object" && !Array.isArray(body.notes)
      ? Object.fromEntries(
          Object.entries(body.notes as Record<string, unknown>)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string" && v.trim())
            .slice(0, 30)
            .map(([k, v]) => [k, String(v).slice(0, 300)]),
        )
      : null;

  const res = await moderate(params.subject as ModerationSubject, params.id, g.actorId!, {
    action,
    notes,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
  });

  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    // Locked after 3 rejects, or already decided by another moderator.
    if (res.reason === "locked") return fail("LISTING_STATE_LOCKED", { locked: true });
    if (res.reason === "bad_state") return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
    return fail("VALIDATION_ERROR");
  }

  return ok({ status: res.status, locked: res.locked, rejectCount: res.rejectCount });
}

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ subject: string; id: string }> }
) {
  const params = await props.params;
  const g = await gate(params.subject, params.id);
  if (g.err) return g.err;
  if (params.subject === "boost") return ok({ history: await boostReviewHistory(params.id) });
  return ok({ history: await moderationHistory(params.subject as ModerationSubject, params.id) });
}
