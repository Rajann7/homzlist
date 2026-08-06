import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { dashboardCounts } from "@/lib/dashboard/service";

/**
 * GET /api/v1/dashboard — the counts behind the Dashboard hub tiles.
 *
 * Authorised the same way every other seller endpoint is: a session is
 * required, the profile is read from the DB (not the token) and must be
 * active. There is no id in the path and every count is derived from
 * `claims.sub` alone, so there is nothing here to enumerate or point at
 * somebody else's row — the caller cannot ask for another seller's numbers.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  const counts = await dashboardCounts(claims.sub);
  return ok({ counts });
}
