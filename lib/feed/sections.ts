import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getFeed, notInterested,
  type FeedCard, type FeedFilter, type FeedSort,
} from "./service";
import { feedScope, type FeedScope } from "./scope";
import { searchBrokers } from "@/lib/search/service";
import type { BrokerResult } from "@/lib/search/types";

/**
 * The P2 home feed as RAILS (5 Aug 2026 — Rajan).
 *
 * The feed used to be one endless vertical column of mixed cards. It is now a
 * vertical stack of horizontal carousels: projects first, then one rail per
 * property type and per scheme type, with Top Builders and Top Brokers in the
 * middle. Nothing about a CARD changed — the same FeedCard/ProjectCard, the
 * same server-decided ranking, the same boosts, the same actions.
 *
 * Three rules the design has to keep, and where each one lives:
 *
 *   • AUTO-HIDE — a type with nothing live in the viewer's city produces no
 *     rail at all. That decision is made HERE, from `hz_feed_type_counts`
 *     (migration 0122): a section with total 0 is never returned, so the client
 *     has nothing to render and cannot draw an empty heading.
 *
 *   • NO LIMIT — every rail paginates horizontally through
 *     `getFeedSectionItems`, using the same cursor the vertical feed used.
 *
 *   • EVERY LABEL AND COUNT IS A QUERY — titles come from `property_types` /
 *     `project_types`, subtitles carry a real count and the real city name.
 *     Nothing on this screen is a string in a component (CLAUDE.md rule 12).
 *
 * The rails do NOT re-implement the feed query. `getFeed` gained a narrowing
 * (only/typeCode/projectType) so a rail is the same query, the same ranking and
 * the same card builder — otherwise a boosted listing would be boosted in the
 * feed and un-boosted inside its own type's rail.
 */

const db = () => createServiceClient();

export type FeedSectionKind = "projects" | "builders" | "brokers" | "property_type" | "project_type";

export interface FeedSectionMeta {
  /** Stable id the item endpoint decodes: "projects" | "builders" | "brokers" | "type:flat" | "ptype:plotting". */
  key: string;
  kind: FeedSectionKind;
  /** DB label — "Flat", "Plotting scheme (NA plots)", "Top Builders". */
  title: string;
  /** Real count + real city — "12 available in Rajkot". */
  subtitle: string;
  total: number;
  /** Where "View all" goes; pre-filtered to exactly what the rail shows. */
  viewAll: string;
}

export interface FeedSectionPage {
  items: FeedCard[];
  /** Builder/broker rails carry people instead of cards. */
  people: BrokerResult[];
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

interface CountRow { scope: string; code: string; n: number }

async function typeCounts(scope: FeedScope, viewerId: string | null, filter: FeedFilter) {
  // EITHER city OR state, never both (migration 0127) — the widened case has to
  // count what the widened rails will actually fetch, or a rail would be
  // announced from a count of 0 and render nothing.
  const { data, error } = await db().rpc("hz_feed_type_counts", {
    p_city: scope.widened ? null : scope.cityId,
    p_state: scope.widened ? scope.stateId : null,
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
 * The place name comes from the SCOPE, not from the viewer's city: a request
 * that widened to the state is showing state-wide cards, so "in Mumbai" over
 * Rajkot inventory would be the label lying about the rows beneath it.
 */
function inPlace(text: string, place: string | null): string {
  return place ? `${text} in ${place}` : text;
}

/**
 * The rails to draw, in order, for THIS viewer right now.
 *
 * Order (Rajan, 5 Aug 2026): projects first; the seller rails sit in the middle
 * — after the first two property rails, not glued to the top — then the rest of
 * the property types, then the scheme types.
 */
export async function getFeedSections(
  viewerId: string | null,
  opts: { filter?: FeedFilter; cityId?: string | null } = {},
): Promise<FeedSectionMeta[]> {
  const filter = opts.filter ?? "all";
  const scope = await feedScope(viewerId, opts.cityId ?? null);
  const cityId = scope.cityId;
  const city = scope.placeLabel;

  const [counts, hidden, { data: propTypes }, { data: projTypes }] = await Promise.all([
    typeCounts(scope, viewerId, filter),
    notInterested(viewerId),
    db().from("property_types").select("code,label,sort_order").eq("is_active", true).order("sort_order"),
    db().from("project_types").select("code,label,sort_order,property_type_codes").eq("is_active", true).order("sort_order"),
  ]);

  // Sellers are ranked over the whole city and only then counted, so a rail
  // that would show nobody is never announced.
  const [builders, brokers] = await Promise.all([
    topPeople(viewerId, scope, "builder"),
    topPeople(viewerId, scope, "broker"),
  ]);

  // Which scheme types ride on which property-type rail — a DB column
  // (`project_types.property_type_codes`, migration 0123), never a map in code.
  const schemeTypes = (projTypes ?? []) as { code: string; label: string; property_type_codes: string[] | null }[];
  const schemesFor = (propertyCode: string) =>
    schemeTypes.filter((t) => (t.property_type_codes ?? []).includes(propertyCode)).map((t) => t.code);

  const propertyRails: FeedSectionMeta[] = ((propTypes ?? []) as { code: string; label: string }[])
    // "Not interested in this type" hides the whole rail, not just its cards —
    // the feed already drops those listings, so the rail would render a heading
    // over an empty strip.
    .filter((t) => !hidden.types.has(t.code))
    .map((t) => {
      const schemes = schemesFor(t.code);
      const props = counts.property.get(t.code) ?? 0;
      const projs = schemes.reduce((sum, code) => sum + (counts.project.get(code) ?? 0), 0);
      return { t, schemes, props, projs };
    })
    // One rail per type, carrying BOTH kinds. It exists if EITHER half has
    // something live — a type with only schemes and no resale still gets a rail.
    .filter(({ props, projs }) => props + projs > 0)
    .map(({ t, schemes, props, projs }) => ({
      key: `type:${t.code}`,
      kind: "property_type" as const,
      title: t.label,
      // The subtitle says what is actually in the rail, in the order it appears.
      subtitle: inPlace(
        [projs ? `${projs} ${projs === 1 ? "project" : "projects"}` : null,
         props ? `${props} ${props === 1 ? "property" : "properties"}` : null]
          .filter(Boolean).join(" · "),
        city,
      ),
      total: props + projs,
      viewAll: searchHref({
        types: [t.code],
        // Both halves travel, so the results screen's Projects tab is filtered
        // to the same schemes the rail was showing.
        ptypes: schemes,
        intent: filter === "buy" ? "sell" : filter === "rent" ? "rent" : undefined,
      }),
    }));

  // A scheme type that belongs under NO property type (Mixed use) would
  // otherwise be reachable only from "New Projects" — it keeps its own rail.
  const projectRails: FeedSectionMeta[] = schemeTypes
    .filter((t) => !(t.property_type_codes ?? []).length)
    .map((t) => ({ t, n: counts.project.get(t.code) ?? 0 }))
    .filter(({ n }) => n > 0)
    .map(({ t, n }) => ({
      key: `ptype:${t.code}`,
      kind: "project_type" as const,
      title: t.label,
      subtitle: inPlace(`${n} ${n === 1 ? "project" : "projects"}`, city),
      total: n,
      viewAll: searchHref({ tab: "projects", ptypes: [t.code] }),
    }));

  const projectTotal = [...counts.project.values()].reduce((a, b) => a + b, 0);

  const out: FeedSectionMeta[] = [];

  // 1. Projects, first — every live scheme, newest (and boosted) first.
  if (projectTotal > 0) {
    out.push({
      key: "projects",
      kind: "projects",
      title: "New Projects",
      subtitle: inPlace(`${projectTotal} live ${projectTotal === 1 ? "project" : "projects"}`, city),
      total: projectTotal,
      viewAll: searchHref({ tab: "projects" }),
    });
  }

  // 2. The first two property rails, then the sellers, then the rest.
  out.push(...propertyRails.slice(0, 2));

  if (builders.length) {
    out.push({
      key: "builders",
      kind: "builders",
      title: "Top Builders",
      subtitle: inPlace(`${builders.length} ${builders.length === 1 ? "builder" : "builders"} with live projects`, city),
      total: builders.length,
      viewAll: searchHref({ tab: "brokers", roles: ["builder"] }),
    });
  }
  if (brokers.length) {
    out.push({
      key: "brokers",
      kind: "brokers",
      title: "Top Brokers",
      subtitle: inPlace(`${brokers.length} ${brokers.length === 1 ? "broker" : "brokers"} with live listings`, city),
      total: brokers.length,
      viewAll: searchHref({ tab: "brokers", roles: ["broker"] }),
    });
  }

  out.push(...propertyRails.slice(2));
  out.push(...projectRails);
  return out;
}

/**
 * One rail's page.
 *
 * `cursor` means the same thing it means everywhere else in the feed: the
 * `live_at` of the last card handed out (people rails use a numeric offset,
 * because profiles are ranked by a computed count, not by time).
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

  const scope = opts.scope ?? (await feedScope(viewerId, opts.cityId ?? null));

  if (key === "builders" || key === "brokers") {
    // Sellers follow the same widening: a state-wide rail of cards over an empty
    // "Top Brokers" strip would be the one rail contradicting the rest.
    const all = await topPeople(viewerId, scope, key === "builders" ? "builder" : "broker");
    const offset = Number.isFinite(Number(cursor)) && Number(cursor) > 0 ? Number(cursor) : 0;
    const page = all.slice(offset, offset + PEOPLE_PAGE);
    const next = offset + PEOPLE_PAGE < all.length ? String(offset + PEOPLE_PAGE) : null;
    return { items: [], people: page, nextCursor: next };
  }

  if (key === "projects") {
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, only: "project", scope });
    return { items: r.items, people: [], nextCursor: r.nextCursor };
  }

  if (key.startsWith("type:")) {
    // ONE rail, both kinds: boosted first (either kind), then this type's
    // projects, then its properties. Which scheme types belong here is the DB's
    // answer, so the rail and its "View all" can never disagree.
    const code = key.slice(5);
    const { data } = await db().from("project_types").select("code").eq("is_active", true).contains("property_type_codes", [code]);
    const projectTypes = ((data ?? []) as { code: string }[]).map((r) => r.code);
    const r = await getFeed(viewerId, {
      filter, sort, cursor, limit,
      typeCode: code, projectTypes, groupOrder: "project-first", scope,
    });
    return { items: r.items, people: [], nextCursor: r.nextCursor };
  }

  if (key.startsWith("ptype:")) {
    const code = key.slice(6);
    const r = await getFeed(viewerId, { filter, sort, cursor, limit, only: "project", projectTypes: [code], scope });
    return { items: r.items, people: [], nextCursor: r.nextCursor };
  }

  return { items: [], people: [], nextCursor: null };
}

/**
 * "Top" = the sellers with the most live inventory in the viewer's city.
 *
 * Deliberately the SAME query the Brokers & Builders search tab runs
 * (`searchBrokers`), narrowed to one role — so the rail and the screen its
 * "View all" opens can never disagree about who is top, and the rule lives in
 * one place. That helper already excludes suspended accounts and anyone with
 * nothing live, counts projects for a builder and listings for a broker, and
 * sorts by that count.
 */
async function topPeople(viewerId: string | null, scope: FeedScope, role: "builder" | "broker"): Promise<BrokerResult[]> {
  // `total` from that helper is the number who QUALIFY; `items` is the ranked
  // list. Asking for PEOPLE_SCAN of them means the rail can page through the
  // whole city without a second round trip per page.
  //
  // A widened request drops the city filter entirely rather than passing the
  // state: `searchBrokers` ranks by live inventory and takes a cityId only, so
  // un-scoping it and letting the ranking decide is the honest approximation —
  // the sellers it surfaces are the ones whose inventory the rails are already
  // showing. Narrower state support belongs in searchBrokers, not a fork here.
  const { items } = await searchBrokers(
    { cityId: scope.widened ? undefined : scope.cityId ?? undefined, roles: [role] },
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
  return `/search/results?${p.toString()}`;
}
