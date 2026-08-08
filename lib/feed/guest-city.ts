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

import {
  GUEST_CITY_COOKIE, NO_GUEST_CITY, parseGuestCity, serializeGuestCity, type GuestCity,
} from "./guest-city-shared";

const GUEST_CITY_KEY = GUEST_CITY_COOKIE;
/** A year — the same "remember my city" horizon the chip implies. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * It is written to a COOKIE as well as to localStorage (8 Aug 2026). The server
 * renders the first screenful of the feed itself now (lib/feed/initial), and it
 * has to scope those rails to the same city the browser is about to ask for —
 * localStorage is invisible to it, so a guest who had picked Ahmedabad would
 * have been served a primed Rajkot feed and then watched it swap. The cookie
 * carries no identity and nothing private: it is the same city id the query
 * string already carried, and it is validated server-side exactly the same way.
 */
function writeCookie(id: string, name: string) {
  try {
    document.cookie = `${GUEST_CITY_COOKIE}=${serializeGuestCity(id, name)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* cookies disabled — the localStorage copy still scopes the client */
  }
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${GUEST_CITY_COOKIE}=`));
  return hit ? hit.slice(GUEST_CITY_COOKIE.length + 1) : null;
}

export function readGuestCity(): GuestCity {
  if (typeof window === "undefined") return NO_GUEST_CITY;
  const fromCookie = parseGuestCity(readCookie());
  if (fromCookie.cityId) return fromCookie;
  try {
    const stored = parseGuestCity(window.localStorage.getItem(GUEST_CITY_KEY));
    // Picked before the cookie existed: promote it, so the NEXT page load is
    // primed in the right city instead of re-fetching itself.
    if (stored.cityId && stored.cityName) writeCookie(stored.cityId, stored.cityName);
    return stored;
  } catch {
    return NO_GUEST_CITY;
  }
}

export function writeGuestCity(id: string, name: string) {
  writeCookie(id, name);
  try {
    window.localStorage.setItem(GUEST_CITY_KEY, JSON.stringify({ id, name }));
  } catch {
    /* private mode / quota — the city simply doesn't persist */
  }
}
