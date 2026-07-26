import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { timeAgo } from "@/lib/listings/matching";
import type { FeedCard } from "@/lib/feed/service";
import { parseQuery, pgrstSafe, type ParsedQuery } from "./parse";
import { bucketRange } from "./filters";
import type {
  AreaResult, AutocompleteResult, BrokerResult,
  SearchFilters, SearchOptions, SearchSection, SearchSort, SearchTab,
} from "./types";

/**
 * Search (Doc2 §12, Doc7 §108-114).
 *
 * The engine is `hz_search_listings` (migration 0032) — one indexed SQL query
 * that returns ordered ids plus the EXACT total. This layer:
 *   • turns free text into filters (parse.ts),
 *   • runs the location cascade (exact areas → adjacent areas → whole city),
 *   • hydrates ids into the same card shape the feed uses, so search results
 *     and the feed are literally the same component,
 *   • answers the other four tabs (Projects / Brokers & Builders / Areas).
 *
 * Every count on screen is a count from here. Nothing is estimated, and the
 * client never filters — it renders what this returns.
 */

const db = () => createServiceClient();

export interface PropertySearchResult {
  sections: SearchSection<FeedCard>[];
  /** Exact number of EXACT-tier matches — the "142 properties" count line. */
  total: number;
  nextCursor: string | null;
  /** Resolved scope, so the UI can label the landing-suggestion row. */
  scope: {
    cityId: string | null; cityName: string | null; citySlug: string | null;
    areaIds: string[]; areaNames: string[];
    typeCodes: string[]; intent: "sell" | "rent" | null; bhk: string[];
  };
  comingSoonCity: string | null;
}

// ---------------------------------------------------------------------------
// Filter → RPC argument marshalling
// ---------------------------------------------------------------------------

interface RpcArgs {
  p_q: string | null;
  p_intent: string | null;
  p_types: string[] | null;
  p_area_ids: string[] | null;
  p_city_id: string | null;
  p_budget_min_paise: number | null;
  p_budget_max_paise: number | null;
  p_amenities: string[] | null;
  p_attrs: Record<string, string[]>;
  p_attr_ranges: Record<string, { min: number | null; max: number | null }[]>;
  p_attr_flags: Record<string, boolean>;
  p_negotiable: boolean;
  p_ready: boolean;
  p_verified_only: boolean;
  p_exclude_profile: string | null;
}

/**
 * Split the UI's flat `attrs` map into the three shapes SQL needs: exact text
 * values, numeric ranges (bucket labels resolved here — never in the browser),
 * and boolean flags.
 */
async function buildArgs(
  f: SearchFilters,
  parsed: ParsedQuery,
  viewerId: string | null,
): Promise<RpcArgs> {
  const attrs: Record<string, string[]> = {};
  const rangeMap: Record<string, { min: number | null; max: number | null }[]> = {};
  const flags: Record<string, boolean> = {};

  const facetRows = await facetIndex();

  for (const [key, values] of Object.entries(f.attrs ?? {})) {
    if (!values?.length) continue;
    const facet = facetRows.get(key);
    if (!facet) continue; // unknown facet key → ignored, never interpolated

    if (facet.control === "toggle") {
      flags[key] = true;
      continue;
    }
    if (facet.buckets?.length) {
      const resolved: { min: number | null; max: number | null }[] = [];
      for (const label of values) {
        const b = facet.buckets.find((x) => x.label === label);
        if (b) resolved.push({ min: b.min, max: b.max });
      }
      if (resolved.length) rangeMap[key] = resolved;
      continue;
    }
    attrs[key] = values;
  }

  // Free text also contributes BHK — "3 BHK Mavdi" filters, it doesn't just match.
  if (parsed.bhk.length && !attrs.bhk) attrs.bhk = parsed.bhk;

  const types = [...new Set([...(f.types ?? []), ...parsed.typeCodes])];
  const areas = [...new Set([...(f.areas ?? []), ...parsed.areaIds])];

  const toPaise = (rupeeLakh: number | undefined) =>
    rupeeLakh == null ? null : Math.round(rupeeLakh * 100_000 * 100);

  return {
    p_q: parsed.text || null,
    p_intent: f.intent ?? parsed.intent ?? null,
    p_types: types.length ? types : null,
    p_area_ids: areas.length ? areas : null,
    p_city_id: f.cityId ?? parsed.cityId ?? null,
    p_budget_min_paise: toPaise(f.budgetMin) ?? parsed.budgetMinPaise,
    p_budget_max_paise: toPaise(f.budgetMax) ?? parsed.budgetMaxPaise,
    p_amenities: f.amenities?.length ? f.amenities : null,
    p_attrs: attrs,
    p_attr_ranges: rangeMap,
    p_attr_flags: flags,
    p_negotiable: Boolean(f.negotiableOnly),
    p_ready: Boolean(f.readyToMove),
    p_verified_only: Boolean(f.verifiedOnly),
    // Own listings never appear in your own search results (same rule as feed).
    p_exclude_profile: viewerId,
  };
}

interface FacetMeta {
  control: "chips" | "toggle" | "range";
  buckets: { label: string; min: number | null; max: number | null }[] | null;
}
let facetCache: { at: number; map: Map<string, FacetMeta> } | null = null;
async function facetIndex(): Promise<Map<string, FacetMeta>> {
  if (facetCache && Date.now() - facetCache.at < 60_000) return facetCache.map;
  const { data } = await db().from("search_filter_facets").select("field_key,control,buckets").eq("is_active", true);
  const map = new Map<string, FacetMeta>(
    ((data ?? []) as { field_key: string; control: FacetMeta["control"]; buckets: FacetMeta["buckets"] }[])
      .map((r) => [r.field_key, { control: r.control, buckets: r.buckets }]),
  );
  facetCache = { at: Date.now(), map };
  return map;
}

async function runRpc(args: RpcArgs, sort: SearchSort, limit: number, offset: number) {
  const { data, error } = await db().rpc("hz_search_listings", {
    ...args, p_sort: sort, p_limit: limit, p_offset: offset,
  });
  if (error) throw new Error(`search failed: ${error.message}`);
  const rows = ((data ?? []) as { id: string; total_count: number }[]);
  return { ids: rows.map((r) => r.id), total: rows[0]?.total_count ?? 0 };
}

/** Exact count for the filter sheet's live "Show N properties" button. */
export async function countProperties(f: SearchFilters, viewerId: string | null): Promise<number> {
  const parsed = await parseQuery(f.q ?? "", { cityId: f.cityId });
  const args = await buildArgs(f, parsed, viewerId);
  const { data, error } = await db().rpc("hz_search_count", args);
  if (error) throw new Error(`count failed: ${error.message}`);
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------
// Properties tab — with the location cascade
// ---------------------------------------------------------------------------

const PAGE = 10;

export async function searchProperties(
  f: SearchFilters,
  opts: SearchOptions,
  viewerId: string | null,
): Promise<PropertySearchResult> {
  const parsed = await parseQuery(f.q ?? "", { cityId: f.cityId });
  const args = await buildArgs(f, parsed, viewerId);
  const sort = opts.sort ?? "latest";
  const limit = Math.min(opts.limit ?? PAGE, 30);
  const offset = cursorToOffset(opts.cursor);

  // ---- exact tier ----
  const exact = await runRpc(args, sort, limit, offset);
  const sections: SearchSection<FeedCard>[] = [];
  const exactCards = await hydrate(exact.ids, viewerId);
  sections.push({ label: null, items: exactCards });

  /**
   * Cascade (Doc2 §12 "Cascade sections in results"). Only when the exact area
   * ran short AND we are on the first page — appending nearby results under a
   * later page would put them above exact results the user has not seen yet.
   *
   * `location_adjacency` was EMPTY until migration 0030, which is why this
   * cascade (and the feed's, and the matcher's) had never actually produced a
   * section in this app.
   */
  const wantCascade = !opts.noCascade && offset === 0 && exactCards.length < limit && Boolean(args.p_area_ids?.length);
  if (wantCascade) {
    const adjacent = await adjacentAreas(args.p_area_ids!);
    const room = limit - exactCards.length;

    if (adjacent.length && room > 0) {
      const nearby = await runRpc({ ...args, p_area_ids: adjacent.map((a) => a.id) }, sort, room, 0);
      const cards = await hydrate(nearby.ids, viewerId);
      if (cards.length) {
        // Label names the areas the extra results actually came from.
        const names = [...new Set(cards.map((c) => c.areaLabel?.split(",")[0]).filter(Boolean))] as string[];
        sections.push({ label: `Nearby: ${names.slice(0, 2).join(", ") || adjacent[0].name}`, items: cards });
      }
    }

    // Still short → widen to the whole city, excluding what we already showed.
    const shown = sections.reduce((n, s) => n + s.items.length, 0);
    if (shown < limit && args.p_city_id) {
      const seen = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
      const city = await runRpc({ ...args, p_area_ids: null }, sort, limit * 2, 0);
      const fresh = city.ids.filter((id) => !seen.has(id)).slice(0, limit - shown);
      const cards = await hydrate(fresh, viewerId);
      if (cards.length) {
        const cityName = await locationName(args.p_city_id);
        sections.push({ label: `More in ${cityName ?? "this city"}`, items: cards });
      }
    }
  }

  const citySlug = args.p_city_id ? await locationSlug(args.p_city_id) : null;
  const cityName = args.p_city_id ? await locationName(args.p_city_id) : null;
  const areaNames = args.p_area_ids?.length ? await locationNames(args.p_area_ids) : [];

  return {
    sections,
    total: exact.total,
    nextCursor: offset + limit < exact.total ? offsetToCursor(offset + limit) : null,
    scope: {
      cityId: args.p_city_id, cityName, citySlug,
      areaIds: args.p_area_ids ?? [], areaNames,
      typeCodes: args.p_types ?? [], intent: (args.p_intent as "sell" | "rent" | null) ?? null,
      bhk: args.p_attrs.bhk ?? [],
    },
    comingSoonCity: parsed.unknownCity,
  };
}

// Offset cursors: the RPC paginates by offset, so the cursor is just an opaque
// wrapper around it rather than a timestamp (the sort is not always temporal).
function cursorToOffset(cursor?: string | null): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : 0;
}
function offsetToCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

async function adjacentAreas(areaIds: string[]): Promise<{ id: string; name: string }[]> {
  const { data } = await db().from("location_adjacency").select("adjacent_id").in("location_id", areaIds);
  const ids = [...new Set(((data ?? []) as { adjacent_id: string }[]).map((r) => r.adjacent_id))]
    .filter((id) => !areaIds.includes(id));
  if (!ids.length) return [];
  const { data: locs } = await db().from("locations").select("id,name").in("id", ids).eq("is_active", true);
  return ((locs ?? []) as { id: string; name: string }[]);
}

async function locationName(id: string): Promise<string | null> {
  const { data } = await db().from("locations").select("name").eq("id", id).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}
async function locationSlug(id: string): Promise<string | null> {
  const { data } = await db().from("locations").select("slug").eq("id", id).maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}
async function locationNames(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await db().from("locations").select("name").in("id", ids);
  return ((data ?? []) as { name: string }[]).map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Hydration — ids → the SAME card shape the feed renders
// ---------------------------------------------------------------------------

export async function hydrate(ids: string[], viewerId: string | null): Promise<FeedCard[]> {
  if (!ids.length) return [];

  const { data: rows } = await db()
    .from("listings")
    .select("id,profile_id,type_code,kind,title,price_paise,price_on_request,is_negotiable,area_label,area_id,city_id,cover_url,attributes,area_sqft,created_at,live_at")
    .in("id", ids);
  const byId = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.id, r]));
  // Preserve the SQL ordering — `in()` returns rows in arbitrary order, and the
  // ranking (boosted first, then sort) is the whole point of the query.
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  const posterIds = [...new Set(ordered.map((l) => l.profile_id))];
  const [{ data: profs }, { data: vers }, photos, saved, boosted] = await Promise.all([
    db().from("profiles").select("id,name,username,role,photo_url").in("id", posterIds.length ? posterIds : [NIL]),
    db().from("verifications").select("profile_id").eq("status", "approved").in("level", ["phone", "id", "rera"]).in("profile_id", posterIds.length ? posterIds : [NIL]),
    photosFor(ids),
    savedFor(viewerId, ids),
    boostedSet(ids),
  ]);

  const profMap = new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p]));
  const verified = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  return ordered.map((l) => {
    const p = profMap.get(l.profile_id) ?? {};
    const bhk = l.attributes?.bhk;
    const sqft = l.area_sqft as number | null;
    // Per-sqft is a SALE metric. Dividing a monthly rent by area produced
    // "₹19/sqft" next to a ₹28,000 rent — a number that looks like a price
    // comparison but is a rent-per-sqft-per-month, i.e. meaningless beside the
    // sale listings in the same result list. Rent cards omit it.
    const perSqft = l.kind !== "rent" && l.price_paise && sqft
      ? Math.round((l.price_paise / 100) / sqft)
      : null;
    const meta = [
      bhk ? `${bhk} BHK` : null,
      sqft ? `${sqft.toLocaleString("en-IN")} sqft` : null,
      perSqft ? `₹${perSqft.toLocaleString("en-IN")}/sqft` : null,
    ].filter(Boolean).join(" · ");

    return {
      kind: "property" as const,
      id: l.id,
      promoted: boosted.has(l.id),
      saved: saved.has(l.id),
      coverUrl: l.cover_url,
      photos: photos.get(l.id) ?? (l.cover_url ? [l.cover_url] : []),
      areaLabel: l.area_label,
      poster: {
        id: l.profile_id, name: p.name ?? "HomzList user", username: p.username ?? null,
        role: p.role ?? null, verified: verified.has(l.profile_id), avatarUrl: p.photo_url ?? null,
      },
      postedAgo: timeAgo(l.live_at ?? l.created_at),
      price: l.price_on_request ? "Price on request" : formatShortRupees(l.price_paise) + (l.is_negotiable ? " · Negotiable" : ""),
      saleLabel: l.kind === "rent" ? ("For Rent" as const) : ("For Sale" as const),
      title: l.title ?? undefined,
      meta, listingKind: l.kind, typeCode: l.type_code,
    };
  });
}

const NIL = "00000000-0000-0000-0000-000000000000";

async function photosFor(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const { data } = await db().from("listing_photos").select("listing_id,url,position")
    .in("listing_id", ids).eq("status", "ready").order("position", { ascending: true });
  for (const p of ((data ?? []) as { listing_id: string; url: string | null }[])) {
    if (!p.url) continue;
    const arr = map.get(p.listing_id) ?? [];
    arr.push(p.url);
    map.set(p.listing_id, arr);
  }
  return map;
}
async function savedFor(viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || !ids.length) return new Set();
  const { data } = await db().from("saves").select("listing_id").eq("profile_id", viewerId).in("listing_id", ids);
  return new Set(((data ?? []) as { listing_id: string }[]).map((s) => s.listing_id));
}
async function boostedSet(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const nowIso = new Date().toISOString();
  const { data } = await db().from("boosts").select("listing_id")
    .eq("status", "active").in("listing_id", ids)
    .lte("starts_at", nowIso).or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  return new Set(((data ?? []) as { listing_id: string }[]).map((b) => b.listing_id));
}

// ---------------------------------------------------------------------------
// Projects tab
// ---------------------------------------------------------------------------

export async function searchProjects(f: SearchFilters, viewerId: string | null, limit = 12): Promise<{ items: FeedCard[]; total: number }> {
  const parsed = await parseQuery(f.q ?? "", { cityId: f.cityId });
  const cityId = f.cityId ?? parsed.cityId;
  const areaIds = [...new Set([...(f.areas ?? []), ...parsed.areaIds])];

  let q = db().from("projects")
    .select("id,profile_id,name,build_status,rera_number,rera_exempt,area_label,area_id,city_id,cover_url,created_at,live_at", { count: "exact" })
    .eq("status", "live")
    .order("live_at", { ascending: false })
    .limit(limit);
  if (cityId) q = q.eq("city_id", cityId);
  if (areaIds.length) q = q.in("area_id", areaIds);
  if (viewerId) q = q.neq("profile_id", viewerId);
  if (parsed.text) q = q.ilike("name", `%${parsed.text}%`);

  const { data, count } = await q;
  const rows = ((data ?? []) as any[]);
  if (!rows.length) return { items: [], total: count ?? 0 };

  const posterIds = [...new Set(rows.map((r) => r.profile_id))];
  const [{ data: profs }, { data: vers }, priceFrom] = await Promise.all([
    db().from("profiles").select("id,name,username,role,photo_url").in("id", posterIds),
    db().from("verifications").select("profile_id").eq("status", "approved").in("level", ["phone", "id", "rera"]).in("profile_id", posterIds),
    priceFromFor(rows.map((r) => r.id)),
  ]);
  const profMap = new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p]));
  const verified = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  const items: FeedCard[] = rows.map((r) => {
    const p = profMap.get(r.profile_id) ?? {};
    const pf = priceFrom.get(r.id);
    return {
      kind: "project", id: r.id, promoted: false, saved: false,
      coverUrl: r.cover_url, photos: r.cover_url ? [r.cover_url] : [],
      areaLabel: r.area_label,
      poster: {
        id: r.profile_id, name: p.name ?? "Builder", username: p.username ?? null,
        role: p.role ?? null, verified: verified.has(r.profile_id), avatarUrl: p.photo_url ?? null,
      },
      postedAgo: timeAgo(r.live_at ?? r.created_at),
      title: r.name,
      priceFrom: pf?.from != null ? `${pf.types.slice(0, 2).join("/") || "Units"} from ${formatShortRupees(pf.from)}` : "Price on request",
      buildStatus: r.build_status === "ready" ? "Ready to move" : r.build_status === "under_construction" ? "Under construction" : "Booking open",
      rera: Boolean(r.rera_number) || r.rera_exempt,
    };
  });
  return { items, total: count ?? items.length };
}

async function priceFromFor(projectIds: string[]): Promise<Map<string, { from: number | null; types: string[] }>> {
  const map = new Map<string, { from: number | null; types: string[] }>();
  if (!projectIds.length) return map;
  const { data } = await db().from("project_units").select("project_id,unit_type,price_from_paise").in("project_id", projectIds);
  for (const u of ((data ?? []) as { project_id: string; unit_type: string; price_from_paise: number | null }[])) {
    const cur = map.get(u.project_id) ?? { from: null, types: [] };
    if (u.price_from_paise != null) cur.from = cur.from === null ? u.price_from_paise : Math.min(cur.from, u.price_from_paise);
    if (u.unit_type && !cur.types.includes(u.unit_type)) cur.types.push(u.unit_type);
    map.set(u.project_id, cur);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Brokers & Builders tab
// ---------------------------------------------------------------------------

export async function searchBrokers(f: SearchFilters, viewerId: string | null, limit = 20): Promise<{ items: BrokerResult[]; total: number }> {
  const parsed = await parseQuery(f.q ?? "", { cityId: f.cityId });
  const cityId = f.cityId ?? parsed.cityId;

  let q = db().from("profiles")
    .select("id,name,username,role,photo_url,city_id,response_label", { count: "exact" })
    .in("role", ["broker", "builder", "owner"])
    // Suspended/banned accounts must not surface in search (Doc2 §11 "Suspended
    // → unavailable"), and `state` is where that lives.
    .eq("state", "active")
    .limit(limit);
  if (parsed.text) q = q.ilike("name", `%${parsed.text}%`);
  if (cityId) q = q.eq("city_id", cityId);
  if (viewerId) q = q.neq("id", viewerId);

  const { data, count } = await q;
  const rows = ((data ?? []) as any[]);
  if (!rows.length) return { items: [], total: count ?? 0 };

  const ids = rows.map((r) => r.id);
  const [counts, projCounts, { data: vers }] = await Promise.all([
    listingCountsFor(ids),
    projectCountsFor(ids),
    db().from("verifications").select("profile_id").eq("status", "approved").in("level", ["phone", "id", "rera"]).in("profile_id", ids),
  ]);
  const verified = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  const items: BrokerResult[] = rows.map((r) => {
    const isBuilder = r.role === "builder";
    const n = isBuilder ? (projCounts.get(r.id) ?? 0) : (counts.get(r.id) ?? 0);
    const noun = isBuilder ? "project" : "listing";
    // The response-time half of the design's "24 listings · Usually responds in
    // 2 hours" is only shown when we have MEASURED it. `profiles.response_label`
    // is computed from real chat reply times (Doc2 §11 "response-time chip
    // (auto)"); it is NULL for every account today because nothing computes it
    // yet — so the row honestly shows just the listing count instead of an
    // invented "responds in 2 hours". Tracked in PENDING-INTEGRATIONS.
    const stats = [`${n} ${noun}${n === 1 ? "" : "s"}`, r.response_label].filter(Boolean).join(" · ");
    return {
      id: r.id, name: r.name ?? "HomzList user", username: r.username ?? null,
      role: r.role, verified: verified.has(r.id), avatarUrl: r.photo_url ?? null,
      stats, listingCount: n,
    };
  })
    // A seller with nothing live is not a useful search result.
    .filter((b) => b.listingCount > 0)
    .sort((a, b) => b.listingCount - a.listingCount);

  return { items, total: items.length };
}

async function listingCountsFor(profileIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!profileIds.length) return map;
  const { data } = await db().from("listings").select("profile_id")
    .in("profile_id", profileIds).eq("status", "live").eq("availability", "available");
  for (const r of ((data ?? []) as { profile_id: string }[])) map.set(r.profile_id, (map.get(r.profile_id) ?? 0) + 1);
  return map;
}
async function projectCountsFor(profileIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!profileIds.length) return map;
  const { data } = await db().from("projects").select("profile_id").in("profile_id", profileIds).eq("status", "live");
  for (const r of ((data ?? []) as { profile_id: string }[])) map.set(r.profile_id, (map.get(r.profile_id) ?? 0) + 1);
  return map;
}

// ---------------------------------------------------------------------------
// Areas tab
// ---------------------------------------------------------------------------

export async function searchAreas(f: SearchFilters, limit = 25): Promise<{ items: AreaResult[]; total: number }> {
  const parsed = await parseQuery(f.q ?? "", { cityId: f.cityId });
  const cityId = f.cityId ?? parsed.cityId;

  let q = db().from("locations")
    .select("id,name,slug,parent_id")
    .eq("level", "area").eq("is_active", true)
    .order("name").limit(limit);
  if (cityId) q = q.eq("parent_id", cityId);
  // pgrstSafe: user text goes into a hand-built PostgREST filter expression,
  // where , . ( ) are syntax — see lib/search/parse.ts.
  const areaTerm = pgrstSafe(parsed.text);
  if (areaTerm) q = q.or(`name.ilike.%${areaTerm}%,name_gu.ilike.%${areaTerm}%`);

  const { data } = await q;
  const rows = ((data ?? []) as { id: string; name: string; slug: string; parent_id: string | null }[]);
  if (!rows.length) return { items: [], total: 0 };

  // City labels + per-area stats, both measured.
  const cityIds = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))] as string[];
  const { data: cities } = await db().from("locations").select("id,name,slug").in("id", cityIds.length ? cityIds : [NIL]);
  const cityMap = new Map<string, { name: string; slug: string }>(
    ((cities ?? []) as { id: string; name: string; slug: string }[]).map((c) => [c.id, { name: c.name, slug: c.slug }]),
  );

  const items = await Promise.all(rows.map(async (r) => {
    const s = await areaStats(r.id);
    const city = r.parent_id ? cityMap.get(r.parent_id) : undefined;
    const parts = [
      `${s.listingCount.toLocaleString("en-IN")} propert${s.listingCount === 1 ? "y" : "ies"}`,
      s.avgPerSqft ? `Avg ₹${s.avgPerSqft.toLocaleString("en-IN")}/sqft` : null,
    ].filter(Boolean);
    return {
      id: r.id, name: r.name, slug: r.slug,
      citySlug: city?.slug ?? "", label: city ? `${r.name}, ${city.name}` : r.name,
      stats: parts.join(" · "), listingCount: s.listingCount,
    };
  }));

  // Areas with nothing live are not results — they are dead ends.
  const live = items.filter((a) => a.listingCount > 0).sort((a, b) => b.listingCount - a.listingCount);
  return { items: live, total: live.length };
}

export interface AreaStats {
  listingCount: number;
  avgPerSqft: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  projectCount: number;
}

/** The area page's stats strip — one SQL function, every number measured. */
export async function areaStats(areaId: string, typeCode?: string | null, intent?: string | null): Promise<AreaStats> {
  const { data, error } = await db().rpc("hz_area_stats", {
    p_area_id: areaId, p_type: typeCode ?? null, p_intent: intent ?? null,
  });
  if (error) throw new Error(`area stats failed: ${error.message}`);
  const r = ((data ?? []) as any[])[0] ?? {};
  return {
    listingCount: Number(r.listing_count ?? 0),
    avgPerSqft: r.avg_per_sqft != null ? Number(r.avg_per_sqft) : null,
    minPrice: r.min_price != null ? Number(r.min_price) : null,
    maxPrice: r.max_price != null ? Number(r.max_price) : null,
    projectCount: Number(r.project_count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Autocomplete (Doc7 §108)
// ---------------------------------------------------------------------------

export async function autocomplete(q: string, viewerId: string | null, mode: "property" | "requirement" = "property"): Promise<AutocompleteResult> {
  const term = (q ?? "").trim().slice(0, 60);

  // ---- recents (user-scoped; a guest simply has none) ----
  let recents: AutocompleteResult["recents"] = [];
  if (viewerId) {
    let rq = db().from("search_recents").select("id,query,target_kind,target_slug")
      .eq("profile_id", viewerId).eq("mode", mode)
      .order("created_at", { ascending: false }).limit(term ? 3 : 5);
    if (term) rq = rq.ilike("query", `%${term}%`);
    const { data } = await rq;
    recents = ((data ?? []) as any[]).map((r) => ({
      id: r.id, query: r.query, targetKind: r.target_kind, targetSlug: r.target_slug,
    }));
  }

  // ---- area/city suggestions with real counts ----
  let lq = db().from("locations").select("id,name,slug,level,parent_id,is_launched")
    .in("level", ["area", "city"]).eq("is_active", true).limit(8);
  const safeTerm = pgrstSafe(term);
  if (safeTerm) lq = lq.or(`name.ilike.%${safeTerm}%,name_gu.ilike.%${safeTerm}%`);
  else lq = lq.eq("level", "area");
  const { data: locs } = await lq;
  const locRows = ((locs ?? []) as { id: string; name: string; slug: string; level: string; parent_id: string | null; is_launched: boolean }[]);

  const parentIds = [...new Set(locRows.map((r) => r.parent_id).filter(Boolean))] as string[];
  const { data: parents } = await db().from("locations").select("id,name,slug").in("id", parentIds.length ? parentIds : [NIL]);
  const parentMap = new Map<string, { name: string; slug: string }>(
    ((parents ?? []) as { id: string; name: string; slug: string }[]).map((p) => [p.id, { name: p.name, slug: p.slug }]),
  );

  const suggestions: AutocompleteResult["suggestions"] = [];
  for (const r of locRows) {
    const count = r.level === "area" ? (await areaStats(r.id)).listingCount : await cityListingCount(r.id);
    // A suggestion that leads to nothing is a dead end — drop it.
    if (count === 0) continue;
    const parent = r.parent_id ? parentMap.get(r.parent_id) : undefined;
    suggestions.push({
      kind: r.level as "area" | "city",
      id: r.id,
      name: r.level === "area" && parent ? `${r.name}, ${parent.name}` : r.name,
      meta: `${count.toLocaleString("en-IN")} propert${count === 1 ? "y" : "ies"}`,
      slug: r.slug,
      citySlug: r.level === "city" ? r.slug : (parent?.slug ?? ""),
    });
    if (suggestions.length >= 4) break;
  }

  // ---- landing pages (the accent-tinted "PAGES" rows) ----
  const pages = await suggestedLandings(locRows.filter((r) => r.level === "area").slice(0, 2), parentMap);

  // ---- unknown / un-launched city ----
  let comingSoonCity: AutocompleteResult["comingSoonCity"] = null;
  if (term.length >= 3) {
    const unlaunched = locRows.find((r) => r.level === "city" && !r.is_launched);
    if (unlaunched) comingSoonCity = { name: unlaunched.name, slug: unlaunched.slug };
    else if (!suggestions.length && !pages.length) {
      // Nothing matched at all — offer the term as an expansion signal rather
      // than a blank dropdown.
      comingSoonCity = { name: term, slug: null };
    }
  }

  return { suggestions, pages, recents, comingSoonCity };
}

async function cityListingCount(cityId: string): Promise<number> {
  const { count } = await db().from("listings").select("id", { count: "exact", head: true })
    .eq("status", "live").eq("availability", "available").eq("city_id", cityId);
  return count ?? 0;
}

/**
 * Landing-page rows in the autocomplete. Each is a REAL page — the same
 * indexability rule the page itself uses (≥3 live listings), so a suggestion
 * can never lead to a noindex stub.
 */
async function suggestedLandings(
  areas: { id: string; name: string; slug: string; parent_id: string | null }[],
  parentMap: Map<string, { name: string; slug: string }>,
): Promise<AutocompleteResult["pages"]> {
  const out: AutocompleteResult["pages"] = [];
  for (const a of areas) {
    const parent = a.parent_id ? parentMap.get(a.parent_id) : undefined;
    if (!parent) continue;
    const { data } = await db().from("listings")
      .select("type_code,kind")
      .eq("status", "live").eq("availability", "available").eq("area_id", a.id);
    const rows = ((data ?? []) as { type_code: string; kind: string }[]);
    const groups = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.type_code}|${r.kind}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const { data: types } = await db().from("property_types").select("code,label");
    const labelOf = new Map<string, string>(((types ?? []) as { code: string; label: string }[]).map((t) => [t.code, t.label]));

    for (const [key, count] of [...groups.entries()].sort((x, y) => y[1] - x[1])) {
      if (count < 3) continue; // the indexability floor (Doc3 §4)
      const [code, kind] = key.split("|");
      const label = labelOf.get(code) ?? code;
      const intentWord = kind === "rent" ? "for Rent" : "for Sale";
      out.push({
        name: `${plural(label)} ${intentWord} in ${a.name} — ${count} listing${count === 1 ? "" : "s"}`,
        href: `/${slugify(plural(label))}-${kind === "rent" ? "for-rent" : "for-sale"}-in-${a.slug}-${parent.slug}`,
        count,
      });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

export function plural(label: string): string {
  if (/\/|s$/.test(label)) return label;          // "PG / Hostel", already plural
  if (/y$/i.test(label)) return label.slice(0, -1) + "ies";
  return `${label}s`;
}
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Popular areas (the P3 "POPULAR AREAS IN RAJKOT" chip row)
// ---------------------------------------------------------------------------

/**
 * Ranked by LIVE INVENTORY, not a hardcoded list. The design's five Rajkot
 * chips are what this returns for Rajkot today; when the data changes, so do
 * the chips.
 */
export async function popularAreas(cityId: string | null, limit = 6): Promise<{ id: string; name: string; slug: string; count: number }[]> {
  let q = db().from("locations").select("id,name,slug").eq("level", "area").eq("is_active", true).limit(40);
  if (cityId) q = q.eq("parent_id", cityId);
  const { data } = await q;
  const rows = ((data ?? []) as { id: string; name: string; slug: string }[]);
  if (!rows.length) return [];

  const { data: counts } = await db().from("listings").select("area_id")
    .eq("status", "live").eq("availability", "available")
    .in("area_id", rows.map((r) => r.id));
  const tally = new Map<string, number>();
  for (const r of ((counts ?? []) as { area_id: string | null }[])) {
    if (r.area_id) tally.set(r.area_id, (tally.get(r.area_id) ?? 0) + 1);
  }

  return rows
    .map((r) => ({ ...r, count: tally.get(r.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Explore grid (P3 S1) — boosted tile is the 2×2
// ---------------------------------------------------------------------------

export interface ExploreTile {
  id: string;
  coverUrl: string | null;
  photoCount: number;
  promoted: boolean;
  price: string;
  sub: string;
  areaLabel: string | null;
}

export async function exploreGrid(cityId: string | null, viewerId: string | null, limit = 12): Promise<ExploreTile[]> {
  let q = db().from("listings")
    .select("id,cover_url,photo_count,price_paise,price_on_request,area_label,attributes,type_code")
    .eq("status", "live").eq("availability", "available")
    .not("cover_url", "is", null)
    .order("live_at", { ascending: false })
    .limit(limit * 2);
  if (cityId) q = q.eq("city_id", cityId);
  if (viewerId) q = q.neq("profile_id", viewerId);
  const { data } = await q;
  const rows = ((data ?? []) as any[]);
  if (!rows.length) return [];

  const boosted = await boostedSet(rows.map((r) => r.id));
  const { data: types } = await db().from("property_types").select("code,label");
  const labelOf = new Map<string, string>(((types ?? []) as { code: string; label: string }[]).map((t) => [t.code, t.label]));

  const tiles: ExploreTile[] = rows.map((l) => ({
    id: l.id,
    coverUrl: l.cover_url,
    photoCount: l.photo_count ?? 0,
    promoted: boosted.has(l.id),
    price: l.price_on_request ? "Price on request" : formatShortRupees(l.price_paise),
    sub: [l.attributes?.bhk ? `${l.attributes.bhk} BHK` : labelOf.get(l.type_code), l.area_label?.split(",")[0]].filter(Boolean).join(" · "),
    areaLabel: l.area_label,
  }));

  // The design's 2×2 hero tile is the PROMOTED one — so a boosted listing is
  // hoisted to position 0 where the big cell is. No boost → no big tile, and
  // the grid is a plain 3-column (never a fake "Promoted" chip on organic).
  const promotedIdx = tiles.findIndex((t) => t.promoted);
  if (promotedIdx > 0) tiles.unshift(...tiles.splice(promotedIdx, 1));
  return tiles.slice(0, limit);
}
