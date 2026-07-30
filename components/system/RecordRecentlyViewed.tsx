"use client";

import { useEffect } from "react";

/**
 * Remembers the last few listings this device opened, so P12 S7's "Recently
 * viewed" rail has something real to show with no network.
 *
 * UI cache only — an id and the two labels already rendered on the page. No
 * business truth lives here: every one of these cards links back to the server,
 * which re-decides what the viewer may see (CLAUDE.md rule 3).
 */
const KEY = "hz-recently-viewed";
const MAX = 6;

export function RecordRecentlyViewed({
  id,
  priceLabel,
  subtitle,
}: {
  id: string;
  priceLabel: string;
  subtitle: string;
}) {
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(KEY);
      const list: Array<{ id: string; priceLabel: string; subtitle: string }> = raw ? JSON.parse(raw) : [];
      const next = [{ id, priceLabel, subtitle }, ...list.filter((x) => x.id !== id)].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode / quota — the rail simply stays empty */
    }
  }, [id, priceLabel, subtitle]);

  return null;
}
