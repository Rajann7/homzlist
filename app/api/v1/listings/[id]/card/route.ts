import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { previewCard } from "@/lib/feed/service";

/**
 * GET /api/v1/listings/:id/card — this listing as the FEED CARD renders it.
 *
 * The Preview screen (P6 S1) promises "this is how your listing appears in the
 * feed". It used to keep its own hand-drawn copy of the card, which stopped
 * being true the moment the card changed — a 4:5 photo, no title, no facts, an
 * action bar that no longer existed. It now renders the same component off this
 * payload, so the promise is structural rather than a claim in a comment.
 *
 * Owner-only, and NOT_FOUND (never FORBIDDEN) for anyone else: a draft is not
 * public, and a different error code would confirm the id exists.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 const claims = await getCurrentUser();
 if (!claims) return fail("UNAUTHORIZED");
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

 const card = await previewCard(params.id, claims.sub);
 if (!card) return fail("NOT_FOUND");
 return ok({ card });
}
