import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { moveStage, addLeadNote, markLeadNotRelevant, STAGES, type Stage } from "@/lib/listings/leads";

/**
 * PATCH /api/v1/leads/:id (Doc7 §104) — stage move / add note / mark not
 * relevant. Owner-scoped in the service (a stranger's lead → 404).
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`lead-act:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  let done = false;
  switch (body.action) {
    case "stage": {
      const stage = body.stage as Stage;
      if (!STAGES.includes(stage)) return fail("VALIDATION_ERROR", { field: "stage" });
      done = await moveStage(params.id, claims.sub, stage, typeof body.note === "string" ? body.note : null);
      break;
    }
    case "note": {
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) return fail("VALIDATION_ERROR", { field: "text" });
      done = await addLeadNote(params.id, claims.sub, text);
      break;
    }
    case "not_relevant":
      done = await markLeadNotRelevant(params.id, claims.sub);
      break;
    default:
      return fail("VALIDATION_ERROR", { field: "action" });
  }

  if (!done) return fail("NOT_FOUND");
  return ok({ updated: true });
}
