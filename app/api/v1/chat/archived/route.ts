import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { getArchivedThreads } from "@/lib/chat/service";

/** GET /api/v1/chat/archived — all of the caller's archived threads (S1 ⋯). */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-archived:${auth.id}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const data = await getArchivedThreads(auth.id);
  return ok(data);
}
