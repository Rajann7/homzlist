import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { istToday, priceLabel, requirementTitle } from "@/lib/leads/service";
import { isNumberVerified } from "./numbers";

/**
 * Sending an inquiry — the whole connection, in one write.
 *
 * There is no composer, no accept/decline and no number request. The sender
 * answers three questions (what / how / when), consents to their contact
 * details being shared, and the receiver gets a lead they can act on
 * immediately with Call or WhatsApp.
 *
 * The option chips are NOT hardcoded here or in any component: they are rows in
 * `inquiry_options`, and this module validates a submission against the same
 * rows the sheet rendered from.
 */

const db = () => createServiceClient();

/**
 * How long before the SAME inquiry may be re-sent to the same subject. One
 * live inquiry per (sender, subject) is a unique index; this is the wall on
 * re-opening it, which is what actually re-notifies the receiver.
 */
export const RESEND_COOLDOWN_MS = 6 * 3600_000;

/** Bumped whenever the consent wording changes; stored on every inquiry. */
export const CONSENT_VERSION = "connect-1";

export type SubjectKind = "listing" | "project" | "requirement";

export interface InquiryOption { code: string; label: string }
export interface InquiryOptions {
  wants: InquiryOption[];
  when: InquiryOption[];
  offers: InquiryOption[];
  consentVersion: string;
  consentText: string;
}

export const CONSENT_TEXT = "I agree to share my contact details for this connection.";

/**
 * The chips, from the database, filtered to the subject they are offered on.
 * A component that ships its own array is the thing `inquiry_options` exists to
 * prevent (CLAUDE.md §7) — admin changes wording without a deploy.
 */
export async function listInquiryOptions(kind: SubjectKind): Promise<InquiryOptions> {
  const { data } = await db()
    .from("inquiry_options")
    .select("kind,code,label,applies_to,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rows = ((data ?? []) as { kind: string; code: string; label: string; applies_to: string[] }[])
    .filter((r) => r.applies_to.includes(kind));
  const of = (k: string) => rows.filter((r) => r.kind === k).map((r) => ({ code: r.code, label: r.label }));
  return { wants: of("want"), when: of("when"), offers: of("offer"), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT };
}

export interface ExistingInquiry {
  id: string;
  leadId: string | null;
  sentAt: string;
  wants: { code: string; label: string }[];
  contactPref: "call" | "whatsapp";
  contactNumber: string | null;
  whenLabel: string | null;
  preferredOn: string | null;
  /** The sender pulled it back — they may send a fresh one. */
  withdrawn: boolean;
}

/**
 * Has this person already connected on this subject?
 *
 * The sheet asks before it draws: offering the same three steps a second time
 * silently overwrites the inquiry they already sent, which is exactly what a
 * double send looks like from the outside.
 */
export async function existingInquiry(
  senderId: string,
  kind: "listing" | "project",
  subjectId: string,
): Promise<ExistingInquiry | null> {
  const col = kind === "listing" ? "listing_id" : "project_id";
  const { data } = await db()
    .from("inquiries")
    .select("id,wants,contact_pref,contact_number,when_token,preferred_on,created_at,updated_at,withdrawn_at")
    .eq("profile_id", senderId)
    .eq(col, subjectId)
    .maybeSingle();
  const row = data as Record<string, any> | null;
  if (!row) return null;

  const [{ data: opts }, { data: lead }] = await Promise.all([
    db().from("inquiry_options").select("code,label"),
    db().from("leads").select("id").eq("inquiry_id", row.id).maybeSingle(),
  ]);
  const labelOf = new Map<string, string>(((opts ?? []) as { code: string; label: string }[]).map((o) => [o.code, o.label]));

  return {
    id: row.id,
    leadId: (lead as { id: string } | null)?.id ?? null,
    sentAt: row.updated_at ?? row.created_at,
    wants: ((row.wants ?? []) as string[]).map((c) => ({ code: c, label: labelOf.get(c) ?? c })),
    contactPref: row.contact_pref === "whatsapp" ? "whatsapp" : "call",
    contactNumber: row.contact_number ?? null,
    whenLabel: row.when_token ? labelOf.get(row.when_token) ?? row.when_token : null,
    preferredOn: row.preferred_on,
    withdrawn: Boolean(row.withdrawn_at),
  };
}

export interface SendInquiryInput {
  kind: "listing" | "project";
  subjectId: string;
  wants: string[];
  contactPref: "call" | "whatsapp";
  /** E.164, only when the sender chose a number other than their profile's. */
  contactNumber?: string | null;
  whenToken: string;
  /** Required when whenToken === 'date'. */
  preferredDate?: string | null;
  consent: boolean;
  idempotencyKey?: string | null;
  ip?: string | null;
}

export type SendInquiryResult =
  | { ok: true; leadId: string; alreadySent: boolean }
  | { ok: false; reason: "self" | "not_found" | "blocked" | "role" | "consent" | "invalid" | "number_unverified" | "cooldown" };

/**
 * A builder can only ever connect on a REQUIREMENT (Doc2 role rules): they sell
 * their own projects, so an inquiry from a builder on someone else's property
 * or project is not a thing the product allows. The button is not rendered for
 * them either — this is the wall behind the button, not instead of it.
 */
export function mayInquire(role: string | null, kind: SubjectKind): boolean {
  if (role === "builder") return kind === "requirement";
  return true;
}

export async function sendInquiry(senderId: string, input: SendInquiryInput): Promise<SendInquiryResult> {
  if (!input.consent) return { ok: false, reason: "consent" };

  const [{ data: me }, options] = await Promise.all([
    db().from("profiles").select("id,name,phone,role,state").eq("id", senderId).maybeSingle(),
    listInquiryOptions(input.kind),
  ]);
  const sender = me as { id: string; name: string | null; phone: string | null; role: string | null; state: string } | null;
  if (!sender || sender.state !== "active") return { ok: false, reason: "not_found" };
  if (!mayInquire(sender.role, input.kind)) return { ok: false, reason: "role" };

  // Validate every submitted code against the rows the sheet was built from.
  const wantCodes = new Set(options.wants.map((o) => o.code));
  const wants = [...new Set(input.wants)].filter((w) => wantCodes.has(w)).slice(0, 10);
  if (!wants.length) return { ok: false, reason: "invalid" };
  if (!options.when.some((o) => o.code === input.whenToken)) return { ok: false, reason: "invalid" };
  if (input.contactPref !== "call" && input.contactPref !== "whatsapp") return { ok: false, reason: "invalid" };

  // The number that will actually be shared. A custom one must have a LIVE
  // verification (7-day window) — the server never takes the client's word.
  let contactNumber = sender.phone ?? null;
  let customVerified = false;
  if (input.contactNumber && input.contactNumber !== sender.phone) {
    if (!(await isNumberVerified(senderId, input.contactNumber))) return { ok: false, reason: "number_unverified" };
    contactNumber = input.contactNumber;
    customVerified = true;
  }
  if (!contactNumber) return { ok: false, reason: "invalid" };

  const preferredOn = resolvePreferredDate(input.whenToken, input.preferredDate ?? null);
  if (input.whenToken === "date" && !preferredOn) return { ok: false, reason: "invalid" };

  // ---- the subject ---------------------------------------------------------
  const subject = input.kind === "listing"
    ? await loadListing(input.subjectId)
    : await loadProject(input.subjectId);
  if (!subject) return { ok: false, reason: "not_found" };
  if (subject.ownerId === senderId) return { ok: false, reason: "self" };

  // A block in either direction closes the channel. The caller turns this into
  // a generic response so it can't be used to detect a block.
  if (await blockedBetween(senderId, subject.ownerId)) return { ok: false, reason: "blocked" };

  // ---- write ---------------------------------------------------------------
  const col = input.kind === "listing" ? "listing_id" : "project_id";
  const now = new Date().toISOString();
  const row = {
    profile_id: senderId,
    [col]: input.subjectId,
    poster_id: subject.ownerId,
    message: "",
    wants,
    contact_pref: input.contactPref,
    contact_number: contactNumber,
    contact_number_verified: customVerified,
    when_token: input.whenToken,
    preferred_on: preferredOn,
    consent_version: CONSENT_VERSION,
    consent_at: now,
    consent_ip: input.ip ?? null,
    subject_snapshot: subject.snapshot,
    idempotency_key: input.idempotencyKey ?? null,
    withdrawn_at: null,
    status: "sent" as const,
  };

  const { data: existing } = await db()
    .from("inquiries").select("id,updated_at").eq("profile_id", senderId).eq(col, input.subjectId).maybeSingle();

  let inquiryId: string;
  let alreadySent = false;
  if (existing) {
    const prior = existing as { id: string; updated_at: string | null };
    // Re-sending the same inquiry re-notifies the owner and puts the lead back
    // on unread. Without a wall that is a free way to poke somebody every few
    // seconds, so a repeat inside the cooldown is refused rather than throttled
    // silently (the sheet shows the already-sent state instead).
    if (prior.updated_at && Date.now() - new Date(prior.updated_at).getTime() < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown" };
    }
    inquiryId = prior.id;
    alreadySent = true;
    await db().from("inquiries").update(row).eq("id", inquiryId);
  } else {
    const { data: created, error } = await db().from("inquiries").insert(row).select("id").single();
    if (error || !created) {
      // Idempotency key collision = the same tap arriving twice. Return the
      // row the first one wrote instead of failing the user's second finger.
      const { data: dup } = await db()
        .from("inquiries").select("id").eq("profile_id", senderId).eq(col, input.subjectId).maybeSingle();
      if (!dup) return { ok: false, reason: "invalid" };
      inquiryId = (dup as { id: string }).id;
      alreadySent = true;
    } else {
      inquiryId = (created as { id: string }).id;
    }
  }

  // ---- the lead the receiver works from ------------------------------------
  const leadPatch = {
    owner_id: subject.ownerId,
    lead_profile_id: senderId,
    [col]: input.subjectId,
    inquiry_id: inquiryId,
    source: input.kind === "project" ? "project" : "inquiry",
    wants,
    contact_pref: input.contactPref,
    contact_number: contactNumber,
    when_token: input.whenToken,
    preferred_on: preferredOn,
    subject_snapshot: subject.snapshot,
    is_relevant: true,
    closed_reason: null,
    last_activity: alreadySent ? "Inquiry updated" : "New inquiry",
    last_activity_at: now,
  };

  const { data: leadRow } = await db()
    .from("leads").select("id,stage").eq("owner_id", subject.ownerId)
    .eq("lead_profile_id", senderId).eq(col, input.subjectId).maybeSingle();

  let leadId: string;
  if (leadRow) {
    leadId = (leadRow as { id: string }).id;
    // A re-send makes it unread again — it IS new information for the owner.
    await db().from("leads").update({ ...leadPatch, seen_at: null }).eq("id", leadId);
  } else {
    const { data: made } = await db().from("leads").insert({ ...leadPatch, stage: "new" }).select("id").single();
    leadId = (made as { id: string } | null)?.id ?? "";
  }

  await notify({
    profileId: subject.ownerId,
    type: "inquiry_received",
    title: `${sender.name ?? "Someone"} is interested`,
    body: [wants.map((w) => options.wants.find((o) => o.code === w)?.label ?? w).join(", "),
           input.contactPref === "call" ? "Call" : "WhatsApp",
           options.when.find((o) => o.code === input.whenToken)?.label].filter(Boolean).join(" · "),
    actorId: senderId,
    // Digest rather than nine pushes in an hour: same owner + same subject
    // inside the type's window collapses into one row.
    groupKey: `lead:${subject.ownerId}:${input.subjectId}`,
    href: `/leads/${input.kind}/${input.subjectId}`,
    entityKind: "lead",
    entityId: leadId,
    thumbUrl: (subject.snapshot.coverUrl as string | null) ?? null,
  });

  return { ok: true, leadId, alreadySent };
}

// ---- helpers ---------------------------------------------------------------

interface SubjectInfo { ownerId: string; snapshot: Record<string, unknown> }

/** BHK lives in the attributes jsonb, not in a column. */
function bhkOf(l: { attributes?: Record<string, unknown> | null }): string | null {
  const v = l.attributes?.bhk;
  return v === null || v === undefined || v === "" ? null : `${v} BHK`;
}

async function loadListing(id: string): Promise<SubjectInfo | null> {
  const { data } = await db()
    .from("listings")
    .select("id,profile_id,status,title,attributes,price_paise,price_on_request,area_label,cover_url")
    .eq("id", id).maybeSingle();
  const l = data as any;
  if (!l || l.status !== "live") return null;
  return {
    ownerId: l.profile_id,
    snapshot: {
      kind: "listing",
      title: l.title || [bhkOf(l), l.area_label].filter(Boolean).join(" · ") || "Property",
      subtitle: [l.price_on_request ? "Price on request" : priceLabel(l.price_paise), l.area_label].filter(Boolean).join(" · "),
      coverUrl: l.cover_url ?? null,
      at: new Date().toISOString(),
    },
  };
}

async function loadProject(id: string): Promise<SubjectInfo | null> {
  const { data } = await db()
    .from("projects").select("id,profile_id,status,name,area_label,cover_url").eq("id", id).maybeSingle();
  const p = data as any;
  if (!p || p.status !== "live") return null;
  return {
    ownerId: p.profile_id,
    snapshot: {
      kind: "project",
      title: p.name ?? "Project",
      subtitle: p.area_label ?? "Project",
      coverUrl: p.cover_url ?? null,
      at: new Date().toISOString(),
    },
  };
}

export async function loadRequirementSnapshot(id: string): Promise<SubjectInfo | null> {
  const { data } = await db()
    .from("requirements")
    .select("id,profile_id,status,kind,bhk,area_label,budget_min_paise,budget_max_paise")
    .eq("id", id).maybeSingle();
  const r = data as any;
  if (!r) return null;
  const budget = r.budget_min_paise && r.budget_max_paise
    ? `${priceLabel(r.budget_min_paise)} – ${priceLabel(r.budget_max_paise)}`
    : r.budget_max_paise ? `Up to ${priceLabel(r.budget_max_paise)}` : "";
  return {
    ownerId: r.profile_id,
    snapshot: {
      kind: "requirement",
      title: requirementTitle(r),
      subtitle: budget,
      coverUrl: null,
      at: new Date().toISOString(),
    },
  };
}

/** Directional block, checked both ways. */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  const { data } = await db()
    .from("user_blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`);
  return ((data as unknown[]) ?? []).length > 0;
}

/**
 * "Tomorrow" is resolved to a real date at insert time, in IST. Storing only
 * the token means a lead read three days later claims a contact time that has
 * already passed — and nothing can compute "overdue".
 */
export function resolvePreferredDate(token: string, explicit: string | null): string | null {
  const today = istToday();
  if (token === "today") return today;
  if (token === "tomorrow") return addDays(today, 1);
  if (token === "date") {
    if (!explicit || !/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return null;
    // No back-dating, and no bookings a year out.
    if (explicit < today || explicit > addDays(today, 90)) return null;
    return explicit;
  }
  return null; // 'anytime' has no date by design
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
