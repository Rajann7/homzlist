import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getActivity } from "@/lib/activity/service";

/**
 * GET /api/v1/activity (Doc7 §58) — the Your-activity aggregation: recently
 * viewed, inquiries sent, and the Saved/Proposals/Visits/Saved-search counts.
 * Own activity only.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getActivity(claims.sub));
}
