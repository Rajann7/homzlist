import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { myRequirements, requirementQuota, REQUIREMENT_DAYS } from "@/lib/listings/requirements";
import { requirementDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/requirements/mine (Doc7 §65) — the poster's own requirements plus
 * the quota strip the form shows ("1 requirement post available · 30 days").
 *
 * The quota is computed from active plans server-side, never held in the
 * client, so the strip can't be talked into showing a post the user can't make.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const [rows, quota] = await Promise.all([
    myRequirements(claims.sub),
    requirementQuota(claims.sub),
  ]);

  return ok({
    items: rows.map(requirementDTO),
    quota: {
      left: quota.left,
      unlimited: quota.unlimited,
      validityDays: REQUIREMENT_DAYS,
      label: quota.unlimited
        ? `Unlimited requirement posts · ${REQUIREMENT_DAYS} days validity`
        : `${quota.left} requirement post${quota.left === 1 ? "" : "s"} available · ${REQUIREMENT_DAYS} days validity`,
    },
  });
}
