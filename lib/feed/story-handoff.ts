import type { StoryCircle } from "./client";

/**
 * Story hand-off — the circle list the ROW already has, handed to the VIEWER.
 *
 * Tapping a circle used to cost a full second of black screen: the viewer
 * mounted with `circles = null`, painted a bare black rectangle, and only then
 * asked `/api/v1/stories` for the very list the feed had fetched moments
 * earlier (measured: 825ms for that call alone, on top of the route's own RSC
 * round-trip). Instagram opens on the first frame; this is why ours did not.
 *
 * This is NOT a client-side source of truth (Doc8 / backend lock): it is the
 * server's own response, produced by the same `storiesApi.list()` call, passed
 * in memory instead of being re-requested. Every per-segment fact the viewer
 * shows is still re-confirmed against `/api/v1/stories/{id}` as that segment
 * comes on screen, which is what decides `available` — the hand-off only saves
 * the round-trip for the frame we already know how to paint.
 *
 * Kept deliberately dumb: one slot, in memory only (never localStorage — a
 * business payload must not outlive the tab), read-only-by-poster, and stale
 * after 60s so a viewer opened from a bookmarked URL always fetches fresh.
 */
const MAX_AGE_MS = 60_000;

let slot: { circles: StoryCircle[]; at: number } | null = null;

export function setStoryHandoff(circles: StoryCircle[]): void {
  slot = { circles, at: Date.now() };
}

/**
 * Read (without consuming) the handed-off list, but only if it actually
 * contains the poster being opened — a deep link or a stale slot falls through
 * to the normal fetch. Not consumed on read because React StrictMode invokes a
 * `useState` initialiser twice and a consume-on-read slot would come back null
 * on the second call, which is exactly the run React keeps.
 */
export function readStoryHandoff(posterId: string): StoryCircle[] | null {
  if (!slot || Date.now() - slot.at > MAX_AGE_MS) return null;
  return slot.circles.some((c) => c.posterId === posterId) ? slot.circles : null;
}
