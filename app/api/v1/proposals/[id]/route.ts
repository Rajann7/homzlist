import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { acceptProposal, declineProposal, notRelevantProposal } from "@/lib/listings/proposals";

/**
 * PATCH /api/v1/proposals/:id (Doc7 §73-75) — the POSTER's actions on a proposal
 * they received: accept / decline / not_relevant. Each is owner-scoped (a
 * crafted id belonging to someone else's requirement matches nothing → 404), and
 * only a PENDING proposal can transition. Accept opens a chat in Module 6.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`proposal-act:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const action = body.action;
  const res =
    action === "accept" ? await acceptProposal(params.id, claims.sub)
    : action === "decline" ? await declineProposal(params.id, claims.sub)
    : action === "not_relevant" ? await notRelevantProposal(params.id, claims.sub)
    : null;

  if (res === null) return fail("VALIDATION_ERROR", { field: "action" });
  if (!res.ok) return fail("NOT_FOUND");
  return ok({ status: res.status, flagged: res.flagged ?? false });
}
