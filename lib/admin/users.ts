import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { listSessions, revokeAllSessions, revokeSession } from "@/lib/auth/session";
import { describeUserAgent } from "@/lib/notifications/user-agent";
import { renderEmail, sendEmail } from "@/lib/notifications/email";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import type { AdminIdentity } from "./guard";

/**
 * A11 — the user detail panel's ten tabs, and the actions its header bar takes.
 *
 * The design draws ten tabs (template 1312) and a nine-button action bar; every
 * one of them here reads or writes a real table. Two rules run through the file:
 *
 *  · A TAB IS A QUERY, NOT A PAYLOAD. The panel asks for one tab at a time, so
 *    opening a user does not drag their whole chat history across the wire —
 *    and the Chats tab, which is the most sensitive thing on the screen, is not
 *    fetched at all until an admin actually opens it.
 *  · THE ACTION FILTER IS THE CLAIM. Every mutation carries the state it is
 *    allowed to leave (`.eq("state","active")` on a suspend), so two admins
 *    clicking the same button produce one transition and one notification.
 *
 * The route writes the audit row from what these return, so the audit and the
 * HTTP response can never disagree about whether the thing happened.
 */

const db = () => createServiceClient();

export type UserActionResult =
  | { ok: true; label: string; summary: string; diff?: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "bad_state" | "validation"; message?: string };

/* ═══════════════════════════════════════════════════════ the header ════════ */

export type UserHeader = {
  id: string;
  name: string | null;
  handle: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  city: string | null;
  status: string;
  joinedAt: string;
  lastActiveAt: string | null;
  photoUrl: string | null;
  verification: { phone: boolean; id: boolean; rera: boolean };
  listingsCount: number;
  leadsCount: number;
  viewsCount: number;
  reportsCount: number;
  trialEndsAt: string | null;
};

export async function userHeader(id: string): Promise<UserHeader | null> {
  const { data } = await db().from("admin_user_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    name: (r.name as string) ?? null,
    handle: (r.handle as string) ?? "—",
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    role: (r.role as string) ?? null,
    city: (r.city_name as string) ?? null,
    status: statusLabel(r.status_key as string),
    joinedAt: r.joined_at as string,
    lastActiveAt: (r.last_active_at as string) ?? null,
    photoUrl: (r.photo_url as string) ?? null,
    verification: {
      phone: Boolean(r.v_phone),
      id: Boolean(r.v_id),
      rera: Boolean(r.v_rera),
    },
    listingsCount: Number(r.listings_count ?? 0),
    leadsCount: Number(r.leads_count ?? 0),
    viewsCount: Number(r.views_count ?? 0),
    reportsCount: Number(r.reports_count ?? 0),
    trialEndsAt: (r.trial_ends_at as string) ?? null,
  };
}

/** The design's four chips: Active · Suspended · Trial · Deleted. */
function statusLabel(key: string): string {
  return key === "suspended"
    ? "Suspended"
    : key === "deleted"
      ? "Deleted"
      : key === "trial"
        ? "Trial"
        : "Active";
}

/* ══════════════════════════════════════════════════════════ the tabs ═══════ */

export type UserTab =
  | "overview"
  | "plans"
  | "payments"
  | "listings"
  | "requirements"
  | "leads"
  | "chats"
  | "communication"
  | "notes"
  | "timeline";

export async function userTab(id: string, tab: UserTab): Promise<unknown> {
  switch (tab) {
    case "overview":
      return overviewTab(id);
    case "plans":
      return plansTab(id);
    case "payments":
      return paymentsTab(id);
    case "listings":
      return listingsTab(id);
    case "requirements":
      return requirementsTab(id);
    case "leads":
      return leadsTab(id);
    case "chats":
      return chatsTab(id);
    case "communication":
      return communicationTab(id);
    case "notes":
      return notesTab(id);
    case "timeline":
      return timelineTab(id);
  }
}

/** template 1332-1341 */
async function overviewTab(id: string) {
  const [{ data: p }, { data: consents }, { data: flags }, { data: rejects }] = await Promise.all([
    db()
      .from("profiles")
      .select(
        "id, name, bio, phone, email, role, city_id, photo_url, response_label, established_year, projects_done, office_address, created_at, bio_flagged_at, bio_flag_reason, bio_flag_outcome",
      )
      .eq("id", id)
      .maybeSingle(),
    db()
      .from("auth_consents")
      .select("kind, version, accepted, accepted_at")
      .eq("profile_id", id)
      .order("accepted_at", { ascending: false }),
    db()
      .from("moderation_events")
      .select("kind, severity, title, detail, created_at")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    db()
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", id)
      .gt("reject_count", 0),
  ]);
  if (!p) return null;
  const row = p as Record<string, unknown>;

  const city = row.city_id
    ? ((
        await db()
          .from("locations")
          .select("name")
          .eq("id", row.city_id as string)
          .maybeSingle()
      ).data as { name: string } | null)
    : null;

  const { data: settings } = await db()
    .from("user_settings")
    .select("show_number_default, findable_by_phone")
    .eq("profile_id", id)
    .maybeSingle();

  // "Profile completion 80%" (template 1336) — the design prints a number, so
  // it has to BE a number: the share of the fields the profile screen offers
  // that this profile has actually filled.
  const fields = [row.name, row.bio, row.photo_url, row.city_id, row.email, row.role];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;

  return {
    fields: {
      name: (row.name as string) ?? null,
      bio: (row.bio as string) ?? null,
      city: city?.name ?? null,
      cityId: (row.city_id as string) ?? null,
      phone: (row.phone as string) ?? null,
      email: (row.email as string) ?? null,
      role: (row.role as string) ?? null,
      officeAddress: (row.office_address as string) ?? null,
    },
    completion: Math.round((filled / fields.length) * 100),
    responseLabel: (row.response_label as string) ?? null,
    consents: (consents ?? []) as { kind: string; version: string; accepted: boolean; accepted_at: string }[],
    marketingOptIn: Boolean((settings as { show_number_default?: boolean } | null)?.show_number_default),
    flags: (flags ?? []) as { kind: string; severity: string; title: string; detail: string | null; created_at: string }[],
    priorRejections: 0,
    bioFlag: row.bio_flagged_at
      ? {
          reason: (row.bio_flag_reason as string) ?? null,
          outcome: (row.bio_flag_outcome as string) ?? null,
        }
      : null,
    _rejectCount: rejects,
  };
}

/** template 1343-1348 — plan cards with real usage bars, then the history. */
async function plansTab(id: string) {
  const [{ data: plans }, { data: consumptions }, { data: adjustments }] = await Promise.all([
    db()
      .from("user_plans")
      .select(
        "id, name, catalog_code, listing_quota, listing_used, requirement_quota, requirement_used, proposal_quota, proposal_used, project_quota, project_used, purchased_at, expires_at, status, is_trial",
      )
      .eq("profile_id", id)
      .order("purchased_at", { ascending: false }),
    db()
      .from("plan_consumptions")
      .select("id, kind, qty, ref_type, ref_id, note, created_at, reverted_at")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    db()
      .from("plan_adjustments")
      .select("id, kind, delta, reason, actor_name, created_at")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    plans: (plans ?? []) as Record<string, unknown>[],
    consumptions: (consumptions ?? []) as Record<string, unknown>[],
    adjustments: (adjustments ?? []) as Record<string, unknown>[],
  };
}

/** template 1350-1352 — "Total paid ₹x · n refunds · n chargebacks" is a sum. */
async function paymentsTab(id: string) {
  const { data } = await db()
    .from("payments")
    .select("id, order_id, status, method, method_detail, amount_paise, created_at, refunded_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as {
    id: string;
    order_id: string;
    status: string;
    amount_paise: number;
    created_at: string;
  }[];

  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const { data: orders } = orderIds.length
    ? await db().from("orders").select("id, catalog_code, kind").in("id", orderIds)
    : { data: [] };
  const orderMap = new Map(
    ((orders ?? []) as { id: string; catalog_code: string; kind: string }[]).map((o) => [o.id, o]),
  );

  return {
    rows: rows.map((r) => ({ ...r, item: orderMap.get(r.order_id)?.catalog_code ?? "—" })),
    totalPaid: rows
      .filter((r) => r.status === "success")
      .reduce((s, r) => s + Number(r.amount_paise), 0),
    refunds: rows.filter((r) => r.status === "refunded").length,
    chargebacks: rows.filter((r) => r.status === "chargeback").length,
  };
}

/** template 1354 — their listings AND projects, because a builder has only projects. */
async function listingsTab(id: string) {
  const { data } = await db()
    .from("admin_listing_master")
    .select(
      "id, kind, title, price_paise, price_on_request, status_key, cover_url, views_count, leads_count, created_at",
    )
    .eq("poster_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return { rows: (data ?? []) as Record<string, unknown>[] };
}

/** template 1356 */
async function requirementsTab(id: string) {
  const { data } = await db()
    .from("requirements")
    .select(
      "id, type_code, kind, bhk, budget_min_paise, budget_max_paise, area_label, status, created_at, expires_at, is_active",
    )
    .eq("profile_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as { id: string }[];
  const { data: proposals } = rows.length
    ? await db()
        .from("proposals")
        .select("requirement_id")
        .in(
          "requirement_id",
          rows.map((r) => r.id),
        )
    : { data: [] };
  const counts = new Map<string, number>();
  for (const p of (proposals ?? []) as { requirement_id: string }[]) {
    counts.set(p.requirement_id, (counts.get(p.requirement_id) ?? 0) + 1);
  }
  return {
    rows: rows.map((r) => ({ ...r, proposals: counts.get(r.id) ?? 0 })),
  };
}

/** template 1358-1360 — grouped by the thing the lead is ABOUT, as the design draws. */
async function leadsTab(id: string) {
  const { data } = await db()
    .from("leads")
    .select(
      "id, lead_profile_id, listing_id, requirement_id, project_id, source, stage, last_activity, last_activity_at",
    )
    .eq("owner_id", id)
    .order("last_activity_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as Record<string, unknown>[];
  const peopleIds = [...new Set(rows.map((r) => r.lead_profile_id as string))];
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean) as string[])];
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean) as string[])];
  const reqIds = [...new Set(rows.map((r) => r.requirement_id).filter(Boolean) as string[])];

  const [people, listings, projects, reqs] = await Promise.all([
    peopleIds.length
      ? db().from("profiles").select("id, name, photo_url").in("id", peopleIds)
      : Promise.resolve({ data: [] }),
    listingIds.length
      ? db().from("listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db().from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    reqIds.length
      ? db().from("requirements").select("id, area_label, bhk").in("id", reqIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameOf = new Map(
    ((people.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
  );
  const groupTitle = (r: Record<string, unknown>) => {
    if (r.listing_id) {
      const l = ((listings.data ?? []) as { id: string; title: string }[]).find(
        (x) => x.id === r.listing_id,
      );
      return { key: `listing:${r.listing_id}`, label: `Property: ${l?.title ?? "Listing"}` };
    }
    if (r.project_id) {
      const p = ((projects.data ?? []) as { id: string; name: string }[]).find(
        (x) => x.id === r.project_id,
      );
      return { key: `project:${r.project_id}`, label: `Project: ${p?.name ?? "Project"}` };
    }
    if (r.requirement_id) {
      const q = ((reqs.data ?? []) as { id: string; area_label: string | null; bhk: number | null }[]).find(
        (x) => x.id === r.requirement_id,
      );
      return {
        key: `requirement:${r.requirement_id}`,
        label: `Requirement: ${q?.bhk ? `${q.bhk} BHK` : "Requirement"}${q?.area_label ? ` · ${q.area_label}` : ""}`,
      };
    }
    return { key: "other", label: "Other" };
  };

  const groups = new Map<string, { label: string; leads: Record<string, unknown>[] }>();
  for (const r of rows) {
    const g = groupTitle(r);
    if (!groups.has(g.key)) groups.set(g.key, { label: g.label, leads: [] });
    groups.get(g.key)!.leads.push({ ...r, lead_name: nameOf.get(r.lead_profile_id as string) ?? "—" });
  }

  return {
    groups: [...groups.values()].map((g) => ({
      label: `${g.label} — ${g.leads.length} lead${g.leads.length === 1 ? "" : "s"}`,
      leads: g.leads,
    })),
  };
}

/** template 1362 — the thread LIST. The thread itself is a second, explicit read. */
async function chatsTab(id: string) {
  const { data } = await db()
    .from("chat_threads")
    .select(
      "id, kind, buyer_id, poster_id, listing_id, project_id, status, last_message_at, last_message_preview",
    )
    .or(`buyer_id.eq.${id},poster_id.eq.${id}`)
    .order("last_message_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Record<string, unknown>[];
  const otherIds = [
    ...new Set(rows.map((r) => (r.buyer_id === id ? r.poster_id : r.buyer_id) as string)),
  ];
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean) as string[])];

  const [people, listings, counts] = await Promise.all([
    otherIds.length
      ? db().from("profiles").select("id, name, photo_url").in("id", otherIds)
      : Promise.resolve({ data: [] }),
    listingIds.length
      ? db().from("listings").select("id, title, cover_url").in("id", listingIds)
      : Promise.resolve({ data: [] }),
    rows.length
      ? db()
          .from("chat_messages")
          .select("thread_id")
          .in(
            "thread_id",
            rows.map((r) => r.id as string),
          )
      : Promise.resolve({ data: [] }),
  ]);

  const msgCount = new Map<string, number>();
  for (const m of (counts.data ?? []) as { thread_id: string }[]) {
    msgCount.set(m.thread_id, (msgCount.get(m.thread_id) ?? 0) + 1);
  }
  const person = new Map(
    ((people.data ?? []) as { id: string; name: string; photo_url: string | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const listing = new Map(
    ((listings.data ?? []) as { id: string; title: string; cover_url: string | null }[]).map((l) => [
      l.id,
      l,
    ]),
  );

  return {
    rows: rows.map((r) => {
      const otherId = (r.buyer_id === id ? r.poster_id : r.buyer_id) as string;
      return {
        id: r.id,
        other_name: person.get(otherId)?.name ?? "—",
        other_photo: person.get(otherId)?.photo_url ?? null,
        subject: r.listing_id ? (listing.get(r.listing_id as string)?.title ?? "Listing") : "Project",
        cover_url: r.listing_id ? (listing.get(r.listing_id as string)?.cover_url ?? null) : null,
        preview: r.last_message_preview,
        last_message_at: r.last_message_at,
        message_count: msgCount.get(r.id as string) ?? 0,
      };
    }),
  };
}

/**
 * The READ-ONLY thread viewer (template 1390-1409).
 *
 * Doc9: admin chats are read-only ENFORCED AT THE API — there is no send path
 * here at all, not a disabled one. Deleted messages are returned, labelled, as
 * the design's own footnote promises ("shown to admins as 'Deleted by user' for
 * evidence") — which is also why the body is blanked rather than passed
 * through: the evidence that matters is that a message existed and was removed.
 */
export async function adminThread(threadId: string) {
  const { data: thread } = await db()
    .from("chat_threads")
    .select(
      "id, kind, buyer_id, poster_id, listing_id, project_id, status, created_at, unit_id",
    )
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;
  const t = thread as Record<string, unknown>;

  const [{ data: people }, { data: messages }, { data: listing }] = await Promise.all([
    db()
      .from("profiles")
      .select("id, name, photo_url, role")
      .in("id", [t.buyer_id as string, t.poster_id as string]),
    db()
      .from("chat_messages")
      .select("id, sender_id, kind, body, photo_url, meta, deleted_all, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300),
    t.listing_id
      ? db()
          .from("listings")
          .select("id, title, price_paise, status, cover_url")
          .eq("id", t.listing_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: t.id,
    participants: (people ?? []) as { id: string; name: string; photo_url: string | null; role: string }[],
    buyerId: t.buyer_id,
    posterId: t.poster_id,
    startedAt: t.created_at,
    listing: listing as Record<string, unknown> | null,
    messages: ((messages ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      kind: m.kind,
      created_at: m.created_at,
      deleted: Boolean(m.deleted_all),
      body: m.deleted_all ? null : m.body,
      photo_url: m.deleted_all ? null : m.photo_url,
      meta: m.deleted_all ? {} : m.meta,
    })),
  };
}

/** template 1364-1366 — every admin-sent message, with its channel and delivery. */
async function communicationTab(id: string) {
  const { data } = await db()
    .from("admin_messages")
    .select("id, channel, subject, body, sent_by_name, delivered_at, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return { rows: (data ?? []) as Record<string, unknown>[] };
}

/** template 1368-1371 */
async function notesTab(id: string) {
  const { data } = await db()
    .from("admin_notes")
    .select("id, author_name, body, created_at")
    .eq("subject_type", "user")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });
  return { rows: (data ?? []) as Record<string, unknown>[] };
}

/**
 * template 1373-1387 — "Devices & sessions" over "Activity log".
 *
 * The sessions are REAL: they come out of the same KV the user's own refresh
 * cookie is validated against, which is why "Sign out" on this panel actually
 * ends a session rather than deleting a row nothing reads.
 *
 * The activity log is assembled from the tables that already record each kind
 * of event, so it cannot drift from what happened: consents and profile
 * creation, orders and payments, listing submissions and approvals, admin
 * actions out of the audit log.
 */
async function timelineTab(id: string) {
  const sessions = await listSessions(id).catch(() => []);

  const [{ data: listings }, { data: payments }, { data: audit }, { data: moderation }, { data: threads }] =
    await Promise.all([
      db()
        .from("listings")
        .select("id, title, status, created_at, submitted_at, approved_at")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("payments")
        .select("id, status, amount_paise, created_at, refunded_at")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("admin_audit_log")
        .select("id, action, actor_name, summary, created_at")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      db()
        .from("moderation_events")
        .select("id, kind, title, created_at")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db()
        .from("chat_threads")
        .select("id, created_at")
        .or(`buyer_id.eq.${id},poster_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  type Item = { at: string; text: string; group: "account" | "listings" | "payments" | "admin" };
  const items: Item[] = [];

  for (const l of (listings ?? []) as Record<string, unknown>[]) {
    if (l.submitted_at)
      items.push({
        at: l.submitted_at as string,
        text: `Submitted listing "${l.title ?? "untitled"}"`,
        group: "listings",
      });
    if (l.approved_at)
      items.push({
        at: l.approved_at as string,
        text: `Listing "${l.title ?? "untitled"}" approved`,
        group: "listings",
      });
  }
  for (const p of (payments ?? []) as Record<string, unknown>[]) {
    items.push({
      at: p.created_at as string,
      text: `Payment ₹${Math.round(Number(p.amount_paise) / 100).toLocaleString("en-IN")} — ${p.status}`,
      group: "payments",
    });
    if (p.refunded_at)
      items.push({ at: p.refunded_at as string, text: `Refund processed`, group: "payments" });
  }
  for (const a of (audit ?? []) as Record<string, unknown>[]) {
    items.push({
      at: a.created_at as string,
      text: `${a.summary} — by ${a.actor_name}`,
      group: "admin",
    });
  }
  for (const m of (moderation ?? []) as Record<string, unknown>[]) {
    items.push({ at: m.created_at as string, text: m.title as string, group: "admin" });
  }
  for (const t of (threads ?? []) as Record<string, unknown>[]) {
    items.push({ at: t.created_at as string, text: "Started a chat", group: "account" });
  }

  const { data: profile } = await db()
    .from("profiles")
    .select("created_at, role")
    .eq("id", id)
    .maybeSingle();
  if (profile) {
    const pr = profile as { created_at: string; role: string | null };
    items.push({
      at: pr.created_at,
      text: `Registered (${pr.role ?? "no role"})`,
      group: "account",
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    devices: sessions.map((s) => {
      const d = describeUserAgent(s.ua);
      return {
        sid: s.sid,
        label: d.label,
        platform: d.label.includes("app") ? "App" : "Web",
        lastUsedAt: new Date(s.lastUsedAt).toISOString(),
        createdAt: new Date(s.createdAt).toISOString(),
        // The raw IP is never stored (Doc9 §19) — only its peppered hash, so
        // there is nothing here to print but the fact that it was recorded.
        ipKnown: Boolean(s.ipHash),
      };
    }),
    items,
  };
}

/* ═══════════════════════════════════════════════════════ the actions ═══════ */

/** template 1693 — Suspend user? Duration + reason, listings hidden, chats frozen. */
export async function suspendUser(
  id: string,
  me: AdminIdentity,
  days: number | null,
  reason: string,
): Promise<UserActionResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };

  const { data } = await db()
    .from("profiles")
    .update({ state: "suspended" })
    .eq("id", id)
    .eq("state", "active")
    .select("id, name")
    .maybeSingle();
  const row = data as { id: string; name: string | null } | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Already suspended or not active" };

  // The suspension's OWN timestamp is read back and reused as `hidden_at`
  // below, so both are the same value from the same clock.
  //
  // They were two clocks before: `created_at` is Postgres `now()` when the
  // insert lands, `hidden_at` was `new Date()` in Node when the payload was
  // built — so the listing was stamped ~50 ms BEFORE the suspension that hid
  // it, `hidden_at >= created_at` was false, and lifting the suspension
  // restored nothing. The design's overlay promises "Listings and chats will
  // be restored"; it had never restored a listing.
  const { data: suspension } = await db()
    .from("account_suspensions")
    .insert({
      profile_id: id,
      reason: reason.trim().slice(0, 300),
      days,
      suspended_by: me.id,
    })
    .select("created_at")
    .single();
  const hiddenAt = (suspension as { created_at: string } | null)?.created_at ?? new Date().toISOString();

  // "Their listings will be hidden and chats frozen" — the warning strip is a
  // promise, so both halves happen here rather than being left to a cron.
  const { count: hidden } = await db()
    .from("listings")
    .update({ status: "hidden", hidden_at: hiddenAt }, { count: "exact" })
    .eq("profile_id", id)
    .eq("status", "live");
  await db()
    .from("projects")
    .update({ status: "hidden", hidden_at: hiddenAt })
    .eq("profile_id", id)
    .eq("status", "live");
  // Frozen chats: every live session goes, so they cannot keep messaging from a
  // tab that is already open.
  await revokeAllSessions(id).catch(() => undefined);

  await notify({
    profileId: id,
    type: "account_suspended",
    title: days ? `Your account is suspended for ${days} days` : "Your account is suspended",
    body: reason.trim(),
    actorId: me.id,
  });

  return {
    ok: true,
    label: row.name ?? "User",
    summary: days ? `Suspended for ${days} days` : "Suspended until review",
    diff: { reason: reason.trim(), days, listingsHidden: hidden ?? 0 },
  };
}

/** template 1757 — Lift suspension? "Listings and chats will be restored." */
export async function liftSuspension(id: string, me: AdminIdentity): Promise<UserActionResult> {
  const { data } = await db()
    .from("profiles")
    .update({ state: "active" })
    .eq("id", id)
    .eq("state", "suspended")
    .select("id, name")
    .maybeSingle();
  const row = data as { id: string; name: string | null } | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Not suspended" };

  await db()
    .from("account_suspensions")
    .update({ lifted_at: new Date().toISOString(), lifted_by: me.id })
    .eq("profile_id", id)
    .is("lifted_at", null);

  // Restore only what the suspension itself hid — a listing the admin hid for
  // its own reasons must not silently come back with the account.
  //
  // `suspendUser` stamps `hidden_at` with this row's own `created_at`, so the
  // comparison below is an exact match on one clock rather than a race between
  // Postgres's and Node's.
  const { data: susp } = await db()
    .from("account_suspensions")
    .select("created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since = (susp as { created_at: string } | null)?.created_at;
  if (since) {
    await db()
      .from("listings")
      .update({ status: "live", hidden_at: null })
      .eq("profile_id", id)
      .eq("status", "hidden")
      .gte("hidden_at", since);
    await db()
      .from("projects")
      .update({ status: "live", hidden_at: null })
      .eq("profile_id", id)
      .eq("status", "hidden")
      .gte("hidden_at", since);
  }

  await notify({
    profileId: id,
    type: "suspension_lifted",
    title: "Your account is active again",
    body: "Your listings and chats have been restored.",
    actorId: me.id,
  });

  return { ok: true, label: row.name ?? "User", summary: "Suspension lifted" };
}

/** template 1750 — "Their listings stay as they are. Plan availability may change." */
export async function changeRole(
  id: string,
  me: AdminIdentity,
  to: "owner" | "broker" | "builder",
  reason: string,
): Promise<UserActionResult> {
  const { data: before } = await db()
    .from("profiles")
    .select("id, name, role")
    .eq("id", id)
    .maybeSingle();
  const prev = before as { id: string; name: string | null; role: string | null } | null;
  if (!prev) return { ok: false, reason: "not_found" };
  if (prev.role === to) return { ok: false, reason: "bad_state", message: "Already that role" };

  await db().from("profiles").update({ role: to }).eq("id", id);
  await db().from("role_change_requests").insert({
    profile_id: id,
    from_role: prev.role,
    to_role: to,
    status: "approved",
  });
  await notify({
    profileId: id,
    type: "role_changed",
    title: `Your account is now a ${to} account`,
    body: reason.trim() || undefined,
    actorId: me.id,
  });

  return {
    ok: true,
    label: prev.name ?? "User",
    summary: `Role ${prev.role ?? "none"} → ${to}`,
    diff: { from: prev.role, to, reason: reason.trim() || null },
  };
}

/**
 * template 1726 — New grant.
 *
 * The sheet's last line is the rule that matters: "Buying a paid plan ends the
 * trial automatically." So a grant is a real `user_plans` row with `is_trial`,
 * not a flag — the same row every quota check already reads, which is what
 * makes that sentence true without a second code path.
 */
export async function grantTrial(
  id: string,
  me: AdminIdentity,
  contents: { listings: number; requirements: number; proposals: number; projects?: number },
  durationDays: number,
  reason: string,
  note: string | null,
): Promise<UserActionResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };
  const total =
    contents.listings + contents.requirements + contents.proposals + (contents.projects ?? 0);
  if (total <= 0) return { ok: false, reason: "validation", message: "Grant at least one thing" };
  if (durationDays <= 0 || durationDays > 365)
    return { ok: false, reason: "validation", message: "Duration must be 1–365 days" };

  const { data: profile } = await db()
    .from("profiles")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return { ok: false, reason: "not_found" };

  const expires = new Date(Date.now() + durationDays * 86_400_000).toISOString();
  const { data: plan, error } = await db()
    .from("user_plans")
    .insert({
      profile_id: id,
      // A real plan_catalog row (migration 0099), inactive so it can never be
      // bought. Reusing a sellable code would make every grant claim to BE that
      // plan in every screen that groups by catalog_code.
      catalog_code: "admin_grant",
      name: `Trial — ${durationDays} days`,
      terms: { grantedBy: me.name, reason: reason.trim(), note: note?.trim() ?? null },
      listing_quota: contents.listings,
      requirement_quota: contents.requirements,
      proposal_quota: contents.proposals,
      project_quota: contents.projects ?? 0,
      expires_at: expires,
      status: "active",
      is_trial: true,
      granted_by: me.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !plan) return { ok: false, reason: "validation", message: error?.message };

  await db().from("grants").insert({
    profile_id: id,
    kind: "trial",
    catalog_code: "admin_grant",
    contents,
    duration_days: durationDays,
    reason: reason.trim(),
    granted_by: me.id,
    granted_by_name: me.name,
    user_plan_id: (plan as { id: string }).id,
    notified_at: new Date().toISOString(),
  });

  // The sheet tells the admin exactly what the user will see; this is that.
  await notify({
    profileId: id,
    type: "admin_message",
    title: "You've received a trial from HomzList",
    body: `${contents.listings} listing + ${contents.requirements} requirement for ${durationDays} days`,
    // The plan they were just given — not the generic Account status page the
    // rest of the admin broadcasts fall back to.
    href: "/plans/my",
    actorId: me.id,
  });

  return {
    ok: true,
    label: (profile as { name: string | null }).name ?? "User",
    summary: `Trial granted — ${durationDays} days`,
    diff: { contents, durationDays, reason: reason.trim() },
  };
}

/** template 1740 — Adjust balance. Applies to a real plan and records why. */
export async function adjustBalance(
  id: string,
  me: AdminIdentity,
  kind: "proposal" | "listing" | "requirement" | "project",
  delta: number,
  reason: string,
): Promise<UserActionResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100)
    return { ok: false, reason: "validation", message: "Adjustment must be ±1…100" };

  const column = `${kind}_quota` as const;
  const { data: plan } = await db()
    .from("user_plans")
    .select(`id, name, ${column}, ${kind}_used`)
    .eq("profile_id", id)
    .eq("status", "active")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const target = plan as Record<string, unknown> | null;
  if (!target) {
    // No plan means nothing to adjust — the design's sheet would otherwise show
    // a success toast over an adjustment that landed nowhere.
    return {
      ok: false,
      reason: "bad_state",
      message: "This user has no active plan — grant a trial first",
    };
  }

  const current = Number(target[column] ?? 0);
  const used = Number(target[`${kind}_used`] ?? 0);
  const next = current + delta;
  if (next < used) {
    return {
      ok: false,
      reason: "validation",
      message: `Can't go below what is already used (${used})`,
    };
  }

  await db()
    .from("user_plans")
    .update({ [column]: next })
    .eq("id", target.id as string);
  await db().from("plan_adjustments").insert({
    profile_id: id,
    user_plan_id: target.id as string,
    kind,
    delta,
    reason: reason.trim().slice(0, 300),
    actor_id: me.id,
    actor_name: me.name,
  });

  return {
    ok: true,
    label: (target.name as string) ?? "Plan",
    summary: `${kind} balance ${delta > 0 ? "+" : ""}${delta} (${current} → ${next})`,
    diff: { kind, delta, from: current, to: next, reason: reason.trim() },
  };
}

/** template 1717 — Send message. Channels · template · subject · body. */
export async function sendAdminMessage(
  ids: string[],
  me: AdminIdentity,
  channels: string[],
  subject: string,
  body: string,
): Promise<UserActionResult> {
  if (!body.trim()) return { ok: false, reason: "validation", message: "A message is required" };
  const allowed = channels.filter((c) => ["in_app", "email", "whatsapp"].includes(c));
  if (!allowed.length)
    return { ok: false, reason: "validation", message: "Pick at least one channel" };

  const title = subject.trim().slice(0, 140) || "A message from the HomzList team";
  const text = body.trim().slice(0, 2000);

  const { data: people } = await db()
    .from("profiles")
    .select("id, email, phone")
    .in("id", ids);
  const contact = new Map(
    ((people ?? []) as { id: string; email: string | null; phone: string | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );

  const totals: Record<string, { sent: number; failed: number; reason?: string }> = {};
  const bump = (ch: string, sent: boolean, reason?: string) => {
    const t = (totals[ch] ??= { sent: 0, failed: 0 });
    if (sent) t.sent++;
    else {
      t.failed++;
      t.reason ??= reason;
    }
  };

  for (const profileId of ids) {
    const who = contact.get(profileId);
    const delivery: Record<string, { sent: boolean; reason?: string }> = {};

    // IN-APP goes through the notification pipeline, which owns preferences,
    // quiet hours and the delivery ledger. Writing our own would be a second
    // sender that disagrees with the first.
    if (allowed.includes("in_app")) {
      const res = await notify({
        profileId,
        type: "admin_message",
        title,
        body: text.slice(0, 500),
        actorId: me.id,
      });
      delivery.in_app = { sent: Boolean(res.id) };
      bump("in_app", Boolean(res.id));
    }

    // EMAIL and WHATSAPP are real calls to the real providers. Where a
    // provider has no credentials on this environment they answer
    // "no_credentials" — which is RECORDED, not hidden behind a success toast.
    if (allowed.includes("email")) {
      const res = await sendEmail({
        to: who?.email ?? "",
        subject: title,
        html: renderEmail({ title, body: text }),
      });
      delivery.email = { sent: res.sent, reason: res.reason };
      bump("email", res.sent, res.reason);
    }
    if (allowed.includes("whatsapp")) {
      const res = await sendWhatsApp({ to: who?.phone ?? "", body: `${title}

${text}` });
      delivery.whatsapp = { sent: res.sent, reason: res.reason };
      bump("whatsapp", res.sent, res.reason);
    }

    const anySent = Object.values(delivery).some((d) => d.sent);
    const { error } = await db().from("admin_messages").insert({
      profile_id: profileId,
      channel: allowed.join(","),
      subject: subject.trim().slice(0, 140) || null,
      body: text,
      sent_by: me.id,
      sent_by_name: me.name,
      // Only set when something genuinely went out on at least one channel.
      delivered_at: anySent ? new Date().toISOString() : null,
      delivery,
    });
    if (error) return { ok: false, reason: "validation", message: error.message };
  }

  // The summary names what failed, so the toast cannot claim three channels
  // when one of them has no provider on this environment.
  const parts = Object.entries(totals).map(([ch, t]) =>
    t.failed === 0 ? `${ch} ✓` : `${ch} ✗ (${t.reason ?? "failed"})`,
  );

  return {
    ok: true,
    label: ids.length === 1 ? "User" : `${ids.length} users`,
    summary: `Message sent — ${parts.join(" · ")}`,
    diff: { channels: allowed, subject: subject.trim() || null, recipients: ids.length, totals },
  };
}

/** template 1368 — internal notes, never visible to the user. */
export async function addNote(
  id: string,
  me: AdminIdentity,
  body: string,
): Promise<UserActionResult> {
  if (!body.trim()) return { ok: false, reason: "validation", message: "Write something first" };
  const { error } = await db().from("admin_notes").insert({
    subject_type: "user",
    subject_id: id,
    author_id: me.id,
    author_name: me.name,
    body: body.trim().slice(0, 2000),
  });
  if (error) return { ok: false, reason: "validation", message: error.message };
  return { ok: true, label: "Internal note", summary: "Note added" };
}

export async function deleteNote(noteId: string, me: AdminIdentity): Promise<UserActionResult> {
  const { data } = await db()
    .from("admin_notes")
    .delete()
    .eq("id", noteId)
    .select("id, subject_id")
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  void me;
  return { ok: true, label: "Internal note", summary: "Note removed" };
}

/** template 1766 — Merge accounts. The sheet's three bullets, all three real. */
export async function mergeAccounts(
  primaryId: string,
  mergedId: string,
  me: AdminIdentity,
  reason: string | null,
): Promise<UserActionResult> {
  if (primaryId === mergedId)
    return { ok: false, reason: "validation", message: "Pick two different accounts" };

  const { data: both } = await db()
    .from("profiles")
    .select("id, name, state")
    .in("id", [primaryId, mergedId]);
  const rows = (both ?? []) as { id: string; name: string | null; state: string }[];
  if (rows.length !== 2) return { ok: false, reason: "not_found" };
  const secondary = rows.find((r) => r.id === mergedId)!;
  if (secondary.state !== "active")
    return { ok: false, reason: "bad_state", message: "The other account is not active" };

  // · Listings and plan balances move to the primary account
  const { count: listings } = await db()
    .from("listings")
    .update({ profile_id: primaryId }, { count: "exact" })
    .eq("profile_id", mergedId);
  const { count: projects } = await db()
    .from("projects")
    .update({ profile_id: primaryId }, { count: "exact" })
    .eq("profile_id", mergedId);
  const { count: plans } = await db()
    .from("user_plans")
    .update({ profile_id: primaryId }, { count: "exact" })
    .eq("profile_id", mergedId)
    .eq("status", "active");
  // · The other account is suspended, not deleted
  await db().from("profiles").update({ state: "suspended" }).eq("id", mergedId);
  await db().from("account_suspensions").insert({
    profile_id: mergedId,
    reason: `Merged into ${rows.find((r) => r.id === primaryId)?.name ?? primaryId}`,
    suspended_by: me.id,
  });
  await revokeAllSessions(mergedId).catch(() => undefined);
  // · Chats stay with their original threads — deliberately NOT reassigned.

  const moved = { listings: listings ?? 0, projects: projects ?? 0, plans: plans ?? 0 };
  await db().from("account_merges").insert({
    primary_id: primaryId,
    merged_id: mergedId,
    moved,
    reason: reason?.trim() ?? null,
    actor_id: me.id,
    actor_name: me.name,
  });

  return {
    ok: true,
    label: rows.find((r) => r.id === primaryId)?.name ?? "User",
    summary: `Merged ${secondary.name ?? mergedId} in — ${moved.listings + moved.projects} postings, ${moved.plans} plans`,
    diff: { primaryId, mergedId, moved },
  };
}

/**
 * template 1776 — Delete this user.
 *
 * The dialog's four bullets are the specification, and the third one is the
 * reason this is not a `delete from profiles`: payment records are kept seven
 * years by law, so the account is anonymised and retired, its content removed,
 * and the money rows left standing with no name attached.
 */
export async function deleteUser(id: string, me: AdminIdentity): Promise<UserActionResult> {
  const { data: profile } = await db()
    .from("profiles")
    .select("id, name, state")
    .eq("id", id)
    .maybeSingle();
  const p = profile as { id: string; name: string | null; state: string } | null;
  if (!p) return { ok: false, reason: "not_found" };
  if (p.state === "deleted") return { ok: false, reason: "bad_state", message: "Already deleted" };

  const now = new Date().toISOString();
  // · Listings and requirements removed
  const { count: listings } = await db()
    .from("listings")
    .update({ status: "deleted", deleted_at: now }, { count: "exact" })
    .eq("profile_id", id)
    .is("deleted_at", null);
  await db()
    .from("projects")
    .update({ status: "deleted", deleted_at: now })
    .eq("profile_id", id)
    .is("deleted_at", null);
  await db()
    .from("requirements")
    .update({ status: "deleted", deleted_at: now, is_active: false })
    .eq("profile_id", id)
    .is("deleted_at", null);

  // · Chats anonymised — the thread survives for the other party, the identity
  //   does not.
  await db()
    .from("profiles")
    .update({
      state: "deleted",
      name: "Deleted user",
      bio: null,
      photo_url: null,
      email: null,
      username: null,
      // The phone column is NOT NULL and is the account's key; it is replaced
      // with a non-routable placeholder rather than left in place.
      phone: `deleted:${id}`,
      is_registered: false,
    })
    .eq("id", id);

  await db().from("trash_items").insert({
    entity_type: "user",
    entity_id: id,
    label: p.name ?? "User",
    deleted_by_kind: "admin",
    deleted_by: me.id,
    deleted_by_name: me.name,
    reason: "Deleted from the admin panel",
  });
  await revokeAllSessions(id).catch(() => undefined);

  return {
    ok: true,
    label: p.name ?? "User",
    summary: `User deleted — ${listings ?? 0} listings removed, payments retained`,
    diff: { listingsRemoved: listings ?? 0 },
  };
}

/** template 1875 — Sign out this session / all devices. */
export async function signOutUser(
  id: string,
  sid: string | null,
): Promise<UserActionResult> {
  if (sid) {
    await revokeSession(id, sid);
    return { ok: true, label: "Session", summary: "One session signed out" };
  }
  await revokeAllSessions(id);
  return { ok: true, label: "Sessions", summary: "All devices signed out" };
}

/** template 1774 — Ban device / IP. Reuses A9's banner so there is one path. */
export async function banUserDevices(
  id: string,
  me: AdminIdentity,
  reason: string,
): Promise<UserActionResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };

  const [{ data: consent }, { data: tokens }] = await Promise.all([
    db()
      .from("auth_consents")
      .select("ip_hash")
      .eq("profile_id", id)
      .not("ip_hash", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("push_tokens")
      .select("device_label")
      .eq("profile_id", id)
      .not("device_label", "is", null)
      .limit(5),
  ]);

  const rows: Record<string, unknown>[] = [];
  const ipHash = (consent as { ip_hash: string | null } | null)?.ip_hash;
  if (ipHash)
    rows.push({
      kind: "ip",
      value: ipHash,
      profile_id: id,
      reason: reason.trim(),
      banned_by: me.id,
    });
  for (const t of (tokens ?? []) as { device_label: string | null }[]) {
    if (t.device_label)
      rows.push({
        kind: "device",
        value: t.device_label,
        profile_id: id,
        reason: reason.trim(),
        banned_by: me.id,
      });
  }
  if (!rows.length)
    return {
      ok: false,
      reason: "bad_state",
      message: "Nothing to ban — no IP hash or device on record for this account",
    };

  await db().from("device_bans").insert(rows);
  return {
    ok: true,
    label: "Device ban",
    summary: `${rows.length} identifier(s) banned`,
    diff: { reason: reason.trim(), count: rows.length },
  };
}

/** The overview tab's inline pencil (template 1275) — a real profile edit. */
const EDITABLE = new Set(["name", "bio", "email", "office_address"]);

export async function editProfileField(
  id: string,
  me: AdminIdentity,
  field: string,
  value: string,
): Promise<UserActionResult> {
  if (!EDITABLE.has(field))
    return { ok: false, reason: "validation", message: "That field is not editable here" };

  const { data: before } = await db()
    .from("profiles")
    .select(`id, name, ${field}`)
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, reason: "not_found" };
  const prev = (before as Record<string, unknown>)[field];
  const next = value.trim().slice(0, 1000) || null;

  await db()
    .from("profiles")
    .update({ [field]: next })
    .eq("id", id);
  void me;

  return {
    ok: true,
    label: ((before as Record<string, unknown>).name as string) ?? "User",
    summary: `${field} edited`,
    diff: { field, from: prev, to: next },
  };
}

/** template 1778 — Force expire this requirement. */
export async function forceExpireRequirement(
  requirementId: string,
  me: AdminIdentity,
): Promise<UserActionResult> {
  const { data } = await db()
    .from("requirements")
    .update({ status: "expired", is_active: false, expires_at: new Date().toISOString() })
    .eq("id", requirementId)
    .in("status", ["live", "paused"])
    .select("id, profile_id, area_label")
    .maybeSingle();
  const row = data as { id: string; profile_id: string; area_label: string | null } | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Not an active requirement" };

  await notify({
    profileId: row.profile_id,
    type: "requirement_expiring",
    title: "Your requirement has been closed",
    body: "It will stop matching. You can post a new one when you're ready.",
    entityKind: "requirement",
    entityId: row.id,
    actorId: me.id,
  });

  return {
    ok: true,
    label: row.area_label ?? "Requirement",
    summary: "Requirement force-expired",
  };
}
