import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { blockUser, unblockUser, reportChat } from "@/lib/chat/thread";

/**
 * POST /api/v1/chat/threads/:id/block (Doc7 §106) — chat moderation:
 *   { action: "block" | "unblock" }                    → block / unblock the other party
 *   { action: "report", reason, note? }                → report the user (feeds P11 queue)
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-block:${auth.id}`, 60, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  if (body.action === "block") { const r = await blockUser(params.id, auth.id); return r.ok ? ok({ blocked: true }) : fail("NOT_FOUND"); }
  if (body.action === "unblock") { const r = await unblockUser(params.id, auth.id); return r.ok ? ok({ blocked: false }) : fail("NOT_FOUND"); }
  if (body.action === "report") {
    const r = await reportChat(auth.id, { threadId: params.id, reason: typeof body.reason === "string" ? body.reason : "", note: typeof body.note === "string" ? body.note : undefined });
    return r.ok ? ok({ reported: true }) : fail("VALIDATION_ERROR");
  }
  return fail("VALIDATION_ERROR", { field: "action" });
}
