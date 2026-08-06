"use client";

/**
 * The GUEST's chosen city — a UI preference, and the only thing about the feed
 * that lives in the browser.
 *
 * It is allowed there by CLAUDE.md rule 3 for the same reason the theme is: it
 * decides which rows to ASK for, never what they contain. Every entitlement,
 * price and locked field is still decided server-side from the session, and the
 * id itself is re-validated against `locations` on arrival
 * (lib/location/viewer-city) — a tampered value scopes to nothing rather than
 * to somebody else's data.
 *
 * A signed-in user has no use for this: their city is a column on their profile
 * and the server reads it from the session.
 *
 * It lives here, not inside FeedHome, because the story VIEWER needs the same
 * answer. It re-fetches the circle list to find the poster it was opened for,
 * and an unscoped list would not contain a circle the scoped row had just
 * shown — the viewer would open and immediately close itself.
 */

const GUEST_CITY_KEY = "hz_guest_city";

export function readGuestCity(): { cityId: string | null; cityName: string | null } {
  if (typeof window === "undefined") return { cityId: null, cityName: null };
  try {
    const raw = window.localStorage.getItem(GUEST_CITY_KEY);
    if (!raw) return { cityId: null, cityName: null };
    const { id, name } = JSON.parse(raw);
    return { cityId: id ?? null, cityName: name ?? null };
  } catch {
    return { cityId: null, cityName: null };
  }
}

export function writeGuestCity(id: string, name: string) {
  try {
    window.localStorage.setItem(GUEST_CITY_KEY, JSON.stringify({ id, name }));
  } catch {
    /* private mode / quota — the city simply doesn't persist */
  }
}
