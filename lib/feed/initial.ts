import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeedSections, getFeedSectionItems } from "./sections";
import { feedScope } from "./scope";
import { GUEST_CITY_COOKIE, parseGuestCity } from "./guest-city-shared";
import type { FeedInitial } from "./client";

/**
 * The home feed, rendered WITH the page (8 Aug 2026 — Rajan: "feed display is
 * far too slow, the first impression is lost").
 *
 * What it was: the page shipped an empty shell, the browser downloaded and ran
 * the bundle, THEN asked `/feed/sections` which rails exist, and only then could
 * each rail ask `/feed/section` for its cards. Measured on the dev server,
 * nothing was requested until 1.2s after navigation and the first card landed
 * near 3.5s — three serial waits (HTML → bundle → sections → cards) before a
 * single property was on screen.
 *
 * What it is now: the server already knows the answer to the first two of those
 * questions, so it answers them in the same response as the HTML. The client
 * renders the rails it was handed, and the first rail's cards are in the markup.
 * Everything after that first paint is untouched — every other rail still lazy
 * loads on scroll, every chip/sort/city change still goes to the API, and the
 * endpoints are unchanged for the PWA and for a client-side navigation.
 *
 * Nothing viewer-private is primed. Only what a guest could read anonymously
 * goes into the HTML (public cards, public counts) — identity still comes from
 * `/profile/me` on the client, so a cached page can never carry someone's
 * session state.
 */

/** The scope the prime was built under, so the client can tell whether it fits. */
export async function getFeedInitial(): Promise<FeedInitial | null> {
  try {
    const claims = await getCurrentUser();
    const viewerId = claims?.sub ?? null;

    // A builder gets the dashboard, not the rails — priming the feed for them
    // would be work whose output is never mounted.
    if (claims?.role === "builder") return null;

    // The guest's city-chip pick. It rides a cookie ALONGSIDE the localStorage
    // copy for exactly this: the server has to scope the first paint to the same
    // city the client is about to ask for, or the primed rails would be the
    // wrong city's rails and would be thrown away on hydration. A signed-in
    // viewer's profile city still wins (lib/location/viewer-city).
    const guestCity = parseGuestCity((await cookies()).get(GUEST_CITY_COOKIE)?.value ?? null);
    const cityId = guestCity.cityId;

    // ONE scope for the whole prime — the rails and the first rail's cards
    // cannot disagree about which city they are showing.
    const scope = await feedScope(viewerId, cityId);

    const sections = await getFeedSections(viewerId, { filter: "all", cityId, scope });

    // The first rail that actually FETCHES. "Have a property to sell?" is a
    // block, not a list, so priming it would ship an empty page under a key the
    // rail component never asks for — and would waste the prime on a screen
    // whose real first rail then still had to load itself.
    const first = sections.find((s) => s.kind !== "sell_cta") ?? null;
    const page = first
      ? await getFeedSectionItems(viewerId, first.key, { filter: "all", sort: "latest", scope })
      : null;

    return {
      filter: "all",
      cityId,
      viewer: viewerId !== null,
      sections,
      primed: first && page ? { key: first.key, page } : null,
    };
  } catch (err) {
    // A prime is an optimisation, never a dependency: if it throws, the page
    // renders exactly as it did before and the client fetches for itself.
    console.error("[feed/initial] prime failed", err);
    return null;
  }
}
