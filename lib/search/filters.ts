import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilterConfig, FilterFacet, SearchFilters } from "./types";
import { keysForKind } from "@/lib/listings/visibility";

/**
 * The filter sheet's schema, built entirely from master data (CLAUDE.md rule 12).
 *
 * Nothing about the P3 filter sheet is hardcoded in a component:
 *   • the type chips  ← property_types
 *   • the amenity chips ← amenities
 *   • which sections a type reveals ← property_types.field_config.fields
 *   • each section's chips ← field_definitions.options, or the search buckets
 *     in search_filter_facets for numeric fields
 *   • the budget slider's bounds ← the actual live inventory
 *
 * Adding a property type, an amenity or a facet is a data change, never a code
 * change — which is the whole point of the config tables.
 */

const db = () => createServiceClient();

interface FacetRow {
  field_key: string;
  label: string | null;
  control: "chips" | "toggle" | "range";
  buckets: { label: string; min: number | null; max: number | null }[] | null;
  source: "attribute" | "column";
  column_name: string | null;
  sort_order: number;
}

interface FieldDefRow {
  key: string;
  label: string;
  options: { label: string; value: string }[] | null;
}

/** Cached per process — master data changes rarely and this runs on every search. */
let cache: { at: number; value: FilterConfig } | null = null;
const TTL_MS = 60_000;

export async function getFilterConfig(cityId?: string | null): Promise<FilterConfig> {
  // The area list is city-scoped, so only the city-independent part is cached.
  const base = cache && Date.now() - cache.at < TTL_MS ? cache.value : await buildBase();
  if (!cache || Date.now() - cache.at >= TTL_MS) cache = { at: Date.now(), value: base };

  const areas = await areasFor(cityId ?? null);
  return { ...base, areas };
}

async function buildBase(): Promise<FilterConfig> {
  const [{ data: typeRows }, { data: amenityRows }, { data: facetRows }, { data: fieldRows }, budget] = await Promise.all([
    db().from("property_types").select("code,label,category,field_config,sort_order").eq("is_active", true).order("sort_order"),
    db().from("amenities").select("code,label,category,sort_order").eq("is_active", true).order("sort_order"),
    db().from("search_filter_facets").select("*").eq("is_active", true).order("sort_order"),
    db().from("field_definitions").select("key,label,options").eq("is_active", true),
    budgetBounds(),
  ]);

  const fields = new Map<string, FieldDefRow>(((fieldRows ?? []) as FieldDefRow[]).map((f) => [f.key, f]));
  const types = ((typeRows ?? []) as { code: string; label: string; category: string; field_config: { fields?: string[]; sell_fields?: string[]; rent_fields?: string[] } }[]);

  // Which types reveal each facet — the inverse of field_config.fields. This is
  // exactly the design's "selecting Flat reveals BHK…, selecting Plot hides
  // BHK and reveals Road width…", derived rather than written down twice.
  const facets: FilterFacet[] = ((facetRows ?? []) as FacetRow[]).map((f) => {
    const def = fields.get(f.field_key);
    const options = f.buckets?.length
      ? f.buckets.map((b) => ({ label: b.label, value: b.label }))
      : (def?.options ?? []);
    return {
      key: f.field_key,
      label: f.label ?? def?.label ?? f.field_key,
      control: f.control,
      options,
      // Per-kind extras count too. Ownership and the bank-loan flag moved into
      // `sell_fields` and the rent terms into `rent_fields` (migration 0060);
      // reading only `fields` silently dropped those facets out of the sheet.
      forTypes: types
        .filter((t) => keysForKind(t.field_config, "sell").includes(f.field_key)
          || keysForKind(t.field_config, "rent").includes(f.field_key))
        .map((t) => t.code),
    };
  })
    // A chips facet with no options would render an empty section — drop it
    // rather than ship a heading with nothing under it.
    .filter((f) => f.control !== "chips" || f.options.length > 0)
    // A facet no live type uses is dead weight in the sheet.
    .filter((f) => f.forTypes.length > 0);

  return {
    types: types.map((t) => ({ code: t.code, label: t.label, category: t.category })),
    amenities: ((amenityRows ?? []) as { code: string; label: string; category: string }[]),
    facets,
    areas: [],
    budget,
  };
}

async function areasFor(cityId: string | null): Promise<{ id: string; name: string }[]> {
  let q = db().from("locations").select("id,name").eq("level", "area").eq("is_active", true).order("name");
  if (cityId) q = q.eq("parent_id", cityId);
  const { data } = await q.limit(200);
  return ((data ?? []) as { id: string; name: string }[]);
}

/**
 * Slider bounds from real inventory, rounded outward to a clean lakh figure.
 * The design's 0-3Cr range is a prototype constant; shipping it would hide
 * anything dearer and leave dead track below the cheapest listing.
 */
async function budgetBounds(): Promise<{ min: number; max: number; step: number }> {
  const { data } = await db()
    .from("listings")
    .select("price_paise")
    .eq("status", "live")
    .eq("availability", "available")
    .not("price_paise", "is", null)
    .order("price_paise", { ascending: false })
    .limit(1);
  const topPaise = ((data ?? []) as { price_paise: number }[])[0]?.price_paise ?? 30_000_000_000;
  const topLakh = Math.ceil(topPaise / 100 / 100_000 / 10) * 10; // → next 10-lakh step
  return { min: 0, max: Math.max(topLakh, 50), step: 5 };
}

/** Resolve a bucket label back to its numeric range (server-side only). */
export async function bucketRange(fieldKey: string, label: string): Promise<{ min: number | null; max: number | null } | null> {
  const { data } = await db().from("search_filter_facets").select("buckets").eq("field_key", fieldKey).maybeSingle();
  const buckets = (data as { buckets: { label: string; min: number | null; max: number | null }[] | null } | null)?.buckets;
  return buckets?.find((b) => b.label === label) ?? null;
}

// ---------------------------------------------------------------------------
// URL <-> filters. One encoding, used by the results page, the API and saved
// searches, so a shared link reproduces the exact same result set.
// ---------------------------------------------------------------------------

const LIST_KEYS = ["types", "areas", "amenities"] as const;
const BOOL_KEYS = ["negotiableOnly", "readyToMove", "newConstruction", "verifiedOnly"] as const;

export function filtersToParams(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.intent) p.set("intent", f.intent);
  if (f.cityId) p.set("city", f.cityId);
  for (const k of LIST_KEYS) {
    const v = f[k];
    if (v?.length) p.set(k, v.join(","));
  }
  if (f.budgetMin != null) p.set("bmin", String(f.budgetMin));
  if (f.budgetMax != null) p.set("bmax", String(f.budgetMax));
  for (const k of BOOL_KEYS) if (f[k]) p.set(k, "1");
  for (const [key, vals] of Object.entries(f.attrs ?? {})) {
    if (vals.length) p.set(`a.${key}`, vals.join(","));
  }
  return p;
}

export function paramsToFilters(p: URLSearchParams): SearchFilters {
  const list = (k: string) => {
    const raw = p.get(k);
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  };
  const num = (k: string) => {
    const raw = p.get(k);
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const attrs: Record<string, string[]> = {};
  for (const [k, v] of p.entries()) {
    if (!k.startsWith("a.") || !v) continue;
    const key = k.slice(2);
    // Guard the key shape here — it is interpolated into a jsonb path below.
    if (!/^[a-z0-9_]{1,40}$/.test(key)) continue;
    attrs[key] = v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  }

  const intent = p.get("intent");
  return {
    q: p.get("q")?.slice(0, 120) || undefined,
    intent: intent === "sell" || intent === "rent" ? intent : undefined,
    cityId: p.get("city") || undefined,
    types: list("types")?.slice(0, 20),
    areas: list("areas")?.slice(0, 30),
    amenities: list("amenities")?.slice(0, 30),
    budgetMin: num("bmin"),
    budgetMax: num("bmax"),
    attrs: Object.keys(attrs).length ? attrs : undefined,
    negotiableOnly: p.get("negotiableOnly") === "1" || undefined,
    readyToMove: p.get("readyToMove") === "1" || undefined,
    newConstruction: p.get("newConstruction") === "1" || undefined,
    verifiedOnly: p.get("verifiedOnly") === "1" || undefined,
  };
}

/**
 * The badge on the filter icon: how many filter GROUPS are active. Counted
 * server-side so the badge can never disagree with the result set.
 */
export function activeFilterCount(f: SearchFilters): number {
  let n = 0;
  if (f.intent) n++;
  if (f.types?.length) n++;
  if (f.areas?.length) n++;
  if (f.amenities?.length) n++;
  if (f.budgetMin != null || f.budgetMax != null) n++;
  for (const vals of Object.values(f.attrs ?? {})) if (vals.length) n++;
  for (const k of BOOL_KEYS) if (f[k]) n++;
  return n;
}
