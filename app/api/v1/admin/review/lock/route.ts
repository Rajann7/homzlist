import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { claimReviewLock, releaseReviewLock, type ReviewSubject } from "@/lib/admin/review-lock";

/**
 * POST   /api/v1/admin/review/lock — claim, or heartbeat an existing claim
 * DELETE /api/v1/admin/review/lock — release
 *
 * The review screen calls POST when it opens and every few minutes while it is
 * open, and DELETE when it closes. Claiming and heartbeating are the same call
 * because they are the same statement: a lock already mine simply has its
 * expiry pushed out (migration 0097).
 *
 * Not audited. A lock is not a decision about anyone's listing — it is two
 * moderators not colliding — and an audit row per heartbeat would bury the log
 * that matters under a metronome.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS: ReviewSubject[] = ["listing", "requirement", "project"];

function parse(body: unknown) {
  const b = (body ?? {}) as { subject?: string; id?: string };
  if (!b.subject || !SUBJECTS.includes(b.subject as ReviewSubject)) return null;
  if (!b.id || !UUID_RE.test(b.id)) return null;
  return { subject: b.subject as ReviewSubject, id: b.id };
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    const input = parse(await req.json().catch(() => null));
    if (!input) return fail("VALIDATION_ERROR");
    return ok(await claimReviewLock(input.subject, input.id, me));
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    const input = parse(await req.json().catch(() => null));
    if (!input) return fail("VALIDATION_ERROR");
    return ok({ released: await releaseReviewLock(input.subject, input.id, me) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
