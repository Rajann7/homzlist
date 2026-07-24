import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { listLeads } from "@/lib/listings/leads";

/**
 * GET /api/v1/leads (Doc7 §103) — the broker/builder pipeline. The Owner sees a
 * simplified list; that split (`ownerVariant`) is decided from the profile ROLE
 * server-side, never a client flag. Trust info comes from profiles+verifications.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  const payload = await listLeads(claims.sub, profile.role);
  return ok(payload);
}
