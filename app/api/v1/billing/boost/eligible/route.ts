import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalog, getSettings, listEligibleListings } from "@/lib/billing/service";
import { formatShortRupees } from "@/lib/billing/money";
import { getProfileById } from "@/lib/profile/service";

/**
 * GET /api/v1/billing/boost/eligible (Doc7 §38) — the boost purchase screen's
 * data: which listings may be boosted, the current admin rates, and the reach
 * estimates per targeting scope.
 *
 * Ineligible listings are returned WITH a lock label (the design shows them
 * dimmed) but the server refuses to boost them at checkout regardless — the
 * dimming is presentation, the refusal is the control (Doc2 §13).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  const [listings, rates, settings] = await Promise.all([
    listEligibleListings(claims.sub),
    getCatalog(profile.role, "boost"),
    getSettings(),
  ]);

  const STATUS_LOCK: Record<string, string> = { pending_review: "Under review", hidden: "Hidden", archived: "Archived" };
  const AVAIL_LOCK: Record<string, string> = { sold: "Sold", rented: "Rented", completed: "Completed" };

  return ok({
    listings: listings.map((l: any) => {
      // Live AND still available — a sold listing can't be boosted (Doc2 §13).
      const eligible = l.status === "live" && l.availability === "available";
      return {
        id: l.id,
        title: l.title,
        areaLabel: l.area_label,
        price: formatShortRupees(l.price_paise ?? 0),
        coverUrl: l.cover_url ?? null,
        eligible,
        lockLabel: eligible ? null : (AVAIL_LOCK[l.availability] ?? STATUS_LOCK[l.status] ?? "Not eligible"),
      };
    }),
    durations: rates.map((r) => ({
      code: r.code,
      label: (r.period_days ?? 7) >= 30 ? "1 Month" : `${r.period_days} Days`,
      price: `₹${(r.price_paise / 100).toLocaleString("en-IN")}`,
      pricePaise: r.price_paise,
      perDay: `≈ ₹${Math.round(r.price_paise / 100 / (r.period_days ?? 7))}/day`,
      bestValue: (r.period_days ?? 7) >= 30,
    })),
    targets: [
      { key: "area", reach: (settings.boost_reach as any)?.area ?? "" },
      { key: "city", reach: (settings.boost_reach as any)?.city ?? "" },
      { key: "state", reach: (settings.boost_reach as any)?.state ?? "" },
      { key: "india", reach: (settings.boost_reach as any)?.india ?? "" },
    ],
  });
}
