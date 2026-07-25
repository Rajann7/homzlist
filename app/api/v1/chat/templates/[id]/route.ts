import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { updateTemplate, deleteTemplate } from "@/lib/chat/thread";

/** PATCH / DELETE /api/v1/chat/templates/:id — edit / delete my own template. */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-template:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const res = await updateTemplate(auth.id, params.id, typeof body.body === "string" ? body.body : "");
  return res.ok ? ok({ updated: true }) : fail("NOT_FOUND");
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-template:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const res = await deleteTemplate(auth.id, params.id);
  return res.ok ? ok({ deleted: true }) : fail("NOT_FOUND");
}
