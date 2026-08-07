"use client";

/**
 * App icon badge counts (Doc3 §98 — "icon badge counts").
 *
 * The number on the installed app's home-screen icon. It is the SERVER's count
 * of unread messages + unread notifications — the same numbers the header bell
 * and the Messages tab draw (GET /api/v1/feed/badges) — never a locally kept
 * tally, so it can't drift from the inbox.
 *
 * Called from `feedApi.badges()` itself, so every screen that already reads the
 * counts keeps the icon honest without its own wiring, and a guest (0/0) clears
 * it rather than leaving a stale number from the previous account.
 *
 * `setAppBadge` is Chromium + installed-PWA only; everywhere else this is a
 * silent no-op, which is the correct behaviour, not a fallback to invent.
 */
export function syncAppBadge(counts: { messages: number; notifications: number | null }) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge) return;
  const total = (counts.messages || 0) + (counts.notifications || 0);
  const done = total > 0 ? nav.setAppBadge(total) : nav.clearAppBadge?.();
  // A rejected promise here is a permissions/unsupported case, never a failure
  // the user should see.
  void done?.catch(() => {});
}
