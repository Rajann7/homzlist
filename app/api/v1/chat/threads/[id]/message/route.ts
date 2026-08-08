import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { sendMessage } from "@/lib/chat/thread";
import { flagEnabled } from "@/lib/system/flags";

/**
 * POST /api/v1/chat/threads/:id/message (Doc7 §93) — send text/photo (2000-char
 * cap enforced server-side), optional quoted-reply. Number-pattern + profanity
 * flagged for admin (never blocks the send). Blocked/declined/pre-accept-poster
 * are refused server-side.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`chat-send:${auth.id}`, 120, 60, "chat_message");
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  // A22 Feature flags → Chat photos. Off = photo attachments are dropped (the
  // message still sends as text). Default-on, so nothing changes while enabled.
  const photosOn = await flagEnabled("chat_photos", { userId: auth.id });
  const res = await sendMessage(params.id, auth.id, {
    text: typeof body.text === "string" ? body.text : "",
    photoUrl: photosOn && typeof body.photoUrl === "string" ? body.photoUrl : undefined,
    photoW: photosOn && typeof body.photoW === "number" ? body.photoW : undefined,
    photoH: photosOn && typeof body.photoH === "number" ? body.photoH : undefined,
    replyTo: typeof body.replyTo === "string" ? body.replyTo : null,
  });
  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "blocked") return fail("FORBIDDEN");
    if (res.reason === "empty") return fail("VALIDATION_ERROR");
    return fail("LISTING_STATE_LOCKED"); // closed / not_accepted
  }
  return ok({ message: res.message });
}
