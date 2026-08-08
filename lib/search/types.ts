/**
 * Search types shared by the server engine and the client (Doc2 §12, Doc7 §108-114).
 *
 * The filter object is the ONE serialisable description of a search. It is what
 * the URL carries, what `saved_searches.params` stores, and what the alert job
 * replays months later — so it must stay plain data with no functions and no
 * client-derived values.
 */

export type SearchMode = "property" | "requirement";
export type SearchTab = "all" | "properties" | "projects" | "brokers" | "areas";
export type SearchSort = "latest" | "nearby" | "price_asc" | "price_desc";

/** Every filter the P3 sheet can set. All optional — absent means "no constraint". */
export interface SearchFilters {
  /** Free text as typed. Unicode preserved verbatim (all-Indian-script input). */
  q?: string;
  /** "Looking to" — maps to listings.kind. */
  intent?: "sell" | "rent";
  /** property_types.code values (DB-driven chips, never a hardcoded list). */
  types?: string[];
  /**
   * project_types.code values — the Projects tab's equivalent of `types`.
   * Carried by the feed's per-scheme-type rails ("Plotting schemes → View
   * all"), so the results page opens on exactly the set the rail showed.
   */
  ptypes?: string[];
  /**
   * profiles.role values for the Brokers & Builders tab. The feed's Top
   * Developers / Featured Brokers rails are the same tab narrowed to one role.
   */
  roles?: string[];
  /** location ids (areas). Empty → whole city. */
  areas?: string[];
  /** location id (city). Falls back to the viewer's city, then to none. */
  cityId?: string;
  /**
   * location id (state) — used INSTEAD of cityId when the feed has widened
   * because the viewer's city holds no live inventory (lib/feed/scope). It
   * exists so the Featured Developers / Featured Brokers rails follow the same widening as
   * the cards beside them, rather than dropping the location filter and ranking
   * over the whole country. Ignored when cityId is present.
   */
  stateId?: string;
  /** Budget in RUPEES (not paise) — the slider's unit. Server converts. */
  budgetMin?: number;
  budgetMax?: number;
  /** amenities.code values. A listing must have ALL selected amenities. */
  amenities?: string[];
  /**
   * Per-type attribute facets, keyed by field_definitions.key:
   *   { bhk: ["2","3"], furnishing: ["semi"], road_width: ["30 ft"] }
   * Values are the facet's option value or bucket label — the server resolves
   * buckets to numeric ranges from `search_filter_facets`, never the client.
   */
  attrs?: Record<string, string[]>;
  /** The design's "More" toggle rows. */
  negotiableOnly?: boolean;
  readyToMove?: boolean;
  newConstruction?: boolean;
  verifiedOnly?: boolean;
}

export interface SearchOptions {
  tab?: SearchTab;
  sort?: SearchSort;
  cursor?: string | null;
  limit?: number;
  /** Suppress the nearby cascade (the area page shows one area only). */
  noCascade?: boolean;
}

/** A result section — the cascade renders these as "NEARBY: University Road". */
export interface SearchSection<T> {
  /** NULL for the exact-match block; a label for each cascade tier. */
  label: string | null;
  items: T[];
}

export interface BrokerResult {
  id: string;
  name: string;
  username: string | null;
  role: string | null;
  verified: boolean;
  avatarUrl: string | null;
  /** "24 listings · Usually responds in 2 hours" — both halves measured. */
  stats: string;
  listingCount: number;
}

export interface AreaResult {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  label: string;
  /** "1,240 properties · Avg ₹4,800/sqft" — both halves measured. */
  stats: string;
  listingCount: number;
}

export interface AutocompleteSuggestion {
  kind: "area" | "city";
  id: string;
  name: string;
  /** "1,240 properties" — a real count. */
  meta: string;
  slug: string;
  citySlug: string;
}

export interface AutocompletePage {
  /** "Flats for Sale in Mavdi — 45 listings" */
  name: string;
  href: string;
  count: number;
}

export interface AutocompleteRecent {
  id: string;
  query: string;
  targetKind: string | null;
  targetSlug: string | null;
}

export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  pages: AutocompletePage[];
  recents: AutocompleteRecent[];
  /**
   * Set when the query names a city we have master data for but have NOT
   * launched (or no data at all) — the client routes to P3-S5 Coming-soon.
   */
  comingSoonCity: { name: string; slug: string | null } | null;
}

/** One facet section in the filter sheet, fully described by the server. */
export interface FilterFacet {
  key: string;
  label: string;
  control: "chips" | "toggle" | "range";
  options: { label: string; value: string }[];
  /** Which property types reveal this facet (drives the design's dynamic sections). */
  forTypes: string[];
}

export interface FilterConfig {
  types: { code: string; label: string; category: string }[];
  amenities: { code: string; label: string; category: string }[];
  facets: FilterFacet[];
  areas: { id: string; name: string }[];
  /** Slider bounds in rupees, derived from live inventory — not a magic 0-3Cr. */
  budget: { min: number; max: number; step: number };
}
