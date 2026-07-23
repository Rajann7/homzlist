import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isStaff, moderate, moderationHistory, type ModerationSubject } from "@/lib/listings/moderation";

/**
 * POST /api/v1/admin/moderate/:subject/:id — Approve / Request changes / Reject.
 * GET  — the decision history for one item.
 *
 * Staff-gated by the `staff` table, not by a role on the seller profile: a
 * moderator is not a kind of seller. A non-staff caller gets 404, not 403, so
 * the existence of the endpoint isn't confirmable by probing (Doc9 §API1).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS = ["listing", "requirement", "project"];

async function gate(subject: string, id: string) {
  const claims = await getCurrentUser();
  if (!claims) return { err: fail("NOT_FOUND") };
  if (!SUBJECTS.includes(subject) || !UUID_RE.test(id)) return { err: fail("NOT_FOUND") };
  if (!(await isStaff(claims.sub))) return { err: fail("NOT_FOUND") };
  return { actorId: claims.sub };
}

export async function POST(req: NextRequest, { params }: { params: { subject: string; id: string } }) {
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

export async function GET(_req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  const g = await gate(params.subject, params.id);
  if (g.err) return g.err;
  return ok({ history: await moderationHistory(params.subject as ModerationSubject, params.id) });
}
