"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import { enqueue } from "@/lib/pwa/offline-queue";

/**
 * Client-side Saved API (P10 S1). Asks the server; renders answers. No counts,
 * no "changed" logic and no collection membership are decided here — all of it
 * comes from GET /saved (CLAUDE.md backend lock).
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`/api/v1${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export interface SavedTile {
  saveId: string;
  listingId: string;
  coverUrl: string | null;
  price: string;
  availability: "available" | "sold" | "rented" | "completed";
  collectionId: string | null;
  dropLabel: string | null;
  changed: boolean;
}
export interface SavedCollection { id: string | null; name: string; count: number }
export interface SavedView { collections: SavedCollection[]; tiles: SavedTile[]; changedCount: number }

export const savedApi = {
  list: (collectionId?: string | null) =>
    req<SavedView>(`/saved${collectionId ? `?collection=${encodeURIComponent(collectionId)}` : ""}`, "GET"),
  createCollection: (name: string) => req<{ id: string }>("/saved/collections", "POST", { name }),
  renameCollection: (id: string, name: string) => req<{ renamed: boolean }>(`/saved/collections/${id}`, "PATCH", { name }),
  deleteCollection: (id: string) => req<{ deleted: boolean }>(`/saved/collections/${id}`, "DELETE"),
  assign: (saveId: string, collectionId: string | null) => req<{ assigned: boolean }>(`/saved/items/${saveId}`, "PATCH", { collectionId }),
  /**
   * Queued when offline (Doc3 §98). A DELETE of one of MY save rows is
   * idempotent, so replaying it minutes later can only reach the same end state
   * — the reason this one is queueable and, say, a payment is not.
   */
  remove: async (saveId: string) => {
    const res = await req<{ removed: boolean }>(`/saved/items/${saveId}`, "DELETE");
    if (res.ok || res.error.code !== "OFFLINE") return res as ApiResult<{ removed: boolean; queued?: boolean }>;
    const queued = await enqueue({ kind: "unsave", path: `/api/v1/saved/items/${saveId}`, method: "DELETE" });
    if (!queued) return res as ApiResult<{ removed: boolean; queued?: boolean }>;
    return { ok: true as const, data: { removed: true, queued: true } };
  },
};
