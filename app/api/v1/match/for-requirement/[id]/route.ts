import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";
import { matchListingsForRequirement } from "@/lib/listings/matching";
import type { RequirementRow } from "@/lib/listings/requirements";

/**
 * GET /api/v1/match/for-requirement/:id (Doc7 §76) — reverse-match: live
 * listings that satisfy a requirement, tiered exact → adjacent → city. Used by
 * the My-Requirements "matching strip". Only the requirement's OWNER may ask
 * (it's their strip); another user's id returns 404.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function priceLabel(paise: number | null): string {
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(r)}`;
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const db = createServiceClient();
  const { data } = await db.from("requirements").select("*").eq("id", params.id).eq("profile_id", claims.sub).maybeSingle();
  const req = (data as RequirementRow) ?? null;
  if (!req) return fail("NOT_FOUND");

  const matches = await matchListingsForRequirement(req);
  return ok({
    items: matches.map((m) => ({
      id: m.id, title: m.title, priceLabel: priceLabel(m.pricePaise),
      areaLabel: m.areaLabel, coverUrl: m.coverUrl, bhk: m.bhk, tier: m.tier, tierLabel: m.tierLabel,
    })),
  });
}
