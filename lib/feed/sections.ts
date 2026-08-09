import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getFeed, notInterested, boostedCount,
  type FeedCard, type FeedFilter, type FeedSort,
} from "./service";
import { feedScope, type FeedScope } from "./scope";
import { searchBrokers } from "@/lib/search/service";
import { latestBlogCards, publishedBlogCount } from "@/lib/blog/service";
import type { BlogCard } from "@/lib/blog/service";
import type { BrokerResult } from "@/lib/search/types";

/**
 * The P2 home feed as RAILS (5 Aug 2026 — Rajan), REORDERED 8 Aug 2026 to the
 * seven blocks Rajan specified after reviewing housing.com and five other
 * portals:
 *
 *   1. HomzList top picks      — live projects
 *   2. Newly-added properties  — the freshest listings
 *   3. Featured Developers     — builders with live projects
 *   4. Featured Brokers        — brokers with live listings
 *   5. Featured properties     — everything BOOSTED, properties and projects
 *   6. Have a property to sell?— the post-a-listing block
 *   7. News and Articles       — the blog
 *
 * What that replaced: one rail per property type (Flat, Shop, Plot…) and per
 * orphan scheme type. Those are gone from the home screen on Rajan's call —
 * type-wise browsing lives on Search, and every rail here still links into it.
 * `getFeedSectionItems` still ANSWERS `type:`/`ptype:` keys, because a PWA
 * running a cached bundle can still ask for one; it just is not offered.
 *
 * Three rules the design has to keep, and where each one lives:
 *
 *   • AUTO-HIDE — a rail with nothing live in the viewer's scope is never
 *     returned, so the client has nothing to render and cannot draw an empty
 *     heading. Decided HERE, from real counts.
 *
 *   • NO LIMIT — every rail paginates horizontally through
 *     `getFeedSectionItems`, using the same cursor the vertical feed used.
 *
 *   • EVERY LABEL AND COUNT IS A QUERY — subtitles carry a real count and the
 *     real place name. Nothing on this screen is a made-up number
 *     (CLAUDE.md rule 12).
 *
 * The rails do NOT re-implement the feed query. `getFeed` gained a narrowing
 * (only/typeCode/projectTypes/onlyBoosted) so a rail is the same query, the same
 * ranking and the same card builder — otherwise a boosted listing would be
 * boosted in the feed and un-boosted inside its own rail.
 */

const db = () => createServiceClient();

export type FeedSectionKind =
  | "projects"
  | "newly_added"
  | "builders"
  | "brokers"
  | "featured"
  | "sell_cta"
  | "news";

export interface FeedSectionMeta {
  /** Stable id the item endpoint decodes — "projects", "featured", "news"… */
  key: string;
  kind: FeedSectionKind;
  /** "HomzList top picks", "Featured Developers", "News and Articles". */
  title: string;
  /** Real count + real place — "12 live projects in Rajkot". */
  subtitle: string;
  total: number;
  /** Where "View all" goes; pre-filtered to exactly what the rail shows. */
  viewAll: string;
}

/**
 * What `/feed/sections` answers: the rails, plus whether this feed had to leave
 * the viewer's city to find them.
 *
 * `emptyCity` is not a second copy of the scope — it is the ONE fact the screen
 * needs from it. The rails above are all-India when it is set, and the notice
 * the client draws from it is what stops that being a silent swap (Rajan, 9 Aug
 * 2026: "tya kevanu che, your city have no listing").
 */
export interface FeedSectionsView {
  sections: FeedSectionMeta[];
  emptyCity: { cityName: string } | null;
}

export interface FeedSectionPage {
  items: FeedCard[];
  /** Builder/broker rails carry people instead of cards. */
  people: BrokerResult[];
  /** The News rail carries blog cards instead of either. */
  posts: BlogCard[];
  nextCursor: string | null;
}

/** Cards per horizontal page. Small: a rail is browsed, not read top to bottom. */
const RAIL_PAGE = 8;
/**
 * How many sellers to rank before taking a page. "Top" has to mean top of the
 * CITY, and the count that ranks them (live listings/projects) is computed
 * after the profile rows are fetched — so ranking a 20-row slice would have
 * meant "top of an arbitrary twenty".
 */
const PEOPLE_SCAN = 200;
const PEOPLE_PAGE = 12;
/** Posts per page on the News rail. */
const POST_PAGE = 6;

interface CountRow { scope: string; code: string; n: number }

async function typeCounts(scope: FeedScope, viewerId: string | null, filter: FeedFilter) {
  // The counts have to be taken over exactly what the rails will fetch, or a
  // rail gets announced from a count of 0 and renders nothing. A widened
  // request passes NEITHER a city nor a state: the RPC's `else true` branch
  // (0127) is the all-India count, which is what `applyFeedScope` now queries.
  const { data, error } = await db().rpc("hz_feed_type_counts", {
    p_city: scope.widened ? null : scope.cityId,
    p_state: null,
    p_viewer: viewerId, p_filter: filter,
  });
  if (error) throw error;
  const property = new Map<string, number>();
  const project = new Map<string, number>();
  for (const r of ((data ?? []) as CountRow[])) {
    (r.scope === "project" ? project : property).set(r.code, Number(r.n));
  }
  return { property, project };
}

/**
 * "12 available in Rajkot" / "12 available" when the viewer has no city set.
 *
 * The place name comes from the SCOPE, not from the viewer's city: a widened
 * request is showing cards from every city in the country, so `placeLabel` is
 * null there and the count stands on its own — naming Rajkot over Mumbai
 * inventory would be the label lying about the rows beneath it.
 */
function inPlace(text: string, place: string | null): string {
  return place ? `${text} in ${place}` : text;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The rails to draw, in order, for THIS viewer right now.
 *
 * A rail that would be empty is simply absent — including the two seller rails
 * and News, so a fresh install with no blog posts does not render a heading over
 * nothing. "Have a property to sell?" is the one block that is always present:
 * it is a call to action, not a list, so it has no empty state to hit.
 */
export async function getFeedSections(
  viewerId: string | null,
  opts: {
    filter?: FeedFilter; cityId?: string | null;
    /**
     * A scope already resolved by the caller. The server-rendered first paint
     * (lib/feed/initial) needs the rails AND the first rail's cards in one
     * response, and resolving the scope twice meant four extra round trips on
     * the critical path for an answer that cannot differ.
     */
    scope?: FeedScope;
  } = {},
): Promise<FeedSectionsView> {
  const filter = opts.filter ?? "all";
  const scope = opts.scope ?? (await feedScope(viewerId, opts.cityId ?? null));
  const city = scope.placeLabel;

  // Everything this needs, at once. Each of these feeds exactly one rail's
  // heading, and none of them reads another's output, so they belong in the
  // same wave rather than in stages the user watches a skeleton through.
  const [counts, hidden, builders, brokers, boosted, newsTotal] = await Promise.all([
    typeCounts(scope, viewerId, filter),
    notInterested(viewerId),
    // Sellers are ranked over the whole city and only then counted, so a rail
    // that would show nobody is never announced.
    topPeople(viewerId, scope, "builder"),
    topPeople(viewerId, scope, "broker"),
    // The same boosted set the Featured rail hands out — see service.boostedCount.
    boostedCount(viewerId, scope, filter),
    publishedBlogCount(),
  ]);

  // "Not interested in this type" removes those listings from the feed, so the
  // counts printed above the rails have to drop them too — otherwise Newly-added
  // advertises rows it will never show.
  //
  // And a boost bought for a whole state (or All India) puts a row from another
  // city ON these rails, which `hz_feed_type_counts` never counted, so those are
  // added back. Both halves exist for the same reason: the number under the
  // heading has to be the number of cards the rail will hand out.
  let propertyTotal = boosted.propertiesOutside;
  for (const [code, n] of counts.property) if (!hidden.types.has(code)) propertyTotal += n;
  const projectTotal = [...counts.project.values()].reduce((a, b) => a + b, 0) + boosted.projectsOutside;

  const out: FeedSectionMeta[] = [];

  // 1. HomzList top picks — every live scheme, boosted then newest.
  if (projectTotal > 0) {
    out.push({
      key: "projects",
      kind: "projects",
      title: "HomzList top picks",
      subtitle: inPlace(plural(projectTotal, "live project", "live projects"), city),
      total: projectTotal,
      viewAll: searchHref({ tab: "projects" }),
    });
  }

  // 2. Newly-added properties — listings only, freshest first (boosts still ride
  //    on top: that rule is the feed's, not this rail's).
  if (propertyTotal > 0) {
    out.push({
      key: "newly_added",
      kind: "newly_added",
      title: "Newly-added properties",
      subtitle: inPlace(plural(propertyTotal, "property", "properties"), city),
      total: propertyTotal,
      viewAll: searchHref({ intent: filter === "buy" ? "sell" : filter === "rent" ? "rent" : undefined }),
    });
  }

  // 3 + 4. The two seller rails.
  if (builders.length) {
    out.push({
      key: "builders",
      kind: "builders",
      title: "Featured Developers",
      subtitle: inPlace(`${plural(builders.length, "builder", "builders")} with live projects`, city),
      total: builders.length,
      viewAll: searchHref({ tab: "brokers", roles: ["builder"] }),
    });
  }
  if (brokers.length) {
    out.push({
      key: "brokers",
      kind: "brokers",
      title: "Featured Brokers",
      subtitle: inPlace(`${plural(brokers.length, "broker", "brokers")} with live listings`, city),
      total: brokers.length,
      viewAll: searchHref({ tab: "brokers", roles: ["broker"] }),
    });
  }

  // 5. Featured properties — everything boosted, BOTH kinds, in FIFO boost order.
  if (boosted.total > 0) {
    out.push({
      key: "featured",
      kind: "featured",
      title: "Featured properties",
      // The subtitle names both halves in the order the rail returns them, so a
      // rail carrying two projects never says "2 properties".
      subtitle: inPlace(
        [
          boosted.properties ? plural(boosted.properties, "property", "properties") : null,
          boosted.projects ? plural(boosted.projects, "project", "projects") : null,
        ].filter(Boolean).join(" · ") + " promoted",
        city,
      ),
      total: boosted.total,
      // NO "View all", deliberately. Every other rail's View all opens a search
      // that contains exactly what the rail was showing; "boosted" is not a
      // search filter, so this one would have opened 150 results under a heading
      // that says 12 — a link that lies. The rail scrolls endlessly through all
      // of them instead, and the empty string is what hides the pill.
      viewAll: "",
    });
  }

  // 6. Have a property to sell? — always present. Not a list, so no empty state.
  out.push({
    key: "sell_cta",
    kind: "sell_cta",
    title: "Have a property to sell?",
    subtitle: inPlace("Post it free and reach buyers", city),
    total: 0,
    viewAll: "/create",
  });

  // 7. News and Articles.
  if (newsTotal > 0) {
    out.push({
      key: "news",
      kind: "news",
      title: "News and Articles",
      subtitle: plural(newsTotal, "article", "articles"),
      total: newsTotal,
      viewAll: "/blog",
    });
  }

  return {
    sections: out,
    // The screen says in words what the scope did silently: this viewer picked a
    // city we have nothing live in, so every rail above is all-India.
    emptyCity: scope.widened && scope.cityName ? { cityName: scope.cityName } : null,
  };
}

/** An empty page — one shape, so no caller has to remember the third field. */
const EMPTY_PAGE: FeedSectionPage = { items: [], people: [], posts: [], nextCursor: null };

/**
 * One rail's page.
 *
 * `cursor` means the same thing it means everywhere else in the feed: the
 * `live_at` of the last card handed out (people rails use a numeric offset,
 * because profiles are ranked by a computed count, not by time; the News rail
 * uses `published_at`, the same cursor /blog pages on).
 */
export async function getFeedSectionItems(
  viewerId: string | null,
  key: string,
  opts: {
    filter?: FeedFilter; sort?: FeedSort; cursor?: string | null; limit?: number;
    cityId?: string | null; scope?: FeedScope;
  } = {},
): Promise<FeedSectionPage> {
  const filter = opts.filter ?? "all";
  const sort = opts.sort ?? "latest";
  const cursor = opts.cursor ?? null;
  const limit = Math.min(opts.limit ?? RAIL_PAGE, 20);

  // The blog is not scoped to a city and needs no session — answer it before
  // paying for a scope resolution it would ignore.
  if (key === "news") {
    const { posts, nextCursor } = await latestBlogCards({ limit: POST_PAGE, cursor });
    return { items: [], people: [], posts, nextCursor };
  }
  // The CTA block has no page. It is answered rather than rejected so a client
  // that asks anyway gets a clean empty rail instead of a validation error.
  if (key === "sell_cta") return EMPTY_PAGE;

  const scope = opts.scope ?? (await feedScope(viewerId, opts.cityId ?? null));

  if (key === "builders" || key === "brokers") {
    // Sellers follow the same widening: a state-wide rail of cards over an empty
    // "Featured Brokers" strip would be the one rail contradicting the rest.
    const all = await topPeople(viewerId, scope, key === "builders" ? "builder" : "broker");
    const offset = Number.isFinite(Number(cursor)) && Number(cursor) > 0 ? Number(cursor) : 0;
    const page = all.slice(offset, offset + PEOPLE_PAGE);
    const next = offset + PEOPLE_PAGE < all.length ? String(offset + PEOPLE_PAGE) : null;
    return { items: [], people: page, posts: [], nextCursor: next };
  }

  if (key === "projects") {
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, only: "project", scope });
    return { items: r.items, people: [], posts: [], nextCursor: r.nextCursor };
  }

  if (key === "newly_added") {
    // Listings only — the projects have their own rail directly above. Boosted
    // still come first: that is getFeed's rule and this rail does not opt out.
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, only: "property", scope });
    return { items: r.items, people: [], posts: [], nextCursor: r.nextCursor };
  }

  if (key === "featured") {
    // BOTH kinds, boosted only, in the boost's own FIFO order.
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, onlyBoosted: true, scope });
    return { items: r.items, people: [], posts: [], nextCursor: r.nextCursor };
  }

  // ---- compatibility: the per-type rails this screen no longer offers -------
  // A PWA holding a cached bundle from before 8 Aug 2026 still asks for these.
  // Answering them keeps that client working until it picks up the new build;
  // nothing in the current UI produces these keys.
  if (key.startsWith("type:")) {
    const code = key.slice(5);
    const { data } = await db().from("project_types").select("code").eq("is_active", true).contains("property_type_codes", [code]);
    const projectTypes = ((data ?? []) as { code: string }[]).map((r) => r.code);
    const r = await getFeed(viewerId, {
      filter, sort, cursor, limit,
      typeCode: code, projectTypes, groupOrder: "project-first", scope,
    });
    return { items: r.items, people: [], posts: [], nextCursor: r.nextCursor };
  }

  if (key.startsWith("ptype:")) {
    const code = key.slice(6);
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, only: "project", projectTypes: [code], scope });
    return { items: r.items, people: [], posts: [], nextCursor: r.nextCursor };
  }

  return EMPTY_PAGE;
}

/**
 * "Featured" = the sellers with the most live inventory in the viewer's city.
 *
 * Deliberately the SAME query the Brokers & Builders search tab runs
 * (`searchBrokers`), narrowed to one role — so the rail and the screen its
 * "View all" opens can never disagree about who is featured, and the rule lives
 * in one place. That helper already excludes suspended accounts and anyone with
 * nothing live, counts projects for a builder and listings for a broker, and
 * sorts by that count.
 */
async function topPeople(viewerId: string | null, scope: FeedScope, role: "builder" | "broker"): Promise<BrokerResult[]> {
  // `total` from that helper is the number who QUALIFY; `items` is the ranked
  // list. Asking for PEOPLE_SCAN of them means the rail can page through the
  // whole city without a second round trip per page.
  //
  // A widened request passes NO location at all, so the people rails are scoped
  // exactly like the card rails beside them — all India, not one state.
  const { items } = await searchBrokers(
    scope.widened ? { roles: [role] } : { cityId: scope.cityId ?? undefined, roles: [role] },
    viewerId,
    PEOPLE_SCAN,
  );
  return items;
}

/** A results URL that reproduces the rail. Query built here so it stays server-owned. */
function searchHref(f: { tab?: string; types?: string[]; ptypes?: string[]; roles?: string[]; intent?: "sell" | "rent" }): string {
  const p = new URLSearchParams();
  if (f.tab) p.set("tab", f.tab);
  if (f.types?.length) p.set("types", f.types.join(","));
  if (f.ptypes?.length) p.set("ptypes", f.ptypes.join(","));
  if (f.roles?.length) p.set("roles", f.roles.join(","));
  if (f.intent) p.set("intent", f.intent);
  const qs = p.toString();
  return qs ? `/search/results?${qs}` : "/search/results";
}
