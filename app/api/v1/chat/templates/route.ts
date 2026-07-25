import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { listTemplates, createTemplate } from "@/lib/chat/thread";

/**
 * GET  /api/v1/chat/templates (Doc7 §107) — default + my quick replies.
 * POST /api/v1/chat/templates — create a template (manage sheet).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-templates:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  return ok({ templates: await listTemplates(auth.id) });
}

export async function POST(req: NextRequest) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-templates:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const res = await createTemplate(auth.id, typeof body.body === "string" ? body.body : "");
  return res.ok ? ok({ id: res.id }) : fail("VALIDATION_ERROR");
}
