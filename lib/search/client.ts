"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { FeedCard } from "@/lib/feed/client";
import type {
  AreaResult, AutocompleteResult, BrokerResult,
  FilterConfig, SearchFilters, SearchSection, SearchSort, SearchTab,
} from "./types";

/**
 * Client-side search API. Same discipline as the rest of the app: it asks the
 * server questions and renders the answers. No filtering, no counting, no
 * ranking and no indexability decision happens here.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      // Saved searches are re-read right after being created or deleted.
      // See lib/listings/client for the case this was caught on.
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    // Distinguished from a server error so the UI can show the offline banner
    // rather than a generic failure (Doc1: every screen has an offline state).
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export interface PropertySearchResponse {
  tab: SearchTab;
  sort: SearchSort;
  sections: SearchSection<FeedCard>[];
  total: number;
  /** Matching projects on the All tab (0 elsewhere); count line = total + this. */
  projectTotal: number;
  nextCursor: string | null;
  filterCount: number;
  scope: {
    cityId: string | null; cityName: string | null; citySlug: string | null;
    areaIds: string[]; areaNames: string[];
    typeCodes: string[]; intent: "sell" | "rent" | null; bhk: string[];
  };
  comingSoonCity: string | null;
}

export interface TabResponse<T> { tab: SearchTab; items: T[]; total: number; filterCount: number; /** Projects tab paginates (same live_at cursor the feed uses); other tabs return null. */ nextCursor?: string | null }

export interface ExploreTile {
  id: string; coverUrl: string | null; photoCount: number; promoted: boolean;
  price: string; sub: string; areaLabel: string | null;
}

export interface RecentRow {
  id: string; query: string; targetKind: string | null; targetSlug: string | null; createdAt: string;
}

export interface SavedSearchRow {
  id: string; label: string; mode: string; params: SearchFilters;
  alertsEnabled: boolean; lastMatchCount: number; createdAt: string;
}

export type SearchConfigResponse = FilterConfig & {
  popularAreas: { id: string; name: string; slug: string; count: number }[];
  cityId: string | null;
};

export const searchApi = {
  /** The results screen (All / Properties tabs). */
  properties: (qs: string) => req<PropertySearchResponse>(`/search?${qs}`),
  projects: (qs: string, cursor?: string | null) => req<TabResponse<FeedCard>>(`/search?${qs}&tab=projects${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  brokers: (qs: string) => req<TabResponse<BrokerResult>>(`/search?${qs}&tab=brokers`),
  areas: (qs: string) => req<TabResponse<AreaResult>>(`/search?${qs}&tab=areas`),

  /** The filter sheet's live "Show N properties" count. */
  count: (qs: string) => req<{ total: number; filterCount: number }>(`/search?${qs}&count=1`),

  autocomplete: (q: string, mode = "property") =>
    req<AutocompleteResult>(`/search/autocomplete?q=${encodeURIComponent(q)}&mode=${mode}`),

  config: (cityId?: string | null) =>
    req<SearchConfigResponse>(`/search/config${cityId ? `?city=${encodeURIComponent(cityId)}` : ""}`),

  explore: (cityId?: string | null) =>
    req<{ tiles: ExploreTile[] }>(`/search/explore${cityId ? `?city=${encodeURIComponent(cityId)}` : ""}`),

  recents: (mode = "property") => req<{ items: RecentRow[] }>(`/search/recent?mode=${mode}`),
  recordRecent: (query: string, opts: { mode?: string; targetKind?: string; targetSlug?: string | null } = {}) =>
    req<{ items: RecentRow[] }>("/search/recent", "POST", { query, ...opts }),
  removeRecent: (id: string, mode = "property") =>
    req<{ items: RecentRow[] }>(`/search/recent?id=${encodeURIComponent(id)}&mode=${mode}`, "DELETE"),
  clearRecents: (mode = "property") =>
    req<{ items: RecentRow[] }>(`/search/recent?mode=${mode}`, "DELETE"),

  savedList: () => req<{ items: SavedSearchRow[] }>("/search/saved"),
  save: (label: string, query: string) => req<{ saved: SavedSearchRow }>("/search/saved", "POST", { label, query }),
  setAlerts: (id: string, alertsEnabled: boolean) =>
    req<{ items: SavedSearchRow[] }>("/search/saved", "PATCH", { id, alertsEnabled }),
  removeSaved: (id: string) => req<{ items: SavedSearchRow[] }>(`/search/saved?id=${encodeURIComponent(id)}`, "DELETE"),

  registerCityInterest: (city: string, cityId?: string | null) =>
    req<{ registered: boolean; city: string; interestCount: number }>("/city/request", "POST", { city, cityId }),
};

// ---------------------------------------------------------------------------
// Filter <-> query-string, mirrored from lib/search/filters.ts
// ---------------------------------------------------------------------------
// The client needs to BUILD the query string it navigates to; the server owns
// PARSING it. Keeping the writer here and the reader there means a malformed
// or hand-edited URL is still validated server-side before it reaches SQL.

export function filtersToQuery(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.intent) p.set("intent", f.intent);
  if (f.cityId) p.set("city", f.cityId);
  if (f.types?.length) p.set("types", f.types.join(","));
  if (f.ptypes?.length) p.set("ptypes", f.ptypes.join(","));
  if (f.roles?.length) p.set("roles", f.roles.join(","));
  if (f.areas?.length) p.set("areas", f.areas.join(","));
  if (f.amenities?.length) p.set("amenities", f.amenities.join(","));
  if (f.budgetMin != null) p.set("bmin", String(f.budgetMin));
  if (f.budgetMax != null) p.set("bmax", String(f.budgetMax));
  if (f.negotiableOnly) p.set("negotiableOnly", "1");
  if (f.readyToMove) p.set("readyToMove", "1");
  if (f.newConstruction) p.set("newConstruction", "1");
  if (f.verifiedOnly) p.set("verifiedOnly", "1");
  for (const [k, v] of Object.entries(f.attrs ?? {})) if (v.length) p.set(`a.${k}`, v.join(","));
  return p.toString();
}

export function queryToFilters(sp: URLSearchParams): SearchFilters {
  const list = (k: string) => sp.get(k)?.split(",").filter(Boolean);
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const attrs: Record<string, string[]> = {};
  for (const [k, v] of sp.entries()) {
    if (k.startsWith("a.") && v) attrs[k.slice(2)] = v.split(",").filter(Boolean);
  }
  const intent = sp.get("intent");
  return {
    q: sp.get("q") ?? undefined,
    intent: intent === "sell" || intent === "rent" ? intent : undefined,
    cityId: sp.get("city") ?? undefined,
    types: list("types"),
    ptypes: list("ptypes"),
    roles: list("roles"),
    areas: list("areas"),
    amenities: list("amenities"),
    budgetMin: num("bmin"),
    budgetMax: num("bmax"),
    attrs: Object.keys(attrs).length ? attrs : undefined,
    negotiableOnly: sp.get("negotiableOnly") === "1" || undefined,
    readyToMove: sp.get("readyToMove") === "1" || undefined,
    newConstruction: sp.get("newConstruction") === "1" || undefined,
    verifiedOnly: sp.get("verifiedOnly") === "1" || undefined,
  };
}

export type { SearchFilters, SearchTab, SearchSort, FilterConfig, AreaResult, BrokerResult, AutocompleteResult };
