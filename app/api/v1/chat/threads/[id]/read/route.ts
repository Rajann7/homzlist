import { ok, fail } from "@/lib/api";
import { requireActive, UUID_RE } from "@/lib/chat/guard";
import { markRead } from "@/lib/chat/thread";

/** POST /api/v1/chat/threads/:id/read (Doc7 §94) — advance my seen cursor. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const res = await markRead(params.id, auth.id);
  if (!res.ok) return fail("NOT_FOUND");
  return ok({ read: true });
}
