import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeedSections, getFeedSectionItems } from "./sections";
import { feedScope } from "./scope";
import { getStories } from "./stories";
import { getLegalIndex } from "@/lib/legal/service";
import { GUEST_CITY_COOKIE, parseGuestCity } from "./guest-city-shared";
import type { FeedInitial } from "./client";

/**
 * The home feed, rendered WITH the page (8 Aug 2026 — Rajan: "feed display is
 * far too slow, the first impression is lost").
 *
 * What it was: the page shipped an empty shell, the browser downloaded and ran
 * the bundle, THEN asked `/feed/sections` which rails exist, and only then could
 * each rail ask `/feed/section` for its cards. Three serial waits (HTML →
 * bundle → sections → cards) before a single property was on screen.
 *
 * What it is now (9 Aug 2026 — Rajan: "home page lazy load che ae remove karo,
 * aakho home page also including story"): the ENTIRE screen is resolved here and
 * ships in the HTML — the story row, every rail's first page, the empty-city
 * notice and the footer's links. Nothing on the home screen waits for a second
 * round trip, and `SectionRail` no longer carries an IntersectionObserver.
 *
 * The rails are resolved in ONE `Promise.all`, so the wall-clock cost is the
 * slowest rail rather than the sum of them; each is the same query the endpoint
 * would have run. The endpoints all still exist and still work — a Buy/Rent
 * chip, a city switch, a sort and the PWA's own navigations go through them
 * exactly as before. This is the first paint, not a replacement for them.
 *
 * Nothing viewer-private is primed beyond what this viewer's own session would
 * fetch anyway: the cards are the same ones `/feed/section` would return for
 * them, and identity still comes from `/profile/me` on the client, so the markup
 * carries no session state of its own.
 */

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

    // ONE scope for the whole prime — the rails, the story row and the cards
    // cannot disagree about which city they are showing.
    const scope = await feedScope(viewerId, cityId);

    // The rails have to be known before their pages can be fetched; the story
    // row and the footer do not depend on them, so they ride alongside.
    const [{ sections, emptyCity }, stories, legal] = await Promise.all([
      getFeedSections(viewerId, { filter: "all", cityId, scope }),
      getStories(viewerId, cityId),
      getLegalIndex(),
    ]);

    // Every rail that actually fetches, at once. "Have a property to sell?" is a
    // block, not a list, so it has no page to prime.
    const fetchable = sections.filter((s) => s.kind !== "sell_cta");
    const pages = await Promise.all(
      fetchable.map((s) =>
        getFeedSectionItems(viewerId, s.key, { filter: "all", sort: "latest", scope })
          // One rail failing must not cost the whole prime: that rail falls back
          // to fetching itself, exactly as it did before this change.
          .then((page) => ({ key: s.key, page }))
          .catch(() => null),
      ),
    );

    return {
      filter: "all",
      cityId,
      viewer: viewerId !== null,
      sections,
      emptyCity,
      primed: pages.filter((p): p is NonNullable<typeof p> => p !== null),
      stories,
      footer: { legal: legal.map((p) => ({ slug: p.slug, title: p.title })) },
    };
  } catch (err) {
    // A prime is an optimisation, never a dependency: if it throws, the page
    // renders exactly as it did before and the client fetches for itself.
    console.error("[feed/initial] prime failed", err);
    return null;
  }
}
