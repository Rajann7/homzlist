import "server-only";
import { formatShortRupees } from "@/lib/billing/money";
import type { FieldDefinitionRow, ListingRow, PropertyTypeRow } from "./service";
import type { RequirementRow } from "./requirements";

/**
 * Listing DTOs (Doc9 §17 — explicit fields only).
 *
 * The rule that matters most here: when the owner has NOT made their number
 * public, the number is absent from the payload entirely — not blanked, not
 * hidden with CSS (Doc7 §51, Doc9 §17). A viewer who opens DevTools finds
 * nothing, because nothing was ever sent.
 */

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null;

/** Display units for an `area` attribute — the design's labels, not the codes. */
const UNIT_LABEL: Record<string, string> = {
  sqft: "sq ft", sqyd: "sq yard", sqm: "sq m",
  vigha: "Vigha", guntha: "Guntha", acre: "Acre", hectare: "Hectare",
};

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
) {
  if (!defs?.length) return [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const order = type?.field_config.fields ?? [];
  // Config order first, then anything the row still carries from an older
  // config (a retired field keeps showing rather than silently disappearing).
  const keys = [...order.filter((k) => k in attrs), ...Object.keys(attrs).filter((k) => !order.includes(k))];

  const rows: { key: string; label: string; value: string }[] = [];
  for (const key of keys) {
    const raw = attrs[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const def = byKey.get(key);
    const label = def?.label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    const optLabel = (v: unknown) => def?.options?.find((o) => o.value === String(v))?.label ?? String(v);

    let value: string;
    if (typeof raw === "boolean") {
      if (!raw) continue; // "Lift: No" is noise; the design only lists what's there.
      value = "Yes";
    } else if (Array.isArray(raw)) {
      if (!raw.length) continue;
      value = raw.map(optLabel).join(", ");
    } else if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
      const a = raw as { value: string; unit?: string };
      if (!a.value) continue;
      value = `${Number(a.value).toLocaleString("en-IN")} ${UNIT_LABEL[a.unit ?? "sqft"] ?? a.unit ?? "sq ft"}`;
    } else if (def?.control === "number" && /^\d{4,}$/.test(String(raw))) {
      // A bare "2500" under "Maintenance (₹/month)" reads as a typo.
      value = Number(raw).toLocaleString("en-IN");
    } else {
      value = optLabel(raw);
    }
    rows.push({ key, label, value });
  }
  return rows;
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

/**
 * The 4-tile key-spec strip and the highlight chip row (designs/P4 S1).
 *
 * WHICH fields appear is per-type config in `property_types.field_config`
 * (migration 0023) and the VALUES are resolved through `field_definitions` —
 * nothing here is a hardcoded list, so an admin config change moves the screen.
 */
function detailBlocks(
  attrs: Record<string, unknown>,
  type: PropertyTypeRow | null,
  defs: FieldDefinitionRow[] | undefined,
) {
  const cfg = (type?.field_config ?? {}) as {
    key_specs?: { field: string; label: string; icon: string }[];
    highlights?: string[];
  };
  const byKey = new Map((defs ?? []).map((d) => [d.key, d]));
  const label = (key: string, v: unknown) =>
    byKey.get(key)?.options?.find((o) => o.value === String(v))?.label ?? String(v);

  const keySpecs: { icon: string; value: string; label: string }[] = [];
  for (const s of cfg.key_specs ?? []) {
    const raw = attrs[s.field];
    if (raw === undefined || raw === null || raw === "") continue;
    let value: string;
    if (s.label === "Sqft") {
      const n = areaSqft(raw);
      if (n === null) continue;
      value = n.toLocaleString("en-IN");
    } else if (s.label === "Bedrooms") {
      value = `${label(s.field, raw)} BHK`;
    } else if (s.label === "Floor" && attrs.total_floors) {
      // The design reads "4 / 7" — the floor within the building.
      value = `${raw} / ${attrs.total_floors}`;
    } else {
      value = label(s.field, raw);
    }
    keySpecs.push({ icon: s.icon, value, label: s.label });
    if (keySpecs.length === 4) break;
  }

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
  },
) {
  const attrs = (l.attributes ?? {}) as Record<string, unknown>;
  const { keySpecs, highlights } = detailBlocks(attrs, type, opts.fieldDefs);

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
    keySpecs,
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
    availability: l.availability,
    areaLabel: l.area_label,
    coverUrl: l.cover_url,
    photoCount: l.photo_count,
    // Raw map stays for the owner's edit form; `attributeRows` is what any
    // screen should actually render.
    attributes: l.attributes,
    attributeRows: attributeRows(l.attributes ?? {}, type, opts.fieldDefs),
    amenities: l.amenities,
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

/** Manager row (Doc7 §56) — statuses + what the owner must act on. */
const STATUS_BADGE: Record<string, { kind: string; label: string }> = {
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
) {
  const card = requirementDTO(r);
  const daysLeft = card.daysLeft;

  const preview = {
    id: r.id,
    access,
    kind: r.kind,
    kindLabel: r.kind === "rent" ? "Looking to Rent" : "Looking to Buy",
    typeCode: r.type_code,
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
