import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { markSeen } from "@/lib/feed/stories";

/**
 * POST /api/v1/stories/:id/seen (Doc7 §85) — mark a segment seen for this
 * (viewer, city). Seen is stored PER CITY. No view-count is ever exposed to the
 * poster (Doc2 §9.3). A guest has nowhere to store seen-state → no-op success.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
 const claims = await getCurrentUser();
 if (!claims) return ok({ ok: true }); // guests can't persist seen-state

 const profile = await getProfileById(claims.sub);
 if (profile?.city_id) await markSeen(claims.sub, profile.city_id, params.id);
 return ok({ ok: true });
}
