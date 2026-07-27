import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";

/**
 * P10 S1 — Saved (Doc4 §57). The wishlist the feed heart writes to (`saves`,
 * 0026), now with private collections and a real "changed" signal (0053). Every
 * value the screen shows is computed here from the database:
 *   • the tiles are the user's saves joined to their listing (cover, price,
 *     sold/rented), filtered by the chosen collection;
 *   • "changed" = the listing's price dropped below the snapshot taken at save
 *     time, OR it is now sold/rented;
 *   • the chip counts are real GROUP BY counts, never assumed.
 */

const db = () => createServiceClient();

export interface SavedTile {
  saveId: string;
  listingId: string;
  coverUrl: string | null;
  price: string;
  availability: "available" | "sold" | "rented" | "completed";
  collectionId: string | null;
  /** Price fell below the save-time snapshot — the design's "↓ ₹5 L" chip. */
  dropLabel: string | null;
  changed: boolean;
}

export interface SavedCollection {
  id: string | null; // null = the built-in "All"
  name: string;
  count: number;
}

export interface SavedView {
  collections: SavedCollection[];
  tiles: SavedTile[];
  changedCount: number;
}

interface SaveJoin {
  id: string;
  listing_id: string;
  collection_id: string | null;
  saved_price_paise: number | null;
  listings: {
    id: string;
    cover_url: string | null;
    price_paise: number | null;
    price_on_request: boolean | null;
    availability: SavedTile["availability"];
    status: string;
  } | null;
}

function toTile(s: SaveJoin): SavedTile | null {
  const l = s.listings;
  if (!l) return null; // listing deleted — the FK cascade removes the save, so rare
  const price = l.price_on_request || l.price_paise === null ? "Price on request" : formatShortRupees(l.price_paise);
  const soldOrRented = l.availability === "sold" || l.availability === "rented";
  // A drop needs both a snapshot and a current price, and must be a real decrease.
  const dropped =
    s.saved_price_paise !== null && l.price_paise !== null && l.price_paise < s.saved_price_paise;
  const dropLabel = dropped ? `↓ ${formatShortRupees((s.saved_price_paise as number) - (l.price_paise as number))}` : null;
  return {
    saveId: s.id,
    listingId: s.listing_id,
    coverUrl: l.cover_url,
    price,
    availability: l.availability,
    collectionId: s.collection_id,
    dropLabel,
    changed: dropped || soldOrRented,
  };
}

/** The whole Saved screen for one user, optionally filtered to a collection. */
export async function getSaved(profileId: string, collectionId?: string | null): Promise<SavedView> {
  // All saves for the counts + change detection (the set is a user's own wishlist,
  // never large enough to need server-side pagination for this screen).
  const { data } = await db()
    .from("saves")
    .select(
      "id,listing_id,collection_id,saved_price_paise,listings(id,cover_url,price_paise,price_on_request,availability,status)",
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as SaveJoin[]).map(toTile).filter((t): t is SavedTile => t !== null);
  const changedCount = rows.filter((t) => t.changed).length;

  // Collection chips: real names + counts, "All" first.
  const { data: colRows } = await db()
    .from("save_collections")
    .select("id,name")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  const named = (colRows ?? []) as { id: string; name: string }[];
  const countByCol = new Map<string, number>();
  for (const t of rows) if (t.collectionId) countByCol.set(t.collectionId, (countByCol.get(t.collectionId) ?? 0) + 1);

  const collections: SavedCollection[] = [
    { id: null, name: "All", count: rows.length },
    ...named.map((c) => ({ id: c.id, name: c.name, count: countByCol.get(c.id) ?? 0 })),
  ];

  const tiles = collectionId ? rows.filter((t) => t.collectionId === collectionId) : rows;
  return { collections, tiles, changedCount };
}

// ---- Collections CRUD -------------------------------------------------------

export async function createCollection(profileId: string, name: string): Promise<{ id: string } | { error: "duplicate" | "invalid" }> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { error: "invalid" };
  const { data, error } = await db()
    .from("save_collections")
    .insert({ profile_id: profileId, name: clean })
    .select("id")
    .maybeSingle();
  if (error) return { error: (error as { code?: string }).code === "23505" ? "duplicate" : "invalid" };
  return { id: (data as { id: string }).id };
}

export async function renameCollection(profileId: string, id: string, name: string): Promise<{ ok: boolean; error?: "duplicate" }> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false };
  const { error, data } = await db()
    .from("save_collections")
    .update({ name: clean })
    .eq("id", id)
    .eq("profile_id", profileId) // ownership wall (IDOR-safe)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: (error as { code?: string }).code === "23505" ? "duplicate" : undefined };
  return { ok: Boolean(data) };
}

export async function deleteCollection(profileId: string, id: string): Promise<{ ok: boolean }> {
  // Saves in it are kept (FK on delete set null) — they fall back to "All".
  const { data } = await db()
    .from("save_collections")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();
  return { ok: Boolean(data) };
}

/** Move a save into a collection (or out of one when collectionId is null). */
export async function assignSave(profileId: string, saveId: string, collectionId: string | null): Promise<{ ok: boolean }> {
  if (collectionId) {
    // The target collection must belong to the caller (IDOR-safe).
    const { data: col } = await db().from("save_collections").select("id").eq("id", collectionId).eq("profile_id", profileId).maybeSingle();
    if (!col) return { ok: false };
  }
  const { data } = await db()
    .from("saves")
    .update({ collection_id: collectionId })
    .eq("id", saveId)
    .eq("profile_id", profileId) // only your own save
    .select("id")
    .maybeSingle();
  return { ok: Boolean(data) };
}

/** Remove a save entirely (the Saved screen's un-save). */
export async function removeSave(profileId: string, saveId: string): Promise<{ ok: boolean }> {
  const { data } = await db().from("saves").delete().eq("id", saveId).eq("profile_id", profileId).select("id").maybeSingle();
  return { ok: Boolean(data) };
}
