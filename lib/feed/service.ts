import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { timeAgo, matchRequirementsForProjects, type MatchedRequirementCard } from "@/lib/listings/matching";
import { placementsFor, outOfCityIds, stateIdOfCity, type PlacementSet } from "@/lib/billing/placement";
import { resolveViewerCity } from "@/lib/location/viewer-city";
import { feedScope, applyFeedScope, type FeedScope } from "./scope";
import { getFieldDefinitions, getAreaUnits, type FieldDefinitionRow } from "@/lib/listings/service";

/**
 * The Property-mode feed (Doc7 §78, Doc2 §9.1).
 *
 * Read-only over data that already exists (listings + projects + boosts). The
 * ranking is decided HERE, never in the client:
 *   boosted (FIFO: boost start, then listing date) → recency,
 * scoped to the viewer's city, OWN listings excluded, requirements never mixed
 * in. Cursor pagination. `not_interested` prefs down-rank (here: filter out).
 *
 * A card is either a `property` (listing) or a `project`. Both carry the poster
 * row, the save flag and the promoted flag — all server-computed.
 */

const db = () => createServiceClient();

export type FeedFilter = "buy" | "rent" | "all";
export type FeedSort = "latest" | "nearby" | "price_asc" | "price_desc";

export interface PosterInfo { id: string; name: string; username: string | null; role: string | null; verified: boolean; avatarUrl: string | null; }

export interface FeedCard {
  kind: "property" | "project";
  id: string;
  promoted: boolean;
  saved: boolean;
  /** Posted by the viewer — hides Save, which they may not do on their own. */
  isOwn: boolean;
  coverUrl: string | null;
  photos: string[];
  areaLabel: string | null;
  /** The area's id — what "not interested" stores for a project card. */
  areaId: string | null;
  poster: PosterInfo;
  postedAgo: string;
  // property
  price?: string;
  saleLabel?: "For Sale" | "For Rent";
  meta?: string;               // "3 BHK · 1,450 sqft · ₹5,862/sqft"
  listingKind?: "sell" | "rent";
  typeCode?: string;
  /** property_types.label — the type chip on the photo ("Flat", "Shop"…). */
  typeLabel?: string | null;
  /** The same meta, as separate chips: "3 BHK", "1,450 sqft", "₹5,862/sqft". */
  metaChips?: string[];
  /** Negotiable is its own flag now, not glued onto the price string. */
  negotiable?: boolean;
  // project
  title?: string;
  priceFrom?: string;
  buildStatus?: string;
  buildStatusCode?: string | null;
  rera?: boolean;
  /**
   * The rest of the project card. Every one of these is a real column the
   * updated create screen writes (migrations 0056/0062/0064) and the card had
   * no way to show — it rendered name + "from ₹x" + status and nothing else,
   * so a plotting scheme and a shopping complex looked identical in the feed.
   */
  projectTypeLabel?: string | null;
  /** "₹45L – ₹1.2Cr" across the scheme's units; null when no unit is priced. */
  priceBand?: string | null;
  unitTypes?: string[];
  possessionLabel?: string | null;
  reraExempt?: boolean;
  /** Facts strip — only the ones this scheme actually filled in. */
  facts?: { label: string; value: string }[];
  /** Builder's number (Doc2 §6: always public on a project) for Call/WhatsApp. */
  contactNumber?: string | null;
}

export interface FeedResult {
  items: FeedCard[];
  nextCursor: string | null;
  sections: { label: string | null; items: FeedCard[] }[];
}

/**
 * The viewer's city. `pickedCityId` is the GUEST's city-chip choice — validated
 * server-side, and always beaten by a signed-in profile's own city (see
 * lib/location/viewer-city). Until it was threaded through, the chip changed
 * its own label and nothing else: a guest who picked Mumbai still got Rajkot.
 */
export async function viewerCity(viewerId: string | null, pickedCityId?: string | null): Promise<string | null> {
  return resolveViewerCity(viewerId, pickedCityId ?? null);
}


export async function notInterested(viewerId: string | null): Promise<{ types: Set<string>; areas: Set<string> }> {
  const types = new Set<string>(); const areas = new Set<string>();
  if (!viewerId) return { types, areas };
  const { data } = await db().from("feed_not_interested").select("type_code, area_id").eq("profile_id", viewerId);
  for (const r of (data ?? []) as { type_code: string | null; area_id: string | null }[]) {
    if (r.type_code) types.add(r.type_code);
    if (r.area_id) areas.add(r.area_id);
  }
  return { types, areas };
}

const PAGE = 10;

/**
 * The columns a project card renders. Kept in one place because the same row
 * shape is fetched twice — the city-scoped query and the out-of-city boost
 * injection — and the two drifting is how a boosted project would render a card
 * missing half its facts.
 */
export const PROJECT_COLS =
  "id,profile_id,name,project_type,build_status,possession_date,towers,floors,total_units,available_units," +
  "attributes,rera_number,rera_exempt,area_label,area_id,city_id,cover_url,created_at,live_at";

/**
 * Narrowing options used by the carousel rails (lib/feed/sections.ts).
 *
 * They exist so a "Flats" rail and the old single feed are the SAME query with
 * the same ranking, boosts, not-interested rules and card builder — a rail that
 * built its own query is how a boosted listing would silently stop being
 * boosted inside one section. Absent → byte-identical behaviour to before.
 */
export interface FeedNarrow {
  /** Restrict the candidate pool to one card kind. */
  only?: "property" | "project";
  /** `listings.type_code` — one property-type rail. */
  typeCode?: string;
  /** `projects.project_type` — the scheme types that belong on this rail. */
  projectTypes?: string[];
  /**
   * A type rail carries BOTH kinds, in one order (Rajan, 5 Aug 2026):
   *   boosted (any kind, FIFO) → projects (recency) → properties (recency).
   * Absent → the mixed feed's original ordering, untouched.
   */
  groupOrder?: "project-first";
}

/**
 * A `project-first` rail cannot page on a bare timestamp: the same cursor would
 * have to mean "more projects" on one page and "more properties" on the next.
 * So the cursor carries which PHASE it is in — `P|<ts>~<id>` while projects are
 * still coming, `L|<ts>~<id>` once they are exhausted and only listings remain.
 * Plain feeds get the same `<ts>~<id>` without the phase. A bare timestamp (an
 * old link, a hand-edited URL) still parses — it just loses the tiebreaker.
 */
function parsePhaseCursor(cursor: string | null): { phase: "P" | "L" | null; ts: string | null; id: string | null; boostOffset: number } {
  if (!cursor) return { phase: null, ts: null, id: null, boostOffset: 0 };
  const m = /^([PL])\|(.+)$/.exec(cursor);
  let rest = m ? m[2] : cursor;
  // `@<n>` — how many boosted subjects have already been handed out. Boosts
  // paginate by FIFO rank, the rest by timestamp; one cursor carries both.
  let boostOffset = 0;
  const at = rest.lastIndexOf("@");
  if (at !== -1) {
    const n = Number(rest.slice(at + 1));
    if (Number.isInteger(n) && n >= 0) { boostOffset = n; rest = rest.slice(0, at); }
  }
  const sep = rest.lastIndexOf("~");
  return {
    phase: m ? (m[1] as "P" | "L") : null,
    ts: sep === -1 ? rest : rest.slice(0, sep),
    id: sep === -1 ? null : rest.slice(sep + 1),
    boostOffset,
  };
}

/** A cursor that means "no constraint — continue from the newest". */
const NO_CONSTRAINT = "9999-12-31T23:59:59.999Z";

/**
 * Keyset pagination on (live_at, id).
 *
 * `live_at < cursor` alone loses rows: seeded and bulk-published inventory
 * shares timestamps to the millisecond, and every tie sitting on a page
 * boundary was silently skipped — the Tenement and Shop rails each came up one
 * listing short of the count printed above them. The id is the tiebreaker, so a
 * page boundary can land in the middle of a tie without dropping anything.
 */
function applyKeyset<T extends { or: (f: string) => T; lt: (c: string, v: string) => T }>(
  q: T, ts: string | null, id: string | null,
): T {
  if (!ts || ts === NO_CONSTRAINT) return q;
  if (!id) return q.lt("live_at", ts);
  return q.or(`live_at.lt."${ts}",and(live_at.eq."${ts}",id.lt."${id}")`);
}

export async function getFeed(
  viewerId: string | null,
  opts: {
    filter?: FeedFilter; sort?: FeedSort; cursor?: string | null; limit?: number;
    /** Guest's city-chip pick; ignored when the viewer's profile has a city. */
    cityId?: string | null;
    /**
     * An already-resolved scope. The rails call this function once per rail, and
     * resolving the scope costs three reads — so `getFeedSections` resolves it
     * once for the whole request and hands the same one down.
     */
    scope?: FeedScope;
  } & FeedNarrow,
): Promise<FeedResult> {
  const filter = opts.filter ?? "all";
  const sort = opts.sort ?? "latest";
  const limit = Math.min(opts.limit ?? PAGE, 30);
  const cursor = opts.cursor ?? null;
  const only = opts.only ?? null;
  const grouped = opts.groupOrder === "project-first";
  // A rail's cursor carries its phase; every other caller's is a bare timestamp.
  const { phase, ts: cursorTs, id: cursorId, boostOffset } = parsePhaseCursor(cursor);

  const scope = opts.scope ?? (await feedScope(viewerId, opts.cityId ?? null));
  const cityId = scope.cityId;
  const hidden = await notInterested(viewerId);

  // Which boosts target THIS viewer (Doc2 §13 targeting), FIFO by boost start.
  // Resolved once per request and reused for ranking, for the out-of-city
  // injection below, and for the Promoted flag on the card.
  //
  // Anchored to the viewer's REAL city even when the result set widened: a boost
  // buys reach to where the viewer is, and widening is about what we can show
  // them, not about who paid to reach them.
  const placements = await placementsFor(
    { cityId, stateId: scope.stateId },
    ["listing", "project"],
  );

  // ---- listing candidates ----
  // Recency = `live_at` (when it entered the feed), NOT `created_at` (when the
  // draft row was made). Listings are drafted, moderated, then published, so the
  // two can be days apart — ordering and "2d ago" by created_at made the feed
  // lie about how new a listing was. Cursor pagination keys off the same column
  // so pages stay consistent with the order.
  let lq = db()
    .from("listings")
    .select("id,profile_id,type_code,kind,title,price_paise,price_on_request,is_negotiable,area_label,area_id,city_id,cover_url,attributes,area_sqft,created_at,live_at")
    .eq("status", "live")
    .eq("availability", "available")
    .order("live_at", { ascending: false })
    // The tiebreaker the keyset cursor pages on — without it, rows sharing a
    // live_at come back in an arbitrary order and the cursor cannot be exact.
    .order("id", { ascending: false })
    .limit(60);
  // City-scoped, or state-scoped when the viewer's city is empty and the
  // request widened (Doc4 §9 "new-city empty (+nearby auto)"). One helper so the
  // listing half, the project half and the rail counts can never disagree.
  lq = applyFeedScope(lq, scope);
  if (viewerId) lq = lq.neq("profile_id", viewerId);
  if (filter === "buy") lq = lq.eq("kind", "sell");
  if (filter === "rent") lq = lq.eq("kind", "rent");
  if (opts.typeCode) lq = lq.eq("type_code", opts.typeCode);
  // In phase "P" the rail is still handing out projects, so no listing has been
  // shown yet — the listing half starts from the newest, not from the cursor.
  if (!grouped || phase !== "P") lq = applyKeyset(lq, cursorTs, cursorId);

  // ---- project candidates (only in the "all" / unfiltered feed) ----
  // A project rail asks for projects explicitly, so it is allowed through the
  // same gate; nothing else changes about when projects appear.
  let projRows: any[] = [];
  // Phase "L" means the projects ran out on an earlier page — don't re-query them.
  // `projectTypes: []` is a real answer, not an absent filter: "this type has no
  // scheme types" (PG / Hostel). Treating an empty array as "no constraint" put
  // every project in the app inside the PG rail.
  const wantProjects = only !== "property"
    && (filter === "all" || only === "project")
    && !(grouped && phase === "L")
    && !(opts.projectTypes !== undefined && opts.projectTypes.length === 0);
  if (wantProjects) {
    let pq = db()
      .from("projects")
      .select(PROJECT_COLS)
      .eq("status", "live")
      .order("live_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20);
    pq = applyFeedScope(pq, scope);
    if (viewerId) pq = pq.neq("profile_id", viewerId);
    if (opts.projectTypes?.length) pq = pq.in("project_type", opts.projectTypes);
    if (!grouped || phase === "P") pq = applyKeyset(pq, cursorTs, cursorId);
    // "Not interested in this area" was applied to listings and silently
    // skipped for projects, so a hidden area kept posting project cards.
    projRows = (((await pq).data ?? []) as any[]).filter((p) => !(p.area_id && hidden.areas.has(p.area_id)));
  }

  // A project-only rail must not pay for a listings query it will discard.
  const { data: lData } = only === "project" ? { data: [] as any[] } : await lq;
  let listings = ((lData ?? []) as any[]).filter(
    (l) => !hidden.types.has(l.type_code) && !(l.area_id && hidden.areas.has(l.area_id)),
  );

  const rank = placements.rank;

  // ---- the boosted block, fetched by id on EVERY page ------------------------
  // Boosted rows are a rank-ordered sequence, not part of the recency window
  // the organic queries page through — see fetchBoostedRows. This also covers
  // the state / All-India targeted boosts on subjects outside the viewer's
  // city, which the city-scoped queries above can never produce: without it,
  // wider targeting was money for nothing.
  const boostedRows = await fetchBoostedRows(placements, {
    cityId, viewerId, filter,
    only, typeCode: opts.typeCode ?? null, projectTypes: opts.projectTypes ?? null,
    wantProjects,
  });
  const boostedIds = new Set([...boostedRows.listings, ...boostedRows.projects].map((r) => r.id));
  // Keep the two sequences disjoint: a boosted row must be ranked by rank, not
  // caught a second time by the recency window it also happens to fall inside.
  // The same not-interested rules apply to a boosted row as to any other.
  listings = [
    ...boostedRows.listings.filter((l) => !hidden.types.has(l.type_code) && !(l.area_id && hidden.areas.has(l.area_id))),
    ...listings.filter((l) => !boostedIds.has(l.id)),
  ];
  projRows = [
    ...boostedRows.projects.filter((p) => !(p.area_id && hidden.areas.has(p.area_id))),
    ...projRows.filter((p) => !boostedIds.has(p.id)),
  ];

  // Merge listings + projects into one candidate list with a common sort key.
  type Cand = { row: any; kind: "property" | "project"; ts: string; boost: number | null; price: number };
  const cands: Cand[] = [
    ...listings.map((l) => ({ row: l, kind: "property" as const, ts: l.live_at ?? l.created_at, boost: rank.has(l.id) ? rank.get(l.id)! : null, price: l.price_paise ?? Number.MAX_SAFE_INTEGER })),
    // Projects are boostable too (Doc2 §13) — they used to be hard-coded to
    // `boost: null`, so a boosted project could never reach the top slot.
    ...projRows.map((p) => ({ row: p, kind: "project" as const, ts: p.live_at ?? p.created_at, boost: rank.has(p.id) ? rank.get(p.id)! : null, price: Number.MAX_SAFE_INTEGER })),
  ];

  // ---- boosted rows paginate by RANK, organic rows by timestamp -------------
  //
  // These are two different sequences and they cannot share one cursor. A boost
  // jumps the queue regardless of how old the row is, so a boosted card sitting
  // at the top of page 1 also satisfies `live_at < cursor` and came back on
  // page 2 — the same card twice, ten times over a full walk of the feed.
  //
  // So the cursor carries how many boosted subjects have already been handed
  // out (`@<n>`), and the boosted block is sliced by that offset in FIFO order.
  // Nothing repeats, and a boost that did not fit on page 1 still gets its turn
  // on page 2 instead of being dropped — it was paid for.
  const boosted = cands.filter((c) => c.boost !== null).sort((a, b) => (a.boost ?? 0) - (b.boost ?? 0));
  const organic = cands.filter((c) => c.boost === null);

  organic.sort((a, b) => {
    // A type rail is one carousel of both kinds: after the boosted cards come
    // the PROJECTS, then the properties. Only rails ask for this.
    if (grouped && a.kind !== b.kind) return a.kind === "project" ? -1 : 1;
    if (sort === "price_asc") return a.price - b.price;
    if (sort === "price_desc") return b.price - a.price;
    return b.ts.localeCompare(a.ts); // latest / nearby fallback → recency
  });

  const boostSlice = boosted.slice(boostOffset);
  const paged = [...boostSlice, ...organic];

  const page = paged.slice(0, limit);
  // The cursor is the OLDEST timestamp handed out, not the last one in render
  // order — with boosts on top, the last card can be newer than one above it,
  // and a "last card" cursor would have skipped everything in between.
  //
  // On a rail it also carries the phase. The page ends in projects → there are
  // (or may be) more projects, so stay in "P" and measure only the projects
  // handed out. The page ends in a listing → the projects are exhausted, so
  // switch to "L" and measure the listings.
  // How many boosted subjects this page consumed — the next page resumes the
  // rank sequence from there.
  const nextBoostOffset = boostOffset + page.filter((c) => c.boost !== null).length;
  let nextCursor: string | null = null;
  if (page.length === limit) {
    // BOOSTED rows are excluded from the measurement. A boost is served out of
    // date order, so an old boosted card sets a cursor far in the past and every
    // row between it and the page's real tail is skipped — the Shop rail lost a
    // listing exactly this way. Later pages drop the boosted ids anyway
    // (`boostedShown`), so nothing repeats by leaving them out here.
    // A page that is ALL boost has no timestamp to give: the sentinel means "no
    // constraint — continue from the newest".
    const oldestOrganic = (cs: Cand[]) => {
      const organic = cs.filter((c) => c.boost === null);
      if (!organic.length) return NO_CONSTRAINT;
      const last = organic.reduce((min, c) => (c.ts < min.ts || (c.ts === min.ts && c.row.id < min.row.id) ? c : min), organic[0]);
      return `${last.ts}~${last.row.id}`;
    };
    // A page that hands out no organic row of the relevant kind must not move
    // the timestamp — it carries the one it came in with, so nothing is skipped.
    const carried = cursorTs ? `${cursorTs}${cursorId ? `~${cursorId}` : ""}` : NO_CONSTRAINT;
    const advance = (cs: Cand[]) => (cs.some((c) => c.boost === null) ? oldestOrganic(cs) : carried);
    if (!grouped) {
      nextCursor = `${advance(page)}@${nextBoostOffset}`;
    } else {
      const stillProjects = page[page.length - 1].kind === "project";
      const kindRows = page.filter((c) => (stillProjects ? c.kind === "project" : c.kind === "property"));
      nextCursor = `${stillProjects ? "P" : "L"}|${advance(kindRows)}@${nextBoostOffset}`;
    }
  }

  // Resolve posters, photos, saved flags in bulk for the page.
  const posterIds = [...new Set(page.map((c) => c.row.profile_id))];
  const listingIds = page.filter((c) => c.kind === "property").map((c) => c.row.id);

  const projectIdsOnPage = page.filter((c) => c.kind === "project").map((c) => c.row.id);

  const [{ data: profs }, { data: vers }, photosByListing, savedSet, unitsByProject, typeLabels, propTypes, fieldDefs, unitLabels] = await Promise.all([
    // Projects publish the builder's number by design (Doc2 §6) — the same rule
    // the project detail runs on. It is selected here so the card's Call and
    // WhatsApp are real actions instead of a button that opens `tel:`.
    db().from("profiles").select("id,name,username,role,photo_url,phone").in("id", posterIds.length ? posterIds : ["00000000-0000-0000-0000-000000000000"]),
    db().from("verifications").select("profile_id").eq("level", "phone").eq("status", "approved").in("profile_id", posterIds.length ? posterIds : ["00000000-0000-0000-0000-000000000000"]),
    photosFor(listingIds),
    savedFor(viewerId, listingIds),
    unitsFor(projectIdsOnPage),
    projectTypeLabels(),
    // The property card's type chip and its facts strip render LABELS, and both
    // masters are already cached loaders — the card never spells an option out.
    propertyTypeLabels(),
    getFieldDefinitions(),
    areaUnitLabelMap(),
  ]);

  const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  const verifiedSet = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  const items = page.map((c) => toCard(c, profMap, verifiedSet, photosByListing, savedSet, unitsByProject, typeLabels, propTypes, fieldDefs, unitLabels, rank, viewerId));

  return { items, nextCursor, sections: [{ label: null, items }] };
}

/**
 * Fetch every boosted listing/project this viewer is entitled to see, BY ID.
 *
 * By id, on every page, because the boosted block paginates by FIFO rank rather
 * than by timestamp: the recency window the organic queries page through can
 * neither be trusted to contain a boosted row (it may be newer than the cursor)
 * nor to exclude one (it may be older). Fetching them separately is what makes
 * "no duplicates, and nothing paid for goes unshown" true at the same time.
 *
 * It also covers what the city-scoped queries can never see — a state- or
 * All-India-targeted boost on a subject outside the viewer's city. Reach is
 * widened here and nowhere else: everything the normal query enforces (live,
 * available, not the viewer's own, the Buy/Rent filter, the rail's type) is
 * re-applied, so a boost can never bypass a feed rule.
 */
async function fetchBoostedRows(
  placements: PlacementSet,
  ctx: {
    cityId: string | null;
    viewerId: string | null;
    filter: FeedFilter;
    /** The rail's narrowing — a boost may widen REACH, never a rail's subject. */
    only: "property" | "project" | null;
    typeCode: string | null;
    projectTypes: string[] | null;
    /** False once a rail has run out of projects — don't re-inject them. */
    wantProjects: boolean;
  },
): Promise<{ listings: any[]; projects: any[] }> {
  const ofKind = (kind: "listing" | "project") =>
    placements.all.filter((p) => p.subjectKind === kind).map((p) => p.subjectId);
  const listingIds = ctx.only === "project" ? [] : ofKind("listing");
  const projectIds = ctx.wantProjects ? ofKind("project") : [];
  if (!listingIds.length && !projectIds.length) return { listings: [], projects: [] };

  // A boosted subject OUTSIDE the viewer's city is only reachable when the buyer
  // paid for state / All-India targeting. In-city ones need no such permission.
  const wide = new Set([...outOfCityIds(placements, "listing"), ...outOfCityIds(placements, "project")]);
  const inScope = (row: { id: string; city_id: string | null }) =>
    !ctx.cityId || row.city_id === ctx.cityId || wide.has(row.id);

  const tasks: Promise<any>[] = [];

  if (listingIds.length) {
    let q = db()
      .from("listings")
      .select("id,profile_id,type_code,kind,title,price_paise,price_on_request,is_negotiable,area_label,area_id,city_id,cover_url,attributes,area_sqft,created_at,live_at")
      .in("id", listingIds)
      .eq("status", "live")
      .eq("availability", "available");
    if (ctx.viewerId) q = q.neq("profile_id", ctx.viewerId);
    if (ctx.filter === "buy") q = q.eq("kind", "sell");
    if (ctx.filter === "rent") q = q.eq("kind", "rent");
    if (ctx.typeCode) q = q.eq("type_code", ctx.typeCode);
    tasks.push(q);
  } else tasks.push(Promise.resolve({ data: [] }));

  // Projects only appear in the unfiltered feed, same as the main query.
  if (projectIds.length) {
    let q = db()
      .from("projects")
      .select(PROJECT_COLS)
      .in("id", projectIds)
      .eq("status", "live");
    if (ctx.viewerId) q = q.neq("profile_id", ctx.viewerId);
    if (ctx.projectTypes?.length) q = q.in("project_type", ctx.projectTypes);
    tasks.push(q);
  } else tasks.push(Promise.resolve({ data: [] }));

  const [lRes, pRes] = await Promise.all(tasks);
  return {
    listings: ((lRes.data ?? []) as any[]).filter(inScope),
    projects: ((pRes.data ?? []) as any[]).filter(inScope),
  };
}

async function photosFor(listingIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!listingIds.length) return map;
  const { data } = await db()
    .from("listing_photos")
    .select("listing_id,url,position,status")
    .in("listing_id", listingIds)
    .eq("status", "ready")
    .order("position", { ascending: true });
  for (const p of (data ?? []) as { listing_id: string; url: string | null }[]) {
    if (!p.url) continue;
    const arr = map.get(p.listing_id) ?? [];
    arr.push(p.url);
    map.set(p.listing_id, arr);
  }
  return map;
}

async function savedFor(viewerId: string | null, listingIds: string[]): Promise<Set<string>> {
  if (!viewerId || !listingIds.length) return new Set();
  const { data } = await db().from("saves").select("listing_id").eq("profile_id", viewerId).in("listing_id", listingIds);
  return new Set(((data ?? []) as { listing_id: string }[]).map((s) => s.listing_id));
}

interface ProjectUnits { from: number | null; to: number | null; types: string[]; available: number | null }

/**
 * The scheme's units, as the card needs them: the cheapest and dearest priced
 * unit (the price BAND — a project spanning ₹45L to ₹1.2Cr said only "from
 * ₹45L" before), the unit names, and how many are still on sale.
 *
 * Sold-out unit rows still count towards the band: they are what the scheme
 * offers. `units_available` sums only the rows still marked available, because
 * that number is the one a buyer acts on.
 */
async function unitsFor(projectIds: string[]): Promise<Map<string, ProjectUnits>> {
  const map = new Map<string, ProjectUnits>();
  if (!projectIds.length) return map;
  const { data } = await db()
    .from("project_units")
    .select("project_id,unit_type,price_from_paise,units_available,available,position")
    .in("project_id", projectIds)
    .order("position", { ascending: true });
  for (const u of (data ?? []) as { project_id: string; unit_type: string; price_from_paise: number | null; units_available: number | null; available: boolean }[]) {
    const cur = map.get(u.project_id) ?? { from: null, to: null, types: [], available: null };
    if (u.price_from_paise != null) {
      cur.from = cur.from === null ? u.price_from_paise : Math.min(cur.from, u.price_from_paise);
      cur.to = cur.to === null ? u.price_from_paise : Math.max(cur.to, u.price_from_paise);
    }
    if (u.unit_type && !cur.types.includes(u.unit_type)) cur.types.push(u.unit_type);
    if (u.available && u.units_available != null) cur.available = (cur.available ?? 0) + u.units_available;
    map.set(u.project_id, cur);
  }
  return map;
}

/**
 * `project_types.label` — the scheme's own words ("Plotting scheme (NA plots)"),
 * read from the table migration 0062 created. CLAUDE.md rule 7: the label is
 * never a string in the component.
 */
async function projectTypeLabels(): Promise<Map<string, string>> {
  const { data } = await db().from("project_types").select("code,label").eq("is_active", true);
  return new Map(((data ?? []) as { code: string; label: string }[]).map((t) => [t.code, t.label]));
}

/** `property_types.label` — same rule for the property card's type chip. */
async function propertyTypeLabels(): Promise<Map<string, string>> {
  const { data } = await db().from("property_types").select("code,label").eq("is_active", true);
  return new Map(((data ?? []) as { code: string; label: string }[]).map((t) => [t.code, t.label]));
}

/**
 * The project card's fields, for any screen that renders one.
 *
 * Search builds its own project cards, and when the feed card was redesigned it
 * would have been left rendering an empty shell (no price band, no unit chips,
 * no facts) — two card layouts fed by two different DTOs is exactly how the two
 * screens drift apart. One builder, both callers.
 */
export async function projectCardExtras(rows: any[]): Promise<Map<string, Partial<FeedCard>>> {
  const out = new Map<string, Partial<FeedCard>>();
  if (!rows.length) return out;
  const [units, typeLabels, unitLabels] = await Promise.all([unitsFor(rows.map((r) => r.id)), projectTypeLabels(), areaUnitLabelMap()]);
  for (const row of rows) {
    const u = units.get(row.id);
    const band = u?.from != null
      ? (u.to != null && u.to !== u.from ? `${formatShortRupees(u.from)} – ${formatShortRupees(u.to)}` : `${formatShortRupees(u.from)} onwards`)
      : null;
    out.set(row.id, {
      priceFrom: u?.from != null ? `${u.types.slice(0, 2).join("/") || "Units"} from ${formatShortRupees(u.from)}` : "Price on request",
      priceBand: band,
      unitTypes: u?.types ?? [],
      buildStatusCode: row.build_status ?? null,
      reraExempt: Boolean(row.rera_exempt),
      projectTypeLabel: row.project_type ? typeLabels.get(row.project_type) ?? null : null,
      possessionLabel: row.possession_date
        ? new Date(row.possession_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : null,
      facts: projectFacts(row, u, unitLabels),
    });
  }
  return out;
}

/**
 * ONE listing as the feed card renders it — for the owner's Preview screen
 * (P6 S1, "this is how your listing appears in the feed").
 *
 * That screen used to hand-draw its own copy of the card: a 4:5 photo, a price
 * with a For-Sale pill, a meta line and no title, which stopped being what the
 * feed shows the moment the card changed. It now renders the SAME component off
 * this payload, so the promise the screen makes is structurally true.
 *
 * Owner-only: the listing is not live yet, and the preview is part of its
 * creation flow. Photos come from `listing_photos` exactly as the feed reads
 * them, so a draft with three uploads previews all three.
 */
export async function previewCard(listingId: string, ownerId: string): Promise<FeedCard | null> {
  const { data } = await db()
    .from("listings")
    .select("id,profile_id,type_code,kind,title,price_paise,price_on_request,is_negotiable,area_label,area_id,city_id,cover_url,attributes,area_sqft,created_at,live_at")
    .eq("id", listingId)
    .eq("profile_id", ownerId)
    .maybeSingle();
  const row = data as any | null;
  if (!row) return null;

  const [{ data: profs }, { data: vers }, photos, propTypes, fieldDefs, unitLabels] = await Promise.all([
    db().from("profiles").select("id,name,username,role,photo_url,phone").eq("id", ownerId),
    db().from("verifications").select("profile_id").eq("level", "phone").eq("status", "approved").eq("profile_id", ownerId),
    photosFor([listingId]),
    propertyTypeLabels(),
    getFieldDefinitions(),
    areaUnitLabelMap(),
  ]);

  const card = toCard(
    { row, kind: "property" },
    new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p])),
    new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id)),
    photos,
    new Set<string>(),
    new Map(),
    new Map(),
    propTypes,
    fieldDefs,
    unitLabels,
    new Map(),
    // NOT the owner's own id: `isOwn` would strip the Save control, and the
    // preview exists to show what a BUYER sees.
    null,
  );
  return { ...card, isOwn: false };
}

/**
 * ONE project as the feed card renders it — the builder's Preview screen.
 *
 * The project flow had no preview at all: a builder spent ₹9,999, filled five
 * steps and went straight to the success screen, so the first time anyone saw
 * the project card was after an admin approved it. Same contract as
 * `previewCard` above — the SAME component off the SAME builder, so "this is
 * how your project appears in the feed" is structural rather than a claim.
 *
 * Owner-only, and the row is fetched by (id, profile_id) so someone else's id
 * is indistinguishable from a non-existent one.
 */
export async function previewProjectCard(projectId: string, ownerId: string): Promise<FeedCard | null> {
  const { data } = await db()
    .from("projects")
    .select(PROJECT_COLS)
    .eq("id", projectId)
    .eq("profile_id", ownerId)
    .maybeSingle();
  const row = data as any | null;
  if (!row) return null;

  const [{ data: profs }, { data: vers }, units, typeLabels, propTypes, fieldDefs, unitLabels] = await Promise.all([
    db().from("profiles").select("id,name,username,role,photo_url,phone").eq("id", ownerId),
    db().from("verifications").select("profile_id").eq("level", "phone").eq("status", "approved").eq("profile_id", ownerId),
    unitsFor([projectId]),
    projectTypeLabels(),
    propertyTypeLabels(),
    getFieldDefinitions(),
    areaUnitLabelMap(),
  ]);

  const card = toCard(
    { row, kind: "project" },
    new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p])),
    new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id)),
    new Map(),
    new Set<string>(),
    units,
    typeLabels,
    propTypes,
    fieldDefs,
    unitLabels,
    new Map(),
    // Not the builder's own id — `isOwn` would collapse the action bar to
    // "View Project", and the preview exists to show what a BUYER sees.
    null,
  );
  // `toCard` withholds the number from a null viewer (anti-scrape rule), which
  // would render the buyer's bar without the thing it is previewing. This is
  // the builder looking at their own project, so the number is their own.
  const phone = ((profs ?? []) as any[])[0]?.phone ?? null;
  return { ...card, isOwn: false, contactNumber: phone };
}

/** A stored option code rendered through its own field definition's label. */
function defLabel(defs: FieldDefinitionRow[], key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const def = defs.find((d) => d.key === key);
  return def?.options?.find((o) => o.value === String(value))?.label ?? String(value);
}

/**
 * The property card's facts strip. Same rule as the project's: only what this
 * listing actually stored, in a fixed priority, at most four. Every label is a
 * `field_definitions` label and every coded value goes through its options, so
 * "semi" shows as "Semi-furnished" and nothing is spelled out in the component.
 */
function propertyFacts(l: any, defs: FieldDefinitionRow[], unitLabels: Record<string, string>): { label: string; value: string }[] {
  const a = (l.attributes ?? {}) as Record<string, any>;
  const out: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => { if (value) out.push({ label, value }); };

  push("Bathrooms", defLabel(defs, "bathrooms", a.bathrooms));
  push("Furnishing", defLabel(defs, "furnishing", a.furnishing));
  // "9 / 12" reads as a floor; the raw 9 does not.
  if (a.floor != null && a.floor !== "") {
    push("Floor", a.total_floors != null && a.total_floors !== "" ? `${a.floor} / ${a.total_floors}` : String(a.floor));
  }
  push("Facing", defLabel(defs, "facing", a.facing));
  // A PLOT answers none of the four above, and its one headline number — "5
  // Vigha" — lives in an `area` control. Without these a land card came back
  // from the server with an empty strip and no chips at all.
  // …but not the one the sqft chip is already showing: `area_sqft` is derived
  // from built-up/carpet, so both together printed "520 sqft" twice on one card.
  const areaKeys = l.area_sqft ? ["plot_area", "land_area"] : ["plot_area", "land_area", "builtup_area", "carpet_area"];
  for (const key of areaKeys) {
    const v = areaValue(a[key], unitLabels);
    if (v) push(defs.find((d) => d.key === key)?.label ?? key, v);
  }
  push("Ownership", defLabel(defs, "ownership_type", a.ownership_type));
  push("Water", defLabel(defs, "water", a.water));
  push("Age", defLabel(defs, "age", a.age));
  push("Parking", a.car_parking ? String(a.car_parking) : null);
  push("Status", defLabel(defs, "construction_status", a.construction_status));
  return out.slice(0, 4);
}

/** An `area` control's stored { value, unit } → "5 Vigha" / "1,450 sq ft". */
function areaValue(raw: unknown, labels: Record<string, string>): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const obj = typeof raw === "object" ? (raw as { value?: unknown; unit?: unknown }) : { value: raw, unit: undefined };
  const n = typeof obj.value === "number" ? obj.value : Number(obj.value);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${n.toLocaleString("en-IN")} ${labels[String(obj.unit ?? "sqft")] ?? labels.sqft ?? "sq ft"}`;
}

/**
 * Area-unit labels, from `area_units` (migration 0068) — the same rows the form
 * renders its unit picker from. Cached per process: it is master data of seven
 * rows, and a feed page would otherwise re-read it for every card.
 */
let areaUnitLabels: Record<string, string> | null = null;
async function areaUnitLabelMap(): Promise<Record<string, string>> {
  if (areaUnitLabels) return areaUnitLabels;
  const units = await getAreaUnits();
  areaUnitLabels = Object.fromEntries(units.map((u) => [u.code, u.label]));
  return areaUnitLabels;
}

/** Facts strip — built ONLY from values the builder actually filled in. */
function projectFacts(row: any, units: ProjectUnits | undefined, unitLabels: Record<string, string>): { label: string; value: string }[] {
  const attrs = (row.attributes ?? {}) as Record<string, any>;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  // `area` controls store { value, unit } (migration 0055's shape).
  // The form's unit <select> defaults to sq ft and only writes `unit` once the
  // builder touches it, so an absent unit means sq ft — not "unknown".
  const land = areaValue(attrs.project_land_area, unitLabels);

  const out: { label: string; value: string }[] = [];
  const push = (label: string, value: number | null, fmt?: (n: number) => string) => {
    if (value == null || Number.isNaN(value)) return;
    out.push({ label, value: fmt ? fmt(value) : value.toLocaleString("en-IN") });
  };
  push("Plots", num(attrs.total_plots));
  push("Towers", num(row.towers));
  push("Floors", num(row.floors));
  push("Total units", num(row.total_units));
  push("Available", row.available_units != null ? num(row.available_units) : units?.available ?? null);
  if (land) out.push({ label: "Site area", value: land });
  push("Open area", num(attrs.open_area_percent), (n) => `${n}%`);
  return out.slice(0, 4);
}

function toCard(
  c: { row: any; kind: "property" | "project" },
  profMap: Map<string, any>,
  verifiedSet: Set<string>,
  photosByListing: Map<string, string[]>,
  savedSet: Set<string>,
  unitsByProject: Map<string, ProjectUnits>,
  typeLabels: Map<string, string>,
  propTypeLabels: Map<string, string>,
  fieldDefs: FieldDefinitionRow[],
  unitLabels: Record<string, string>,
  boostRank: Map<string, number>,
  viewerId: string | null,
): FeedCard {
  const p = profMap.get(c.row.profile_id) ?? {};
  const poster: PosterInfo = { id: c.row.profile_id, name: p.name ?? "HomzList user", username: p.username ?? null, role: p.role ?? null, verified: verifiedSet.has(c.row.profile_id), avatarUrl: p.photo_url ?? null };

  if (c.kind === "project") {
    const u = unitsByProject.get(c.row.id);
    const buildLabel = c.row.build_status === "ready" ? "Ready to move" : c.row.build_status === "under_construction" ? "Under construction" : "Booking open";
    const isOwn = viewerId !== null && c.row.profile_id === viewerId;
    // A band, not a single number: "₹45L – ₹1.2Cr" when the cheapest and the
    // dearest unit differ, the single figure when they don't.
    const band = u?.from != null
      ? (u.to != null && u.to !== u.from ? `${formatShortRupees(u.from)} – ${formatShortRupees(u.to)}` : `${formatShortRupees(u.from)} onwards`)
      : null;
    return {
      kind: "project", id: c.row.id, promoted: boostRank.has(c.row.id), saved: false,
      isOwn,
      coverUrl: c.row.cover_url, photos: c.row.cover_url ? [c.row.cover_url] : [],
      areaLabel: c.row.area_label, areaId: c.row.area_id ?? null, poster, postedAgo: timeAgo(c.row.live_at ?? c.row.created_at),
      title: c.row.name,
      priceFrom: u?.from != null ? `${u.types.slice(0, 2).join("/") || "Units"} from ${formatShortRupees(u.from)}` : "Price on request",
      buildStatus: buildLabel,
      // The code as well as the label: the card colours the status pill off the
      // code, so nothing has to re-derive meaning by matching English strings.
      buildStatusCode: c.row.build_status ?? null,
      rera: Boolean(c.row.rera_number) || c.row.rera_exempt,
      reraExempt: Boolean(c.row.rera_exempt),
      projectTypeLabel: c.row.project_type ? typeLabels.get(c.row.project_type) ?? null : null,
      priceBand: band,
      unitTypes: u?.types ?? [],
      possessionLabel: c.row.possession_date
        ? new Date(c.row.possession_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : null,
      facts: projectFacts(c.row, u, unitLabels),
      // Doc2 §6 makes a builder's number public on a project — the detail
      // screen already returns it. It is still withheld from GUESTS here, so a
      // logged-out scrape of the feed cannot harvest builder numbers in bulk;
      // a guest tapping Call gets the login sheet. And a builder is never shown
      // their own number back: their bar is Edit / Insights.
      contactNumber: isOwn || !viewerId ? null : (p.phone ?? null),
    };
  }

  const l = c.row;
  const bhk = l.attributes?.bhk;
  const sqft = l.area_sqft as number | null;
  // Per-sqft is a SALE metric. Dividing a monthly rent by area printed
  // "₹19/sqft" beside a ₹28,000 rent — a figure that reads like a price
  // comparison but is rent-per-sqft-per-month, meaningless next to the sale
  // cards in the same feed. Found during the Module 8 search pass and fixed in
  // both places (PENDING §M8.1).
  const perSqft = l.kind !== "rent" && l.price_paise && sqft
    ? Math.round((l.price_paise / 100) / sqft)
    : null;
  const metaChips = [
    bhk ? `${bhk} BHK` : null,
    sqft ? `${sqft.toLocaleString("en-IN")} sqft` : null,
    perSqft ? `₹${perSqft.toLocaleString("en-IN")}/sqft` : null,
  ].filter((v): v is string => Boolean(v));
  // The joined string is still sent: the search screen and the share sheet
  // render the one-liner, and only the feed card splits it into chips.
  const meta = metaChips.join(" · ");
  const photos = photosByListing.get(l.id) ?? (l.cover_url ? [l.cover_url] : []);

  return {
    kind: "property", id: l.id,
    promoted: boostRank.has(l.id),
    saved: savedSet.has(l.id),
    // The viewer's own listing — no wishlist heart on it. The server refuses a
    // self-save regardless (feed/interactions.toggleSave); this is the UI half.
    isOwn: viewerId !== null && l.profile_id === viewerId,
    coverUrl: l.cover_url, photos,
    // "2d ago" = since it went LIVE, not since the draft was created.
    areaLabel: l.area_label, areaId: l.area_id ?? null, poster, postedAgo: timeAgo(l.live_at ?? l.created_at),
    // "Negotiable" is its own flag now — the card renders it as a chip beside
    // the price instead of the price string carrying two facts glued together.
    price: l.price_on_request ? "Price on request" : formatShortRupees(l.price_paise),
    negotiable: Boolean(l.is_negotiable) && !l.price_on_request,
    saleLabel: l.kind === "rent" ? "For Rent" : "For Sale",
    // The card shows the listing title beside the price. Property cards never
    // carried it before — only project cards did.
    title: l.title ?? undefined,
    meta, metaChips, listingKind: l.kind, typeCode: l.type_code,
    typeLabel: l.type_code ? propTypeLabels.get(l.type_code) ?? null : null,
    facts: propertyFacts(l, fieldDefs, unitLabels),
  };
}

/**
 * New-listings count since a timestamp (Doc7 §83). The CLIENT decides whether to
 * SHOW the pill (only after ≥30s on feed); the server just answers "how many".
 */
export async function newCount(viewerId: string | null, sinceIso: string, pickedCityId?: string | null): Promise<number> {
  // Same scope as the feed the pill sits on — counting a city the feed is not
  // showing would fire "5 new listings" over an unchanged screen.
  const scope = await feedScope(viewerId, pickedCityId ?? null);
  // "New" = newly IN THE FEED, i.e. went live after `since` — `live_at`, not
  // `created_at`. A listing is drafted, moderated, then published, so
  // created_at can be days older than the moment it appeared. Counting by
  // created_at meant the pill never fired for a genuinely new listing.
  let q = db().from("listings").select("id", { count: "exact", head: true })
    .eq("status", "live").eq("availability", "available").gt("live_at", sinceIso);
  q = applyFeedScope(q, scope);
  if (viewerId) q = q.neq("profile_id", viewerId);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Builder dashboard feed (Doc7 §80, Doc2 §9.1) — builder role ONLY: own project
 * stat cards + requirements matched to those projects. NO foreign listings.
 *
 * Project view-counts aren't tracked yet (listing views are, projects aren't —
 * noted in PENDING), so the stat line uses REAL data — units available and the
 * builder's real lead count — rather than a fabricated "1,240 views" (DB-lock
 * bans hardcoded counts). Matched requirements reuse the location cascade.
 */
export interface BuilderProjectStat {
  id: string; name: string; coverUrl: string | null;
  unitsAvailable: number | null; unitsTotal: number | null; leads: number; buildStatus: string;
  /** Raw status, so the card can say "Under review" instead of vanishing. */
  status: string;
}

/** A non-live project still belongs on the builder's own dashboard, labelled. */
export const PROJECT_STATE_LABEL: Record<string, string> = {
  pending_review: "Under review",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  hidden: "Hidden",
  archived: "Archived",
};

export async function builderDashboard(builderId: string): Promise<{
  projects: BuilderProjectStat[];
  matched: MatchedRequirementCard[];
}> {
  // Every project the builder owns except drafts and deletions — NOT just live.
  // A project sits in `pending_review` after posting, and while it did, it
  // appeared on no screen in the entire app: the profile counted it, this
  // dashboard hid it, and My Listings only ever held listings. The builder had
  // paid ₹9,999 for something they could not see.
  const { data: projData } = await db()
    .from("projects")
    // `project_type` feeds the shared matcher's DB-driven type pairing.
    .select("id,name,project_type,cover_url,available_units,total_units,build_status,city_id,area_id,area_label,status")
    .eq("profile_id", builderId)
    .not("status", "in", "(draft,deleted)")
    .order("created_at", { ascending: false });
  const projects = (projData ?? []) as any[];

  // The builder's real lead count (their pipeline) — a real number, not a guess.
  const { count: leadCount } = await db().from("leads").select("id", { count: "exact", head: true }).eq("owner_id", builderId).eq("is_relevant", true);
  const leadsTotal = leadCount ?? 0;

  const projectStats: BuilderProjectStat[] = projects.map((p) => ({
    id: p.id, name: p.name, coverUrl: p.cover_url,
    unitsAvailable: p.available_units ?? null, unitsTotal: p.total_units ?? null,
    leads: leadsTotal, // pipeline is per-builder, not per-project (leads don't link to projects yet)
    buildStatus: p.build_status === "ready" ? "Ready to move" : p.build_status === "under_construction" ? "Under construction" : "Booking open",
    status: p.status,
  }));

  // Requirements matched to the builder's projects, from the SHARED matching
  // engine (lib/listings/matching). Only a LIVE project pulls matches — an
  // under-review project must not start generating leads before it is approved.
  // The engine owns the access strip (a builder without an active
  // requirement-access plan gets locked preview cards, same as everywhere else)
  // and reads the project-type → property-type pairing from `project_types`
  // instead of a hardcoded "residential" list.
  const matched = await matchRequirementsForProjects(
    builderId,
    projects.filter((p) => p.status === "live"),
    8,
  );
  return { projects: projectStats, matched };
}

export interface FeedBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  targetUrl: string | null;
  /** 0 = show every visit · 1 = once per day · 2 = once per session. Enforced client-side. */
  frequencyCap: number;
}

/** Who is asking, so a role/city-targeted banner reaches only its audience. */
export interface BannerViewer {
  role?: string | null;
  cityId?: string | null;
}

/**
 * The active admin banner for the feed slot (P2 "admin banner"; Doc2 §9).
 *
 * Server-decided, DB-driven (migration 0027): the highest-priority active banner
 * whose schedule window is open AND whose targeting matches the viewer. NULL →
 * the slot doesn't render. The P15 admin CMS edits these rows.
 *
 * Targeting (`target_roles`, `target_cities`) is applied HERE — an empty array
 * means "everyone", otherwise the viewer's role/city must be in it. Guests (no
 * role/city) therefore see only untargeted banners, never one aimed at a role or
 * city they don't have. This is what stops an admin's "Builders in Rajkot only"
 * banner from being shown to everyone.
 */
export async function activeFeedBanner(viewer: BannerViewer = {}): Promise<FeedBanner | null> {
  const nowIso = new Date().toISOString();
  const { data } = await db()
    .from("feed_banners")
    .select("id,title,subtitle,image_url,target_url,frequency_cap,target_roles,target_cities,starts_at,ends_at")
    .eq("placement", "feed")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("sort_order", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as {
    id: string; title: string; subtitle: string | null; image_url: string | null;
    target_url: string | null; frequency_cap: number | null;
    target_roles: string[] | null; target_cities: string[] | null;
  }[];

  const match = rows.find((b) => {
    const roles = b.target_roles ?? [];
    const cities = b.target_cities ?? [];
    if (roles.length && !(viewer.role && roles.includes(viewer.role))) return false;
    if (cities.length && !(viewer.cityId && cities.includes(viewer.cityId))) return false;
    return true;
  });
  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    subtitle: match.subtitle,
    imageUrl: match.image_url,
    targetUrl: match.target_url,
    frequencyCap: match.frequency_cap ?? 0,
  };
}

/** "Suggested for you" strip (Doc7 §81) — a small area/recency set, mini cards. */
export async function suggested(viewerId: string | null, pickedCityId?: string | null): Promise<{ id: string; coverUrl: string | null; price: string; areaLabel: string | null }[]> {
  const scope = await feedScope(viewerId, pickedCityId ?? null);
  let q = db().from("listings")
    .select("id,cover_url,price_paise,price_on_request,area_label")
    .eq("status", "live").eq("availability", "available")
    .order("created_at", { ascending: false }).limit(8);
  q = applyFeedScope(q, scope);
  if (viewerId) q = q.neq("profile_id", viewerId);
  const { data } = await q;
  return ((data ?? []) as any[]).map((l) => ({
    id: l.id, coverUrl: l.cover_url,
    price: l.price_on_request ? "On request" : formatShortRupees(l.price_paise),
    areaLabel: l.area_label,
  }));
}
