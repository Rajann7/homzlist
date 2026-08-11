import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { profileCompleteness } from "@/lib/listings/proposals";

/**
 * Leads — the single record both sides of a connection work from.
 *
 * This replaces the chat pipeline entirely. A connection is no longer a
 * conversation: the sender picks WHAT they want, HOW to be contacted and WHEN,
 * and that lands here as a lead the receiver acts on with Call / WhatsApp.
 *
 * Two views, one table:
 *   RECEIVED — grouped by the receiver's own listing / project / requirement,
 *              each with its live count, then drilled into per subject.
 *   SENT     — what the viewer sent, with the offer they attached (if any).
 *
 * Deliberate rules encoded here:
 *  - `stage` keeps its legacy vocabulary in the database; the product speaks
 *    New → Contacted → Converted → Archived. `statusOf` maps the old labels
 *    onto the new four so no historical row becomes unreadable.
 *  - unseen (`seen_at`) and stage are different things. The nav badge counts
 *    unseen; the filter chips count stage.
 *  - the SENDER never sees the receiver's pipeline stage. They see a derived,
 *    non-judgemental state (Sent / Seen / Owner contacted you / Closed) —
 *    "Archived" must never read to a sender as "you were rejected".
 *  - subject text comes from the snapshot taken when the lead was created, so
 *    an edited or deleted listing cannot blank out or rewrite an old lead.
 */

const db = () => createServiceClient();

export const LEAD_STATUSES = ["new", "contacted", "converted", "archived"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New", contacted: "Contacted", converted: "Converted", archived: "Archived",
};

/** Legacy stage → the four the product now speaks. */
export function statusOf(stage: string): LeadStatus {
  switch (stage) {
    case "new": return "new";
    case "contacted":
    case "visit":
    case "negotiation": return "contacted";
    case "converted":
    case "closed_won": return "converted";
    case "archived":
    case "closed_lost": return "archived";
    default: return "new";
  }
}

export type SubjectKind = "listing" | "project" | "requirement";

export interface LeadSubject {
  kind: SubjectKind;
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  /** Live, from the subject row — "Live", "Sold", "Expired", "Removed". */
  stateLabel: string;
  total: number;
  unseen: number;
  lastAt: string | null;
}

export interface LeadGroups {
  subjects: LeadSubject[];
  totals: { total: number; unseen: number };
  sentCount: number;
}

interface Row {
  id: string;
  owner_id: string;
  lead_profile_id: string;
  listing_id: string | null;
  project_id: string | null;
  requirement_id: string | null;
  inquiry_id: string | null;
  proposal_id: string | null;
  offer_listing_id: string | null;
  offer_project_id: string | null;
  source: string;
  stage: string;
  wants: string[];
  contact_pref: string | null;
  contact_number: string | null;
  when_token: string | null;
  preferred_on: string | null;
  subject_snapshot: Record<string, unknown>;
  notes: { text: string; at: string }[];
  seen_at: string | null;
  closed_reason: string | null;
  last_activity: string | null;
  last_activity_at: string;
  is_relevant: boolean;
  created_at: string;
}

/**
 * The Received tab: the viewer's own subjects, each with its lead count.
 *
 * One aggregate (`lead_subject_counts`) plus one read per subject TABLE — not
 * one count per row. A broker with 200 listings would otherwise turn this into
 * 200 round trips and make Leads the slowest screen in the product.
 */
export async function listLeadGroups(ownerId: string): Promise<LeadGroups> {
  const { data: counts } = await db().rpc("lead_subject_counts", { p_owner: ownerId });
  const rows = ((counts ?? []) as { kind: SubjectKind; subject_id: string; total: string | number; unseen: string | number; last_at: string | null }[]);

  const ids = (k: SubjectKind) => rows.filter((r) => r.kind === k).map((r) => r.subject_id);
  const [listingIds, projectIds, requirementIds] = [ids("listing"), ids("project"), ids("requirement")];

  const [{ data: listings }, { data: projects }, { data: requirements }, { count: sentCount }] = await Promise.all([
    listingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url,status,attributes").in("id", listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    projectIds.length
      ? db().from("projects").select("id,name,cover_url,status,city_id").in("id", projectIds)
      : Promise.resolve({ data: [] as unknown[] }),
    requirementIds.length
      ? db().from("requirements").select("id,kind,bhk,area_label,budget_min_paise,budget_max_paise,status,expires_at").in("id", requirementIds)
      : Promise.resolve({ data: [] as unknown[] }),
    db().from("leads").select("id", { count: "exact", head: true }).eq("lead_profile_id", ownerId),
  ]);

  const lMap = new Map((listings ?? []).map((l: any) => [l.id, l]));
  const pMap = new Map((projects ?? []).map((p: any) => [p.id, p]));
  const rMap = new Map((requirements ?? []).map((r: any) => [r.id, r]));

  const subjects: LeadSubject[] = [];
  for (const row of rows) {
    const total = Number(row.total);
    const unseen = Number(row.unseen);
    if (row.kind === "listing") {
      const l: any = lMap.get(row.subject_id);
      if (!l) continue;
      subjects.push({
        kind: "listing", id: row.subject_id,
        title: l.title || [l.attributes?.bhk ? `${l.attributes.bhk} BHK` : null, l.area_label].filter(Boolean).join(" · ") || "Property",
        subtitle: [l.price_on_request ? "Price on request" : priceLabel(l.price_paise), l.area_label].filter(Boolean).join(" · "),
        coverUrl: l.cover_url ?? null,
        stateLabel: listingState(l.status),
        total, unseen, lastAt: row.last_at,
      });
    } else if (row.kind === "project") {
      const p: any = pMap.get(row.subject_id);
      if (!p) continue;
      subjects.push({
        kind: "project", id: row.subject_id,
        title: p.name ?? "Project", subtitle: listingState(p.status),
        coverUrl: p.cover_url ?? null, stateLabel: listingState(p.status),
        total, unseen, lastAt: row.last_at,
      });
    } else if (row.kind === "requirement") {
      const r: any = rMap.get(row.subject_id);
      if (!r) continue;
      subjects.push({
        kind: "requirement", id: row.subject_id,
        // `requirements` has no title column — the product composes one from
        // BHK + buy/rent + area, the same shape the requirement card shows.
        title: requirementTitle(r),
        subtitle: budgetLabel(r.budget_min_paise, r.budget_max_paise),
        coverUrl: null,
        stateLabel: requirementState(r.status, r.expires_at),
        total, unseen, lastAt: row.last_at,
      });
    }
  }
  // Newest activity first inside the natural grouping the UI renders
  // (Properties → Projects → Requirements).
  const order: Record<SubjectKind, number> = { listing: 0, project: 1, requirement: 2 };
  subjects.sort((a, b) =>
    order[a.kind] - order[b.kind] ||
    (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  return {
    subjects,
    totals: {
      total: subjects.reduce((n, s) => n + s.total, 0),
      unseen: subjects.reduce((n, s) => n + s.unseen, 0),
    },
    sentCount: sentCount ?? 0,
  };
}

export interface LeadView {
  id: string;
  status: LeadStatus;
  statusLabel: string;
  /** preferred date has passed and nobody has acted — the state leads die in. */
  overdue: boolean;
  seen: boolean;
  createdAt: string;
  lastActivityAt: string;
  wants: { code: string; label: string }[];
  contactPref: "call" | "whatsapp" | null;
  /** Full number — never masked. Only ever served to the lead's owner. */
  contactNumber: string | null;
  whenLabel: string | null;
  preferredOn: string | null;
  notes: { text: string; at: string }[];
  closedReason: string | null;
  person: {
    id: string;
    name: string;
    role: string | null;
    photoUrl: string | null;
    verified: { phone: boolean; id: boolean; rera: boolean };
    memberSince: string;
    profilePct: number;
  };
  subject: { kind: SubjectKind; id: string | null; title: string; subtitle: string; coverUrl: string | null };
  /** "I Have a Property" — what the sender offered against a requirement. */
  offer: { kind: "listing" | "project"; id: string; title: string; subtitle: string; coverUrl: string | null } | null;
}

export interface SubjectLeads {
  subject: LeadSubject | null;
  leads: LeadView[];
  counts: { key: "all" | LeadStatus | "overdue"; label: string; count: number }[];
}

/** Every lead on ONE of the viewer's subjects. */
export async function listSubjectLeads(ownerId: string, kind: SubjectKind, subjectId: string): Promise<SubjectLeads> {
  const col = kind === "listing" ? "listing_id" : kind === "project" ? "project_id" : "requirement_id";
  const { data } = await db()
    .from("leads")
    .select("*")
    .eq("owner_id", ownerId)
    .eq(col, subjectId)
    .eq("is_relevant", true)
    .order("last_activity_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const groups = await listLeadGroups(ownerId);
  const subject = groups.subjects.find((s) => s.kind === kind && s.id === subjectId) ?? null;
  const leads = await hydrate(rows);

  const n = (pred: (l: LeadView) => boolean) => leads.filter(pred).length;
  return {
    subject,
    leads,
    counts: [
      { key: "all", label: "All", count: leads.length },
      { key: "new", label: "New", count: n((l) => l.status === "new") },
      { key: "overdue", label: "Overdue", count: n((l) => l.overdue) },
      { key: "contacted", label: "Contacted", count: n((l) => l.status === "contacted") },
      { key: "converted", label: "Converted", count: n((l) => l.status === "converted") },
      { key: "archived", label: "Archived", count: n((l) => l.status === "archived") },
    ],
  };
}

export async function getLead(ownerId: string, id: string): Promise<LeadView | null> {
  const { data } = await db().from("leads").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (!data) return null;
  return (await hydrate([data as Row]))[0] ?? null;
}

/** Turn rows into the payload the UI renders — one batch read per relation. */
async function hydrate(rows: Row[]): Promise<LeadView[]> {
  if (!rows.length) return [];
  const personIds = [...new Set(rows.map((r) => r.lead_profile_id))];
  const offerListingIds = rows.map((r) => r.offer_listing_id).filter((x): x is string => Boolean(x));
  const offerProjectIds = rows.map((r) => r.offer_project_id).filter((x): x is string => Boolean(x));

  const [{ data: profs }, { data: vers }, { data: wantOpts }, { data: whenOpts }, { data: offerL }, { data: offerP }] = await Promise.all([
    db().from("profiles").select("id,name,role,bio,photo_url,email,city_id,created_at").in("id", personIds),
    db().from("verifications").select("profile_id,level,status").in("profile_id", personIds),
    db().from("inquiry_options").select("code,label").in("kind", ["want", "offer"]),
    db().from("inquiry_options").select("code,label").eq("kind", "when"),
    offerListingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url").in("id", offerListingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    offerProjectIds.length
      ? db().from("projects").select("id,name,cover_url").in("id", offerProjectIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const verMap = new Map<string, { phone: boolean; id: boolean; rera: boolean }>();
  for (const v of (vers ?? []) as { profile_id: string; level: string; status: string }[]) {
    const cur = verMap.get(v.profile_id) ?? { phone: false, id: false, rera: false };
    if (v.status === "approved" && (v.level === "phone" || v.level === "id" || v.level === "rera")) cur[v.level] = true;
    verMap.set(v.profile_id, cur);
  }
  const wantMap = new Map<string, string>((wantOpts ?? []).map((o: any) => [o.code as string, o.label as string]));
  const whenMap = new Map<string, string>((whenOpts ?? []).map((o: any) => [o.code as string, o.label as string]));
  const offerLMap = new Map((offerL ?? []).map((l: any) => [l.id, l]));
  const offerPMap = new Map((offerP ?? []).map((p: any) => [p.id, p]));

  const today = istToday();

  return rows.map((r) => {
    const p: any = profMap.get(r.lead_profile_id) ?? {};
    const snap = (r.subject_snapshot ?? {}) as Record<string, string | null>;
    const status = statusOf(r.stage);
    const ol: any = r.offer_listing_id ? offerLMap.get(r.offer_listing_id) : null;
    const op: any = r.offer_project_id ? offerPMap.get(r.offer_project_id) : null;
    return {
      id: r.id,
      status,
      statusLabel: STATUS_LABEL[status],
      overdue: status === "new" && !!r.preferred_on && r.preferred_on < today,
      seen: Boolean(r.seen_at),
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
      wants: (r.wants ?? []).map((code) => ({ code, label: wantMap.get(code) ?? code })),
      contactPref: (r.contact_pref === "call" || r.contact_pref === "whatsapp") ? r.contact_pref : null,
      contactNumber: r.contact_number ?? p.phone ?? null,
      whenLabel: r.when_token ? whenMap.get(r.when_token) ?? null : null,
      preferredOn: r.preferred_on,
      notes: r.notes ?? [],
      closedReason: r.closed_reason,
      person: {
        id: r.lead_profile_id,
        name: p.name ?? "HomzList user",
        role: p.role ?? null,
        photoUrl: p.photo_url ?? null,
        verified: verMap.get(r.lead_profile_id) ?? { phone: false, id: false, rera: false },
        memberSince: memberSince(p.created_at),
        profilePct: profileCompleteness(p),
      },
      subject: {
        kind: r.listing_id ? "listing" : r.project_id ? "project" : "requirement",
        id: r.listing_id ?? r.project_id ?? r.requirement_id,
        title: snap.title ?? "—",
        subtitle: snap.subtitle ?? "",
        coverUrl: snap.coverUrl ?? null,
      },
      offer: ol
        ? { kind: "listing", id: ol.id, title: ol.title ?? "Property",
            subtitle: [ol.price_on_request ? "Price on request" : priceLabel(ol.price_paise), ol.area_label].filter(Boolean).join(" · "),
            coverUrl: ol.cover_url ?? null }
        : op
          ? { kind: "project", id: op.id, title: op.name ?? "Project", subtitle: "Project", coverUrl: op.cover_url ?? null }
          : null,
    };
  });
}

// ---- sender side -----------------------------------------------------------

export interface SentLead {
  id: string;
  /** Sender-facing state. The receiver's pipeline stage is NEVER exposed. */
  state: "sent" | "seen" | "contacted" | "closed";
  stateLabel: string;
  createdAt: string;
  summary: string;
  closedReason: string | null;
  canWithdraw: boolean;
  subject: { kind: SubjectKind; id: string | null; title: string; subtitle: string; coverUrl: string | null };
  to: { id: string; name: string; role: string | null; photoUrl: string | null };
  offer: { kind: "listing" | "project"; id: string; title: string; subtitle: string; coverUrl: string | null } | null;
}

export async function listSentLeads(profileId: string): Promise<SentLead[]> {
  const { data } = await db()
    .from("leads")
    .select("*")
    .eq("lead_profile_id", profileId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];

  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const offerListingIds = rows.map((r) => r.offer_listing_id).filter((x): x is string => Boolean(x));
  const offerProjectIds = rows.map((r) => r.offer_project_id).filter((x): x is string => Boolean(x));
  const [{ data: owners }, { data: events }, { data: wantOpts }, { data: whenOpts }, { data: offerL }, { data: offerP }] = await Promise.all([
    db().from("profiles").select("id,name,role,photo_url").in("id", ownerIds),
    db().from("lead_contact_events").select("lead_id").in("lead_id", rows.map((r) => r.id)),
    db().from("inquiry_options").select("code,label").in("kind", ["want", "offer"]),
    db().from("inquiry_options").select("code,label").eq("kind", "when"),
    offerListingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url").in("id", offerListingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    offerProjectIds.length
      ? db().from("projects").select("id,name,cover_url").in("id", offerProjectIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const ownerMap = new Map((owners ?? []).map((o: any) => [o.id, o]));
  const contacted = new Set(((events ?? []) as { lead_id: string }[]).map((e) => e.lead_id));
  const wantMap = new Map<string, string>((wantOpts ?? []).map((o: any) => [o.code as string, o.label as string]));
  const whenMap = new Map<string, string>((whenOpts ?? []).map((o: any) => [o.code as string, o.label as string]));
  const offerLMap = new Map((offerL ?? []).map((l: any) => [l.id, l]));
  const offerPMap = new Map((offerP ?? []).map((p: any) => [p.id, p]));

  return rows.map((r) => {
    const status = statusOf(r.stage);
    const snap = (r.subject_snapshot ?? {}) as Record<string, string | null>;
    const o: any = ownerMap.get(r.owner_id) ?? {};
    // Closed is closed. The sender is never told they were "archived", which
    // reads as a rejection the owner did not necessarily mean.
    const state: SentLead["state"] =
      status === "converted" || status === "archived" || r.closed_reason ? "closed"
      : contacted.has(r.id) ? "contacted"
      : r.seen_at ? "seen"
      : "sent";
    const ol: any = r.offer_listing_id ? offerLMap.get(r.offer_listing_id) : null;
    const op: any = r.offer_project_id ? offerPMap.get(r.offer_project_id) : null;
    const bits = [
      (r.wants ?? []).map((c) => wantMap.get(c) ?? c).join(", "),
      r.contact_pref === "whatsapp" ? "WhatsApp" : r.contact_pref === "call" ? "Call" : "",
      r.when_token ? whenMap.get(r.when_token) ?? "" : "",
    ].filter(Boolean);
    return {
      id: r.id,
      state,
      stateLabel: state === "sent" ? "Sent" : state === "seen" ? "Seen" : state === "contacted" ? "Owner contacted you" : "Closed",
      createdAt: r.created_at,
      summary: bits.join(" · "),
      closedReason: r.closed_reason,
      canWithdraw: state === "sent",
      subject: {
        kind: r.listing_id ? "listing" : r.project_id ? "project" : "requirement",
        id: r.listing_id ?? r.project_id ?? r.requirement_id,
        title: snap.title ?? "—",
        subtitle: snap.subtitle ?? "",
        coverUrl: snap.coverUrl ?? null,
      },
      to: { id: r.owner_id, name: o.name ?? "HomzList user", role: o.role ?? null, photoUrl: o.photo_url ?? null },
      offer: ol
        ? { kind: "listing", id: ol.id, title: ol.title ?? "Property",
            subtitle: [ol.price_on_request ? "Price on request" : priceLabel(ol.price_paise), ol.area_label].filter(Boolean).join(" · "),
            coverUrl: ol.cover_url ?? null }
        : op
          ? { kind: "project", id: op.id, title: op.name ?? "Project", subtitle: "Project", coverUrl: op.cover_url ?? null }
          : null,
    };
  });
}

// ---- mutations -------------------------------------------------------------

const STAGE_FOR: Record<LeadStatus, string> = {
  new: "new", contacted: "contacted", converted: "converted", archived: "archived",
};

export async function setLeadStatus(id: string, ownerId: string, status: LeadStatus, note?: string | null): Promise<boolean> {
  const { data: cur } = await db().from("leads").select("notes").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (!cur) return false;
  const notes = note?.trim()
    ? [...(((cur as { notes: { text: string; at: string }[] }).notes) ?? []), { text: note.trim().slice(0, 500), at: new Date().toISOString() }]
    : undefined;
  const patch: Record<string, unknown> = {
    stage: STAGE_FOR[status],
    last_activity: `Moved to ${STATUS_LABEL[status]}`,
    last_activity_at: new Date().toISOString(),
  };
  if (notes) patch.notes = notes;
  const { data } = await db().from("leads").update(patch).eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  return Boolean(data);
}

/** Opening a lead marks it seen — that is what clears the nav badge. */
export async function markLeadSeen(id: string, ownerId: string): Promise<boolean> {
  const { data } = await db()
    .from("leads").update({ seen_at: new Date().toISOString() })
    .eq("id", id).eq("owner_id", ownerId).is("seen_at", null)
    .select("id").maybeSingle();
  return Boolean(data);
}

export async function markSubjectSeen(ownerId: string, kind: SubjectKind, subjectId: string): Promise<number> {
  const col = kind === "listing" ? "listing_id" : kind === "project" ? "project_id" : "requirement_id";
  const { data } = await db()
    .from("leads").update({ seen_at: new Date().toISOString() })
    .eq("owner_id", ownerId).eq(col, subjectId).is("seen_at", null)
    .select("id");
  return ((data ?? []) as unknown[]).length;
}

/**
 * The tap on Call / WhatsApp. This is the ONLY evidence the platform has that a
 * connection actually happened now that there are no messages, so it is
 * recorded server-side and it — not the owner's bookkeeping — is what moves a
 * lead out of New.
 */
export async function recordContact(id: string, actorId: string, channel: "call" | "whatsapp" | "profile"): Promise<boolean> {
  const { data: lead } = await db().from("leads").select("id,owner_id,stage").eq("id", id).maybeSingle();
  const row = lead as { id: string; owner_id: string; stage: string } | null;
  if (!row || row.owner_id !== actorId) return false;
  await db().from("lead_contact_events").insert({ lead_id: id, actor_id: actorId, channel });
  if (channel !== "profile" && statusOf(row.stage) === "new") {
    await db().from("leads").update({
      stage: "contacted",
      last_activity: channel === "call" ? "Called" : "Messaged on WhatsApp",
      last_activity_at: new Date().toISOString(),
    }).eq("id", id).eq("owner_id", actorId);
  }
  return true;
}

export async function markLeadNotRelevant(id: string, ownerId: string): Promise<boolean> {
  const { data } = await db().from("leads").update({ is_relevant: false }).eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  return Boolean(data);
}

export async function addLeadNote(id: string, ownerId: string, text: string): Promise<boolean> {
  const { data: cur } = await db().from("leads").select("notes").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (!cur || !text.trim()) return false;
  const notes = [...(((cur as { notes: { text: string; at: string }[] }).notes) ?? []), { text: text.trim().slice(0, 500), at: new Date().toISOString() }];
  const { data } = await db().from("leads").update({ notes }).eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  return Boolean(data);
}

/**
 * The sender pulling their inquiry back. It stops the receiver's list showing
 * it and closes the lead; it does NOT unshare a number that was already
 * delivered, and the UI says exactly that rather than implying a recall.
 */
export async function withdrawSent(id: string, senderId: string): Promise<boolean> {
  const { data: lead } = await db().from("leads").select("id,inquiry_id,proposal_id").eq("id", id).eq("lead_profile_id", senderId).maybeSingle();
  const row = lead as { id: string; inquiry_id: string | null } | null;
  if (!row) return false;
  await db().from("leads").update({
    is_relevant: false, closed_reason: "Withdrawn by sender", stage: "archived",
    last_activity: "Withdrawn by sender", last_activity_at: new Date().toISOString(),
  }).eq("id", id).eq("lead_profile_id", senderId);
  if (row.inquiry_id) await db().from("inquiries").update({ withdrawn_at: new Date().toISOString() }).eq("id", row.inquiry_id);
  return true;
}

/**
 * A subject stopped being actionable (sold, unpublished, expired, deleted).
 * Without this the sender's card sits on "Sent" forever — the dead-end the
 * chat-era proposals had, brought back through a different door.
 */
export async function closeLeadsForSubject(kind: SubjectKind, subjectId: string, reason: string): Promise<number> {
  const col = kind === "listing" ? "listing_id" : kind === "project" ? "project_id" : "requirement_id";
  const { data } = await db()
    .from("leads")
    .update({ closed_reason: reason, stage: "archived", last_activity: reason, last_activity_at: new Date().toISOString() })
    .eq(col, subjectId).in("stage", ["new", "contacted", "visit", "negotiation"])
    .select("id");
  return ((data ?? []) as unknown[]).length;
}

/** Unseen leads across every subject — the bottom-nav badge. */
export async function countUnseenLeads(ownerId: string): Promise<number> {
  const { count } = await db()
    .from("leads").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).eq("is_relevant", true).is("seen_at", null);
  return count ?? 0;
}

/** Profile stats strip (P9 S1) — same filter the Leads screen uses. */
export async function countProfileLeads(ownerId: string): Promise<number> {
  const { count } = await db()
    .from("leads").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).eq("is_relevant", true);
  return count ?? 0;
}

// ---- CSV export (Doc7 §105) ------------------------------------------------

export const CSV_FIELDS = ["name", "phone", "property", "source", "stage", "date", "last_activity"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

const CSV_HEADER: Record<CsvField, string> = {
  name: "Name", phone: "Phone", property: "Property", source: "Source", stage: "Stage", date: "Date", last_activity: "Last activity",
};

const SOURCE_LABEL: Record<string, string> = {
  inquiry: "Property lead", proposal: "Requirement proposal", project: "Project lead", visit: "Site visit",
};

export async function exportLeadsCsv(ownerId: string, fields: CsvField[]): Promise<string> {
  const cols = fields.length ? fields.filter((f) => CSV_FIELDS.includes(f)) : [...CSV_FIELDS];
  const { data } = await db()
    .from("leads").select("*").eq("owner_id", ownerId).eq("is_relevant", true)
    .order("last_activity_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const personIds = [...new Set(rows.map((r) => r.lead_profile_id))];
  const { data: profs } = personIds.length
    ? await db().from("profiles").select("id,name,phone").in("id", personIds)
    : { data: [] as unknown[] };
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

  const lines = [cols.map((c) => csvCell(CSV_HEADER[c])).join(",")];
  for (const r of rows) {
    const p: any = profMap.get(r.lead_profile_id) ?? {};
    const snap = (r.subject_snapshot ?? {}) as Record<string, string | null>;
    const cell: Record<CsvField, string> = {
      name: p.name ?? "",
      // The number actually shared for THIS lead, not whatever the profile says
      // today — the export is a record of the connection, not a live directory.
      phone: r.contact_number ?? p.phone ?? "",
      property: [snap.title, snap.subtitle].filter(Boolean).join(", "),
      source: SOURCE_LABEL[r.source] ?? SOURCE_LABEL.inquiry,
      stage: STATUS_LABEL[statusOf(r.stage)],
      date: new Date(r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
      last_activity: r.last_activity ?? "",
    };
    lines.push(cols.map((c) => csvCell(cell[c])).join(","));
  }
  return lines.join("\r\n");
}

function csvCell(v: string): string {
  // Formula-injection guard (Doc9): a cell a spreadsheet would treat as a
  // formula is neutralised so a lead's name like `=cmd|…` can't execute.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

// ---- shared formatting -----------------------------------------------------

export function priceLabel(paise: number | null): string {
  if (paise === null || paise === undefined) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(r)}`;
}

/** "3 BHK to buy in Kalawad Road" — requirements carry no title of their own. */
export function requirementTitle(r: { bhk?: number | null; kind?: string | null; area_label?: string | null }): string {
  const head = [r.bhk ? `${r.bhk} BHK` : "Property", r.kind === "rent" ? "on rent" : "to buy"].join(" ");
  return r.area_label ? `${head} in ${r.area_label}` : head;
}

function budgetLabel(min: number | null, max: number | null): string {
  if (min && max) return `${priceLabel(min)} – ${priceLabel(max)}`;
  if (max) return `Up to ${priceLabel(max)}`;
  if (min) return `From ${priceLabel(min)}`;
  return "Budget not set";
}

function listingState(status: string | null): string {
  switch (status) {
    case "live": return "Live";
    case "sold": return "Sold";
    case "rented": return "Rented";
    case "paused": return "Paused";
    case "expired": return "Expired";
    case "draft": return "Draft";
    default: return status ? status[0].toUpperCase() + status.slice(1) : "—";
  }
}

function requirementState(status: string | null, expiresAt: string | null): string {
  if (status === "active" && expiresAt) {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return "Expired";
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  return listingState(status);
}

function memberSince(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Today in IST as YYYY-MM-DD — "overdue" must not flip at UTC midnight. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
