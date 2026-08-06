import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The programmatic landing-page matrix (Doc3 §4).
 *
 * Every combination of city × area × type × intent × BHK is addressable at a
 * lowercase-hyphen URL, generated from master data — there is no table of
 * pages, because a table would go stale the moment an admin adds a property
 * type or a locality. The slug IS the query.
 *
 *   /flats-for-sale-in-rajkot
 *   /flats-for-sale-in-mavdi-rajkot
 *   /2-bhk-flats-for-rent-in-rajkot
 *   /plots-for-sale-in-mavdi-rajkot
 *   /pg-in-rajkot                          (PG has no sale/rent split)
 *   /commercial-shops-for-rent-in-rajkot
 *   /new-projects-in-rajkot
 *   /rajkot                                (city hub)
 *
 * Parsing is strict: anything that does not resolve to real master data
 * returns null, and the route 404s. That matters — a loose parser on a root
 * catch-all turns every typo into a thin indexable page, which is precisely
 * how programmatic SEO gets a site penalised.
 */

const db = () => createServiceClient();

export type LandingKind = "landing" | "area" | "city" | "projects";

export interface LandingSpec {
  kind: LandingKind;
  /** Resolved master data. */
  city: { id: string; name: string; slug: string; highlights: string | null };
  area: { id: string; name: string; slug: string; highlights: string | null } | null;
  /** property_types.code — empty means "all types". */
  typeCodes: string[];
  /** The label used in prose: "Flat" → "Flats". */
  typeLabel: string | null;
  typeLabelPlural: string | null;
  intent: "sell" | "rent" | null;
  bhk: string | null;
  /** The canonical path this spec re-serialises to. */
  path: string;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** "Flat" → "Flats", "PG / Hostel" → "PG", "Agriculture Land" → "Agriculture Land". */
export function pluralLabel(label: string): string {
  if (label.includes("/")) return label.split("/")[0].trim();     // "PG / Hostel" → "PG"
  if (/(?:land|property)$/i.test(label)) return label;            // uncountable-ish
  if (/s$/i.test(label)) return label;
  if (/y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

interface TypeRow { code: string; label: string; category: string }

interface CityRow { id: string; name: string; slug: string; highlights: string | null }

/**
 * The launched-city list, memoised like `types()`.
 *
 * `resolvePlace` runs on EVERY hit to the root catch-all, including the misses
 * — `/asdf1`, `/asdf2`, … — so an unmemoised query here turns random-slug
 * traffic into one DB round-trip per request against a table that changes
 * roughly never. 60s TTL keeps a newly-launched city appearing promptly.
 */
let cityCache: { at: number; rows: CityRow[] } | null = null;
async function launchedCities(): Promise<CityRow[]> {
  if (cityCache && Date.now() - cityCache.at < 60_000) return cityCache.rows;
  const { data } = await db()
    .from("locations").select("id,name,slug,highlights")
    .eq("level", "city").eq("is_active", true).eq("is_launched", true);
  const rows = ((data ?? []) as CityRow[]);
  cityCache = { at: Date.now(), rows };
  return rows;
}

/**
 * The floor at which a city opens on its OWN inventory — the same ≥3 threshold
 * a landing page needs to be indexable (Doc3 §4).
 */
export const CITY_INVENTORY_FLOOR = 3;

/**
 * The cities we render browse pages for: the ones an admin explicitly launched,
 * PLUS any city that has earned a page by carrying real inventory (≥3 live,
 * available listings).
 *
 * A seller can list in any town in the master (the city picker never gated on
 * launch). The gap that created was a live listing whose city hub/landing/area
 * all 404'd and whose search said "coming soon" while the listing sat right
 * there. Auto-opening a city once it clears the inventory floor closes that gap:
 * gating on real inventory instead of a manual flag, so Jamnagar's 8 listings
 * become a working `/jamnagar` the moment they're live.
 *
 * Memoised (60s) like the launched list — `resolvePlace` runs on every root
 * catch-all hit, misses included, so the inventory tally must not be per-request.
 */
let browsableCache: { at: number; rows: CityRow[]; ids: Set<string> } | null = null;
async function browsable(): Promise<{ rows: CityRow[]; ids: Set<string> }> {
  if (browsableCache && Date.now() - browsableCache.at < 60_000) return browsableCache;
  const launched = await launchedCities();
  const launchedIds = new Set(launched.map((c) => c.id));

  // Tally live inventory per city, keep the cities that clear the floor.
  const { data: lrows } = await db()
    .from("listings").select("city_id")
    .eq("status", "live").eq("availability", "available").limit(50_000);
  const tally = new Map<string, number>();
  for (const r of ((lrows ?? []) as { city_id: string | null }[])) {
    if (r.city_id) tally.set(r.city_id, (tally.get(r.city_id) ?? 0) + 1);
  }
  const extraIds = [...tally.entries()]
    .filter(([id, n]) => n >= CITY_INVENTORY_FLOOR && !launchedIds.has(id))
    .map(([id]) => id);

  let extras: CityRow[] = [];
  if (extraIds.length) {
    const { data } = await db()
      .from("locations").select("id,name,slug,highlights")
      .in("id", extraIds).eq("level", "city").eq("is_active", true);
    extras = ((data ?? []) as CityRow[]);
  }
  const rows = [...launched, ...extras];
  browsableCache = { at: Date.now(), rows, ids: new Set(rows.map((r) => r.id)) };
  return browsableCache;
}

/** The set of city ids that have a browse page — for the search/parse gate. */
export async function browsableCityIds(): Promise<Set<string>> {
  return (await browsable()).ids;
}

/** The city rows that have a browse page — for the sitemap. */
export async function browsableCities(): Promise<CityRow[]> {
  return (await browsable()).rows;
}

let typeCache: { at: number; rows: TypeRow[] } | null = null;
async function types(): Promise<TypeRow[]> {
  if (typeCache && Date.now() - typeCache.at < 60_000) return typeCache.rows;
  const { data } = await db().from("property_types").select("code,label,category").eq("is_active", true).order("sort_order");
  const rows = ((data ?? []) as TypeRow[]);
  typeCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Resolve a trailing place string to city (+ optional area).
 *
 * "mavdi-rajkot"              → area Mavdi in city Rajkot
 * "150-feet-ring-road-rajkot" → area 150 Feet Ring Road in Rajkot
 * "rajkot"                    → city only
 *
 * City slugs are globally unique (index in 0030), so the city is found by
 * matching the LONGEST city slug that the tail ends with; whatever precedes it
 * must then be an area slug inside that city.
 */
export async function resolvePlace(tail: string): Promise<{ city: any; area: any } | null> {
  if (!tail) return null;
  const cityRows = (await browsable()).rows;

  // Longest suffix wins, so "…-rajkot" is not stolen by a shorter city slug.
  const matches = cityRows
    .filter((c) => tail === c.slug || tail.endsWith(`-${c.slug}`))
    .sort((a, b) => b.slug.length - a.slug.length);
  const city = matches[0];
  if (!city) return null;

  if (tail === city.slug) return { city, area: null };

  const areaSlug = tail.slice(0, tail.length - city.slug.length - 1);
  const { data: areaRow } = await db()
    .from("locations").select("id,name,slug,highlights")
    .eq("level", "area").eq("parent_id", city.id).eq("slug", areaSlug).eq("is_active", true)
    .maybeSingle();
  if (!areaRow) return null;
  return { city, area: areaRow };
}

/**
 * Parse a root-level slug into a landing spec, or null if it is not one.
 * Returning null is important: the root catch-all must 404 rather than render
 * an empty page for anything it does not recognise.
 */
export async function parseLandingSlug(slug: string): Promise<LandingSpec | null> {
  const s = slugify(decodeURIComponent(slug ?? ""));
  if (!s || s.length > 120) return null;

  // ---- new-projects-in-<place> ----
  let m = /^new-projects-in-(.+)$/.exec(s);
  if (m) {
    const place = await resolvePlace(m[1]);
    if (!place) return null;
    return finish({
      kind: "projects", city: place.city, area: place.area,
      typeCodes: [], typeLabel: null, typeLabelPlural: "New Projects",
      intent: null, bhk: null,
    });
  }

  // ---- [<n>-bhk-] [commercial-] <typePlural> (-for-<intent>)? -in-<place> ----
  m = /^(.+?)-in-(.+)$/.exec(s);
  if (!m) {
    // Bare city hub: /rajkot
    const place = await resolvePlace(s);
    if (!place || place.area) return null;
    return finish({
      kind: "city", city: place.city, area: null,
      typeCodes: [], typeLabel: null, typeLabelPlural: null, intent: null, bhk: null,
    });
  }

  let head = m[1];
  const place = await resolvePlace(m[2]);
  if (!place) return null;

  // intent
  let intent: "sell" | "rent" | null = null;
  const im = /^(.*)-for-(sale|rent)$/.exec(head);
  if (im) { head = im[1]; intent = im[2] === "rent" ? "rent" : "sell"; }

  // BHK prefix
  let bhk: string | null = null;
  const bm = /^(\d)-bhk-(.*)$/.exec(head);
  if (bm) { bhk = bm[1]; head = bm[2]; }

  // "commercial-" is a CATEGORY prefix, not part of the type name.
  let categoryOnly: string | null = null;
  const cm = /^commercial-(.*)$/.exec(head);
  if (cm) { categoryOnly = "commercial"; head = cm[1] || "property"; }

  if (!head) return null;

  const typeRows = await types();

  // Match the head against pluralised, slugified type labels.
  let matched: TypeRow[] = [];
  let typeLabel: string | null = null;
  let typeLabelPlural: string | null = null;

  const exact = typeRows.find((t) => slugify(pluralLabel(t.label)) === head || slugify(t.label) === head);
  if (exact) {
    matched = [exact];
    typeLabel = exact.label;
    typeLabelPlural = pluralLabel(exact.label);
  } else if (head === "property" || head === "properties") {
    matched = categoryOnly ? typeRows.filter((t) => t.category === categoryOnly) : [];
    typeLabel = categoryOnly === "commercial" ? "Commercial Property" : "Property";
    typeLabelPlural = categoryOnly === "commercial" ? "Commercial Properties" : "Properties";
  } else {
    // A category name used as the type: /plots-in-…, /pg-in-…
    const byCategory = typeRows.filter((t) => slugify(t.category) === head || `${slugify(t.category)}s` === head);
    if (byCategory.length) {
      matched = byCategory;
      typeLabel = byCategory[0].label;
      typeLabelPlural = pluralLabel(byCategory[0].label);
    }
  }

  if (!matched.length && !typeLabelPlural) return null;
  if (categoryOnly && matched.length) matched = matched.filter((t) => t.category === categoryOnly);

  // PG is never "for sale" — reject the nonsense combination instead of
  // rendering a guaranteed-empty page that Google would index.
  if (matched.length === 1 && matched[0].category === "pg" && intent === "sell") return null;
  // BHK only makes sense for types that actually have a bhk field.
  if (bhk && matched.length && !matched.some((t) => t.category === "residential")) return null;

  return finish({
    kind: place.area ? "landing" : "landing",
    city: place.city, area: place.area,
    typeCodes: matched.map((t) => t.code),
    typeLabel, typeLabelPlural, intent, bhk,
  });
}

/** Parse the Doc7 §117 area URL: /area/mavdi-rajkot */
export async function parseAreaSlug(slug: string): Promise<LandingSpec | null> {
  const place = await resolvePlace(slugify(decodeURIComponent(slug ?? "")));
  if (!place) return null;
  return finish({
    kind: "area", city: place.city, area: place.area,
    typeCodes: [], typeLabel: null, typeLabelPlural: null, intent: null, bhk: null,
  });
}

function finish(partial: Omit<LandingSpec, "path">): LandingSpec {
  return { ...partial, path: buildPath(partial) };
}

/** Serialise a spec back to its canonical path — the <link rel=canonical>. */
export function buildPath(spec: Omit<LandingSpec, "path">): string {
  const place = spec.area ? `${spec.area.slug}-${spec.city.slug}` : spec.city.slug;
  if (spec.kind === "area") return `/area/${place}`;
  if (spec.kind === "projects") return `/new-projects-in-${place}`;
  if (spec.kind === "city" && !spec.typeLabelPlural) return `/${spec.city.slug}`;

  const parts: string[] = [];
  if (spec.bhk) parts.push(`${spec.bhk}-bhk`);
  parts.push(slugify(spec.typeLabelPlural ?? "properties"));
  let head = parts.join("-");
  if (spec.intent) head += `-for-${spec.intent === "rent" ? "rent" : "sale"}`;
  return `/${head}-in-${place}`;
}

/**
 * Enumerate the landing matrix for the sitemap. Only combinations that CLEAR
 * the indexability floor (≥3 live listings — Doc3 §4) are returned, so the
 * sitemap never advertises a noindex page.
 */
export interface MatrixEntry { path: string; count: number; lastmod: string }

export async function enumerateLandings(): Promise<MatrixEntry[]> {
  const { data } = await db()
    .from("listings")
    .select("type_code,kind,city_id,area_id,attributes,live_at,updated_at")
    .eq("status", "live").eq("availability", "available");
  const rows = ((data ?? []) as any[]);
  if (!rows.length) return [];

  // Only the locations the live inventory actually points at. Reading every
  // city and area used to be five rows; since migration 0054 it is 155k, and
  // none of the ones nobody has listed in can contribute a landing page.
  const referenced = [...new Set(rows.flatMap((l) => [l.city_id, l.area_id]).filter(Boolean) as string[])];
  const [{ data: locs }, typeRows, browsableIds] = await Promise.all([
    referenced.length
      ? db().from("locations").select("id,name,slug,level,parent_id,is_launched").in("id", referenced).eq("is_active", true)
      : Promise.resolve({ data: [] as any[] }),
    types(),
    browsableCityIds(),
  ]);
  const locMap = new Map<string, any>(((locs ?? []) as any[]).map((l) => [l.id, l]));
  const typeMap = new Map<string, TypeRow>(typeRows.map((t) => [t.code, t]));

  // Tally every combination the live inventory actually supports.
  const tally = new Map<string, { count: number; lastmod: string }>();
  const bump = (path: string, ts: string) => {
    const cur = tally.get(path);
    if (!cur) tally.set(path, { count: 1, lastmod: ts });
    else { cur.count++; if (ts > cur.lastmod) cur.lastmod = ts; }
  };

  for (const l of rows) {
    const city = l.city_id ? locMap.get(l.city_id) : null;
    // A city earns landing pages once it's launched OR clears the inventory
    // floor — the same rule that opens its hub in resolvePlace.
    if (!city || !browsableIds.has(city.id)) continue;
    const area = l.area_id ? locMap.get(l.area_id) : null;
    const type = typeMap.get(l.type_code);
    if (!type) continue;
    const ts = (l.updated_at ?? l.live_at ?? new Date().toISOString()).slice(0, 10);
    const intent: "sell" | "rent" = l.kind === "rent" ? "rent" : "sell";
    const bhk = typeof l.attributes?.bhk === "string" ? l.attributes.bhk : null;

    const places = area ? [{ area, city }, { area: null, city }] : [{ area: null, city }];
    for (const p of places) {
      const base = { kind: "landing" as const, city: p.city, area: p.area, typeCodes: [type.code], typeLabel: type.label, typeLabelPlural: pluralLabel(type.label), intent, bhk: null };
      bump(buildPath(base), ts);
      // …and the BHK variant for residential types.
      if (bhk && type.category === "residential" && /^[1-5]$/.test(bhk)) {
        bump(buildPath({ ...base, bhk }), ts);
      }
    }
  }

  // Doc3 §4: indexable only with ≥3 live listings.
  return [...tally.entries()]
    .filter(([, v]) => v.count >= 3)
    .map(([path, v]) => ({ path, count: v.count, lastmod: v.lastmod }))
    .sort((a, b) => b.count - a.count);
}
