import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { setListingStatus, NOT_OWNED, type StatusAction } from "@/lib/listings/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { myListingDTO } from "@/lib/listings/dto";
import { getProfileById } from "@/lib/profile/service";
import { canPostListing } from "@/lib/listings/capabilities";

/**
 * POST /api/v1/listings/:id/status (Doc7 §53) — the status state machine
 * (Doc2 §5.4). Marking sold/rented/completed archives the listing AND stops any
 * running boost with no refund for unused days — that consequence is applied
 * server-side so it can't be skipped by calling the endpoint directly.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: StatusAction[] = ["sold", "rented", "completed", "reactivate", "restore", "hide", "unhide"];

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Status thrash (hide/unhide, sold/reactivate) churns the boosts table — cap it.
  const limited = await rateLimit(`listing-status:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action as StatusAction;
  if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });

  // Migration 0067 hid every Builder listing. The three actions that end in a
  // publicly visible listing again are refused for that role — otherwise the
  // takedown would be one "Unhide" tap away. sold/rented/completed/hide stay
  // open: they move the listing further off the surface, not back onto it.
  if (action === "unhide" || action === "reactivate" || action === "restore") {
    const profile = await getProfileById(claims.sub);
    if (!canPostListing(profile?.role ?? null)) return fail("FORBIDDEN");
  }

  const listing = await setListingStatus(params.id, claims.sub, action);
  // Someone else's listing is NOT FOUND — answering "state locked" here would
  // confirm the id is real (Doc9 §7). An illegal transition on your OWN listing
  // is a genuine 400.
  if (listing === NOT_OWNED) return fail("NOT_FOUND");
  if (!listing) return fail("LISTING_STATE_LOCKED");

  return ok({ listing: myListingDTO(listing) });
}
