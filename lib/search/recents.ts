import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { SearchFilters, SearchMode } from "./types";

/**
 * Recent + saved searches (Doc7 §110-114).
 *
 * Both are per-USER server state, never localStorage: a recent search is
 * business data (it feeds the autocomplete and, for saved searches, an alert
 * job that runs while the browser is closed). A guest simply has none — which
 * is exactly the design's "No recent searches yet" empty state.
 */

const db = () => createServiceClient();

export interface RecentRow {
  id: string;
  query: string;
  targetKind: string | null;
  targetSlug: string | null;
  createdAt: string;
}

export async function listRecents(profileId: string, mode: SearchMode = "property", limit = 20): Promise<RecentRow[]> {
  const { data } = await db()
    .from("search_recents")
    .select("id,query,target_kind,target_slug,created_at")
    .eq("profile_id", profileId)
    .eq("mode", mode)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 20));
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, query: r.query, targetKind: r.target_kind, targetSlug: r.target_slug, createdAt: r.created_at,
  }));
}

/**
 * Record a search. Re-searching the same text MOVES the row to the top rather
 * than adding a duplicate (unique index on lower(query) per user+mode), and the
 * 20-cap is enforced by a DB trigger, not here.
 */
export async function recordRecent(
  profileId: string,
  query: string,
  mode: SearchMode = "property",
  target?: { kind: "area" | "city" | "landing" | "text"; slug: string | null },
): Promise<void> {
  const q = (query ?? "").trim().slice(0, 120);
  if (!q) return;

  // The dedupe index is on `lower(query)` — an EXPRESSION index, which ON
  // CONFLICT cannot target by column name. Delete-then-insert gives the same
  // "move it to the top" behaviour: one row per distinct query per mode, with
  // a fresh timestamp. The 20-cap is applied by the DB trigger on insert.
  await db().from("search_recents")
    .delete()
    .eq("profile_id", profileId)
    .eq("mode", mode)
    .ilike("query", q);

  await db().from("search_recents").insert({
    profile_id: profileId,
    mode,
    query: q,
    target_kind: target?.kind ?? "text",
    target_slug: target?.slug ?? null,
  });
}

export async function deleteRecent(profileId: string, id: string): Promise<void> {
  // Scoped by profile_id as well as id — an IDOR here would let anyone delete
  // another user's history by guessing a uuid.
  await db().from("search_recents").delete().eq("profile_id", profileId).eq("id", id);
}

export async function clearRecents(profileId: string, mode: SearchMode = "property"): Promise<void> {
  await db().from("search_recents").delete().eq("profile_id", profileId).eq("mode", mode);
}

// ---------------------------------------------------------------------------
// Saved searches (Doc7 §112-114)
// ---------------------------------------------------------------------------

export interface SavedSearchRow {
  id: string;
  label: string;
  mode: SearchMode;
  params: SearchFilters;
  alertsEnabled: boolean;
  lastMatchCount: number;
  createdAt: string;
}

export async function listSaved(profileId: string): Promise<SavedSearchRow[]> {
  const { data } = await db()
    .from("saved_searches")
    .select("id,label,mode,params,alerts_enabled,last_match_count,created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, label: r.label, mode: r.mode, params: r.params ?? {},
    alertsEnabled: r.alerts_enabled, lastMatchCount: r.last_match_count, createdAt: r.created_at,
  }));
}

export async function saveSearch(
  profileId: string,
  label: string,
  params: SearchFilters,
  mode: SearchMode = "property",
  matchCount = 0,
): Promise<SavedSearchRow | null> {
  const { data, error } = await db().from("saved_searches").insert({
    profile_id: profileId,
    label: label.trim().slice(0, 120) || "Saved search",
    mode,
    params,
    last_match_count: matchCount,
  }).select("id,label,mode,params,alerts_enabled,last_match_count,created_at").maybeSingle();
  if (error || !data) return null;
  const r = data as any;
  return {
    id: r.id, label: r.label, mode: r.mode, params: r.params ?? {},
    alertsEnabled: r.alerts_enabled, lastMatchCount: r.last_match_count, createdAt: r.created_at,
  };
}

export async function setAlerts(profileId: string, id: string, enabled: boolean): Promise<boolean> {
  const { error, count } = await db().from("saved_searches")
    .update({ alerts_enabled: enabled }, { count: "exact" })
    .eq("profile_id", profileId).eq("id", id);
  return !error && (count ?? 0) > 0;
}

export async function deleteSaved(profileId: string, id: string): Promise<boolean> {
  const { error, count } = await db().from("saved_searches")
    .delete({ count: "exact" })
    .eq("profile_id", profileId).eq("id", id);
  return !error && (count ?? 0) > 0;
}
