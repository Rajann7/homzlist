import { ok, fail } from "@/lib/api";
import { requireActive } from "@/lib/chat/guard";
import { getRequests } from "@/lib/chat/service";

/**
 * GET /api/v1/chat/requests (Doc7 §88) — the poster's incoming requests,
 * preview-before-accept, split Verified / Others. Proposal variant carries the
 * sender's number AUTO (Doc2 §8.1); inquiry variant carries only the trust strip.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  return ok(await getRequests(auth.id));
}
