import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { reactMessage, deleteMessage, reportChat, loadThreadForParticipant } from "@/lib/chat/thread";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH  /api/v1/chat/messages/:id  (Doc7 §95) — react (toggle emoji).
 * DELETE /api/v1/chat/messages/:id  (Doc7 §96) — { scope: "me" | "everyone" }.
 * POST   /api/v1/chat/messages/:id  (Doc7 §97) — report this message.
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`chat-react:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const res = await reactMessage(params.id, auth.id, typeof body.emoji === "string" ? body.emoji : "");
  return res.ok ? ok({ reactions: res.reactions }) : fail("VALIDATION_ERROR");
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const scope = new URL(req.url).searchParams.get("scope") === "everyone" ? "everyone" : "me";
  const res = await deleteMessage(params.id, auth.id, scope);
  return res.ok ? ok({ deleted: true, scope }) : fail("NOT_FOUND");
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  // Resolve the message's thread so reportChat can ownership-check the reporter.
  const { data } = await createServiceClient().from("chat_messages").select("thread_id").eq("id", params.id).maybeSingle();
  const threadId = (data as { thread_id: string } | null)?.thread_id;
  if (!threadId || !(await loadThreadForParticipant(threadId, auth.id))) return fail("NOT_FOUND");
  const res = await reportChat(auth.id, { threadId, messageId: params.id, reason: typeof body.reason === "string" ? body.reason : "", note: typeof body.note === "string" ? body.note : undefined });
  return res.ok ? ok({ reported: true }) : fail("VALIDATION_ERROR");
}
