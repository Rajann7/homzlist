import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { requestNumber, numberResponse } from "@/lib/chat/thread";

/**
 * POST /api/v1/chat/threads/:id/number (Doc7 §98-99) — the sealed number flow.
 *   { action: "request" }              → buyer asks for the poster's number
 *   { action: "respond", allow: bool } → poster Allow/Deny (confirm dialog)
 * Deny → re-request is UNLIMITED (no cooldown, no auto-block); the number is
 * NEVER revealed except by an explicit Allow. Throttled only to stop flooding.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`chat-number:${auth.id}`, 30, 60); // anti-flood only
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  if (body.action === "request") {
    const res = await requestNumber(params.id, auth.id);
    if (!res.ok) return res.reason === "not_found" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR", { reason: res.reason });
    return ok({ requested: true });
  }
  if (body.action === "respond") {
    const res = await numberResponse(params.id, auth.id, body.allow === true);
    if (!res.ok) return res.reason === "not_found" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR", { reason: res.reason });
    return ok({ allowed: body.allow === true });
  }
  return fail("VALIDATION_ERROR", { field: "action" });
}
