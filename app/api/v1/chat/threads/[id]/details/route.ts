import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { chatDetails } from "@/lib/chat/thread";

/** GET /api/v1/chat/threads/:id/details (S4) — participant, shared media, state. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-details:${auth.id}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const data = await chatDetails(params.id, auth.id);
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}
