import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { getThread } from "@/lib/chat/thread";

/**
 * GET /api/v1/chat/threads/:id (Doc7 §92) — messages (50/page, up-scroll cursor
 * `?before=<iso>`), pinned card (live price), computed state. The poster's
 * number is present ONLY when allowed (getThread seals it) — DevTools-proof.
 * A non-participant id matches nothing → 404 (no existence leak, Doc9 §10).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`chat-thread:${auth.id}`, 300, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  const view = await getThread(params.id, auth.id, { before });
  if (!view) return fail("NOT_FOUND");
  return ok(view);
}
