import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { attributeRows } from "@/lib/listings/dto";
import { getAmenityLabels, getFieldDefinitions, getPropertyType, labelAmenities } from "@/lib/listings/service";
import { MAX_REJECTS } from "@/lib/listings/moderation";
import { signedReadUrl } from "@/lib/storage";
import { ageLabel, reportCounts, scoreRisk, type Risk } from "./risk";
import { locksFor, type Lock } from "./locks";
import { budgetLabel, LISTING_TABS, type QueueSubject } from "./queues";
import { flagText, type FlaggedText } from "./textFlags";
import {
  changeFields,
  flagReasonLabels,
  humaniseFlag,
  rejectTemplates,
  sopItems,
  type ChangeField,
  type RejectTemplate,
  type SopItem,
} from "./reviewConfig";
import type { CurrentStaff } from "./auth";

/**
 * A4 / A5 — the review detail reader (Doc5 A4, A5).
 *
 * Everything the panel draws in one server pass, because A4 is the screen where
 * a wrong answer costs the most: an admin approves what this function describes.
 * So nothing here is derived in the browser, and nothing is a placeholder — the
 * submitted-fields list comes from `field_definitions`, the SOP checklist and
 * reject templates from their config tables, the risk reasons from the same
 * scorer the queue sorts by, and the "2 of 3 rejections" line from the row's own
 * counter rather than a typed-in string.
 *
 * `position` is what makes prev/next and auto-advance honest: it is computed
 * against the SAME ordering the queue screen used (risk desc, then oldest), so
 * "3 of 12 · → next" moves through the list the admin was just looking at.
 */

const TABLE: Record<QueueSubject, string> = { listing: "listings", requirement: "requirements" };

export interface ReviewField {
  key: string;
  label: string;
  value: string;
  /** A field the reviewer should look at twice (contact, flagged text). */
  warn?: boolean;
  /** Present for free text — carries the number-detection spans. */
  flagged?: FlaggedText | null;
  /** The moderator's existing note from a previous "request changes". */
  note?: string | null;
}

export interface ReviewPoster {
  id: string;
  name: string;
  initials: string;
  role: string | null;
  avatarUrl: string | null;
  isNew: boolean;
  registeredAt: string | null;
  registeredLabel: string | null;
  listings: number;
  rejections: number;
  reports: number;
  phoneVerified: boolean;
  idVerified: boolean;
  reraVerified: boolean;
  /** True on their first ever listing — A4 shows the profile preview note then. */
  isFirstListing: boolean;
  bio: string | null;
}

export interface ReviewDoc {
  typeLabel: string | null;
  url: string | null;
  nameOnDoc: string | null;
  nameOnAccount: string;
  /** null = we never captured the doc name, so no claim is made either way. */
  mismatch: boolean | null;
  uploadedLabel: string | null;
}

export interface ReviewHistoryEntry {
  at: string;
  dateLabel: string;
  text: string;
}

export interface ReviewPosition {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  tab: string;
}

export interface ReviewCardPreview {
  priceLabel: string;
  kindLabel: string;
  metaLine: string;
  areaLabel: string | null;
  fullLocation: string | null;
  photos: string[];
  photoCount: number;
  specs: Array<{ value: string; label: string }>;
  amenities: string[];
  description: FlaggedText;
  typeLine: string;
}

export interface ReviewDetail {
  subject: QueueSubject;
  id: string;
  shortId: string;
  status: string;
  statusLabel: string;
  isLocked: boolean;
  position: ReviewPosition;
  preview: ReviewCardPreview;
  risk: Risk;
  fields: ReviewField[];
  locationTrail: string[];
  doc: ReviewDoc | null;
  poster: ReviewPoster;
  history: ReviewHistoryEntry[];
  rejects: { count: number; max: number; nextWouldLock: boolean };
  reports: { count: number; reasons: Array<{ reason: string; count: number }> } | null;
  sop: SopItem[];
  rejectTemplates: RejectTemplate[];
  changeFields: ChangeField[];
  lock: Lock | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
  payment_pending: "Payment pending",
  live: "Live",
  hidden: "Hidden",
  archived: "Archived",
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function registeredLabelOf(iso: string): string {
  const on = new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  // ageLabel switches from "3 days ago" to an absolute date past 60 days, so the
  // relative half is only useful inside that window.
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  const rel = days < 60 ? ageLabel(iso) : null;
  return rel ? `${on} · ${rel}` : on;
}

/** `profiles.role` is stored lowercase; the panel labels roles in title case. */
function roleLabel(role: string | null): string | null {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Which A3 tab a row belongs to — the panel must page within its own tab. */
export function tabOf(row: { status: string; edited_since_approval?: boolean | null }): string {
  if (row.status === "changes_requested") return "changes";
  if (row.status === "rejected") return "rejected";
  if (row.status === "payment_pending") return "payment";
  return row.edited_since_approval ? "updated" : "pending";
}

/**
 * The ids of one tab, in the queue's own order.
 *
 * Deliberately re-derives the order rather than trusting an index passed in the
 * URL: an admin who leaves the panel open for ten minutes while colleagues clear
 * items must not get "4 of 12" pointing at something already approved.
 */
async function orderedIds(subject: QueueSubject, tab: string, staffId: string): Promise<string[]> {
  const db = createServiceClient();
  const table = TABLE[subject];

  let q = db
    .from(table)
    .select("id, submitted_at, created_at, reject_count, flagged_reason, profile_id");
  if (tab === "changes") q = q.eq("status", "changes_requested");
  else if (tab === "rejected") q = q.eq("status", "rejected");
  else if (tab === "payment") q = q.eq("status", "payment_pending");
  else q = q.eq("status", "pending_review").eq("edited_since_approval", tab === "updated");

  const { data } = await q.order("submitted_at", { ascending: true, nullsFirst: false }).limit(200);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const posterIds = [...new Set(rows.map((r) => r.profile_id as string).filter(Boolean))];
  const [profiles, reports] = await Promise.all([
    posterIds.length
      ? db.from("profiles").select("id, created_at").in("id", posterIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    reportCounts(subject, rows.map((r) => r.id as string)),
  ]);
  const created = new Map(
    ((profiles.data ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p.created_at as string]),
  );

  const scored = rows.map((r) => {
    const stamp = (r.submitted_at as string) ?? (r.created_at as string);
    const hours = stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 3_600_000) : 0;
    const risk = scoreRisk({
      posterCreatedAt: created.get(r.profile_id as string) ?? null,
      rejectCount: (r.reject_count as number) ?? 0,
      flaggedReason: (r.flagged_reason as string) ?? null,
      reportCount: reports.get(r.id as string) ?? 0,
    });
    return { id: r.id as string, score: risk.score, hours };
  });

  // The exact rule lib/admin/queues.ts sorts by — see its comment.
  scored.sort((a, b) => b.score - a.score || b.hours - a.hours);
  void staffId;
  return scored.map((s) => s.id);
}

/** Grouped open reports on this item — A4's report-context card. */
async function reportContext(subject: QueueSubject, id: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("reports")
    .select("reason")
    .eq("subject_type", subject)
    .eq("subject_id", id)
    .in("status", ["open", "reviewing"]);
  const rows = (data ?? []) as Array<{ reason: string }>;
  if (!rows.length) return null;

  const byReason = new Map<string, number>();
  for (const r of rows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  return {
    count: rows.length,
    reasons: [...byReason.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function posterPanel(profileId: string, subjectId: string): Promise<ReviewPoster> {
  const db = createServiceClient();
  const [{ data: p }, listings, rejects, reports, verifs] = await Promise.all([
    db.from("profiles").select("id, name, role, photo_url, bio, created_at").eq("id", profileId).maybeSingle(),
    db.from("listings").select("id", { count: "exact", head: true }).eq("profile_id", profileId).is("deleted_at", null),
    db.from("moderation_log").select("id", { count: "exact", head: true }).eq("actor_id", profileId).eq("action", "reject"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("subject_type", "user").eq("subject_id", profileId),
    db.from("verifications").select("level, status").eq("profile_id", profileId),
  ]);

  // Rejections AGAINST this poster, not decisions they made — moderation_log's
  // actor_id is the admin, so the count has to come from their own rows.
  const { data: theirs } = await db
    .from("listings")
    .select("reject_count")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  const rejectionCount = ((theirs ?? []) as Array<{ reject_count: number | null }>).reduce(
    (n, r) => n + (r.reject_count ?? 0),
    0,
  );
  void rejects;

  const row = (p ?? {}) as Record<string, unknown>;
  const name = (row.name as string) || "Unnamed";
  const createdAt = (row.created_at as string) ?? null;
  const levels = new Map(
    ((verifs.data ?? []) as Array<{ level: string; status: string }>).map((v) => [v.level, v.status]),
  );
  const total = listings.count ?? 0;

  return {
    id: profileId,
    name,
    initials: initialsOf(name),
    role: roleLabel((row.role as string) ?? null),
    avatarUrl: (row.photo_url as string) ?? null,
    isNew: createdAt ? Date.now() - new Date(createdAt).getTime() <= 7 * 86_400_000 : false,
    registeredAt: createdAt,
    // "12 Jan 2025 · 2h ago". `ageLabel` falls back to a DATE past 60 days, which
    // printed the same date twice ("2 Dec 2024 · 2 Dec 2024"); the relative half
    // is only appended while it is still relative.
    registeredLabel: createdAt ? registeredLabelOf(createdAt) : null,
    listings: total,
    rejections: rejectionCount,
    reports: reports.count ?? 0,
    phoneVerified: levels.get("phone") === "approved",
    idVerified: levels.get("id") === "approved",
    reraVerified: levels.get("rera") === "approved",
    // "First listing from this account" — true when this IS their only one.
    isFirstListing: total <= 1,
    bio: (row.bio as string) ?? null,
  };
}

/** The decision trail A4's "Prior history" strip lists. */
async function historyOf(subject: QueueSubject, id: string, submittedAt: string | null): Promise<ReviewHistoryEntry[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_log")
    .select("action, reason, created_at, actor_id")
    .eq("subject", subject)
    .eq("subject_id", id)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const actorIds = [...new Set(rows.map((r) => r.actor_id as string).filter(Boolean))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: staff } = await db
      .from("staff")
      .select("profile_id, display_name, email")
      .in("profile_id", actorIds);
    for (const s of (staff ?? []) as Array<Record<string, unknown>>) {
      names.set(s.profile_id as string, (s.display_name as string) || (s.email as string) || "an admin");
    }
  }

  const out: ReviewHistoryEntry[] = rows.map((r) => {
    const who = names.get(r.actor_id as string) ?? "an admin";
    const at = r.created_at as string;
    const action = r.action as string;
    const verb =
      action === "reject" ? `Rejected${r.reason ? ` (${r.reason})` : ""}`
      : action === "request_changes" ? "Changes requested"
      : "Approved";
    return { at, dateLabel: dateLabel(at), text: `${verb} by ${who}` };
  });

  if (submittedAt) {
    out.push({ at: submittedAt, dateLabel: dateLabel(submittedAt), text: "Submitted (this version)" });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * state › district › taluka › city › area · pincode — A4's Location section.
 *
 * A REQUIREMENT does not have that chain: it stores a city and an `area_ids`
 * array (a buyer names several areas, a seller one address). Reading only the
 * listing columns left A5 printing the city on its own, dropping the very thing
 * the reviewer is checking, so both shapes are handled.
 */
async function locationTrail(row: Record<string, unknown>): Promise<string[]> {
  const chain = ["state_id", "district_id", "taluka_id", "city_id", "area_id"]
    .map((k) => row[k] as string | null)
    .filter((v): v is string => Boolean(v));
  const areaIds = Array.isArray(row.area_ids) ? (row.area_ids as string[]).filter(Boolean) : [];
  const ids = [...new Set([...chain, ...areaIds])];
  if (!ids.length) return [];

  const db = createServiceClient();
  const { data } = await db.from("locations").select("id, name").in("id", ids);
  const names = new Map(((data ?? []) as Array<Record<string, unknown>>).map((l) => [l.id as string, l.name as string]));

  const trail = chain.map((id) => names.get(id)).filter((v): v is string => Boolean(v));
  // The preferred areas come after the city, comma-joined, because they are
  // alternatives to each other rather than another level of the hierarchy.
  const areas = areaIds.map((id) => names.get(id)).filter((v): v is string => Boolean(v));
  if (areas.length) trail.push(areas.join(", "));

  const pincode = row.pincode as string | null;
  return pincode ? [...trail, pincode] : trail;
}

export type ReviewLoad =
  | { ok: true; detail: ReviewDetail }
  | { ok: false; reason: "not_found" };

export async function reviewDetail(
  subject: QueueSubject,
  id: string,
  staff: CurrentStaff,
): Promise<ReviewLoad> {
  const db = createServiceClient();
  const { data: raw } = await db.from(TABLE[subject]).select("*").eq("id", id).maybeSingle();
  if (!raw) return { ok: false, reason: "not_found" };
  const row = raw as Record<string, unknown>;

  const tab = tabOf(row as { status: string; edited_since_approval?: boolean | null });
  const submittedAt = (row.submitted_at as string) ?? (row.created_at as string) ?? null;

  const [ids, poster, reports, history, trail, defs, type, amenityLabels, sop, templates, chips, locks, flagLabels] =
    await Promise.all([
      orderedIds(subject, tab, staff.id),
      posterPanel(row.profile_id as string, id),
      reportContext(subject, id),
      historyOf(subject, id, submittedAt),
      locationTrail(row),
      getFieldDefinitions(),
      // A requirement names a property type too ("Buy · Flat"), so the label is
      // resolved for both subjects — printing `type_code` showed the reviewer
      // "flat" where the poster picked "Flat".
      getPropertyType(row.type_code as string),
      getAmenityLabels(),
      sopItems(subject),
      rejectTemplates(subject),
      changeFields(subject),
      locksFor(subject, [id], staff.id),
      flagReasonLabels(),
    ]);

  const index = ids.indexOf(id);
  const position: ReviewPosition = {
    index: index >= 0 ? index : 0,
    total: ids.length || 1,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
    tab,
  };

  const flagCode = (row.flagged_reason as string) ?? null;
  const risk = scoreRisk({
    posterCreatedAt: poster.registeredAt,
    rejectCount: (row.reject_count as number) ?? 0,
    // The stored value is a CODE; the risk block is read by a person.
    flaggedReason: flagCode ? humaniseFlag(flagCode, flagLabels) : null,
    reportCount: reports?.count ?? 0,
    posterAgeLabel: ageLabel(poster.registeredAt),
  });

  const notes = (row.review_notes ?? null) as Record<string, string> | null;
  const noteFor = (key: string) => notes?.[key] ?? null;

  const description = await flagText(row.description as string | null);
  const title = await flagText(row.title as string | null);

  const fields: ReviewField[] =
    subject === "listing"
      ? await listingFields(row, type, defs, description, title, noteFor)
      : await requirementFields(row, type, defs, noteFor);

  const preview =
    subject === "listing"
      ? await listingPreview(row, type, defs, amenityLabels, description, trail)
      : await requirementPreview(row, type, trail);

  const rejectCount = (row.reject_count as number) ?? 0;

  return {
    ok: true,
    detail: {
      subject,
      id,
      shortId: id.slice(0, 8),
      status: row.status as string,
      statusLabel: STATUS_LABEL[row.status as string] ?? (row.status as string),
      isLocked: Boolean(row.is_locked),
      position,
      preview,
      risk,
      fields,
      locationTrail: trail,
      doc: subject === "listing" ? await ownershipDoc(row, poster.name, defs) : null,
      poster,
      history,
      rejects: { count: rejectCount, max: MAX_REJECTS, nextWouldLock: rejectCount + 1 >= MAX_REJECTS },
      reports,
      sop,
      rejectTemplates: templates,
      changeFields: chips,
      lock: locks.get(id) ?? null,
    },
  };
}

// -------------------------------------------------------------- field builders

type NoteLookup = (key: string) => string | null;

async function listingFields(
  row: Record<string, unknown>,
  type: Awaited<ReturnType<typeof getPropertyType>>,
  defs: Awaited<ReturnType<typeof getFieldDefinitions>>,
  description: FlaggedText,
  title: FlaggedText,
  noteFor: NoteLookup,
): Promise<ReviewField[]> {
  const attrs = (row.attributes ?? {}) as Record<string, unknown>;
  const out: ReviewField[] = [
    {
      key: "title",
      label: "Title",
      value: (row.title as string) ?? "—",
      flagged: title.spans.length ? title : null,
      warn: title.spans.length > 0,
      note: noteFor("title"),
    },
    { key: "type", label: "Type", value: type?.label ?? ((row.type_code as string) ?? "—"), note: noteFor("type") },
    {
      key: "kind",
      label: "Looking to",
      value: row.kind === "rent" ? "Rent out" : "Sell",
      note: noteFor("kind"),
    },
  ];

  // Every stored answer, labelled and ordered by `field_definitions` — the same
  // call the public detail screen makes, so the reviewer reads exactly the list
  // the seller filled in (rule 7: nothing enumerated in this file).
  for (const r of attributeRows(attrs, type, defs, (row.kind as string) ?? "sell")) {
    out.push({ key: r.key, label: r.label, value: r.value, note: noteFor(r.key) });
  }

  // Price gets the design's "₹85,00,000  ✓ ₹85 Lakh" cross-check row: the exact
  // rupees next to the short form a buyer will actually see, so a misplaced zero
  // is visible without arithmetic.
  const paise = row.price_paise as number | null;
  const exact = paise == null ? null : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
  const short = paise == null ? null : formatShortRupees(paise);
  out.push({
    key: "price",
    label: "Price",
    value:
      row.price_on_request || exact == null
        ? "Price on request"
        // The short form is only worth showing when it differs — "₹23,404 ✓
        // ₹23,404" is noise, and the whole point of the row is the comparison.
        : short && short !== exact
          ? `${exact}  ✓ ${short}`
          : exact,
    note: noteFor("price"),
  });

  out.push({
    key: "description",
    label: "Description",
    value: description.text || "—",
    flagged: description.spans.length ? description : null,
    warn: description.spans.length > 0,
    note: noteFor("description"),
  });
  out.push({ key: "negotiable", label: "Negotiable", value: row.is_negotiable ? "Yes" : "No", note: noteFor("negotiable") });

  // Doc9 §17: the number itself is never handed to a screen that doesn't need
  // it. A reviewer needs to know WHETHER a number was published and that it is
  // shaped like one — not the digits.
  const contactNumber = (row.contact_number as string) ?? null;
  out.push({
    key: "contact",
    label: "Contact",
    value: row.contact_public
      ? contactNumber
        ? "Published by the poster"
        : "Marked public, no number saved"
      : "Number hidden",
    warn: !row.contact_public,
    note: noteFor("contact"),
  });
  if (contactNumber) {
    out.push({
      key: "display_number",
      label: "Display number",
      value: maskNumber(contactNumber),
      note: noteFor("display_number"),
    });
  }
  return out;
}

async function requirementFields(
  row: Record<string, unknown>,
  type: Awaited<ReturnType<typeof getPropertyType>>,
  defs: Awaited<ReturnType<typeof getFieldDefinitions>>,
  noteFor: NoteLookup,
): Promise<ReviewField[]> {
  const notes = await flagText(row.notes as string | null);

  // `urgency` is an option list like any other (migration 0102 put it in
  // field_definitions), so its label is resolved the same way as a listing's.
  const urgencyDef = defs.find((d) => d.key === "urgency");
  const urgencyCode = (row.urgency as string) ?? null;
  const urgency = urgencyCode
    ? (urgencyDef?.options?.find((o) => o.value === urgencyCode)?.label ?? urgencyCode)
    : "—";

  const min = row.budget_min_paise as number | null;
  const max = row.budget_max_paise as number | null;

  return [
    { key: "type", label: "Type", value: `${row.kind === "rent" ? "Rent" : "Buy"} · ${typeLabelOf(type, row)}`, note: noteFor("type") },
    {
      key: "budget",
      label: "Budget",
      // A5's budget word-check, the counterpart of A4's price row: the exact
      // rupees beside the words a broker will read, so a range typed one zero out
      // is visible without doing the arithmetic.
      value: budgetWordCheck(min, max),
      note: noteFor("budget"),
    },
    { key: "areas", label: "Preferred areas", value: (row.area_label as string) ?? "—", note: noteFor("areas") },
    { key: "bhk", label: "BHK", value: row.bhk ? String(row.bhk) : "Any", note: noteFor("bhk") },
    { key: "urgency", label: "Urgency", value: urgency, note: noteFor("urgency") },
    {
      key: "notes",
      label: "Notes",
      value: notes.text || "—",
      flagged: notes.spans.length ? notes : null,
      warn: notes.spans.length > 0,
      note: noteFor("notes"),
    },
  ];
}

function typeLabelOf(type: Awaited<ReturnType<typeof getPropertyType>>, row: Record<string, unknown>): string {
  return type?.label ?? ((row.type_code as string) ?? "—");
}

/** "₹40,00,000 – ₹85,00,000  ✓ ₹40 Lakh – ₹85 Lakh" (only when it differs). */
function budgetWordCheck(min: number | null, max: number | null): string {
  const words = budgetLabel(min, max);
  if (min == null && max == null) return words;
  const rupees = (p: number | null) => (p == null ? "—" : `₹${Math.round(p / 100).toLocaleString("en-IN")}`);
  const exact = `${rupees(min)} – ${rupees(max)}`;
  return exact === words ? words : `${exact}  ✓ ${words}`;
}

/** "+91 98XXX XXX21" — the design's masked display, built from the real number. */
function maskNumber(n: string): string {
  const digits = n.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return "Invalid number on file";
  return `+91 ${digits.slice(0, 2)}XXX XXX${digits.slice(8)}`;
}

// ------------------------------------------------------------------- previews

async function listingPreview(
  row: Record<string, unknown>,
  type: Awaited<ReturnType<typeof getPropertyType>>,
  defs: Awaited<ReturnType<typeof getFieldDefinitions>>,
  amenityLabels: Map<string, string>,
  description: FlaggedText,
  trail: string[],
): Promise<ReviewCardPreview> {
  const db = createServiceClient();
  // `status = ready` and ordered by `position` — the same predicate the feed
  // uses (lib/feed/service.photosFor), so the reviewer's carousel is the
  // carousel a buyer will swipe, not a superset including failed uploads.
  const { data: photoRows } = await db
    .from("listing_photos")
    .select("url, position, status")
    .eq("listing_id", row.id as string)
    .eq("status", "ready")
    .order("position", { ascending: true });

  const photos = ((photoRows ?? []) as Array<{ url: string | null }>)
    .map((p) => p.url)
    .filter((u): u is string => Boolean(u));
  const cover = (row.cover_url as string) ?? null;
  const all = photos.length ? photos : cover ? [cover] : [];

  const attrs = (row.attributes ?? {}) as Record<string, unknown>;
  const paise = row.price_paise as number | null;
  const sqft = row.area_sqft as number | null;
  const bhk = attrs.bhk == null || attrs.bhk === "" ? null : String(attrs.bhk);
  const perSqft = paise && sqft ? Math.round(paise / 100 / sqft) : null;

  const rows = attributeRows(attrs, type, defs, (row.kind as string) ?? "sell");
  const pick = (key: string) => rows.find((r) => r.key === key)?.value ?? null;

  // The design's 4-cell spec strip. Which four depends on what the type stored,
  // so the cells are filled from the same rendered rows rather than assuming a
  // flat's shape for a plot.
  const specs = [
    bhk ? { value: bhk, label: "BHK" } : null,
    pick("bathrooms") ? { value: pick("bathrooms")!, label: "Baths" } : null,
    sqft ? { value: sqft.toLocaleString("en-IN"), label: "Sq.ft" } : null,
    pick("facing") ? { value: pick("facing")!, label: "Facing" } : null,
  ].filter((v): v is { value: string; label: string } => Boolean(v));

  return {
    priceLabel: row.price_on_request || paise == null ? "Price on request" : formatShortRupees(paise),
    kindLabel: row.kind === "rent" ? "For Rent" : "For Sale",
    metaLine: [bhk ? `${bhk} BHK` : null, sqft ? `${sqft.toLocaleString("en-IN")} sqft` : null, perSqft ? `₹${perSqft.toLocaleString("en-IN")}/sqft` : null]
      .filter(Boolean)
      .join(" · "),
    areaLabel: (row.area_label as string) ?? null,
    fullLocation: trail.length ? trail.join(", ") : ((row.area_label as string) ?? null),
    photos: all,
    photoCount: (row.photo_count as number) ?? all.length,
    specs,
    amenities: labelAmenities((row.amenities as string[]) ?? [], amenityLabels),
    description,
    typeLine: [type?.label ?? (row.type_code as string), row.kind === "rent" ? "For Rent" : "For Sale", perSqft ? `₹${perSqft.toLocaleString("en-IN")}/sqft` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

async function requirementPreview(
  row: Record<string, unknown>,
  type: Awaited<ReturnType<typeof getPropertyType>>,
  trail: string[],
): Promise<ReviewCardPreview> {
  const notes = await flagText(row.notes as string | null);
  const label = typeLabelOf(type, row);
  return {
    priceLabel: budgetLabel(row.budget_min_paise as number, row.budget_max_paise as number),
    kindLabel: row.kind === "rent" ? "Rent" : "Buy",
    metaLine: [row.bhk ? `${row.bhk} BHK` : null, label].filter(Boolean).join(" · "),
    areaLabel: (row.area_label as string) ?? null,
    fullLocation: trail.length ? trail.join(", ") : ((row.area_label as string) ?? null),
    photos: [],
    photoCount: 0,
    specs: [],
    amenities: [],
    description: notes,
    typeLine: `${row.kind === "rent" ? "Rent" : "Buy"} · ${label}`,
  };
}

async function ownershipDoc(
  row: Record<string, unknown>,
  accountName: string,
  defs: Awaited<ReturnType<typeof getFieldDefinitions>>,
): Promise<ReviewDoc | null> {
  const key = (row.ownership_proof_key as string) ?? null;
  if (!key) return null;

  // `ownership_proof_type` stores the option CODE ("electricity_bill"). The label
  // lives in `field_definitions.options`, like every other option list — reading
  // it here is what stops the reviewer being shown a raw key.
  const typeCode = (row.ownership_proof_type as string) ?? null;
  const typeDef = defs.find((d) => d.key === "ownership_proof_type");
  const typeLabel = typeCode
    ? (typeDef?.options?.find((o) => o.value === typeCode)?.label ??
       typeCode.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))
    : null;

  const nameOnDoc = (row.ownership_proof_name as string) ?? null;
  // A signed, short-lived URL — the object stays private, and the link an admin
  // holds expires with the panel (Doc9 §17).
  const url = await signedReadUrl(key, 300);
  const submitted = (row.submitted_at as string) ?? null;

  return {
    typeLabel: typeLabel ?? "Ownership document",
    url,
    nameOnDoc,
    nameOnAccount: accountName,
    // No stored doc name means no claim: the badge is withheld rather than
    // reporting "no mismatch" about a comparison nobody made.
    mismatch: nameOnDoc ? nameOnDoc.trim().toLowerCase() !== accountName.trim().toLowerCase() : null,
    uploadedLabel: submitted ? ageLabel(submitted) : null,
  };
}

export { LISTING_TABS };
