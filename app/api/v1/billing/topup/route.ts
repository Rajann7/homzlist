import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalog, getActivePlans, expirePlans } from "@/lib/billing/service";
import { planCardDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/topup (Doc7 §37) — the top-up sheet's data: the add-on on
 * sale right now and the user's CURRENT pooled proposal balance.
 *
 * The balance is read fresh from the server every time the sheet opens; it is
 * never carried in client state, because it decides whether a proposal may be
 * sent (Doc7 §11 — entitlement is server-owned).
 *
 * Purchase itself goes through POST /billing/checkout with this plan code, so
 * there is exactly one price-computing path (Doc9 §12).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  await expirePlans(claims.sub);
  const [addOns, plans] = await Promise.all([getCatalog(null, "topup"), getActivePlans(claims.sub)]);

  const active = plans.filter((p) => p.status === "active" && (!p.expires_at || new Date(p.expires_at) > new Date()));
  const balance = active.reduce((n, p) => (p.proposal_quota < 0 ? n : n + (p.proposal_quota - p.proposal_used)), 0);
  const quota = active.reduce((n, p) => (p.proposal_quota < 0 ? n : n + p.proposal_quota), 0);

  // Which pool the new proposals join decides the expiry copy in the sheet.
  const monthlyPool = active.length > 0 && active.every((p) => p.terms.proposals_expire_with_plan);

  return ok({
    addOn: addOns[0] ? planCardDTO(addOns[0]) : null,
    balance,
    balancePct: quota ? Math.round((balance / quota) * 100) : 0,
    hasActivePlan: active.length > 0,
    expiryNote: monthlyPool ? "Expire with your monthly plan" : "Never expire while your account is active",
  });
}
