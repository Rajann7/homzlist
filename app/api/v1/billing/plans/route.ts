import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { getCatalog, getActivePlans, expirePlans } from "@/lib/billing/service";
import { planCardDTO } from "@/lib/billing/dto";
import { formatPaise } from "@/lib/billing/money";

/**
 * GET /api/v1/billing/plans (Doc7 §27) — role-filtered plans at CURRENT prices.
 *
 * The role filter is applied on the server: a Broker cannot see (or buy) the
 * Builder ₹9,999 plan by tampering with the client (Doc9 §11). Prices come from
 * the admin-editable catalog, so an admin edit reflects immediately.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  await expirePlans(claims.sub);

  const [catalog, mine] = await Promise.all([
    getCatalog(profile.role, "plan"),
    getActivePlans(claims.sub),
  ]);
  const topups = await getCatalog(profile.role, "topup");

  const active = mine.filter((p) => p.status === "active" && (!p.expires_at || new Date(p.expires_at) > new Date()));

  // "Recommended" is a role hint only — it never gates anything.
  const recommended = { owner: "p999", broker: "p2999", builder: "p9999" }[profile.role ?? "owner"];

  return ok({
    role: profile.role,
    recommended,
    plans: catalog.map(planCardDTO),
    addOns: topups.map(planCardDTO),
    activePlan: active.length
      ? {
          // A granted plan carries no price in its snapshot; `formatPaise` on
          // that renders "₹NaN" as the active-plan label (same bug as My Plan).
          name:
            typeof active[0].terms?.price_paise === "number"
              ? formatPaise(active[0].terms.price_paise)
              : active[0].name,
          isTrial: active[0].is_trial,
        }
      : null,
    trial: active.find((p) => p.is_trial)
      ? {
          summary: "Trial from HomzList",
        }
      : null,
  });
}
