import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { listLeadGroups } from "@/lib/leads/service";

/**
 * GET /api/v1/leads — the Received tab: the viewer's own listings, projects and
 * requirements, each with its live lead count. One aggregate query, not one per
 * subject (see lead_subject_counts).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  return ok(await listLeadGroups(claims.sub));
}
