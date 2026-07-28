import "server-only";
import { formatShortRupees } from "@/lib/billing/money";
import type { FieldDefinitionRow, ListingRow, PropertyTypeRow } from "./service";
import type { RequirementRow } from "./requirements";
import { keysForKind } from "./visibility";
import { scopedGroups } from "./groupLabel";

/**
 * Listing DTOs (Doc9 §17 — explicit fields only).
 *
 * The rule that matters most here: when the owner has NOT made their number
 * public, the number is absent from the payload entirely — not blanked, not
 * hidden with CSS (Doc7 §51, Doc9 §17). A viewer who opens DevTools finds
 * nothing, because nothing was ever sent.
 */

/** `listings.availability`, as the detail screen says it out loud. */
const AVAILABILITY_LABEL: Record<string, string> = {
  sold: "This property has been sold",
  rented: "This property has been rented",
  completed: "This deal is closed",
};

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null;

/**
 * Three rent answers live in COLUMNS, not in `attributes`: the security
 * deposit, the availability date and whether maintenance is inside the rent
 * (`ListingForm.RENT_COLUMNS` keeps them out of the blob so a filter can query
 * them). Nothing put them back, so every screen that renders a listing from
 * `attributeRows` — the preview AND the public detail — simply never showed
 * them. The form asked a landlord for the deposit, the database stored it, and
 * a tenant could not see the single figure they care about most.
 *
 * They are merged back here, keyed by the names `field_definitions` already
 * carries, so they pick up their label, their group ("Rental terms") and their
 * position from config exactly like every other field — no second code path.
 */
function withRentColumns(l: ListingRow): Record<string, unknown> {
  const attrs = { ...((l.attributes ?? {}) as Record<string, unknown>) };
  if (l.kind !== "rent") return attrs;
  if (l.deposit_paise !== null && l.deposit_paise !== undefined) attrs.deposit = Math.round(l.deposit_paise / 100);
  if (l.available_from) attrs.available_from = l.available_from;
  if (l.maintenance_included) attrs.maintenance_included = true;
  return attrs;
}

/** Display units for an `area` attribute — the design's labels, not the codes. */
const UNIT_LABEL: Record<string, string> = {
  sqft: "sq ft", sqyd: "sq yard", sqm: "sq m",
  vigha: "Vigha", guntha: "Guntha", acre: "Acre", hectare: "Hectare",
};

/**
 * One stored answer → the string a detail screen prints.
 *
 * Exported because PROJECTS need exactly the same rendering and had grown their
 * own half of it: a project's site area printed "50 vigha" instead of
 * "50 Vigha", and its booking amount printed "150000" instead of "1,50,000",
 * because the unit-label map and the thousands-grouping both lived only in the
 * listing path. Two copies of "how do we print an answer" is how a scheme and a
 * flat end up describing the same field differently.
 *
 * Returns null when the value should not be shown at all (an unchecked
 * checkbox, an empty list, a blank area).
 */
export function renderAttrValue(def: FieldDefinitionRow | undefined, raw: unknown): string | null {
  const optLabel = (v: unknown) => def?.options?.find((o) => o.value === String(v))?.label ?? String(v);

  // `"true"` / `"false"` as STRINGS reached the row from an older form build
  // (corner_plot, meals). Without this they missed the boolean branch and
  // printed "Corner plot — false"; migration 0073 repaired the stored rows and
  // this keeps any straggler honest.
  if (typeof raw === "boolean" || raw === "true" || raw === "false") {
    // "Lift: No" is noise; the design only lists what's there.
    return raw === true || raw === "true" ? "Yes" : null;
  }
  if (Array.isArray(raw)) {
    return raw.length ? raw.map(optLabel).join(", ") : null;
  }
  if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const a = raw as { value: string; unit?: string };
    if (!a.value) return null;
    return `${Number(a.value).toLocaleString("en-IN")} ${UNIT_LABEL[a.unit ?? "sqft"] ?? a.unit ?? "sq ft"}`;
  }
  if (def?.control === "area") {
    // An `area` field whose row holds a bare figure rather than the
    // {value, unit} object the form writes today (older listings). Printing
    // "14960" under "Land area" states no unit at all; sq ft is what the column
    // has always meant when there is no unit beside it.
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return `${n.toLocaleString("en-IN")} sq ft`;
  }
  if (def?.control === "date") {
    // A DATE column comes back as an ISO timestamp; "2026-08-31T18:30:00.000Z"
    // under "Available from" is not a date a tenant reads.
    return ist(String(raw)) ?? String(raw);
  }
  if (def?.control === "number" && /^\d{4,}$/.test(String(raw))) {
    // A bare "2500" under "Maintenance (₹/month)" reads as a typo.
    return Number(raw).toLocaleString("en-IN");
  }
  return optLabel(raw);
}

/**
 * Attributes, rendered.
 *
 * `attributes` is stored as raw keys and raw option CODES — `{furnishing:
 * "semi", age: "1-5", water: "municipal"}`. The detail screen used to print
 * that object directly, so a buyer read "Furnishing semi" and "Bhk 3".
 *
 * The labels already exist in `field_definitions` (that is the whole point of
 * migration 0008), so the server resolves them here rather than each client
 * inventing its own mapping. Order follows the type's field list, so the detail
 * screen reads in the same order the form was filled.
 */
function attributeRows(
  attrs: Record<string, unknown>,
  type: PropertyTypeRow | null,
  defs: FieldDefinitionRow[] | undefined,
  kind = "sell",
) {
  if (!defs?.length) return [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  // The per-kind extras are part of the order too — reading only `fields` put a
  // rented office's lease duration and lock-in in the unordered tail.
  const order = keysForKind(type?.field_config, kind);
  /**
   * ONLY what this type asks for (Rajan, 29 Jul 2026 — "agriculture land, and
   * it shows building, parking… check all of them, globally").
   *
   * This used to append every unrecognised key the row still carried, so that
   * "a retired field keeps showing rather than silently disappearing". Audited
   * across the live listings, that fallback was printing Furnishing and
   * Construction status on farmland, Ownership on a PG bed and `wifi` under
   * "More details" — 39 of 124 rows. A seller cannot even edit those keys (the
   * form only renders the type's own fields), so showing them to a buyer states
   * something about the property that nobody can correct.
   *
   * Real answers stored under an older NAME are not lost: migration 0073
   * renamed the synonyms (`plot_area` → `land_area`, `washroom` → `washrooms`,
   * `floor_no` → `floor`) so they arrive through the config, like every other
   * field. Anything still outside the list is foreign to the type by
   * definition, and the value stays in the row either way.
   */
  const keys = order.filter((k) => k in attrs);

  const rows: { key: string; label: string; value: string; group: string | null }[] = [];
  for (const key of keys) {
    const raw = attrs[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const def = byKey.get(key);
    const label = def?.label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

    const value = renderAttrValue(def, raw);
    if (value === null) continue;
    // The same grouping the creation form uses (migration 0055), so a seller
    // sees their listing described in the order they described it — and a
    // twenty-row "Details" list becomes four short, titled blocks.
    rows.push({ key, label, value, group: def?.group ?? null });
  }
  return rows;
}

/**
 * Attribute rows → the form's titled blocks.
 *
 * Group order is the group list's order, and a row whose group is unknown (an
 * older field, or one an admin hasn't filed yet) lands in a trailing "More
 * details" block rather than vanishing.
 */
function groupRows(
  rows: { key: string; label: string; value: string; group: string | null }[],
  groups: { key: string; label: string; icon?: string | null; tone?: string | null }[] | undefined,
) {
  if (!rows.length) return [];
  const known = groups ?? [];
  // The icon and tone travel with the block (migration 0070) so the detail
  // screen's section headers are config, not a map inside a component.
  const out: { key: string; label: string; icon: string | null; tone: string | null; rows: typeof rows }[] = [];
  for (const g of known) {
    const items = rows.filter((r) => r.group === g.key);
    if (items.length) out.push({ key: g.key, label: g.label, icon: g.icon ?? null, tone: g.tone ?? null, rows: items });
  }
  const rest = rows.filter((r) => !r.group || !known.some((g) => g.key === r.group));
  if (rest.length) out.push({ key: "other", label: "More details", icon: "list", tone: "neutral", rows: rest });
  return out;
}

/** The numeric part of an `area` attribute, in sq ft, or null. */
function areaSqft(raw: unknown): number | null {
  if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const a = raw as { value: string | number; unit?: string };
    const n = Number(a.value);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Only sq ft converts cleanly to a ₹/sqft figure; the design only ever
    // shows that line for built-up/carpet areas, which are captured in sq ft.
    return (a.unit ?? "sqft") === "sqft" ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One entry of a type's `field_config.key_specs` candidate list (0071). */
export interface KeySpecCandidate {
  field: string;
  label: string;
  icon: string;
  /** `column` = read the row itself (projects: towers/floors/…), not `attributes`. */
  source?: "column" | "attribute";
}

/**
 * The key-spec strip, from a CANDIDATE list (migration 0071).
 *
 * The strip used to be exactly the four fields a type named, and any of them
 * the seller left empty was dropped — so a Flat posted without `floor` drew a
 * four-column grid with three tiles in it and a hole where the fourth was. The
 * config now lists EIGHT candidates in preference order and this takes the
 * first four that actually carry a value; the component then renders as many
 * columns as it was given. A thin listing gets a short, complete strip instead
 * of a full-width broken one.
 *
 * Shared with projects (`projectKeySpecs`), so a scheme's strip is the same
 * DB-driven list rather than a second one hardcoded in a component.
 */
export function resolveKeySpecs(
  candidates: KeySpecCandidate[] | undefined,
  values: Record<string, unknown>,
  defs: FieldDefinitionRow[] | undefined,
  max = 4,
): { icon: string; value: string; label: string; key: string }[] {
  const byKey = new Map((defs ?? []).map((d) => [d.key, d]));
  const out: { icon: string; value: string; label: string; key: string }[] = [];

  for (const s of candidates ?? []) {
    const raw = values[s.field];
    if (raw === undefined || raw === null || raw === "" || raw === false) continue;
    if (Array.isArray(raw) && !raw.length) continue;
    // A yes/no answer is not a spec. "AC — Yes" in a tile that reads
    // "3 BHK / 2 / 1,200" is noise, and the same fact is already a row in the
    // details block below. Skip it and let the next candidate have the slot.
    if (raw === true || raw === "true" || raw === "yes") continue;

    let value: string | null;
    let label = s.label;
    if (s.label === "Bedrooms") {
      // The design reads "3 BHK", not "3".
      value = `${renderAttrValue(byKey.get(s.field), raw) ?? raw} BHK`;
    } else if (s.label === "Floor" && values.total_floors) {
      // "9 / 12" — the floor within the building.
      value = `${raw} / ${values.total_floors}`;
    } else if (s.field === "floors" && s.source === "column") {
      // A project's tower height reads "G+14".
      value = `G+${raw}`;
    } else if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
      // An area object is a NUMBER on the strip ("2,400") with the unit moved
      // into the label ("Built-up sqft") — the tile has no room for
      // "2,400 sq ft" on one line, and a bare number with no unit anywhere is
      // just an unlabelled figure. A non-sqft unit (Vigha, sq yard) keeps its
      // unit in the value, because that is the number people quote.
      const n = areaSqft(raw);
      if (n === null) value = renderAttrValue(byKey.get(s.field), raw);
      else { value = n.toLocaleString("en-IN"); label = `${s.label} sqft`; }
    } else if (typeof raw === "number" || /^\d{4,}$/.test(String(raw))) {
      // A bare 14960 in a tile reads as a phone number. `renderAttrValue` only
      // groups when the definition says `control: number`, and a legacy row can
      // carry a plain figure under a key that is configured as an area.
      value = Number(raw).toLocaleString("en-IN");
    } else {
      value = renderAttrValue(byKey.get(s.field), raw);
    }
    if (value === null || value === "" || value === "Yes") continue;

    out.push({ icon: s.icon, value, label, key: s.field });
    if (out.length === max) break;
  }
  return out;
}

/**
 * Top the strip up from the answers the row actually carries.
 *
 * A candidate list can still come up short: a row seeded before a type's field
 * list changed stores `plot_area` where the config now says `land_area`, so
 * NONE of the eight candidates match and the strip disappears from a listing
 * that has plenty to show. Rather than leave a hole (or invent a value), this
 * borrows the first rendered rows — real values, in the config's own order —
 * and takes the section's DB icon (`field_groups.icon`) with them.
 *
 * Only runs when the type's own candidates produced fewer than two, so a
 * well-configured listing is never affected by it.
 */
export function topUpSpecs(
  specs: { icon: string; value: string; label: string; key: string }[],
  rows: { key: string; label: string; value: string; group: string | null }[],
  groups: { key: string; icon?: string | null }[] | undefined,
  min = 2,
  max = 4,
) {
  if (specs.length >= min) return specs;
  // Keyed by FIELD, not by label: `land_area` is titled "Plot area" by the
  // candidate list and "Land area" by its definition, so a label-keyed guard let
  // the same answer appear as two tiles.
  const used = new Set(specs.map((s) => s.key));
  const iconOf = new Map((groups ?? []).map((g) => [g.key, g.icon ?? "list"]));
  const out = [...specs];
  for (const r of rows) {
    if (out.length >= max) break;
    // "Yes" rows and long prose make poor tiles — a tile is one short fact.
    if (used.has(r.key) || r.value === "Yes" || r.value.length > 18) continue;
    used.add(r.key);
    out.push({ icon: iconOf.get(r.group ?? "") ?? "list", value: r.value, label: r.label, key: r.key });
  }
  return out;
}

/**
 * The key-spec strip and the highlight chip row (designs/P4 S1).
 *
 * WHICH fields appear is per-type config in `property_types.field_config`
 * (migrations 0023 / 0069 / 0071) and the VALUES are resolved through
 * `field_definitions` — nothing here is a hardcoded list, so an admin config
 * change moves the screen.
 */
function detailBlocks(
  attrs: Record<string, unknown>,
  type: PropertyTypeRow | null,
  defs: FieldDefinitionRow[] | undefined,
) {
  const cfg = (type?.field_config ?? {}) as {
    key_specs?: KeySpecCandidate[];
    highlights?: string[];
  };
  const byKey = new Map((defs ?? []).map((d) => [d.key, d]));
  const label = (key: string, v: unknown) =>
    byKey.get(key)?.options?.find((o) => o.value === String(v))?.label ?? String(v);

  const keySpecs = resolveKeySpecs(cfg.key_specs, attrs, defs);

  const highlights: string[] = [];
  for (const key of cfg.highlights ?? []) {
    const raw = attrs[key];
    if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") continue;
    const text = Array.isArray(raw) ? raw.map((v) => label(key, v)).join(", ") : label(key, raw);
    if (text) highlights.push(text);
  }

  return { keySpecs, highlights };
}

/** Price for a card: "₹85 Lakh", or the on-request label (Doc2 §5.1). */
function priceLabel(l: Pick<ListingRow, "price_paise" | "price_on_request" | "is_negotiable">) {
  if (l.price_on_request || l.price_paise === null) return "Price on request";
  return formatShortRupees(l.price_paise) + (l.is_negotiable ? " · Negotiable" : "");
}

/** Card shape for feed/search/manager lists. */
export function listingCardDTO(l: ListingRow) {
  return {
    id: l.id,
    title: l.title,
    price: priceLabel(l),
    priceOnRequest: l.price_on_request,
    areaLabel: l.area_label,
    coverUrl: l.cover_url,
    photoCount: l.photo_count,
    typeCode: l.type_code,
    kind: l.kind,
    status: l.status,
    availability: l.availability,
  };
}

/**
 * One tile of a P9 S1 featured collection: price on top, "3 BHK Mavdi"
 * underneath. The subtitle is composed here so the sheet never has to reach
 * into `attributes` in the browser.
 */
export function featuredItemDTO(l: ListingRow) {
  const bhk = (l.attributes as Record<string, unknown> | null)?.bhk;
  return {
    ...listingCardDTO(l),
    subtitle: [bhk ? `${bhk} BHK` : null, l.area_label].filter(Boolean).join(" "),
  };
}

/**
 * Public detail. `contact` is only present when the owner published it; the
 * caller must NOT merge in the raw row anywhere downstream.
 */
export function listingDetailDTO(
  l: ListingRow,
  type: PropertyTypeRow | null,
  opts: {
    isOwner: boolean;
    fieldDefs?: FieldDefinitionRow[];
    /** Real boost state — see service.isPromoted. */
    promoted?: boolean;
    /** Owner-only view/save/lead counts — see service.ownerListingStats. */
    stats?: { views: number; saves: number | null; leads: number | null } | null;
    /** Amenity code → label (service.getAmenityLabels); raw codes otherwise. */
    amenityLabels?: Map<string, string>;
    /** Amenity code → label + icon + category (service.getAmenityMeta). */
    amenityMeta?: Map<string, { label: string; icon: string | null; category: string | null }>;
    /** Form sections, in order (service.getFieldGroups) — used to block the details. */
    fieldGroups?: { key: string; label: string; icon?: string | null; tone?: string | null; scope_labels?: Record<string, string> | null }[];
    /**
     * Who posted it (service.listingPoster). The detail screen had no poster
     * block at all: every feed card names and links its poster, and tapping
     * through to the property lost them entirely, so a buyer could not tell an
     * owner from a broker on the one screen where it decides how they'll deal.
     * Public data — the feed already publishes exactly these fields.
     */
    poster?: { id: string; name: string | null; username: string | null; role: string | null; verified: boolean; avatarUrl: string | null } | null;
    /** Whether this viewer already saved it (service.isListingSaved). */
    saved?: boolean;
  },
) {
  const attrs = withRentColumns(l);
  const { keySpecs, highlights } = detailBlocks(attrs, type, opts.fieldDefs);
  const rows = attributeRows(attrs, type, opts.fieldDefs, l.kind);
  // Never a strip with one tile in it — see topUpSpecs.
  const specs = topUpSpecs(keySpecs, rows, opts.fieldGroups);

  // ₹/sqft is computed HERE, from the same figures the row holds — the client
  // must never derive a price (CLAUDE.md §6).
  const sqft =
    l.area_sqft ??
    areaSqft(attrs.builtup_area) ??
    areaSqft(attrs.carpet_area) ??
    areaSqft(attrs.land_area) ??
    areaSqft(attrs.plot_area);
  const pricePerSqft =
    !l.price_on_request && l.price_paise !== null && sqft
      ? `₹${Math.round(l.price_paise / 100 / sqft).toLocaleString("en-IN")} / sqft`
      : null;

  const base = {
    id: l.id,
    title: l.title,
    description: l.description,
    price: priceLabel(l),
    // The design's location line carries the pincode: "Mavdi, Rajkot – 360004".
    locationLabel: l.pincode ? `${l.area_label} – ${l.pincode}` : l.area_label,
    pincode: l.pincode,
    pricePerSqft,
    kindLabel: l.kind === "rent" ? "For Rent" : "For Sale",
    keySpecs: specs,
    highlights,
    promoted: opts.promoted ?? false,
    // The card label carries "· Negotiable"; the detail screen shows the figure
    // large with a separate Negotiable tag, so it needs the figure alone —
    // printing `price` there rendered "Negotiable" twice.
    priceOnly: l.price_on_request || l.price_paise === null ? "Price on request" : formatShortRupees(l.price_paise),
    pricePaise: l.price_on_request ? null : l.price_paise,
    priceOnRequest: l.price_on_request,
    isNegotiable: l.is_negotiable,
    kind: l.kind,
    typeCode: l.type_code,
    typeLabel: type?.label ?? l.type_code,
    status: l.status,
    // The badge for that status, resolved from the SAME map My Listings uses.
    // The Preview screen used to hardcode "Under review" beside its bottom bar,
    // so a listing sitting in `changes_requested` or already `live` was
    // previewed under a label that wasn't its own (CLAUDE.md rule 12).
    badge: STATUS_BADGE[l.status] ?? { kind: "expired", label: l.status },
    availability: l.availability,
    // The archived reason as a word, so the screen never has to map the enum
    // itself ("available" prints nothing — there's no banner for it).
    availabilityLabel: AVAILABILITY_LABEL[l.availability] ?? null,
    areaLabel: l.area_label,
    coverUrl: l.cover_url,
    photoCount: l.photo_count,
    // The type's family (residential / commercial / plot), so the detail can
    // title its own blocks without re-deriving it from the type code.
    typeCategory: type?.category ?? null,
    poster: opts.poster ?? null,
    saved: opts.saved ?? false,
    // Raw map stays for the owner's edit form; `attributeRows` is what any
    // screen should actually render.
    attributes: l.attributes,
    attributeRows: rows,
    /**
     * The same rows, in the same titled blocks the creation form used
     * (migration 0055). The detail screen printed one flat "Details" list —
     * fine at eight rows, unreadable at the twenty-seven a Flat now carries.
     * Grouped here rather than in the component so the projects screen, the
     * preview and the public detail can't drift apart.
     */
    /**
     * Sections titled for THIS type (migration 0072). An Agriculture Land row
     * used to file water + electricity under "Parking & utilities" and facing +
     * ownership under "Building & ownership", because the section list is one
     * global list and nothing re-titled it for a field.
     */
    attributeGroups: groupRows(rows, scopedGroups(opts.fieldGroups, { kind: "property", category: type?.category })),
    // Labels, not codes — "power_backup" is a storage detail, not UI copy.
    amenities: (l.amenities ?? []).map((a) => opts.amenityMeta?.get(a)?.label ?? opts.amenityLabels?.get(a) ?? a),
    /**
     * The same amenities with their icon and category (migration 0070), which
     * is what the detail screen's tile grid renders. `amenities` above stays a
     * plain string[] because the cards and the search chips read it.
     */
    amenityItems: (l.amenities ?? []).map((a) => ({
      code: a,
      label: opts.amenityMeta?.get(a)?.label ?? opts.amenityLabels?.get(a) ?? a,
      icon: opts.amenityMeta?.get(a)?.icon ?? null,
      category: opts.amenityMeta?.get(a)?.category ?? null,
    })),
    postedOn: ist(l.live_at ?? l.created_at),
    // Whether a number EXISTS is public (it drives the Request-Number button);
    // the number itself is not.
    contactPublic: l.contact_public,
  };

  if (l.contact_public) {
    return {
      ...base,
      contact: { number: l.contact_number, alt: l.alt_number, whatsapp: l.whatsapp_number },
      ...(opts.isOwner ? ownerExtras(l, opts.stats ?? null) : {}),
    };
  }

  // Number withheld → the key is absent, not null-with-a-hint.
  return { ...base, ...(opts.isOwner ? ownerExtras(l, opts.stats ?? null) : {}) };
}

/**
 * Fields only the owner sees on their own listing: moderation notes, the
 * reject counter, and the private ownership-proof reference. Never merged for
 * another viewer.
 */
function ownerExtras(
  l: ListingRow,
  stats: { views: number; saves: number | null; leads: number | null } | null,
) {
  return {
    owner: {
      // Views/Saves/Leads strip above the owner action bar (designs/P4 S1).
      stats,
      slotId: l.slot_id,
      rejectCount: l.reject_count,
      isLocked: l.is_locked,
      reviewNotes: l.review_notes,
      rejectReason: l.reject_reason,
      // Whether a proof was uploaded — never the private R2 key itself, which
      // is only ever served through a short-lived signed URL (Doc2 §5.1).
      hasOwnershipProof: Boolean(l.ownership_proof_key),
      ownershipProofType: l.ownership_proof_type,
      contact: { number: l.contact_number, alt: l.alt_number, whatsapp: l.whatsapp_number, public: l.contact_public },
      // The edit form has to re-open the location cascade on the levels the
      // listing already sits on, so the owner gets the ids back. They stay out
      // of the public payload — only the label is public.
      location: {
        stateId: l.state_id,
        districtId: l.district_id,
        talukaId: l.taluka_id,
        cityId: l.city_id,
        areaId: l.area_id,
        pincode: l.pincode,
        label: l.area_label,
      },
      depositPaise: l.deposit_paise,
      maintenancePaise: l.maintenance_paise,
      maintenanceIncluded: l.maintenance_included,
      availableFrom: l.available_from,
    },
  };
}

/**
 * Manager row (Doc7 §56) — statuses + what the owner must act on.
 *
 * Exported because `projects` uses the same `listing_state` enum, so a builder's
 * Projects tab must speak the same badge language as their listings rather than
 * growing a second, drifting vocabulary.
 */
export const STATUS_BADGE: Record<string, { kind: string; label: string }> = {
  draft: { kind: "expired", label: "Draft" },
  payment_pending: { kind: "pending", label: "Payment pending" },
  pending_review: { kind: "pending", label: "Under review" },
  changes_requested: { kind: "grace", label: "Changes requested" },
  rejected: { kind: "failed", label: "Rejected" },
  live: { kind: "active", label: "Live" },
  hidden: { kind: "expired", label: "Hidden" },
  archived: { kind: "expired", label: "Archived" },
};

export function myListingDTO(l: ListingRow) {
  return {
    ...listingCardDTO(l),
    badge: STATUS_BADGE[l.status] ?? { kind: "expired", label: l.status },
    reviewNotes: l.review_notes,
    rejectReason: l.reject_reason,
    isLocked: l.is_locked,
    canBoost: l.status === "live" && l.availability === "available",
    canReactivate: l.availability === "rented",
    // The 2-month "still available?" prompt. The cron sets the flag and the
    // owner has 15 days to answer before step 2 auto-hides the listing — so the
    // manager has to actually ASK, not just carry the timestamp silently.
    stillAvailableAsked: Boolean(l.still_available_asked_at) && l.status === "live",
    createdOn: ist(l.created_at),
  };
}

/**
 * P9 S5 — Listing insights.
 *
 * Everything the screen prints is here, computed on the server: the four metric
 * counts, the "Live since … · Lifetime listing" line, whether the 2-month
 * check-in is currently asking, and which of the design's cards apply. The
 * client renders this payload and decides nothing about it.
 */
export function listingInsightsDTO(
  l: ListingRow,
  opts: {
    stats: { views: number; saves: number; shares: number; leads: number };
    promoted: boolean;
    planLabel: string | null;
    boostFromPaise: number | null;
  },
) {
  const { stats, promoted, planLabel, boostFromPaise } = opts;
  const liveDays = l.live_at ? Math.floor((Date.now() - new Date(l.live_at).getTime()) / 86_400_000) : null;

  // The design's advice card ("No inquiries in 30 days"). It is an OBSERVATION,
  // so it only renders when the observation is actually true — a listing that
  // went live yesterday must not be told it has been ignored for a month.
  const tip =
    l.status === "live" && stats.leads === 0 && liveDays !== null && liveDays >= 30
      ? {
          title: "No inquiries in 30 days",
          body: "Listings with 5+ daylight photos and a clear price get up to 3× more inquiries.",
        }
      : null;

  return {
    ...myListingDTO(l),
    promoted,
    planLabel,
    liveSince: l.live_at
      ? new Date(l.live_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
      : null,
    liveDays,
    stats,
    tip,
    /** "Boost — from ₹499", priced from plan_catalog rather than written in. */
    boostFrom: boostFromPaise === null ? null : formatShortRupees(boostFromPaise),
  };
}

/** Config payload the dynamic form is built from (Doc7 §43). */
export function typeConfigDTO(t: PropertyTypeRow) {
  return {
    code: t.code,
    label: t.label,
    category: t.category,
    kinds: t.kinds,
    fields: t.field_config.fields ?? [],
    hidden: t.field_config.hidden ?? [],
    required: t.field_config.required ?? [],
    /**
     * The extras a RENT listing asks for on top of `fields`. The form used to
     * hardcode deposit/available-from/maintenance/tenant-preference, which was
     * both a client-side business rule and wrong for commercial rent — an
     * office needs its lease duration and lock-in, not a tenant preference.
     */
    rentFields: t.field_config.rent_fields ?? [],
    /**
     * The mirror image — asked only when the place is being SOLD. A landlord
     * was being asked to state the ownership document and whether the property
     * is approved for a bank loan, neither of which a tenant can use.
     */
    sellFields: t.field_config.sell_fields ?? [],
    areaUnits: Boolean(t.field_config.area_units),
  };
}

// ---------------------------------------------------------------------------
// Requirements (P6 S4 / P8) — creation only in Module 4
// ---------------------------------------------------------------------------

const URGENCY_LABEL: Record<string, string> = {
  immediate: "Immediate (within 1 month)",
  "1_3_months": "1–3 months",
  exploring: "Just exploring",
};

const REQ_STATUS_BADGE: Record<string, { kind: string; label: string }> = {
  draft: { kind: "expired", label: "Draft" },
  // Kinds must be StatusBadge's vocabulary — "review"/"changes" matched nothing
  // there, so the badge fell through to default styling.
  pending_review: { kind: "under-review", label: "Under Review" },
  changes_requested: { kind: "changes-requested", label: "Changes Requested" },
  rejected: { kind: "rejected", label: "Rejected" },
  live: { kind: "active", label: "Live" },
  paused: { kind: "expired", label: "Paused" },
  fulfilled: { kind: "active", label: "Fulfilled" },
  expired: { kind: "expired", label: "Expired" },
};

/** Budget as the form's live word-line: "₹40 Lakh – ₹60 Lakh". */
function budgetLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatShortRupees(min)} – ${formatShortRupees(max)}`;
  if (max !== null) return `Up to ${formatShortRupees(max)}`;
  if (min !== null) return `${formatShortRupees(min)}+`;
  return "Budget not set";
}

export function requirementDTO(r: RequirementRow) {
  const daysLeft = r.expires_at
    ? Math.max(0, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: r.kind === "rent" ? "Rent" : "Buy",
    typeCode: r.type_code,
    bhk: r.bhk,
    budgetLabel: budgetLabel(r.budget_min_paise, r.budget_max_paise),
    areaLabel: r.area_label,
    urgency: r.urgency,
    urgencyLabel: URGENCY_LABEL[r.urgency] ?? r.urgency,
    notes: r.notes,
    status: r.status,
    badge: REQ_STATUS_BADGE[r.status] ?? { kind: "expired", label: r.status },
    isActive: r.is_active,
    rejectReason: r.reject_reason,
    daysLeft,
    createdOn: ist(r.created_at),
  };
}

/**
 * Requirement DETAIL (P4 S4). The access level decides what is even present:
 * a locked viewer never receives the budget or the poster — those keys are
 * absent, not blurred (Doc9 §17, "stripped server-side").
 */
export function requirementDetailDTO(
  r: RequirementRow,
  access: "own" | "unlocked" | "locked",
  proposalCount: number | null,
  /**
   * `property_types.label` for `type_code`. The payload only ever carried the
   * CODE, so the detail screen had nothing to print but "flat" — the one line
   * that says what the buyer is actually looking for was a storage value.
   */
  typeLabel?: string | null,
) {
  const card = requirementDTO(r);
  const daysLeft = card.daysLeft;

  const preview = {
    id: r.id,
    access,
    kind: r.kind,
    kindLabel: r.kind === "rent" ? "Looking to Rent" : "Looking to Buy",
    typeCode: r.type_code,
    typeLabel: typeLabel ?? null,
    bhk: r.bhk,
    areaLabel: r.area_label,
    urgency: r.urgency,
    urgencyLabel: card.urgencyLabel,
    isUrgent: r.urgency === "immediate",
    status: r.status,
    badge: card.badge,
    postedOn: card.createdOn,
    daysLeft,
  };

  // Locked stops here — deliberately no budget, no notes, no poster.
  if (access === "locked") return preview;

  const full = {
    ...preview,
    budgetLabel: card.budgetLabel,
    notes: r.notes,
    referenceId: `#REQ-${r.id.slice(0, 4).toUpperCase()}`,
  };

  if (access !== "own") return full;

  return {
    ...full,
    isActive: r.is_active,
    proposalCount: proposalCount ?? 0,
    rejectReason: r.reject_reason,
    // Raw values so the poster's own edit form can re-open on them. Never in
    // `full` — an unlocked viewer gets the formatted budget label, not the
    // figures, and never the area ids.
    budgetMinPaise: r.budget_min_paise,
    budgetMaxPaise: r.budget_max_paise,
    areaIds: r.area_ids ?? [],
    // Doc2 §4.2: turning off or deleting still counts against the quota. The
    // screen says this out loud before either action.
    quotaNote: "This requirement still counts against your plan quota.",
  };
}
