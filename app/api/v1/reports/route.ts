import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { report } from "@/lib/feed/interactions";

/**
 * POST /api/v1/reports — the Report sheet (Doc2 §15). One open report per
 * reporter per subject; can't report your own. Persists to `reports`, which the
 * P11 admin Reports queue consumes. A re-report is a friendly no-op.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`report:${claims.sub}`, 30, 3600, "report_submit");
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const subjectType = body.subjectType;
  if (subjectType !== "listing" && subjectType !== "project" && subjectType !== "requirement") return fail("VALIDATION_ERROR", { field: "subjectType" });
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
  if (!UUID_RE.test(subjectId)) return fail("VALIDATION_ERROR", { field: "subjectId" });
  const reason = typeof body.reason === "string" ? body.reason : "";

  const res = await report(claims.sub, subjectType, subjectId, reason, typeof body.note === "string" ? body.note : null);
  if (!res.ok) return fail("VALIDATION_ERROR");
  return ok({ reported: true });
}
