import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * WHICH city a viewer's content is anchored to — the one answer the feed, the
 * rails, the stories, Suggested, the new-listings pill and the requirement
 * surfaces all ask for.
 *
 * It exists because the two halves of that question had drifted apart. A
 * SIGNED-IN viewer's city is `profiles.city_id`, which the city chip PATCHes —
 * that half always worked. A GUEST has no profile row to hold one, so their
 * pick was written to `hz_guest_city` in localStorage and then read by nobody:
 * the chip re-rendered its own label and every server query stayed unscoped. A
 * visitor who picked Mumbai was shown Rajkot inventory under a header that said
 * "Mumbai".
 *
 * So the guest's pick now rides the request. Two rules make that safe:
 *
 *   1. It is VALIDATED here — a `locations` row that actually exists and is
 *      actually a city. A forged id, a malformed one, or an AREA id resolves to
 *      null rather than reaching a query.
 *   2. A signed-in profile's city ALWAYS wins. The param is only consulted when
 *      the viewer has no city of their own, so a query string can never
 *      re-scope somebody's account.
 *
 * This is a UI preference, not business data (CLAUDE.md rule 3): it selects
 * WHICH rows are shown, never how many of one is revealed. Every entitlement,
 * price and locked field is still decided server-side from the session.
 */

const db = () => createServiceClient();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveViewerCity(
  viewerId: string | null,
  pickedCityId?: string | null,
): Promise<string | null> {
  if (viewerId) {
    const { data } = await db().from("profiles").select("city_id").eq("id", viewerId).maybeSingle();
    const own = (data as { city_id: string | null } | null)?.city_id ?? null;
    if (own) return own;
  }

  if (!pickedCityId || !UUID_RE.test(pickedCityId)) return null;
  const { data } = await db()
    .from("locations")
    .select("id")
    .eq("id", pickedCityId)
    .eq("level", "city")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** The `?city=` a request carried, if any. One reader so every route agrees. */
export function pickedCityParam(url: URL): string | null {
  return url.searchParams.get("city");
}
