import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { ageLabel } from "./risk";
import { actionOptions } from "./reviewConfig";

/**
 * A9 — Reports queue (Doc5 A9, Doc3 §1.6).
 *
 * Reports are GROUPED by what was reported, not listed one per row: three people
 * reporting the same listing is one decision, and the design's card says
 * "3 reports". Acting on the group closes every report in it and notifies every
 * reporter — which is the promise the card's footer makes.
 *
 * Priority is computed from `report_priority_rules` (migration 0107). The design
 * draws a red dot and offers a "High priority" chip; before that table the dot
 * was decoration and the chip filtered nothing.
 */

export type ReportFilter = "all" | "listings" | "users" | "messages" | "high";

export interface Reporter {
  id: string;
  name: string;
  initials: string;
  reason: string;
  note: string | null;
  atLabel: string;
}

export interface ReportGroup {
  /** Stable key for the group: subject type + id. */
  key: string;
  subjectType: string;
  subjectId: string;
  /** Every report id in this group — what an action closes. */
  reportIds: string[];
  count: number;
  /** The commonest reason, already labelled. */
  reason: string;
  /** All distinct reasons with their counts, for the badge row. */
  reasons: Array<{ reason: string; count: number }>;
  oldestLabel: string;
  hours: number;
  high: boolean;
  reporters: Reporter[];
  /** Who owns the reported thing — the target of Warn / Suspend. */
  owner: { id: string; name: string; initials: string; role: string | null } | null;
  entity: ListingEntity | UserEntity | MessageEntity | null;
}

export interface ListingEntity {
  kind: "listing" | "project" | "requirement";
  id: string;
  title: string;
  meta: string;
  coverUrl: string | null;
  /** Whether the review screen can open it (only a listing has one in P2). */
  reviewHref: string | null;
}

export interface UserEntity {
  kind: "user";
  id: string;
  name: string;
  initials: string;
  meta: string;
}

export interface MessageEntity {
  kind: "message";
  id: string;
  /** Read-only chat context: the reported message and the two around it. */
  messages: Array<{ id: string; senderName: string; body: string; reported: boolean; atLabel: string }>;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

let labelCache: { at: number; map: Map<string, string>; high: string[] } | null = null;
const TTL_MS = 60_000;

async function config() {
  if (labelCache && Date.now() - labelCache.at < TTL_MS) return labelCache;
  const db = createServiceClient();
  const [opts, { data: rules }] = await Promise.all([
    actionOptions("report_reason"),
    db.from("report_priority_rules").select("pattern").eq("priority", "high"),
  ]);
  labelCache = {
    at: Date.now(),
    map: new Map(opts.map((o) => [o.value.toLowerCase(), o.label])),
    high: ((rules ?? []) as Array<{ pattern: string }>).map((r) => r.pattern.toLowerCase()),
  };
  return labelCache;
}

/** A stored code or a stored sentence → one sentence (see migration 0107). */
function labelReason(raw: string, map: Map<string, string>): string {
  const hit = map.get(raw.trim().toLowerCase());
  if (hit) return hit;
  return raw.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function isHigh(reasons: string[], patterns: string[]): boolean {
  const hay = reasons.join(" ").toLowerCase();
  return patterns.some((p) => hay.includes(p));
}

/** The five chips' counts, derived from groups already read (rule 12 — all real). */
export function countsOf(groups: ReportGroup[]): Record<ReportFilter, number> {
  return {
    all: groups.length,
    listings: groups.filter((g) => g.subjectType === "listing").length,
    users: groups.filter((g) => g.subjectType === "user").length,
    messages: groups.filter((g) => g.subjectType === "message").length,
    high: groups.filter((g) => g.high).length,
  };
}

/**
 * The screen's whole payload in ONE read.
 *
 * The chips show counts for every filter, so the page needs the full set either
 * way — and calling a counts function that itself re-read and re-grouped
 * everything meant A9 did the expensive work twice per render. Read once, count,
 * then filter in memory.
 */
export async function reportsScreen(
  filter: ReportFilter,
): Promise<{ groups: ReportGroup[]; counts: Record<ReportFilter, number> }> {
  const all = await reportGroups("all");
  const counts = countsOf(all);

  const groups =
    filter === "all" ? all
    : filter === "high" ? all.filter((g) => g.high)
    : filter === "listings" ? all.filter((g) => g.subjectType === "listing")
    : filter === "users" ? all.filter((g) => g.subjectType === "user")
    : all.filter((g) => g.subjectType === "message");

  return { groups, counts };
}

export async function reportGroups(filter: ReportFilter, limit = 200): Promise<ReportGroup[]> {
  const db = createServiceClient();
  const cfg = await config();

  let q = db
    .from("reports")
    .select("id, reporter_id, subject_type, subject_id, reason, note, status, created_at")
    .in("status", ["open", "reviewing"]);

  // The chips filter by what was reported. `project` and `requirement` reports
  // have no chip of their own in the design, so they appear under All — they are
  // never dropped.
  if (filter === "listings") q = q.eq("subject_type", "listing");
  if (filter === "users") q = q.eq("subject_type", "user");
  if (filter === "messages") q = q.eq("subject_type", "message");

  const { data } = await q.order("created_at", { ascending: true }).limit(limit);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  // ---- group ---------------------------------------------------------------
  const byKey = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const key = `${r.subject_type}:${r.subject_id}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  // ---- reporter names in one query ----------------------------------------
  const reporterIds = [...new Set(rows.map((r) => r.reporter_id as string).filter(Boolean))];
  const { data: reporters } = reporterIds.length
    ? await db.from("profiles").select("id, name").in("id", reporterIds)
    : { data: [] as Array<Record<string, unknown>> };
  const names = new Map(((reporters ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, (p.name as string) || "Unnamed"]));

  /**
   * Each group needs the reported entity and its owner — several reads apiece.
   * Done in a serial loop that was ~46 groups × 3-5 sequential round-trips and A9
   * took 23 seconds to paint. The groups are independent, so they resolve
   * together (Doc3 §5's N+1 rule).
   */
  const out: ReportGroup[] = await Promise.all([...byKey.entries()].map(async ([key, group]): Promise<ReportGroup> => {
    const first = group[0];
    const subjectType = first.subject_type as string;
    const subjectId = first.subject_id as string;

    const labelled = group.map((r) => labelReason((r.reason as string) ?? "other", cfg.map));
    const byReason = new Map<string, number>();
    for (const l of labelled) byReason.set(l, (byReason.get(l) ?? 0) + 1);
    const reasons = [...byReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    const oldest = group.reduce((a, b) => ((a.created_at as string) < (b.created_at as string) ? a : b));
    const oldestAt = oldest.created_at as string;
    const [entity, owner] = await Promise.all([
      entityFor(db, subjectType, subjectId),
      ownerFor(db, subjectType, subjectId),
    ]);

    return {
      key,
      subjectType,
      subjectId,
      reportIds: group.map((r) => r.id as string),
      count: group.length,
      reason: reasons[0]?.reason ?? "Reported",
      reasons,
      oldestLabel: ageLabel(oldestAt) ?? "—",
      hours: Math.floor((Date.now() - new Date(oldestAt).getTime()) / 3_600_000),
      high: isHigh(
        group.map((r) => (r.reason as string) ?? ""),
        cfg.high,
      ),
      reporters: group.map((r) => {
        const name = names.get(r.reporter_id as string) ?? "Unnamed";
        return {
          id: r.reporter_id as string,
          name,
          initials: initialsOf(name),
          reason: labelReason((r.reason as string) ?? "other", cfg.map),
          note: (r.note as string) ?? null,
          atLabel: ageLabel(r.created_at as string) ?? "—",
        };
      }),
      owner,
      entity,
    };
  }));

  if (filter === "high") return out.filter((g) => g.high);

  // High priority first, then most-reported, then oldest: the order an admin
  // should work through them in.
  return out.sort((a, b) => Number(b.high) - Number(a.high) || b.count - a.count || b.hours - a.hours);
}

type Db = ReturnType<typeof createServiceClient>;

const ITEM_TABLE: Record<string, string> = { listing: "listings", project: "projects", requirement: "requirements" };

/** Who is answerable for the reported thing — Warn and Suspend act on them. */
async function ownerFor(db: Db, subjectType: string, subjectId: string) {
  let profileId: string | null = null;

  if (subjectType === "user") profileId = subjectId;
  else if (subjectType === "message") {
    const { data } = await db.from("chat_messages").select("sender_id").eq("id", subjectId).maybeSingle();
    profileId = ((data ?? {}) as Record<string, unknown>).sender_id as string | null;
  } else {
    const table = ITEM_TABLE[subjectType];
    if (table) {
      const { data } = await db.from(table).select("profile_id").eq("id", subjectId).maybeSingle();
      profileId = ((data ?? {}) as Record<string, unknown>).profile_id as string | null;
    }
  }
  if (!profileId) return null;

  const { data: p } = await db.from("profiles").select("id, name, role").eq("id", profileId).maybeSingle();
  if (!p) return null;
  const row = p as Record<string, unknown>;
  const name = (row.name as string) || "Unnamed";
  const role = (row.role as string) ?? null;
  return {
    id: row.id as string,
    name,
    initials: initialsOf(name),
    role: role ? role.charAt(0).toUpperCase() + role.slice(1) : null,
  };
}

async function entityFor(db: Db, subjectType: string, subjectId: string) {
  if (subjectType === "user") {
    const [{ data: p }, listings, priors] = await Promise.all([
      db.from("profiles").select("id, name, role").eq("id", subjectId).maybeSingle(),
      db.from("listings").select("id", { count: "exact", head: true }).eq("profile_id", subjectId).is("deleted_at", null),
      db
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("subject_type", "user")
        .eq("subject_id", subjectId)
        .in("status", ["actioned", "dismissed"]),
    ]);
    if (!p) return null;
    const row = p as Record<string, unknown>;
    const name = (row.name as string) || "Unnamed";
    const priorCount = priors.count ?? 0;
    return {
      kind: "user" as const,
      id: subjectId,
      name,
      initials: initialsOf(name),
      meta: `${listings.count ?? 0} listing${(listings.count ?? 0) === 1 ? "" : "s"} · ${priorCount} prior report${priorCount === 1 ? "" : "s"}`,
    };
  }

  if (subjectType === "message") {
    /**
     * Read-only chat context, and ONLY around a reported message (Doc3 §1.6: an
     * admin may read the context of a reported message, and sending is disabled
     * everywhere). Two messages either side is what the design shows — enough to
     * judge, not the whole conversation.
     */
    const { data: msg } = await db
      .from("chat_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("id", subjectId)
      .maybeSingle();
    if (!msg) return null;
    const m = msg as Record<string, unknown>;

    const { data: around } = await db
      .from("chat_messages")
      .select("id, sender_id, body, kind, photo_url, created_at")
      .eq("thread_id", m.thread_id as string)
      .order("created_at", { ascending: true });

    const all = (around ?? []) as Array<Record<string, unknown>>;
    const idx = all.findIndex((x) => x.id === subjectId);
    const slice = idx >= 0 ? all.slice(Math.max(0, idx - 2), idx + 2) : [m];

    const senderIds = [...new Set(slice.map((x) => x.sender_id as string).filter(Boolean))];
    const { data: people } = senderIds.length
      ? await db.from("profiles").select("id, name").in("id", senderIds)
      : { data: [] as Array<Record<string, unknown>> };
    const who = new Map(((people ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, (p.name as string) || "Unnamed"]));

    return {
      kind: "message" as const,
      id: subjectId,
      messages: slice.map((x) => ({
        id: x.id as string,
        // A system line ("X shared their number") has no sender, and calling that
        // "Unnamed" reads as a person who forgot to fill in their profile.
        senderName: x.sender_id ? (who.get(x.sender_id as string) ?? "Unnamed") : "System",
        // A photo message has no body; the reviewer needs to know there IS
        // something there rather than reading it as an empty message.
        body: ((x.body as string) ?? "").trim() || (x.photo_url ? "(photo)" : `(${(x.kind as string) ?? "no text"})`),
        reported: x.id === subjectId,
        atLabel: ageLabel(x.created_at as string) ?? "—",
      })),
    };
  }

  const table = ITEM_TABLE[subjectType];
  if (!table) return null;

  const { data: item } = await db
    .from(table)
    .select(table === "listings" ? "id, title, cover_url, status, area_label" : table === "projects" ? "id, name, cover_url, status, area_label" : "id, area_label, status")
    .eq("id", subjectId)
    .maybeSingle();
  if (!item) return null;
  const it = item as Record<string, unknown>;

  return {
    kind: subjectType as "listing" | "project" | "requirement",
    id: subjectId,
    title: ((it.title as string) || (it.name as string) || (it.area_label as string) || "Untitled") as string,
    meta: `#${subjectId.slice(0, 8)} · ${(it.status as string) ?? "—"}${it.area_label ? ` · ${it.area_label}` : ""}`,
    coverUrl: (it.cover_url as string) ?? null,
    // A4 exists for listings in this part; projects and requirements get theirs
    // in later parts, so the link is withheld rather than pointing at a 404.
    reviewHref: subjectType === "listing" ? `/queues/listings/${subjectId}` : null,
  };
}
