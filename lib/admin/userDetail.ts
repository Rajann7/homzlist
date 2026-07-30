import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A11's Overview reader (Doc5 A11 / designs P14's user panel).
 *
 * Everything the header and the Overview tab show is a real row: the profile
 * itself, the verification levels actually approved, the suspension actually in
 * force, and the counts the tabs will drill into. Nothing is derived in the
 * browser, and the phone number is only here because the caller already passed
 * `users.edit` — A10's list and this panel read through the same guard.
 */

export interface UserDetail {
  id: string;
  name: string;
  initials: string;
  handle: string;
  phone: string;
  email: string | null;
  role: string | null;
  roleLabel: string;
  city: string;
  bio: string | null;
  status: string;
  statusLabel: string;
  joinedLabel: string;
  lastActiveLabel: string;
  verified: { id: boolean; rera: boolean };
  /** In force right now, if any — the header's red banner. */
  suspension: { reason: string; days: number | null; sinceLabel: string } | null;
  counts: {
    listings: number;
    requirements: number;
    leads: number;
    payments: number;
    plans: number;
    reports: number;
    notes: number;
  };
  plans: Array<{ id: string; name: string; isTrial: boolean; startsLabel: string; expiresLabel: string; status: string }>;
  notes: Array<{ id: string; body: string; author: string; atLabel: string }>;
  listings: Array<{ id: string; title: string; statusLabel: string; priceLabel: string; postedLabel: string; reviewHref: string | null }>;
  payments: Array<{ id: string; ref: string; amountLabel: string; method: string; statusLabel: string; atLabel: string }>;
  leads: Array<{ id: string; who: string; about: string; stage: string; atLabel: string }>;
  /** A11's read-only chat list. Bodies are NOT loaded here — see `threadMessages`. */
  chats: Array<{ id: string; withWhom: string; about: string; preview: string; atLabel: string; messages: number }>;
  comms: Array<{ id: string; channel: string; subject: string; body: string; sentBy: string; atLabel: string; delivered: boolean }>;
  timeline: Array<{ id: string; atLabel: string; text: string; by: string }>;
  /** Device/IP bans in force against this account. */
  bans: Array<{ id: string; kind: string; reason: string; atLabel: string }>;
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", broker: "Broker", builder: "Builder" };
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
  deleted: "Deleted",
  archived: "Archived",
};

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export async function userDetail(id: string): Promise<UserDetail | null> {
  const db = createServiceClient();

  const { data: p } = await db
    .from("profiles")
    .select("id, name, username, phone, email, role, city_id, bio, state, created_at, last_active_at")
    .eq("id", id)
    .maybeSingle();

  if (!p) return null;
  const row = p as Record<string, unknown>;

  const [
    city,
    verifs,
    suspension,
    listings,
    requirements,
    leads,
    payments,
    plans,
    reports,
    notes,
    listingRows,
    paymentRows,
    leadRows,
    threadRows,
    commRows,
    auditRows,
    banRows,
  ] = await Promise.all([
    row.city_id ? db.from("locations").select("name").eq("id", row.city_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("verifications").select("level").eq("profile_id", id).eq("status", "approved"),
    db.from("account_suspensions").select("reason, days, created_at").eq("profile_id", id).is("lifted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("listings").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("requirements").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", id),
    db.from("payments").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("user_plans").select("id, name, is_trial, starts_at, expires_at, status").eq("profile_id", id).order("purchased_at", { ascending: false }),
    db.from("reports").select("id", { count: "exact", head: true }).eq("subject_type", "user").eq("subject_id", id),
    db.from("admin_notes").select("id, body, author_name, created_at").eq("subject_type", "user").eq("subject_id", id).order("created_at", { ascending: false }),
    db.from("listings").select("id, title, status, price_paise, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("payments").select("id, razorpay_payment_id, amount_paise, method, status, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("leads").select("id, lead_profile_id, listing_id, requirement_id, stage, created_at").eq("owner_id", id).order("created_at", { ascending: false }).limit(50),
    db
      .from("chat_threads")
      .select("id, kind, buyer_id, poster_id, listing_id, requirement_id, last_message_preview, last_message_at")
      .or(`buyer_id.eq.${id},poster_id.eq.${id}`)
      .order("last_message_at", { ascending: false })
      .limit(30),
    db.from("admin_messages").select("id, channel, subject, body, sent_by_name, delivered_at, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("admin_audit_log").select("id, action, summary, actor_name, created_at").eq("entity_type", "user").eq("entity_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("device_bans").select("id, kind, reason, created_at").eq("profile_id", id).is("lifted_at", null).order("created_at", { ascending: false }),
  ]);

  // ---- second pass: the names and titles the rows above only hold ids for --
  const threads = (threadRows.data ?? []) as Array<Record<string, unknown>>;
  const leadsList = (leadRows.data ?? []) as Array<Record<string, unknown>>;

  const otherIds = [
    ...new Set([
      ...threads.map((t) => (t.buyer_id === id ? (t.poster_id as string) : (t.buyer_id as string))),
      ...leadsList.map((l) => l.lead_profile_id as string | null),
    ].filter(Boolean) as string[]),
  ];
  const subjectListingIds = [
    ...new Set(
      [...threads.map((t) => t.listing_id as string | null), ...leadsList.map((l) => l.listing_id as string | null)].filter(
        Boolean,
      ) as string[],
    ),
  ];

  const [others, subjectTitles, msgCounts] = await Promise.all([
    otherIds.length ? db.from("profiles").select("id, name").in("id", otherIds) : Promise.resolve({ data: [] }),
    subjectListingIds.length ? db.from("listings").select("id, title").in("id", subjectListingIds) : Promise.resolve({ data: [] }),
    threads.length ? db.from("chat_messages").select("thread_id").in("thread_id", threads.map((t) => t.id as string)) : Promise.resolve({ data: [] }),
  ]);

  const nameOf = new Map(((others.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name || "Unnamed"]));
  const titleOf = new Map(((subjectTitles.data ?? []) as Array<{ id: string; title: string }>).map((l) => [l.id, l.title]));
  const msgCountOf = new Map<string, number>();
  for (const m of (msgCounts.data ?? []) as Array<{ thread_id: string }>) {
    msgCountOf.set(m.thread_id, (msgCountOf.get(m.thread_id) ?? 0) + 1);
  }

  const money = (paise: number | null) =>
    paise == null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

  const LISTING_STATUS: Record<string, string> = {
    live: "Live",
    pending_review: "Pending",
    payment_pending: "Payment pending",
    changes_requested: "Changes Requested",
    rejected: "Rejected",
    hidden: "Hidden",
    sold: "Sold",
    rented: "Rented",
    expired: "Expired",
    archived: "Archived",
  };

  const levels = (verifs.data ?? []) as Array<{ level: string }>;
  const sus = suspension.data as { reason: string | null; days: number | null; created_at: string } | null;
  const name = (row.name as string) || "Unnamed";
  const state = (row.state as string) ?? "active";

  return {
    id,
    name,
    initials: initialsOf(name),
    handle: row.username ? `@${row.username as string}` : "—",
    phone: (row.phone as string) ?? "—",
    email: (row.email as string) ?? null,
    role: (row.role as string) ?? null,
    roleLabel: ROLE_LABEL[(row.role as string) ?? ""] ?? "No role",
    city: ((city.data as { name?: string } | null)?.name as string) ?? "—",
    bio: (row.bio as string) ?? null,
    status: state,
    statusLabel: STATUS_LABEL[state] ?? state,
    joinedLabel: day(row.created_at as string),
    lastActiveLabel: stamp((row.last_active_at as string) ?? null),
    verified: { id: levels.some((v) => v.level !== "rera"), rera: levels.some((v) => v.level === "rera") },
    suspension: sus ? { reason: sus.reason ?? "No reason recorded", days: sus.days, sinceLabel: day(sus.created_at) } : null,
    counts: {
      listings: listings.count ?? 0,
      requirements: requirements.count ?? 0,
      leads: leads.count ?? 0,
      payments: payments.count ?? 0,
      plans: (plans.data ?? []).length,
      reports: reports.count ?? 0,
      notes: (notes.data ?? []).length,
    },
    plans: ((plans.data ?? []) as Array<Record<string, unknown>>).map((pl) => ({
      id: pl.id as string,
      name: (pl.name as string) ?? "Plan",
      isTrial: Boolean(pl.is_trial),
      startsLabel: day(pl.starts_at as string),
      expiresLabel: day(pl.expires_at as string),
      status: (pl.status as string) ?? "—",
    })),
    notes: ((notes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
      id: n.id as string,
      body: n.body as string,
      author: (n.author_name as string) ?? "An admin",
      atLabel: stamp(n.created_at as string),
    })),
    listings: ((listingRows.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: l.id as string,
      title: (l.title as string) ?? "Untitled",
      statusLabel: LISTING_STATUS[(l.status as string) ?? ""] ?? ((l.status as string) ?? "—"),
      priceLabel: money(l.price_paise as number | null),
      postedLabel: day(l.created_at as string),
      // Only a listing that is actually in a review queue has an A4 to open.
      reviewHref: ["pending_review", "changes_requested", "payment_pending", "rejected"].includes((l.status as string) ?? "")
        ? `/queues/listings/${l.id as string}`
        : null,
    })),
    payments: ((paymentRows.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      ref: (p.razorpay_payment_id as string) ?? (p.id as string).slice(0, 8),
      amountLabel: money(p.amount_paise as number | null),
      method: ((p.method as string) ?? "—").toUpperCase(),
      statusLabel: ((p.status as string) ?? "—").replace(/^./, (c) => c.toUpperCase()),
      atLabel: day(p.created_at as string),
    })),
    leads: leadsList.map((l) => ({
      id: l.id as string,
      who: nameOf.get(l.lead_profile_id as string) ?? "Someone",
      about: l.listing_id
        ? (titleOf.get(l.listing_id as string) ?? "a listing")
        : l.requirement_id
          ? "a requirement"
          : "—",
      stage: ((l.stage as string) ?? "new").replace(/^./, (c) => c.toUpperCase()),
      atLabel: day(l.created_at as string),
    })),
    chats: threads.map((t) => ({
      id: t.id as string,
      withWhom: nameOf.get((t.buyer_id === id ? t.poster_id : t.buyer_id) as string) ?? "Someone",
      about: t.listing_id ? (titleOf.get(t.listing_id as string) ?? "a listing") : t.requirement_id ? "a requirement" : ((t.kind as string) ?? "—"),
      preview: (t.last_message_preview as string) ?? "No messages yet",
      atLabel: stamp((t.last_message_at as string) ?? null),
      messages: msgCountOf.get(t.id as string) ?? 0,
    })),
    comms: ((commRows.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      channel: ((c.channel as string) ?? "in-app").toUpperCase(),
      subject: (c.subject as string) ?? "—",
      body: (c.body as string) ?? "",
      sentBy: (c.sent_by_name as string) ?? "An admin",
      atLabel: stamp(c.created_at as string),
      delivered: Boolean(c.delivered_at),
    })),
    timeline: ((auditRows.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: a.id as string,
      atLabel: stamp(a.created_at as string),
      text: (a.summary as string) ?? (a.action as string),
      by: (a.actor_name as string) ?? "An admin",
    })),
    bans: ((banRows.data ?? []) as Array<Record<string, unknown>>).map((b) => ({
      id: b.id as string,
      kind: ((b.kind as string) ?? "device").toUpperCase(),
      reason: (b.reason as string) ?? "No reason recorded",
      atLabel: day(b.created_at as string),
    })),
  };
}
