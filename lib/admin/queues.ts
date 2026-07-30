import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { ageLabel, reportCounts, scoreRisk, type Risk } from "./risk";
import { locksFor, type Lock } from "./locks";
import type { CurrentStaff } from "./auth";

/**
 * A3/A5's queue reader (Doc5 A3, Doc3 §1.4).
 *
 * One module for every review queue so a tile on A2, a sidebar badge and the
 * queue itself can never disagree about what "pending" means — they all come
 * through here.
 *
 * Sorting is Doc3 §1.4's rule and not negotiable: risk descending, then oldest
 * first. The riskiest thing waiting longest is what an admin should open next.
 */

export type QueueSubject = "listing" | "requirement";

/** A3's sub-tabs, in the design's order, with the status each one means. */
export interface QueueTab {
  key: string;
  label: string;
  /** P13 draws a coloured dot on two of them. */
  dot: "warning" | "info" | null;
}

export const LISTING_TABS: QueueTab[] = [
  { key: "pending", label: "Pending", dot: null },
  { key: "updated", label: "Updated after edit", dot: "warning" },
  { key: "changes", label: "Changes requested", dot: null },
  { key: "payment", label: "Payment pending", dot: "info" },
  { key: "rejected", label: "Rejected", dot: null },
];

const TABLE: Record<QueueSubject, string> = { listing: "listings", requirement: "requirements" };

/**
 * "Pending" and "Updated after edit" are both status=pending_review; the flag is
 * what separates a first submission from a re-review after the seller edited a
 * live listing. Without the split, A3's two tabs would show the same rows — and
 * A2's Listings tile uses the same predicate as the Pending tab, so a tile can
 * never deep-link to a queue showing a different number.
 *
 * Generic over the builder rather than `any`: Supabase re-types itself on every
 * .eq(), and this shape is all the function needs.
 */
function applyTab<T extends { eq: (c: string, v: unknown) => T }>(q: T, tab: string): T {
  switch (tab) {
    case "updated":
      return q.eq("status", "pending_review").eq("edited_since_approval", true);
    case "changes":
      return q.eq("status", "changes_requested");
    case "payment":
      return q.eq("status", "payment_pending");
    case "rejected":
      return q.eq("status", "rejected");
    default:
      return q.eq("status", "pending_review").eq("edited_since_approval", false);
  }
}

export interface QueueFilters {
  type?: string | null;
  cityId?: string | null;
  risk?: "low" | "medium" | "high" | null;
  role?: string | null;
  /** ISO date — items submitted on or after. */
  since?: string | null;
}

export interface QueueRow {
  id: string;
  title: string;
  subtitle: string | null;
  typeLabel: string | null;
  location: string | null;
  coverUrl: string | null;
  poster: { id: string; name: string; initials: string; role: string | null; isNew: boolean };
  risk: Risk;
  /** Hours waiting, and the SLA band P13 colours by. */
  hours: number;
  sla: "ok" | "warn" | "over";
  ageText: string;
  status: string;
  statusLabel: string;
  lock: Lock | null;
}

export interface QueuePage {
  rows: QueueRow[];
  counts: Record<string, number>;
  total: number;
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

function slaOf(hours: number): QueueRow["sla"] {
  if (hours > 24) return "over";
  if (hours >= 12) return "warn";
  return "ok";
}

/** "26h" under two days, then "3d" — the design's In-queue column. */
function ageText(hours: number): string {
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Counts for every sub-tab in one pass, so the tab strip is never a guess. */
export async function tabCounts(subject: QueueSubject): Promise<Record<string, number>> {
  const db = createServiceClient();
  const out: Record<string, number> = {};
  const tabs = subject === "listing" ? LISTING_TABS : LISTING_TABS.filter((t) => t.key !== "payment");

  await Promise.all(
    tabs.map(async (t) => {
      const q = applyTab(db.from(TABLE[subject]).select("id", { count: "exact", head: true }), t.key);
      const { count } = await q;
      out[t.key] = count ?? 0;
    }),
  );
  return out;
}

export async function queuePage(
  subject: QueueSubject,
  opts: { tab: string; filters: QueueFilters; staff: CurrentStaff; limit?: number },
): Promise<QueuePage> {
  const db = createServiceClient();
  const limit = opts.limit ?? 50;
  const table = TABLE[subject];

  const columns =
    subject === "listing"
      ? "id, title, type_code, kind, status, area_label, cover_url, submitted_at, created_at, reject_count, flagged_reason, profile_id, city_id"
      : "id, type_code, kind, status, area_label, budget_min_paise, budget_max_paise, submitted_at, created_at, reject_count, flagged_reason, profile_id, city_id";

  let q = applyTab(db.from(table).select(columns), opts.tab);
  if (opts.filters.type) q = q.eq("type_code", opts.filters.type);
  if (opts.filters.cityId) q = q.eq("city_id", opts.filters.cityId);
  if (opts.filters.since) q = q.gte("submitted_at", opts.filters.since);

  /**
   * Risk and role cannot be a WHERE clause: risk is scored from four tables and
   * role lives on the poster, so both can only be applied AFTER this query.
   *
   * That is why the fetch has to widen when either is set. With the flat 50-row
   * cap, "Risk: medium" searched only the oldest 50 of 69 pending listings and
   * showed 3 of the 4 that actually match — a filter quietly under-reporting,
   * which is worse than one that fails. When a computed filter is on we read the
   * whole reviewable set (capped for safety), score it, filter, and only then
   * take `limit`.
   */
  const computedFilter = Boolean(opts.filters.risk || opts.filters.role);
  const SCAN_CAP = 500;

  const { data } = await q
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(computedFilter ? SCAN_CAP : limit);
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  const ids = rows.map((r) => r.id as string);
  const posterIds = [...new Set(rows.map((r) => r.profile_id as string).filter(Boolean))];

  const [profiles, reports, locks] = await Promise.all([
    posterIds.length
      ? db.from("profiles").select("id, name, role, created_at").in("id", posterIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    reportCounts(subject, ids),
    locksFor(subject, ids, opts.staff.id),
  ]);

  const byId = new Map(
    ((profiles.data ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]),
  );

  const NEW_MS = 7 * 86_400_000;
  const out: QueueRow[] = rows.map((r) => {
    const p = byId.get(r.profile_id as string);
    const posterCreatedAt = (p?.created_at as string) ?? null;
    const stamp = (r.submitted_at as string) ?? (r.created_at as string);
    const hours = stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 3_600_000) : 0;

    const risk = scoreRisk({
      posterCreatedAt,
      rejectCount: (r.reject_count as number) ?? 0,
      flaggedReason: (r.flagged_reason as string) ?? null,
      reportCount: reports.get(r.id as string) ?? 0,
      posterAgeLabel: ageLabel(posterCreatedAt),
    });

    const name = (p?.name as string) || "Unnamed";
    const status = r.status as string;

    return {
      id: r.id as string,
      title:
        subject === "listing"
          ? ((r.title as string) ?? "Untitled listing")
          : budgetLabel(r.budget_min_paise as number, r.budget_max_paise as number),
      subtitle: subject === "requirement" ? ((r.area_label as string) ?? null) : null,
      typeLabel: typeLabel(r.type_code as string, r.kind as string),
      location: (r.area_label as string) ?? null,
      coverUrl: (r.cover_url as string) ?? null,
      poster: {
        id: (r.profile_id as string) ?? "",
        name,
        initials: initialsOf(name),
        role: (p?.role as string) ?? null,
        isNew: posterCreatedAt ? Date.now() - new Date(posterCreatedAt).getTime() <= NEW_MS : false,
      },
      risk,
      hours,
      sla: slaOf(hours),
      ageText: ageText(hours),
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      lock: locks.get(r.id as string) ?? null,
    };
  });

  // Doc3 §1.4: risk desc, then oldest first.
  out.sort((a, b) => b.risk.score - a.risk.score || b.hours - a.hours);

  // The two computed filters, applied here because neither could be a WHERE.
  // `total` is the count AFTER filtering and BEFORE the page cut, so the screen can
  // say how many actually match rather than how many it happened to draw.
  let filtered = out;
  if (opts.filters.risk) filtered = filtered.filter((r) => r.risk.band === opts.filters.risk);
  if (opts.filters.role) {
    const want = opts.filters.role.toLowerCase();
    filtered = filtered.filter((r) => (r.poster.role ?? "").toLowerCase() === want);
  }
  const total = filtered.length;

  return { rows: filtered.slice(0, limit), counts: await tabCounts(subject), total };
}

function typeLabel(typeCode: string | null, kind: string | null): string | null {
  if (!typeCode) return null;
  const type = typeCode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // `listing_kind` is stored as 'sell' | 'rent'. This tested for 'sale', which
  // no row has ever held, so every sale row fell through and the queue printed
  // the raw enum: "Flat / sell".
  const intent = kind === "rent" ? "Rent" : kind === "sell" ? "Sale" : kind;
  return intent ? `${type} / ${intent}` : type;
}

/** "₹40 Lakh – ₹60 Lakh" — the word-check wording A5 shows. */
export function budgetLabel(minPaise: number | null, maxPaise: number | null): string {
  const w = (paise: number | null) => {
    if (paise == null) return "—";
    const rupees = paise / 100;
    if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(rupees % 1_00_00_000 ? 1 : 0)} Cr`;
    if (rupees >= 1_00_000) return `₹${Math.round(rupees / 1_00_000)} Lakh`;
    if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}k`;
    return `₹${rupees}`;
  };
  if (minPaise == null && maxPaise == null) return "Budget not set";
  return `${w(minPaise)} – ${w(maxPaise)}`;
}
