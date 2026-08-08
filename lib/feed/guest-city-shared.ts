/**
 * The guest city's wire format — the one thing about it the browser and the
 * server both have to agree on.
 *
 * It lives in its own module (no "use client", no "server-only") so the cookie
 * name and the parser are literally the same code on both sides. The value is
 * still just a UI preference: it selects WHICH rows to ask for, never what a row
 * is allowed to contain, and the id is re-validated against `locations`
 * server-side (lib/location/viewer-city) before it reaches a query.
 */

export const GUEST_CITY_COOKIE = "hz_guest_city";

export interface GuestCity {
  cityId: string | null;
  cityName: string | null;
}

export const NO_GUEST_CITY: GuestCity = { cityId: null, cityName: null };

/** Decode the cookie/localStorage payload. Anything malformed reads as "none". */
export function parseGuestCity(raw: string | null | undefined): GuestCity {
  if (!raw) return NO_GUEST_CITY;
  try {
    // The cookie is percent-encoded; the localStorage copy (written before the
    // cookie existed) is plain JSON. Decode when it decodes, take it as-is
    // otherwise, so an older browser's stored city still reads.
    let text = raw;
    try { text = decodeURIComponent(raw); } catch { /* not encoded */ }
    const { id, name } = JSON.parse(text);
    return { cityId: typeof id === "string" ? id : null, cityName: typeof name === "string" ? name : null };
  } catch {
    return NO_GUEST_CITY;
  }
}

export function serializeGuestCity(id: string, name: string): string {
  return encodeURIComponent(JSON.stringify({ id, name }));
}
