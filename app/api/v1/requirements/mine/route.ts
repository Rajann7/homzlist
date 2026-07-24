import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { myRequirements, requirementQuota, REQUIREMENT_DAYS } from "@/lib/listings/requirements";
import { requirementDTO } from "@/lib/listings/dto";
import { requirementProposalStats } from "@/lib/listings/proposals";
import { matchListingsForRequirement } from "@/lib/listings/matching";

/**
 * GET /api/v1/requirements/mine (Doc7 §65) — the poster's own requirements, the
 * quota strip, and for each LIVE requirement the proposals count ("12 · 4 new")
 * and the matching-properties strip. All server-computed — the client never
 * derives a count.
 */
export const dynamic = "force-dynamic";

function priceLabel(paise: number | null): string {
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(r)}`;
}

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const [rows, quota] = await Promise.all([
    myRequirements(claims.sub),
    requirementQuota(claims.sub),
  ]);

  // Enrich only live requirements — the others don't receive proposals or match.
  const items = await Promise.all(
    rows.map(async (r) => {
      const dto = requirementDTO(r);
      if (r.status !== "live") return { ...dto, proposals: { total: 0, newCount: 0 }, matches: [] };
      const [stats, matches] = await Promise.all([
        requirementProposalStats(r.id),
        matchListingsForRequirement(r, 6),
      ]);
      return {
        ...dto,
        proposals: stats,
        matches: matches.map((m) => ({
          id: m.id, title: m.title, priceLabel: priceLabel(m.pricePaise),
          areaLabel: m.areaLabel, bhk: m.bhk, coverUrl: m.coverUrl, tier: m.tier, tierLabel: m.tierLabel,
        })),
      };
    }),
  );

  return ok({
    items,
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
