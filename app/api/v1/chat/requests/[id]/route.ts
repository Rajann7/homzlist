import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { acceptRequest, declineRequest } from "@/lib/chat/service";

/**
 * POST /api/v1/chat/requests/:id (Doc7 §89-90) — the poster acts on a request
 * (by thread id): accept → thread opens (seen starts) / decline → 30-day cooldown.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`chat-req-act:${auth.id}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const res = body.action === "accept" ? await acceptRequest(params.id, auth.id)
    : body.action === "decline" ? await declineRequest(params.id, auth.id)
    : null;
  if (res === null) return fail("VALIDATION_ERROR", { field: "action" });
  return res.ok ? ok({ status: body.action === "accept" ? "accepted" : "declined" }) : fail("NOT_FOUND");
}
