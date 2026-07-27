import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  applyBoostCredit,
  listBoostCredits,
  SUBJECT_KINDS,
  TARGETINGS,
  type BoostSubjectKind,
  type BoostTargeting,
} from "@/lib/billing/boost";

/**
 * GET  /api/v1/billing/boost/credit — unused boost days this seller can spend.
 * POST /api/v1/billing/boost/credit — spend them on another subject.
 *
 * Credits are minted when a boosted listing / project / requirement is sold,
 * rented or switched off mid-window (migration 0050). No money moves in either
 * direction here: this is placement that was already paid for, being pointed at
 * something that can still use it.
 *
 * Everything the boost ends up with is the SERVER's: the day count comes from
 * the credit row, the geography from the subject, the price is zero by
 * construction. The body carries only which subject and which of the three
 * scopes — nothing that could inflate what the credit is worth.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const credits = await listBoostCredits(claims.sub);
  return ok({
    credits: credits.map((c) => ({
      id: c.id,
      days: c.days,
      reason: c.reason,
      expiresOn: new Date(c.expiresAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      }),
    })),
    totalDays: credits.reduce((n, c) => n + c.days, 0),
  });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Applying a credit writes a boost row; cap the loop.
  const limited = await rateLimit(`boost-credit:${claims.sub}`, 30, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const kind = SUBJECT_KINDS.find((k) => k === body.subjectKind) as BoostSubjectKind | undefined;
  const targeting = TARGETINGS.find((t) => t === body.targeting) as BoostTargeting | undefined;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";

  if (!kind) return fail("VALIDATION_ERROR", { field: "subjectKind" });
  if (!targeting) return fail("VALIDATION_ERROR", { field: "targeting" });
  if (!UUID_RE.test(subjectId)) return fail("VALIDATION_ERROR", { field: "subjectId" });

  const res = await applyBoostCredit(claims.sub, kind, subjectId, targeting);
  if (!res.ok) {
    // A subject that isn't the caller's is indistinguishable from one that does
    // not exist (Doc9 §API1) — `applyBoostCredit` looks it up ownership-scoped.
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "no_credit") return fail("VALIDATION_ERROR", { field: "credit", noCredit: true });
    if (res.reason === "city_cap") return fail("LISTING_STATE_LOCKED", { cityCapReached: true });
    return fail("LISTING_STATE_LOCKED", { ineligible: true });
  }
  return ok(res);
}
