import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { ListingRow } from "@/lib/listings/service";

/**
 * Featured collections (P9 S1) — the named circles under the Edit-profile row.
 *
 * A collection is a name plus an ordered set of the owner's OWN listings. Two
 * rules live here rather than in the browser:
 *  1. every listing in a collection must belong to the caller (checked against
 *     the rows themselves, so a foreign id is silently dropped, not stored);
 *  2. a collection SHOWS only live+available members, because the circle is a
 *     public shelf — but membership is kept, so a listing that comes back to
 *     live returns to its collection instead of quietly falling out for good.
 */

const db = () => createServiceClient();

/** Per-profile and per-collection caps, enforced server-side. */
export const MAX_COLLECTIONS = 10;
export const MAX_ITEMS = 20;
export const NAME_MAX = 30;

export interface FeaturedCollection {
  id: string;
  name: string;
  /** How many of its listings are visible right now. */
  count: number;
  /** Cover of the first visible listing — the circle falls back to an icon. */
  coverUrl: string | null;
  createdAt: string;
}

/** The circles for a profile, oldest first (the order they were created in). */
export async function listCollections(profileId: string): Promise<FeaturedCollection[]> {
  const { data } = await db()
    .from("featured_collections")
    .select("id,name,created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(MAX_COLLECTIONS);
  const rows = (data ?? []) as { id: string; name: string; created_at: string }[];
  if (!rows.length) return [];

  // One round trip for every collection's visible members, rather than N+1.
  const { data: itemRows } = await db()
    .from("featured_collection_items")
    .select("collection_id,listing_id,position")
    .in("collection_id", rows.map((r) => r.id))
    .order("position", { ascending: true });
  const items = (itemRows ?? []) as { collection_id: string; listing_id: string; position: number }[];

  const visible = await visibleListings(
    profileId,
    items.map((i) => i.listing_id),
  );

  return rows.map((r) => {
    const mine = items.filter((i) => i.collection_id === r.id && visible.has(i.listing_id));
    return {
      id: r.id,
      name: r.name,
      count: mine.length,
      coverUrl: mine.length ? (visible.get(mine[0].listing_id)?.cover_url ?? null) : null,
      createdAt: r.created_at,
    };
  });
}

/** The listings inside one collection — ownership-checked, visible ones only. */
export async function getCollection(
  profileId: string,
  collectionId: string,
): Promise<{ id: string; name: string; listings: ListingRow[] } | null> {
  const { data } = await db()
    .from("featured_collections")
    .select("id,name")
    .eq("id", collectionId)
    .eq("profile_id", profileId)
    .maybeSingle();
  const row = data as { id: string; name: string } | null;
  if (!row) return null;

  const { data: itemRows } = await db()
    .from("featured_collection_items")
    .select("listing_id,position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });
  const ids = ((itemRows ?? []) as { listing_id: string }[]).map((i) => i.listing_id);
  const visible = await visibleListings(profileId, ids);

  return {
    id: row.id,
    name: row.name,
    listings: ids.map((id) => visible.get(id)).filter((l): l is ListingRow => Boolean(l)),
  };
}

/** Listings the owner may show: theirs, live and available. */
async function visibleListings(profileId: string, ids: string[]): Promise<Map<string, ListingRow>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data } = await db()
    .from("listings")
    .select("*")
    .in("id", unique)
    .eq("profile_id", profileId)
    .eq("status", "live")
    .eq("availability", "available");
  return new Map(((data ?? []) as ListingRow[]).map((l) => [l.id, l]));
}

/**
 * Create a collection. `listingIds` is filtered down to rows the caller really
 * owns before anything is written, so a tampered payload creates a smaller
 * collection rather than a collection full of someone else's property.
 */
export async function createCollection(
  profileId: string,
  name: string,
  listingIds: string[],
): Promise<{ ok: true; id: string } | { ok: false; reason: "LIMIT" | "NO_LISTINGS" }> {
  const { count } = await db()
    .from("featured_collections")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if ((count ?? 0) >= MAX_COLLECTIONS) return { ok: false, reason: "LIMIT" };

  const owned = await ownedListingIds(profileId, listingIds.slice(0, MAX_ITEMS));
  if (!owned.length) return { ok: false, reason: "NO_LISTINGS" };

  const { data, error } = await db()
    .from("featured_collections")
    .insert({ profile_id: profileId, name: name.trim() })
    .select("id")
    .maybeSingle();
  const created = data as { id: string } | null;
  if (error || !created) return { ok: false, reason: "NO_LISTINGS" };

  const { error: itemError } = await db()
    .from("featured_collection_items")
    .insert(owned.map((listingId, position) => ({ collection_id: created.id, listing_id: listingId, position })));

  // Step 2 of 2 failed: a collection with no members is a circle that opens
  // onto nothing, so the empty shell is removed rather than left behind.
  if (itemError) {
    await db().from("featured_collections").delete().eq("id", created.id).eq("profile_id", profileId);
    return { ok: false, reason: "NO_LISTINGS" };
  }

  return { ok: true, id: created.id };
}

/** Remove a collection (its items cascade). Someone else's id is simply absent. */
export async function deleteCollection(profileId: string, collectionId: string): Promise<boolean> {
  const { data } = await db()
    .from("featured_collections")
    .delete()
    .eq("id", collectionId)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

/** Which of these listing ids the profile actually owns, in the order given. */
async function ownedListingIds(profileId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const { data } = await db()
    .from("listings")
    .select("id")
    .in("id", unique)
    .eq("profile_id", profileId)
    .neq("status", "deleted");
  const owned = new Set(((data ?? []) as { id: string }[]).map((l) => l.id));
  return unique.filter((id) => owned.has(id));
}
