import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { getBlockedUsers, unblockUserById } from "@/lib/chat/service";

/**
 * GET  /api/v1/chat/blocked — users the caller has blocked (S1 ⋯).
 * POST /api/v1/chat/blocked { action: "unblock", userId } — unblock one.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-blocked:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  return ok(await getBlockedUsers(auth.id));
}

export async function POST(req: NextRequest) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-blocked:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (body.action !== "unblock" || typeof body.userId !== "string") return fail("VALIDATION_ERROR");
  const res = await unblockUserById(auth.id, body.userId);
  if (!res.ok) return fail("VALIDATION_ERROR");
  return ok({ unblocked: true });
}
