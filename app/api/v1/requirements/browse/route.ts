import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { browseRequirements } from "@/lib/listings/matching";
import { proposalBalance } from "@/lib/listings/proposals";

/**
 * GET /api/v1/requirements/browse (Doc7 §63) — browse others' requirements.
 *
 * Unpaid viewers get PREVIEW fields only (type/area/intent); the budget and the
 * poster are stripped SERVER-SIDE in `browseRequirements` (they never enter the
 * payload, so a locked card can't be un-blurred in DevTools — Doc9 §17). Paid
 * (₹2,999 Requirement Access) viewers get full cards + cascade sections.
 *
 * Guests may browse the locked preview — that is the paywall's whole point.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const type = url.searchParams.get("type");

  const { sections, unlocked, cityName } = await browseRequirements(claims?.sub ?? null, {
    kind: kind === "sell" || kind === "rent" ? kind : null,
    typeCode: type || null,
  });

  // The proposal-counter strip only makes sense for a signed-in unlocked viewer.
  const balance = claims && unlocked
    ? await proposalBalance(claims.sub)
    : { left: 0, total: 0, unlimited: false };

  return ok({ sections, unlocked, cityName, balance });
}
