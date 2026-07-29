import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { browseRequirements } from "@/lib/listings/matching";
import { proposalBalance, builderMayPropose } from "@/lib/listings/proposals";
import { requirementUnlockPlan } from "@/lib/billing/service";
import { requirementUnlockDTO } from "@/lib/billing/dto";
import { getProfileById } from "@/lib/profile/service";

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

  // A builder proposes only through a LIVE project (0087). Sent so the card
  // renders the reason instead of a Send button the POST is going to refuse.
  const canPropose = claims ? await builderMayPropose(claims.sub) : true;

  // WHICH plan this viewer's role can actually buy to unlock these cards. The
  // wall hardcoded p2999, which a builder is refused at checkout (0087) — so
  // every Unlock button on a builder's screen ended at "That plan isn't
  // available for your account". A guest sees the owner/broker plan, which is
  // what they'll be offered once they sign up.
  const role = claims ? (await getProfileById(claims.sub))?.role ?? null : "owner";
  const unlockPlan = unlocked ? null : requirementUnlockDTO(await requirementUnlockPlan(role as never));

  return ok({ sections, unlocked, cityName, balance, canPropose, unlockPlan });
}
