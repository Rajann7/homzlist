import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isStaff, reviewQueue, type ModerationSubject } from "@/lib/listings/moderation";
import { boostQueue } from "@/lib/billing/boost";

/**
 * GET /api/v1/admin/queue/:subject — the review queue, oldest first.
 * Staff-gated the same way as the moderate endpoint (404 to everyone else).
 *
 * `boost` is a queue of its own shape (Doc2 §13): a boost has already been PAID
 * for, so the row carries the amount, the window being bought and the
 * eligibility checks the P13-15 panel lists — approving it starts a paid window,
 * rejecting it refunds money.
 */
export const dynamic = "force-dynamic";
const SUBJECTS = ["listing", "requirement", "project", "boost"];

export async function GET(_req: NextRequest, { params }: { params: { subject: string } }) {
  const claims = await getCurrentUser();
  if (!claims || !SUBJECTS.includes(params.subject)) return fail("NOT_FOUND");
  if (!(await isStaff(claims.sub))) return fail("NOT_FOUND");

  if (params.subject === "boost") return ok({ items: await boostQueue() });

  const items = await reviewQueue(params.subject as ModerationSubject);
  // Only what a queue row needs — the full record is fetched on open.
  return ok({
    items: items.map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title ?? r.name ?? null,
      status: r.status,
      submittedAt: r.submitted_at,
      rejectCount: r.reject_count ?? 0,
      flaggedReason: r.flagged_reason ?? null,
    })),
  });
}
