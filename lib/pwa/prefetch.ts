"use client";

/**
 * Image prefetch (Doc8 §173 — "prefetch next 3–4 feed images").
 *
 * `loading="lazy"` only starts a photo ~200px before it enters the viewport,
 * which at flick speed is far too late: the card arrives grey and fills in
 * afterwards. This warms the next few covers so they are already decoded by the
 * time they scroll up.
 *
 * Deliberately cheap and bounded:
 *  - runs in idle time, so it never competes with the photos actually on screen;
 *  - remembers what it has asked for, so re-renders don't re-request;
 *  - hard cap per call — prefetching a whole page of a feed would cost the user
 *    data they never looked at.
 */

const asked = new Set<string>();

export function prefetchImages(urls: (string | null | undefined)[], limit = 4) {
  if (typeof window === "undefined") return;
  const list = urls.filter((u): u is string => !!u && !asked.has(u)).slice(0, limit);
  if (!list.length) return;

  const run = () => {
    for (const url of list) {
      asked.add(url);
      const img = new Image();
      img.decoding = "async";
      // Explicitly low: these are for LATER. Without it the browser can schedule
      // them alongside the visible photos and make the current screen slower.
      img.fetchPriority = "low";
      img.src = url;
    }
  };

  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 1200 });
  else setTimeout(run, 300);
}
