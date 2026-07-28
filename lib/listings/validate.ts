import "server-only";
import type { PropertyTypeRow } from "./service";
import { keysForKind } from "./visibility";

/**
 * Server-side listing validation (Doc2 §5.3, Doc9 §6 "never trust the browser").
 *
 * Mirrors every client rule, because the client's copy is a convenience and
 * this one is the control. Two distinct outcomes, deliberately kept apart:
 *   - ERRORS block the submit (required fields, impossible values).
 *   - WARNINGS never block (Doc2 §5.3 is explicit) — they're returned so the
 *     UI can nudge, and the listing still saves.
 */

export interface ValidationResult {
  errors: Record<string, string>;
  warnings: Record<string, string>;
  /** Set when the description looks like it contains a phone number. */
  flaggedReason: string | null;
}

/** 10-digit runs, and the spaced/dashed forms people use to dodge a naive check. */
const NUMBER_PATTERNS = [
  /\b[6-9]\d{9}\b/,
  /\b[6-9]\d{2}[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\+?91[\s.-]?[6-9]\d{9}\b/,
  /\b[6-9](?:[\s.-]?\d){9}\b/,
];

export function detectNumberInText(text: string): boolean {
  const t = text ?? "";
  return NUMBER_PATTERNS.some((re) => re.test(t));
}

/** Per-type sanity bands (warning-only — Doc2 §5.1). Values in paise. */
const PRICE_BANDS: Record<string, [number, number]> = {
  flat: [500_000_00, 50_00_00_000_00],
  bungalow: [1_000_000_00, 100_00_00_000_00],
  pg: [1_000_00, 1_00_000_00],
};

export interface ListingInput {
  typeCode: string;
  kind: "sell" | "rent";
  title?: string | null;
  description?: string | null;
  pricePaise?: number | null;
  priceOnRequest?: boolean;
  cityId?: string | null;
  areaId?: string | null;
  pincode?: string | null;
  attributes?: Record<string, unknown>;
  photoCount?: number;
  contact?: { public?: boolean; number?: string | null };
}

/**
 * `visible` is the key set `sanitizeAttributes` resolved for this payload. A
 * required field the seller could not see must not block the submit — a plot
 * has no BHK, and a ready-to-move flat has no possession date to give.
 */
export function validateListing(input: ListingInput, type: PropertyTypeRow, visible?: Set<string>): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  // ---- hard requirements ---------------------------------------------------
  if (!type.kinds.includes(input.kind)) {
    errors.kind = `${type.label} can't be listed for ${input.kind === "rent" ? "rent" : "sale"}`;
  }
  if (!input.cityId) errors.city = "Select a city";

  // Pincode is REQUIRED (it was an optional free-text box, so the column was
  // null on most rows and area pages had no postal anchor). It is picked from
  // the chosen place's real codes now — migration 0054 seeded 19,238 of them —
  // so the only thing left to check here is that we were handed one, and that
  // it is a real Indian pincode rather than six arbitrary digits.
  const pin = (input.pincode ?? "").trim();
  if (!pin) errors.pincode = "Select a pincode";
  else if (!/^[1-9][0-9]{5}$/.test(pin)) errors.pincode = "Enter a valid 6-digit pincode";

  // Price is required UNLESS explicitly "on request" (Doc2 §5.1).
  if (!input.priceOnRequest) {
    if (input.pricePaise === null || input.pricePaise === undefined) {
      errors.price = "Enter a price, or mark it as 'Price on request'";
    } else if (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0) {
      errors.price = "Enter a valid price";
    }
  }

  const title = (input.title ?? "").trim();
  if (title.length > 120) errors.title = "Title is too long (max 120 characters)";

  const desc = input.description ?? "";
  if (desc.length > 5000) errors.description = "Description is too long (max 5000 characters)";

  // A public number must actually be a number.
  if (input.contact?.public && input.contact.number) {
    const digits = input.contact.number.replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) errors.contactNumber = "Enter a valid 10-digit mobile number";
  }

  // Error copy only — WHICH fields are required is config, this just phrases it.
  const REQUIRED_MSG: Record<string, string> = {
    bhk: "Select BHK",
    builtup_area: "Enter the built-up area",
    carpet_area: "Enter the carpet area",
    plot_area: "Enter the plot area",
    land_area: "Enter the plot area",
  };

  // Required per-type attributes. Which ones matter is CONFIG (`required` in
  // field_config), not a list of field names hardcoded here — a Flat needs its
  // built-up area, a Farmhouse needs neither BHK nor carpet, and a new type
  // states its own requirements without touching this file (Doc2 §5.1).
  const attrs = input.attributes ?? {};
  const asked = visible ?? new Set(keysForKind(type.field_config, input.kind));
  for (const key of type.field_config.required ?? []) {
    if (!asked.has(key)) continue;
    const v = attrs[key] as unknown;
    // An `area` control stores {value, unit}; everything else stores a scalar.
    const empty = v === undefined || v === null || v === ""
      || (typeof v === "object" && !(v as { value?: unknown }).value);
    if (empty) errors[key] = REQUIRED_MSG[key] ?? `This field is required`;
  }

  /**
   * An `area` attribute's magnitude has to be a NUMBER.
   *
   * The form only ever sends digits, so this is about a hand-made payload: the
   * value is stored verbatim and later cast to numeric inside the search RPC,
   * across every live row at once. One listing carrying `{value: "12x34"}` was
   * therefore enough to make area-filtered search raise for every buyer. The
   * SQL guard was fixed too (migration 0059) — this stops the bad value being
   * stored in the first place, which is the layer that should catch it.
   */
  for (const [key, raw] of Object.entries(attrs)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const v = (raw as { value?: unknown }).value;
    if (v === undefined || v === null || v === "") continue;
    if (!/^\d+(\.\d+)?$/.test(String(v))) {
      errors[key] = "Enter a number";
    } else if (Number(v) <= 0) {
      errors[key] = "Enter a value greater than zero";
    }
  }

  // A PG cannot have more free beds than beds. The two are separate number
  // fields, so nothing stopped "4 total, 9 available" reaching the feed.
  const totalBeds = Number(attrs.total_beds ?? 0);
  const freeBeds = Number(attrs.beds_available ?? 0);
  if (totalBeds > 0 && freeBeds > totalBeds) {
    errors.beds_available = `Can't be more than the ${totalBeds} total beds`;
  }

  // Floor above the building's own height is a typo every time.
  const floor = Number(attrs.floor ?? 0);
  const totalFloors = Number(attrs.total_floors ?? 0);
  if (totalFloors > 0 && floor > totalFloors) {
    errors.floor = `Can't be above the building's ${totalFloors} floors`;
  }

  // ---- warnings (never block — Doc2 §5.3) ---------------------------------
  if (!title) warnings.title = "Listings with a title get more views";
  if (desc.trim().length < 40) warnings.description = "A longer description gets more inquiries";
  if ((input.photoCount ?? 0) < 5) warnings.photos = "Listings with 5+ photos get up to 3× more inquiries";

  const band = PRICE_BANDS[input.typeCode];
  if (band && !input.priceOnRequest && typeof input.pricePaise === "number") {
    if (input.pricePaise < band[0]) warnings.price = "That price looks low for this property type — double-check it";
    else if (input.pricePaise > band[1]) warnings.price = "That price looks high for this property type — double-check it";
  }

  // Numbers in free text bypass the number-privacy rule → flag for admin, but
  // never block the post (Doc2 §5.1).
  const flagged = detectNumberInText(desc) || detectNumberInText(title);
  if (flagged) warnings.description = "Phone numbers in the description are removed by our team — use the contact settings instead";

  return { errors, warnings, flaggedReason: flagged ? "phone_number_in_text" : null };
}

/**
 * Area unit conversion (Doc2 §5.1). Stored canonically in sq ft so filters and
 * sorting work across units; the user's chosen unit is kept for display only.
 */
/**
 * The factors come from `area_units` (migration 0068), loaded once per process.
 * They used to be a constant here AND a label list in the form AND a third copy
 * in the feed card; the table is now the only place a unit is defined.
 */
let factorCache: Record<string, number> | null = null;
export async function areaFactors(): Promise<Record<string, number>> {
  if (factorCache) return factorCache;
  const { getAreaUnits } = await import("./service");
  const rows = await getAreaUnits();
  factorCache = Object.fromEntries(rows.map((u) => [u.code, u.sqftFactor]));
  return factorCache;
}

export async function toSqft(value: number, unit: string): Promise<number | null> {
  const f = (await areaFactors())[unit];
  if (!f || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * f);
}

/**
 * Which stored attribute is a listing's PRIMARY area, in preference order.
 *
 * A flat is compared on its built-up area, a plot on its land area, a shop on
 * its carpet area. Whichever of these the type actually carries becomes
 * `listings.area_sqft`, so "3 Vigha" and "1,450 sq ft" are finally comparable.
 */
const PRIMARY_AREA_KEYS = ["builtup_area", "land_area", "plot_area", "carpet_area", "construction_area"] as const;

/**
 * Canonical area in sq ft for an attributes blob, or null if the type has no
 * area field (a PG, for instance). This is what makes the form's
 * "Converted automatically for search" hint true.
 */
export async function primaryAreaSqft(attributes: Record<string, unknown> | null | undefined): Promise<number | null> {
  const attrs = attributes ?? {};
  for (const key of PRIMARY_AREA_KEYS) {
    const raw = attrs[key];
    if (!raw || typeof raw !== "object") continue;
    const { value, unit } = raw as { value?: string | number; unit?: string };
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    // An untouched unit <select> shows sq ft, so a stored value without a unit
    // IS sq ft — the form now writes it explicitly, this covers older rows.
    const sqft = await toSqft(n, unit ?? "sqft");
    if (sqft) return sqft;
  }
  return null;
}

export async function fromSqft(sqft: number, unit: string): Promise<number | null> {
  const f = (await areaFactors())[unit];
  if (!f) return null;
  return +(sqft / f).toFixed(2);
}
