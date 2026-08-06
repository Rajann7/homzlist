import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hasRequirementAccess, type RequirementRow } from "./requirements";
import { placementsFor, outOfCityIds, stateIdOfCity } from "@/lib/billing/placement";
import { resolveViewerCity } from "@/lib/location/viewer-city";

/**
 * The matching cascade (Doc2 §8.3) — ONE engine, used in both directions:
 *
 *   reverse-match  requirement → live listings  (My-Requirements "matching
 *                  strip" + Doc7 §76 /match/for-requirement/:id)
 *   browse         live requirements → a viewer  (Doc7 §63 requirements browse,
 *                  grouped into the same tiers relative to the viewer)
 *
 * Location tier: exact landmark/area → adjacent areas (the admin `location_adjacency`
 * map, migration 0005) → city. STOP at city (never spill to another city).
 * Budget: ±20% overlap. Type + kind must match.
 *
 * Everything is decided server-side; a locked browse card never carries the
 * budget or poster it hides (the strip is done in `requirements.ts`, applied here).
 */

const db = () => createServiceClient();

/** ±20% band around a requirement's budget (Doc2 §8.3). Open-ended if a side is null. */
export function budgetBand(min: number | null, max: number | null): { lo: number; hi: number | null } {
  const lo = min !== null ? Math.floor(min * 0.8) : 0;
  const hi = max !== null ? Math.ceil(max * 1.2) : null;
  return { lo, hi };
}

/** A price sits in the band when it overlaps [lo, hi] (hi null = no ceiling). */
function priceInBand(price: number | null, lo: number, hi: number | null): boolean {
  if (price === null) return false;
  if (price < lo) return false;
  if (hi !== null && price > hi) return false;
  return true;
}

export type Tier = "exact" | "adjacent" | "city";

/**
 * Browse tiers extend the match tiers with the two FALLBACK scopes.
 *
 * The match cascade stops at city (Doc2 §8.3) and still does — a requirement is
 * never *matched* across cities. Browse is a different question ("show me what
 * is out there"), and stopping dead at an empty city meant a viewer in Jamnagar
 * or Mumbai got a screen that said "expand your city" with nothing to tap.
 * These two tiers are only ever reached when the tighter scope returned NOTHING,
 * and they always carry a header saying where the cards came from, so a
 * Gujarat-wide card can never read as a local one (Doc4 §9 "new-city empty
 * (+nearby auto)").
 */
export type BrowseTier = Tier | "state" | "india";

/** location_adjacency lookup: which areas are adjacent to any of `areaIds`. */
async function adjacentAreas(areaIds: string[]): Promise<Set<string>> {
  if (!areaIds.length) return new Set();
  const { data } = await db()
    .from("location_adjacency")
    .select("adjacent_id")
    .in("location_id", areaIds);
  return new Set(((data ?? []) as { adjacent_id: string }[]).map((r) => r.adjacent_id));
}

/** Human tier label for a card ("Nearby: University Road" etc.). */
function tierLabel(tier: Tier, areaName: string | null, cityName: string | null): string | null {
  if (tier === "exact") return null; // primary group has no header
  if (tier === "adjacent") return areaName ? `Nearby: ${areaName}` : "Nearby";
  return cityName ? `Other areas in ${cityName}` : "Other areas";
}

/**
 * Section header for a BROWSE section.
 *
 * `leading` = this is the first section on the screen. The city tier used to
 * print "Other areas in Rajkot" as the ONLY header on the page — "Other" than
 * what? That is the common case, not an edge one: a viewer with no live
 * listings and no live requirement of their own has no anchor areas at all, so
 * every card lands in the city tier. A leading group takes no header, exactly
 * like the exact tier ("primary group has no header").
 */
function browseSectionLabel(
  tier: BrowseTier,
  areaName: string | null,
  scope: RequirementScope,
  leading: boolean,
): string | null {
  if (tier === "state") return scope.stateName ? `Other cities in ${scope.stateName}` : "Other cities";
  if (tier === "india") return "Across India";
  if (tier === "city" && leading) return null;
  return tierLabel(tier, areaName, scope.cityName);
}

export interface MatchedListing {
  id: string;
  title: string | null;
  pricePaise: number | null;
  areaLabel: string | null;
  coverUrl: string | null;
  bhk: number | null;
  tier: Tier;
  tierLabel: string | null;
}

/**
 * Reverse-match: live, available listings that satisfy a requirement, ordered
 * exact → adjacent → city, each tagged with its tier. Powers the matching strip
 * and Doc7 §76. Own listings are never matched to your own requirement.
 */
export async function matchListingsForRequirement(
  req: Pick<RequirementRow, "id" | "profile_id" | "kind" | "type_code" | "budget_min_paise" | "budget_max_paise" | "area_ids" | "city_id">,
  limit = 12,
): Promise<MatchedListing[]> {
  const { lo, hi } = budgetBand(req.budget_min_paise, req.budget_max_paise);
  const exact = new Set(req.area_ids ?? []);
  const adjacent = await adjacentAreas(req.area_ids ?? []);

  // Pull the city-wide candidate set once, then tier + budget-filter in memory —
  // the band is a computed range the query can't express cleanly, and a single
  // city rarely holds enough live listings for this to matter.
  let q = db()
    .from("listings")
    .select("id,title,price_paise,area_label,cover_url,attributes,area_id,city_id,profile_id")
    .eq("status", "live")
    .eq("availability", "available")
    .eq("type_code", req.type_code)
    .eq("kind", req.kind)
    .neq("profile_id", req.profile_id)
    .order("created_at", { ascending: false })
    .limit(120);
  if (req.city_id) q = q.eq("city_id", req.city_id);

  const { data } = await q;
  const rows = (data ?? []) as {
    id: string; title: string | null; price_paise: number | null; area_label: string | null;
    cover_url: string | null; attributes: Record<string, unknown> | null; area_id: string | null; city_id: string | null;
  }[];

  const out: MatchedListing[] = [];
  for (const l of rows) {
    if (!priceInBand(l.price_paise, lo, hi)) continue;
    const tier: Tier = l.area_id && exact.has(l.area_id) ? "exact"
      : l.area_id && adjacent.has(l.area_id) ? "adjacent"
      : "city";
    const bhkRaw = l.attributes?.bhk;
    out.push({
      id: l.id,
      title: l.title,
      pricePaise: l.price_paise,
      areaLabel: l.area_label,
      coverUrl: l.cover_url,
      bhk: typeof bhkRaw === "number" ? bhkRaw : bhkRaw ? Number(bhkRaw) || null : null,
      tier,
      tierLabel: tierLabel(tier, l.area_label, null),
    });
  }
  const rank = { exact: 0, adjacent: 1, city: 2 };
  out.sort((a, b) => rank[a.tier] - rank[b.tier]);
  return out.slice(0, limit);
}

// ---- Browse (Doc7 §63): live requirements grouped for a viewer -------------

export interface BrowseCard {
  id: string;
  access: "unlocked" | "locked";
  kind: "sell" | "rent";
  kindLabel: string;
  typeCode: string;
  bhk: number | null;
  /** partial info always visible: "3 BHK · Buy · Mavdi area" */
  summary: string;
  isUrgent: boolean;
  isBoosted: boolean;
  postedAgo: string;
  /** unlocked only — omitted entirely when locked (DevTools-proof) */
  budgetLabel?: string;
  areaLabel?: string;
  posterName?: string;
  posterRole?: string;
  posterVerified?: boolean;
  proposalCount?: number;
  /** whether THIS viewer has already sent a proposal (button → "Proposal sent ✓") */
  alreadySent?: boolean;
  tier: BrowseTier;
}

export interface BrowseSection {
  tier: BrowseTier;
  label: string | null;
  cards: BrowseCard[];
}

/**
 * WHERE a browse request is anchored — the single answer every requirement
 * surface asks for, so the browse list, the requirement-mode feed and the
 * dashboard "Browse requirements · N" tile can never disagree about what the
 * viewer's city is.
 *
 * A signed-in profile's city is the truth (the city chip PATCHes it). A guest
 * has no profile to hold one, so their pick rides the request as `cityId` and
 * is VALIDATED here against `locations` — the browser is choosing a filter, not
 * asserting a fact, and a forged id resolves to nothing rather than to a query.
 */
export interface RequirementScope {
  cityId: string | null;
  cityName: string | null;
  stateId: string | null;
  stateName: string | null;
  /** profile = signed-in city; picked = guest's city chip; none = nobody has one */
  source: "profile" | "picked" | "none";
}

export async function requirementScope(
  viewerId: string | null,
  pickedCityId?: string | null,
): Promise<RequirementScope> {
  // ONE resolver for the whole app (lib/location/viewer-city): profile city
  // wins, the guest's pick is validated as a real `locations` city, anything
  // else resolves to null. The requirement surfaces and the property feed must
  // never disagree about which city a viewer is in.
  const cityId = await resolveViewerCity(viewerId, pickedCityId ?? null);
  const source: RequirementScope["source"] = !cityId
    ? "none"
    : viewerId && (await profileCityOf(viewerId)) === cityId
      ? "profile"
      : "picked";

  if (!cityId) return { cityId: null, cityName: null, stateId: null, stateName: null, source };

  const stateId = await stateIdOfCity(cityId);
  const ids: string[] = [cityId, ...(stateId ? [stateId] : [])];
  const { data: names } = await db().from("locations").select("id,name").in("id", ids);
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));

  return {
    cityId,
    cityName: nameOf.get(cityId) ?? null,
    stateId,
    stateName: stateId ? nameOf.get(stateId) ?? null : null,
    source,
  };
}

/** Only to report WHERE the scope came from; the scope itself is already decided. */
async function profileCityOf(viewerId: string): Promise<string | null> {
  const { data } = await db().from("profiles").select("city_id").eq("id", viewerId).maybeSingle();
  return (data as { city_id: string | null } | null)?.city_id ?? null;
}

/**
 * The empty screen, decided by the SERVER (CLAUDE.md rule 12 — no copy invented
 * in a component). `action` tells the surface which real control to offer; a
 * screen that says "expand your city" with nothing to tap is a dead end.
 */
export interface BrowseEmpty {
  title: string;
  subtitle: string;
  action: "pick_city" | null;
}

function emptyFor(scope: RequirementScope): BrowseEmpty {
  if (scope.cityId) {
    return {
      title: `No requirements in ${scope.cityName ?? "your city"} yet`,
      subtitle: scope.stateName
        ? `Nothing live across ${scope.stateName} right now either. Try another city — new requirements appear here as people post them.`
        : "New requirements appear here as people post them.",
      action: "pick_city",
    };
  }
  return {
    title: "No requirements yet",
    subtitle: "Pick your city to see requirements near you — new ones appear here as people post them.",
    action: "pick_city",
  };
}

/**
 * The areas a browsing viewer is anchored to — the union of their own live
 * listings' areas and their active requirements' areas ("requirements near what
 * I'm selling / what I want"). Falls back to city-only tiering when empty.
 */
async function viewerAnchorAreas(viewerId: string): Promise<Set<string>> {
  const [{ data: listings }, { data: reqs }] = await Promise.all([
    db().from("listings").select("area_id").eq("profile_id", viewerId).eq("status", "live"),
    db().from("requirements").select("area_ids").eq("profile_id", viewerId).eq("status", "live"),
  ]);
  const areas = new Set<string>();
  for (const l of (listings ?? []) as { area_id: string | null }[]) if (l.area_id) areas.add(l.area_id);
  for (const r of (reqs ?? []) as { area_ids: string[] }[]) for (const a of r.area_ids ?? []) areas.add(a);
  return areas;
}

/**
 * Bulk-enrich a set of requirement rows once, then hand back a factory that
 * turns any of them into an access-stripped card.
 *
 * This exists so there is exactly ONE place that decides what a requirement
 * card contains. The builder dashboard used to build its own from the full
 * `requirementDTO`, which meant a builder whose ₹9,999 plan had expired still
 * read every matched buyer's budget straight off the dashboard while the detail
 * screen behind the same card locked it.
 */
async function cardBuilder(
  viewerId: string | null,
  rows: RequirementRow[],
  unlocked: boolean,
): Promise<(r: RequirementRow, tier: BrowseTier, isBoosted?: boolean) => BrowseCard> {
  // Which requirements has this viewer already proposed to? One query, not N.
  const sentSet = new Set<string>();
  if (viewerId && rows.length) {
    const { data: sent } = await db()
      .from("proposals")
      .select("requirement_id")
      .eq("sender_id", viewerId)
      .in("requirement_id", rows.map((r) => r.id))
      .in("status", ["pending", "accepted"]);
    for (const p of (sent ?? []) as { requirement_id: string }[]) sentSet.add(p.requirement_id);
  }

  // Proposal counts (public "12 proposals sent so far"). One read over these
  // requirement ids, counted in memory — the browse page is capped at 60 rows,
  // so this stays a single round-trip.
  const countMap = new Map<string, number>();
  if (rows.length) {
    const { data: props } = await db()
      .from("proposals")
      .select("requirement_id")
      .in("requirement_id", rows.map((r) => r.id))
      .in("status", ["pending", "accepted", "declined", "not_relevant", "expired", "fulfilled"]);
    for (const p of (props ?? []) as { requirement_id: string }[]) {
      countMap.set(p.requirement_id, (countMap.get(p.requirement_id) ?? 0) + 1);
    }
  }

  // Poster identity is shown ONLY on unlocked cards (name + role + verified, no
  // number ever — Doc2 §7). Resolve them in bulk; locked cards never touch this.
  const posterMap = new Map<string, { name: string | null; role: string | null; verified: boolean }>();
  if (unlocked && rows.length) {
    const posterIds = [...new Set(rows.map((r) => r.profile_id))];
    const [{ data: profs }, { data: vers }] = await Promise.all([
      db().from("profiles").select("id,name,role").in("id", posterIds),
      db().from("verifications").select("profile_id,status").in("profile_id", posterIds).eq("level", "phone").eq("status", "approved"),
    ]);
    const verified = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));
    for (const p of (profs ?? []) as { id: string; name: string | null; role: string | null }[]) {
      posterMap.set(p.id, { name: p.name, role: p.role, verified: verified.has(p.id) });
    }
  }

  return (r, tier, isBoosted = false) =>
    toBrowseCard(r, unlocked, sentSet.has(r.id), countMap.get(r.id) ?? 0, posterMap.get(r.profile_id), isBoosted, tier);
}

/**
 * Browse others' live requirements, grouped into cascade sections relative to
 * the viewer. Each card is access-stripped: unlocked (viewer holds ₹2,999
 * Requirement Access) carries full data; locked carries preview fields ONLY.
 */
export async function browseRequirements(
  viewerId: string | null,
  filters: { kind?: "sell" | "rent" | null; typeCode?: string | null; cityId?: string | null },
): Promise<{
  sections: BrowseSection[];
  unlocked: boolean;
  cityName: string | null;
  scope: RequirementScope;
  empty: BrowseEmpty | null;
}> {
  const unlocked = await hasRequirementAccess(viewerId);

  const scope = await requirementScope(viewerId, filters.cityId ?? null);
  const anchorAreas = viewerId ? await viewerAnchorAreas(viewerId) : new Set<string>();
  const adjacent = await adjacentAreas([...anchorAreas]);

  /** The live-requirement query minus its location predicate. */
  const liveQuery = () => {
    let q = db()
      .from("requirements")
      .select("*")
      .eq("status", "live")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60);
    if (viewerId) q = q.neq("profile_id", viewerId); // never browse your own
    if (filters.kind) q = q.eq("kind", filters.kind);
    if (filters.typeCode) q = q.eq("type_code", filters.typeCode);
    return q;
  };

  // Scope to the viewer's city when we know it. The cascade inside a city is
  // exact → adjacent → city, exactly as before.
  let fallback: "state" | "india" | null = null;
  let rows = scope.cityId
    ? (((await liveQuery().eq("city_id", scope.cityId)).data ?? []) as RequirementRow[])
    : [];

  // Nothing in the city → widen ONCE to the rest of the state, as its own
  // labelled section. Nobody has a city at all (guest who never picked one) →
  // all-India, also labelled. Both only ever run when the tighter scope came
  // back empty, so a viewer whose city HAS requirements is unaffected.
  if (!rows.length) {
    if (scope.cityId && scope.stateId) {
      rows = ((await liveQuery().eq("state_id", scope.stateId).neq("city_id", scope.cityId)).data ?? []) as RequirementRow[];
      if (rows.length) fallback = "state";
    } else if (!scope.cityId) {
      rows = ((await liveQuery()).data ?? []) as RequirementRow[];
      if (rows.length) fallback = "india";
    }
  }

  // ---- requirement boost placement (Doc2 §13, §9.2) -------------------------
  // "requirement boost → requirement-mode feed top + story first + locked-but-top
  // for unpaid". `isBoosted` was hard-coded false until Module 9, so a boosted
  // requirement was indistinguishable from an organic one.
  //
  // "Locked-but-top" falls out of doing the ranking here and the stripping in
  // `toBrowseCard`: an unpaid viewer gets the boosted card FIRST but still
  // without budget or poster — the position is bought, the data is not.
  const placements = await placementsFor(
    { cityId: scope.cityId, stateId: scope.stateId },
    ["requirement"],
  );

  // State / All-India targeted requirement boosts reach viewers whose city the
  // requirement isn't in, which the city-scoped query above cannot return.
  const missing = outOfCityIds(placements, "requirement").filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) {
    let xq = db().from("requirements").select("*").in("id", missing).eq("status", "live").eq("is_active", true);
    if (viewerId) xq = xq.neq("profile_id", viewerId);
    if (filters.kind) xq = xq.eq("kind", filters.kind);
    if (filters.typeCode) xq = xq.eq("type_code", filters.typeCode);
    rows = [...(((await xq).data ?? []) as RequirementRow[]), ...rows];
  }

  const cityName = scope.cityName;

  const build = await cardBuilder(viewerId, rows, unlocked);

  const sections: Record<BrowseTier, BrowseCard[]> = { exact: [], adjacent: [], city: [], state: [], india: [] };
  // Boosted cards are pulled OUT of their tier and hoisted to the very top of the
  // list — the design has no separate "Promoted" section header, so they lead the
  // first section with their Promoted tag (Doc2 §9.2 "boosted top").
  const boosted: { card: BrowseCard; rank: number }[] = [];

  for (const r of rows) {
    const rank = placements.rank.get(r.id);
    const inExact = (r.area_ids ?? []).some((a) => anchorAreas.has(a));
    const inAdj = (r.area_ids ?? []).some((a) => adjacent.has(a));
    // A widened list is NOT tiered against the viewer's own areas — every card
    // in it is out-of-city by construction, so it belongs under the one header
    // that says so rather than being scattered into "Nearby".
    const tier: BrowseTier = fallback ?? (inExact ? "exact" : inAdj ? "adjacent" : "city");
    const card = build(r, tier, rank !== undefined);
    if (rank !== undefined) { boosted.push({ card, rank }); continue; }
    sections[tier].push(card);
  }

  boosted.sort((a, b) => a.rank - b.rank); // FIFO by boost start, like the feed
  const boostedCards = boosted.map((b) => b.card);

  const order: BrowseTier[] = ["exact", "adjacent", "city", "state", "india"];
  const built: BrowseSection[] = [];
  for (const tier of order) {
    if (!sections[tier].length) continue;
    // Header uses the first card's area for the "Nearby: X" phrasing.
    const firstArea = sections[tier][0]?.areaLabel ?? null;
    built.push({ tier, label: browseSectionLabel(tier, firstArea, scope, built.length === 0), cards: sections[tier] });
  }

  if (boostedCards.length) {
    if (built.length) built[0].cards = [...boostedCards, ...built[0].cards];
    else built.push({ tier: "exact", label: null, cards: boostedCards });
  }

  const total = built.reduce((n, s) => n + s.cards.length, 0);
  return { sections: built, unlocked, cityName, scope, empty: total === 0 ? emptyFor(scope) : null };
}

/**
 * Requirements matched to a builder's LIVE projects (P2 builder dashboard).
 *
 * Two things were wrong with the copy that lived in `lib/feed/service.ts`:
 *
 *  1. It shipped the FULL requirement (budget, notes, poster) to every builder,
 *     with no access check at all — the ₹9,999 plan is what buys that, and a
 *     builder whose plan lapsed kept reading budgets here while the requirement
 *     detail behind the card correctly locked them.
 *  2. It decided "residential" from a hardcoded list of seven type codes in
 *     TypeScript. The pairing is a DB fact: `project_types.property_type_codes`
 *     (the same mapping the feed's type rails use, migration 0123).
 *
 * Both now come from the shared engine: same access strip, same card shape, same
 * tier labels as browse.
 */
export interface MatchedRequirementCard {
  card: BrowseCard;
  /** Which of the builder's projects pulled it in. */
  matchedTo: string;
  tierLabel: string | null;
}

export async function matchRequirementsForProjects(
  builderId: string,
  projects: { id: string; name: string; project_type: string | null; city_id: string | null; area_id: string | null }[],
  limit = 8,
): Promise<MatchedRequirementCard[]> {
  const live = projects.filter((p) => p.city_id);
  if (!live.length) return [];

  // project_type → the property types that scheme actually sells. An empty
  // list ("Mixed use") means no type restriction rather than no matches.
  const { data: ptypes } = await db()
    .from("project_types")
    .select("code,property_type_codes")
    .in("code", [...new Set(live.map((p) => p.project_type).filter(Boolean))] as string[]);
  const typeMap = new Map(
    ((ptypes ?? []) as { code: string; property_type_codes: string[] | null }[]).map((t) => [t.code, t.property_type_codes ?? []]),
  );

  const unlocked = await hasRequirementAccess(builderId);
  const picked: { row: RequirementRow; matchedTo: string; tier: Tier; areaLabel: string | null }[] = [];
  const seen = new Set<string>();

  for (const p of live) {
    if (picked.length >= limit) break;
    const types = p.project_type ? typeMap.get(p.project_type) ?? [] : [];
    const adj = p.area_id ? await adjacentAreas([p.area_id]) : new Set<string>();

    let q = db()
      .from("requirements")
      .select("*")
      .eq("status", "live").eq("is_active", true).eq("kind", "sell")
      .eq("city_id", p.city_id as string)
      .neq("profile_id", builderId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (types.length) q = q.in("type_code", types);

    for (const r of (((await q).data ?? []) as RequirementRow[])) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const inExact = (r.area_ids ?? []).some((a) => a === p.area_id);
      const inAdj = (r.area_ids ?? []).some((a) => adj.has(a));
      picked.push({
        row: r,
        matchedTo: p.name,
        tier: inExact ? "exact" : inAdj ? "adjacent" : "city",
        areaLabel: r.area_label,
      });
      if (picked.length >= limit) break;
    }
  }

  const build = await cardBuilder(builderId, picked.map((p) => p.row), unlocked);
  return picked.map((p) => ({
    card: build(p.row, p.tier),
    matchedTo: p.matchedTo,
    tierLabel: tierLabel(p.tier, p.areaLabel, null),
  }));
}

function toBrowseCard(
  r: RequirementRow,
  unlocked: boolean,
  alreadySent: boolean,
  proposalCount: number,
  poster?: { name: string | null; role: string | null; verified: boolean },
  isBoosted = false,
  tier: BrowseTier = "city",
): BrowseCard {
  const kindLabel = r.kind === "rent" ? "Looking to Rent" : "Looking to Buy";
  const summary = [r.bhk ? `${r.bhk} BHK` : null, r.kind === "rent" ? "Rent" : "Buy", r.area_label ? `${r.area_label} area` : null]
    .filter(Boolean).join(" · ");
  const base: BrowseCard = {
    id: r.id,
    access: unlocked ? "unlocked" : "locked",
    kind: r.kind,
    kindLabel,
    typeCode: r.type_code,
    bhk: r.bhk,
    summary,
    isUrgent: r.urgency === "immediate",
    // Server-decided placement (Doc2 §13). A locked card still carries this flag:
    // the Promoted tag and the top slot are what the boost bought, while budget
    // and poster stay stripped — "locked-but-top" (Doc2 §9.2).
    isBoosted,
    postedAgo: timeAgo(r.created_at),
    tier,
  };
  if (!unlocked) return base; // locked: budget/poster simply absent from the payload
  return {
    ...base,
    budgetLabel: budgetLabelFor(r.budget_min_paise, r.budget_max_paise),
    areaLabel: r.area_label ?? undefined,
    posterName: poster?.name ?? "HomzList user",
    posterRole: poster?.role ?? undefined,
    posterVerified: poster?.verified ?? false,
    alreadySent,
    proposalCount,
  };
}

/** "₹40 Lakh – ₹60 Lakh" — mirrors dto.ts budgetLabel. */
function budgetLabelFor(min: number | null, max: number | null): string {
  const fmt = (paise: number) => {
    const r = paise / 100;
    if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
    if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} Lakh`;
    if (r >= 1_000) return `₹${+(r / 1_000).toFixed(2)} K`;
    return `₹${r}`;
  };
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
  if (max !== null) return `Up to ${fmt(max)}`;
  if (min !== null) return `${fmt(min)}+`;
  return "Budget flexible";
}

/** UTC → "2h ago" / "Yesterday" / "12 Jan" (Doc2 §15 IST display). */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
