import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import type { FeedCard } from "@/lib/feed/service";
import { hydrate, areaStats, searchProjects } from "@/lib/search/service";
import { buildPath, pluralLabel, type LandingSpec } from "./slugs";
import { renderIntro, renderFaqs, type Faq } from "./content";

/**
 * Turn a LandingSpec into a rendered page's worth of DATA (Doc3 §4 page anatomy):
 *   H1 = the exact query phrase
 *   → stats strip (measured)
 *   → listings grid
 *   → unique content block (rotating template, filled with measured values)
 *   → internal links: nearby areas (adjacency) + cross-links
 *   → FAQ (auto-answered from data)
 *   → breadcrumbs
 *
 * The indexability decision is made here and nowhere else: fewer than 3 live
 * listings → noindex, and the page shows a requirement CTA instead of pretending
 * to be a listings page (Doc3 §4).
 */

const db = () => createServiceClient();

/** Doc3 §4 — the floor below which a landing page is not worth indexing. */
export const INDEX_FLOOR = 3;

export interface LandingStats {
  count: number;
  avgPerSqft: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  projectCount: number;
  /**
   * Which intent the price figures describe.
   *
   * A page that spans BOTH sale and rent (an area page, a city hub) cannot
   * quote one price envelope honestly — the minimum would be a ₹14k monthly
   * rent standing next to ₹1.9 Cr sale inventory. So the envelope is always
   * computed for a SINGLE intent (the one with more listings when the page
   * does not name one), and this field says which, so the label can too.
   */
  priceIntent: "sell" | "rent" | null;
}

export interface CrossLink { label: string; href: string }

export interface LandingPage {
  spec: LandingSpec;
  h1: string;
  title: string;
  description: string;
  canonical: string;
  indexable: boolean;
  stats: LandingStats;
  statsStrip: { value: string; label: string }[];
  intro: string | null;
  highlights: string | null;
  cards: FeedCard[];
  projects: FeedCard[];
  nearby: { label: string; href: string; count: number }[];
  crossLinks: CrossLink[];
  faqs: Faq[];
  breadcrumbs: { label: string; href: string }[];
  /** Chips under the highlights block (design S4). */
  chips: { label: string; href: string; active: boolean }[];
  updatedLabel: string;
  lastmod: string;
}

/** "Flats for Sale in Mavdi, Rajkot" — the H1, and the phrase every formula reuses. */
export function queryPhrase(spec: LandingSpec): string {
  const place = spec.area ? `${spec.area.name}, ${spec.city.name}` : spec.city.name;
  if (spec.kind === "projects") return `New Projects in ${place}`;
  if (spec.kind === "area") return `Property in ${place}`;
  if (spec.kind === "city" && !spec.typeLabelPlural) return `Property in ${place}`;

  const bits: string[] = [];
  if (spec.bhk) bits.push(`${spec.bhk} BHK`);
  bits.push(spec.typeLabelPlural ?? "Properties");
  if (spec.intent) bits.push(spec.intent === "rent" ? "for Rent" : "for Sale");
  return `${bits.join(" ")} in ${place}`;
}

export function intentPhrase(intent: "sell" | "rent" | null): string {
  return intent === "rent" ? "for rent" : intent === "sell" ? "for sale" : "listed";
}

export async function buildLandingPage(spec: LandingSpec, viewerId: string | null): Promise<LandingPage> {
  const scopeArea = spec.area?.id ?? null;

  // ---- the listing set + measured stats, one predicate for both -------------
  const stats = await statsFor(spec);
  const ids = await listingIds(spec, 12);
  const cards = await hydrate(ids, viewerId);

  const projects = spec.kind === "projects" || spec.kind === "area" || spec.kind === "city"
    ? (await searchProjects({ cityId: spec.city.id, areas: scopeArea ? [scopeArea] : undefined }, viewerId, 6)).items
    : [];

  const phrase = queryPhrase(spec);
  const place = spec.area ? `${spec.area.name}, ${spec.city.name}` : spec.city.name;
  const indexable = (spec.kind === "projects" ? projects.length : stats.count) >= INDEX_FLOOR;

  const [nearby, crossLinks] = await Promise.all([
    nearbyLinks(spec),
    crossLinksFor(spec),
  ]);

  const templateKind = spec.kind === "area" ? "area" : spec.kind === "city" ? "city" : "landing";
  const vars = await templateVars(spec, stats, nearby, projects.length);

  const [intro, faqs] = await Promise.all([
    renderIntro(templateKind, spec.path, vars),
    renderFaqs(templateKind, vars),
  ]);

  const lastmod = await lastModified(spec);

  return {
    spec,
    h1: phrase,
    title: buildTitle(spec, stats),
    description: buildDescription(spec, stats),
    canonical: buildPath(spec),
    indexable,
    stats,
    statsStrip: statsStrip(stats, spec),
    intro,
    highlights: spec.area?.highlights ?? spec.city.highlights ?? null,
    cards,
    projects,
    nearby,
    crossLinks,
    faqs,
    breadcrumbs: breadcrumbs(spec),
    chips: await chipsFor(spec),
    updatedLabel: freshnessLabel(lastmod),
    lastmod,
  };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function statsFor(spec: LandingSpec): Promise<LandingStats> {
  // The TOTAL is over the page's real scope (sale + rent when it spans both).
  const total = await scopedCount(spec);

  // The price ENVELOPE is always single-intent. When the page names an intent
  // that is the one; otherwise pick whichever side has more inventory, so the
  // figures describe a coherent market rather than two mixed together.
  let priceIntent: "sell" | "rent" | null = spec.intent;
  let envelope = total;
  if (!spec.intent) {
    const [sale, rent] = await Promise.all([
      scopedCount({ ...spec, intent: "sell" }),
      scopedCount({ ...spec, intent: "rent" }),
    ]);
    if (sale.count === 0 && rent.count === 0) {
      priceIntent = null;
      envelope = { count: 0, min: null, max: null, avg: null };
    } else if (sale.count >= rent.count) {
      priceIntent = "sell"; envelope = sale;
    } else {
      priceIntent = "rent"; envelope = rent;
    }
  }

  const projectCount = spec.area
    ? (await areaStats(spec.area.id)).projectCount
    : ((await db().from("projects").select("id", { count: "exact", head: true })
        .eq("status", "live").eq("city_id", spec.city.id)).count ?? 0);

  return {
    count: total.count,
    avgPerSqft: envelope.avg,
    minPrice: envelope.min,
    maxPrice: envelope.max,
    projectCount,
    priceIntent,
  };
}

/** Count + price envelope for any spec scope, straight off the listings table. */
async function scopedCount(spec: LandingSpec): Promise<{ count: number; min: number | null; max: number | null; avg: number | null }> {
  let q = db().from("listings")
    .select("price_paise,area_sqft")
    .eq("status", "live").eq("availability", "available")
    .eq("city_id", spec.city.id);
  if (spec.area) q = q.eq("area_id", spec.area.id);
  if (spec.typeCodes.length) q = q.in("type_code", spec.typeCodes);
  if (spec.intent) q = q.eq("kind", spec.intent);
  if (spec.bhk) q = q.eq("attributes->>bhk", spec.bhk);

  const { data } = await q.limit(2000);
  const rows = ((data ?? []) as { price_paise: number | null; area_sqft: number | null }[]);
  const priced = rows.map((r) => r.price_paise).filter((p): p is number => p != null);
  const perSqft = rows
    .filter((r) => r.price_paise != null && (r.area_sqft ?? 0) > 0)
    .map((r) => (r.price_paise! / 100) / r.area_sqft!);
  return {
    count: rows.length,
    min: priced.length ? Math.min(...priced) : null,
    max: priced.length ? Math.max(...priced) : null,
    avg: perSqft.length ? Math.round(perSqft.reduce((a, b) => a + b, 0) / perSqft.length) : null,
  };
}

async function listingIds(spec: LandingSpec, limit: number): Promise<string[]> {
  let q = db().from("listings")
    .select("id")
    .eq("status", "live").eq("availability", "available")
    .eq("city_id", spec.city.id)
    .order("live_at", { ascending: false })
    .limit(limit);
  if (spec.area) q = q.eq("area_id", spec.area.id);
  if (spec.typeCodes.length) q = q.in("type_code", spec.typeCodes);
  if (spec.intent) q = q.eq("kind", spec.intent);
  if (spec.bhk) q = q.eq("attributes->>bhk", spec.bhk);
  const { data } = await q;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Internal-link block: nearby areas via adjacency, with real counts. */
async function nearbyLinks(spec: LandingSpec): Promise<{ label: string; href: string; count: number }[]> {
  let candidateIds: string[] = [];

  if (spec.area) {
    const { data } = await db().from("location_adjacency").select("adjacent_id").eq("location_id", spec.area.id);
    candidateIds = ((data ?? []) as { adjacent_id: string }[]).map((r) => r.adjacent_id);
  }
  // No adjacency (or a city-level page) → the city's other localities.
  if (!candidateIds.length) {
    const { data } = await db().from("locations").select("id")
      .eq("level", "area").eq("parent_id", spec.city.id).eq("is_active", true).limit(12);
    candidateIds = ((data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => id !== spec.area?.id);
  }
  if (!candidateIds.length) return [];

  const { data: locs } = await db().from("locations").select("id,name,slug").in("id", candidateIds).eq("is_active", true);
  const rows = ((locs ?? []) as { id: string; name: string; slug: string }[]);

  const out: { label: string; href: string; count: number }[] = [];
  for (const r of rows) {
    // Count within the SAME type/intent scope, so the chip's number matches
    // what the visitor will actually find when they follow it.
    const scoped: LandingSpec = { ...spec, area: { id: r.id, name: r.name, slug: r.slug, highlights: null } };
    const c = await scopedCount(scoped);
    if (c.count === 0) continue;
    out.push({ label: `${r.name} (${c.count})`, href: buildPath(scoped), count: c.count });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 6);
}

/**
 * "Also explore" cross-links (Doc3 §4: "2BHK in Mavdi | Plots in Mavdi | Rent
 * in Mavdi"). Only links that lead to a page with listings are emitted — a
 * cross-link block full of empty pages is the classic programmatic-SEO
 * self-inflicted wound.
 */
async function crossLinksFor(spec: LandingSpec): Promise<CrossLink[]> {
  const out: CrossLink[] = [];
  const seen = new Set<string>([spec.path]);

  const push = async (variant: Omit<LandingSpec, "path">, label: string) => {
    const path = buildPath(variant);
    if (seen.has(path) || out.length >= 6) return;
    const c = await scopedCount({ ...variant, path });
    if (c.count === 0) return;
    seen.add(path);
    out.push({ label, href: path });
  };

  const place = spec.area?.name ?? spec.city.name;
  const { data: typeRows } = await db().from("property_types").select("code,label,category").eq("is_active", true).order("sort_order");
  const allTypes = ((typeRows ?? []) as { code: string; label: string; category: string }[]);
  const currentType = spec.typeCodes.length === 1 ? allTypes.find((t) => t.code === spec.typeCodes[0]) : null;

  // BHK variants of the same type.
  if (currentType?.category === "residential") {
    for (const b of ["2", "3"]) {
      if (b === spec.bhk) continue;
      await push({ ...spec, bhk: b }, `${b} BHK ${pluralLabel(currentType.label)} in ${place}`);
    }
  }
  // The other intent.
  if (spec.intent) {
    const other = spec.intent === "rent" ? "sell" : "rent";
    await push({ ...spec, intent: other, bhk: null }, `${spec.typeLabelPlural ?? "Properties"} for ${other === "rent" ? "Rent" : "Sale"} in ${place}`);
  }
  // Sibling types in the same place.
  for (const t of allTypes) {
    if (t.code === currentType?.code) continue;
    await push(
      { ...spec, typeCodes: [t.code], typeLabel: t.label, typeLabelPlural: pluralLabel(t.label), bhk: null, intent: t.category === "pg" ? null : spec.intent },
      `${pluralLabel(t.label)} in ${place}`,
    );
    if (out.length >= 5) break;
  }
  // New projects.
  const projPath = buildPath({ ...spec, kind: "projects", typeCodes: [], typeLabel: null, typeLabelPlural: "New Projects", intent: null, bhk: null });
  if (!seen.has(projPath)) {
    const { count } = await db().from("projects").select("id", { count: "exact", head: true })
      .eq("status", "live").eq("city_id", spec.city.id)
      .filter("area_id", spec.area ? "eq" : "not.is", spec.area ? spec.area.id : null);
    if ((count ?? 0) > 0) out.push({ label: `New Projects in ${place}`, href: projPath });
  }

  return out.slice(0, 6);
}

/** Filter chips on the area page (design S4) — each is a real landing URL. */
async function chipsFor(spec: LandingSpec): Promise<{ label: string; href: string; active: boolean }[]> {
  const chips: { label: string; href: string; active: boolean }[] = [];
  const base: Omit<LandingSpec, "path"> = { ...spec, kind: "landing" };

  const variants: { label: string; v: Omit<LandingSpec, "path">; on: boolean }[] = [
    { label: "For Sale", v: { ...base, intent: "sell", bhk: null }, on: spec.intent === "sell" },
    { label: "For Rent", v: { ...base, intent: "rent", bhk: null }, on: spec.intent === "rent" },
    { label: "2 BHK", v: { ...base, bhk: "2" }, on: spec.bhk === "2" },
    { label: "3 BHK", v: { ...base, bhk: "3" }, on: spec.bhk === "3" },
  ];

  for (const { label, v, on } of variants) {
    // Only offer a chip that leads somewhere. A "3 BHK" chip on an area with no
    // 3 BHK listings is a dead end and a thin page waiting to be indexed.
    const c = await scopedCount({ ...v, path: "" });
    if (c.count === 0 && !on) continue;
    chips.push({ label, href: buildPath(v), active: on });
  }
  return chips;
}

function statsStrip(stats: LandingStats, spec: LandingSpec): { value: string; label: string }[] {
  const range = stats.minPrice != null && stats.maxPrice != null
    ? (stats.minPrice === stats.maxPrice
        ? formatShortRupees(stats.minPrice)
        : `${formatShortRupees(stats.minPrice)}–${formatShortRupees(stats.maxPrice)}`)
    : "—";
  // When the page spans both intents the envelope covers only one of them, so
  // the label has to say which — "Price range" alone would misrepresent it.
  const rangeLabel = !spec.intent && stats.priceIntent
    ? `${stats.priceIntent === "rent" ? "Rent" : "Sale"} range`
    : "Price range";
  return [
    { value: String(stats.count), label: stats.count === 1 ? "Listing" : "Listings" },
    { value: stats.avgPerSqft ? `₹${stats.avgPerSqft.toLocaleString("en-IN")}` : "—", label: "Avg /sqft" },
    { value: range, label: rangeLabel },
  ];
}

function breadcrumbs(spec: LandingSpec): { label: string; href: string }[] {
  const out = [{ label: "Home", href: "/" }, { label: spec.city.name, href: `/${spec.city.slug}` }];
  if (spec.area) out.push({ label: spec.area.name, href: `/area/${spec.area.slug}-${spec.city.slug}` });
  if (spec.kind === "landing" || spec.kind === "projects") {
    const tail = spec.kind === "projects"
      ? "New Projects"
      : [spec.bhk ? `${spec.bhk} BHK` : null, spec.typeLabelPlural, spec.intent ? (spec.intent === "rent" ? "for Rent" : "for Sale") : null].filter(Boolean).join(" ");
    if (tail) out.push({ label: tail, href: spec.path });
  }
  return out;
}

async function lastModified(spec: LandingSpec): Promise<string> {
  let q = db().from("listings").select("updated_at,live_at")
    .eq("status", "live").eq("availability", "available").eq("city_id", spec.city.id)
    .order("updated_at", { ascending: false }).limit(1);
  if (spec.area) q = q.eq("area_id", spec.area.id);
  if (spec.typeCodes.length) q = q.in("type_code", spec.typeCodes);
  const { data } = await q;
  const r = ((data ?? []) as { updated_at: string | null; live_at: string | null }[])[0];
  return (r?.updated_at ?? r?.live_at ?? new Date().toISOString());
}

/** Doc3 §4 freshness signal — "Updated this week". Derived, never a constant. */
export function freshnessLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 1) return "Updated today";
  if (days <= 7) return "Updated this week";
  if (days <= 31) return "Updated this month";
  return `Updated ${new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
}

// ---------------------------------------------------------------------------
// Title / meta formulas (Doc3 §4)
// ---------------------------------------------------------------------------

/**
 * `{Type} for {Sale|Rent} in {Area}, {City} - {count}+ Listings | HomzList`
 * capped at 60 characters. The cap is applied by dropping the least important
 * parts in order, never by chopping mid-word.
 */
export function buildTitle(spec: LandingSpec, stats: LandingStats): string {
  const phrase = queryPhrase(spec);
  const n = spec.kind === "projects" ? stats.projectCount : stats.count;
  const withAll = `${phrase} - ${n}+ Listings | HomzList`;
  if (withAll.length <= 60) return withAll;
  const withCount = `${phrase} - ${n}+ Listings`;
  if (withCount.length <= 60) return withCount;
  const withBrand = `${phrase} | HomzList`;
  if (withBrand.length <= 60) return withBrand;
  return phrase.length <= 60 ? phrase : `${phrase.slice(0, 57).trimEnd()}…`;
}

/**
 * `Find {count}+ verified {type} for {sale} in {area}, {city}. Prices from
 * {min}. Photos, direct owner contact, no spam calls. Updated {Month Year}.`
 * ~155 characters.
 */
export function buildDescription(spec: LandingSpec, stats: LandingStats): string {
  const place = spec.area ? `${spec.area.name}, ${spec.city.name}` : spec.city.name;
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const typeWord = (spec.typeLabelPlural ?? "properties").toLowerCase();
  const n = spec.kind === "projects" ? stats.projectCount : stats.count;

  const head = spec.kind === "projects"
    ? `Explore ${n} new projects in ${place}.`
    : `Find ${n}+ verified ${typeWord} ${intentPhrase(spec.intent)} in ${place}.`;

  // "Prices from X" only on an INTENT-SCOPED page. On a mixed sale+rent page
  // the minimum is a monthly rent (₹14,471) sitting next to sale inventory, so
  // the sentence reads as if flats start at fourteen thousand rupees. Dropping
  // the clause is better than quoting a number that means something else.
  const price = spec.intent && stats.minPrice != null
    ? ` Prices from ${formatShortRupees(stats.minPrice)}.`
    : "";
  const tail = ` Photos, direct owner contact, no spam calls. Updated ${month}.`;

  const full = `${head}${price}${tail}`;
  return full.length <= 158 ? full : `${head}${price}`.slice(0, 155).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Template variables — every one MEASURED
// ---------------------------------------------------------------------------

export interface TemplateVars extends Record<string, string | null> {
  area: string; city: string; count: string;
  min: string | null; max: string | null; avg: string | null;
  type: string; typePlural: string; aTypeSingular: string;
  intentPhrase: string; month: string;
  nearbyList: string | null; projectAnswer: string | null;
}

async function templateVars(
  spec: LandingSpec,
  stats: LandingStats,
  nearby: { label: string; count: number }[],
  projectCount: number,
): Promise<TemplateVars> {
  const typeSingular = spec.typeLabel ?? "property";
  const typePlural = (spec.typeLabelPlural ?? "properties").toLowerCase();
  const article = /^[aeiou]/i.test(typeSingular) ? "an" : "a";

  return {
    area: spec.area?.name ?? spec.city.name,
    city: spec.city.name,
    count: String(spec.kind === "projects" ? projectCount : stats.count),
    min: stats.minPrice != null ? formatShortRupees(stats.minPrice) : null,
    max: stats.maxPrice != null ? formatShortRupees(stats.maxPrice) : null,
    avg: stats.avgPerSqft != null ? `₹${stats.avgPerSqft.toLocaleString("en-IN")} per sqft` : null,
    type: typeSingular.toLowerCase(),
    typePlural,
    aTypeSingular: `${article} ${typeSingular.toLowerCase()}`,
    intentPhrase: intentPhrase(spec.intent),
    month: new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    nearbyList: nearby.length ? listPhrase(nearby.map((n) => n.label.replace(/\s*\(\d+\)$/, ""))) : null,
    projectAnswer: projectCount > 0
      ? `Yes — there ${projectCount === 1 ? "is 1 project" : `are ${projectCount} projects`} listed in ${spec.area?.name ?? spec.city.name} on HomzList right now, with unit sizes and builder details on each project page.`
      : null,
  };
}

function listPhrase(items: string[]): string {
  const a = items.slice(0, 4);
  if (a.length <= 1) return a[0] ?? "";
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}
