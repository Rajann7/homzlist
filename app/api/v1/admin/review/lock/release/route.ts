import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { releaseReviewLock, type ReviewSubject } from "@/lib/admin/review-lock";

/**
 * POST /api/v1/admin/review/lock/release — the same release as DELETE on the
 * lock route, reachable by `navigator.sendBeacon`.
 *
 * A beacon is the only request that reliably survives the tab closing, and it
 * can only POST. Without it, closing the tab on a review leaves the listing
 * locked until the TTL expires — ten minutes in which nobody else can work on
 * it. The TTL is still the backstop; this just makes the common case instant.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS: ReviewSubject[] = ["listing", "requirement", "project"];

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    // sendBeacon sends a Blob, so the content-type is whatever it was given.
    const raw = await req.text();
    const body = JSON.parse(raw || "{}") as { subject?: string; id?: string };
    if (!body.subject || !SUBJECTS.includes(body.subject as ReviewSubject)) {
      return fail("VALIDATION_ERROR");
    }
    if (!body.id || !UUID_RE.test(body.id)) return fail("VALIDATION_ERROR");
    return ok({ released: await releaseReviewLock(body.subject as ReviewSubject, body.id, me) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
