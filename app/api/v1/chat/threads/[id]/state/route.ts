import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { setThreadState, deleteThreadForMe } from "@/lib/chat/thread";

/**
 * PATCH /api/v1/chat/threads/:id/state — pin / mute / archive (swipe + long-press).
 * DELETE — delete chat for me (row survives for the other side + admin evidence).
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-state:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const res = await setThreadState(params.id, auth.id, {
    pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    muted: typeof body.muted === "boolean" ? body.muted : undefined,
    archived: typeof body.archived === "boolean" ? body.archived : undefined,
  });
  return res.ok ? ok({ updated: true }) : fail("NOT_FOUND");
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-state:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const res = await deleteThreadForMe(params.id, auth.id);
  return res.ok ? ok({ deleted: true }) : fail("NOT_FOUND");
}
