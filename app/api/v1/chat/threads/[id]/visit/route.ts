import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { proposeVisit } from "@/lib/chat/thread";

/** POST /api/v1/chat/threads/:id/visit (Doc7 §100) — propose a site-visit slot. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-visit:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const res = await proposeVisit(params.id, auth.id, typeof body.scheduledAt === "string" ? body.scheduledAt : "");
  if (!res.ok) return res.reason === "not_found" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR", { reason: res.reason });
  return ok({ proposed: true });
}
