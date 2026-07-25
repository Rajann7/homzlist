import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { blockUserById, reportUserById } from "@/lib/chat/service";

/**
 * POST /api/v1/profile/moderation — Block / Report a user from their PUBLIC
 * profile (P9 ⋯ menu). These buttons used to only toast (PENDING A4): a "blocked"
 * user was never protected and a "submitted" report saved nothing. Both now
 * persist. `blocker`/`reporter` is always the session user, so there is no IDOR
 * surface — you can only act on your own behalf against a target id.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const limited = await rateLimit(`profile-mod:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = body.action;

  if (action === "block") {
    const res = await blockUserById(claims.sub, userId);
    return res.ok ? ok({ blocked: true }) : fail("VALIDATION_ERROR");
  }
  if (action === "report") {
    const reason = typeof body.reason === "string" ? body.reason : "other";
    const note = typeof body.note === "string" ? body.note : null;
    const res = await reportUserById(claims.sub, userId, reason, note);
    return res.ok ? ok({ reported: true }) : fail("VALIDATION_ERROR");
  }
  return fail("VALIDATION_ERROR", { field: "action" });
}
