import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { submitListing } from "@/lib/listings/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getProfileById } from "@/lib/profile/service";
import { canPostListing } from "@/lib/listings/capabilities";

/**
 * POST /api/v1/listings/:id/submit (Doc4 §27) — "Submit for Review".
 *
 * Separate from creation on purpose: the listing is a draft through the photos
 * and preview steps, so the user isn't told it's under review before they've
 * even added a photo. Re-submitting something already pending/live is refused,
 * which makes a double-tap — or a back-navigation into a stale preview — a
 * no-op rather than a second queue entry.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 const claims = await getCurrentUser();
 if (!claims) return fail("UNAUTHORIZED");
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

 const limited = await rateLimit(`listing-submit:${claims.sub}`, 60, 3600);
 if (!limited.allowed) return fail("RATE_LIMITED");

 // Creation is gated at POST /listings, but a Builder who still holds a DRAFT
 // from before the rule changed would otherwise publish it through here.
 const profile = await getProfileById(claims.sub);
 if (!canPostListing(profile?.role ?? null)) return fail("FORBIDDEN");

 const res = await submitListing(params.id, claims.sub);
 if (res.ok) return ok({ submitted: true });

 if (res.reason === "not_found") return fail("NOT_FOUND");
 if (res.reason === "no_photos") return fail("VALIDATION_ERROR", { field: "photos", message: "Add at least 1 photo" });
 // Quota ran out between opening the form and submitting → the plan wall.
 if (res.reason === "no_slot") return fail("PLAN_REQUIRED");
 // Locked after 3 rejections — appeals are the only way forward (Doc2 §5.4).
 if (res.reason === "locked") return fail("LISTING_STATE_LOCKED", { locked: true });
 // Already submitted — the client treats this as success and moves on.
 return ok({ submitted: false, already: true });
}
