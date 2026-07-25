import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { markAllRead } from "@/lib/chat/thread";

/** POST /api/v1/chat/read-all — the ⋯ → "Mark all as read" action (Doc4 §34). */
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-readall:${auth.id}`, 30, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  await markAllRead(auth.id);
  return ok({ read: true });
}
