import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { continuityAnswer } from "@/lib/chat/thread";

/**
 * POST /api/v1/chat/threads/:id/continuity — the post-number "Did you connect on
 * call?" prompt (Interested / Not interested / Visit fixed) → updates the lead
 * pipeline stage (Doc2 §10.4).
 */
export const dynamic = "force-dynamic";
const OK = new Set(["interested", "not_interested", "visit_fixed"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-continuity:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (typeof body.answer !== "string" || !OK.has(body.answer)) return fail("VALIDATION_ERROR", { field: "answer" });
  const res = await continuityAnswer(params.id, auth.id, body.answer as any);
  return res.ok ? ok({ updated: true }) : fail("NOT_FOUND");
}
