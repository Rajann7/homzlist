import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { resumeBoostsForSubject, stopBoostsForSubject } from "@/lib/billing/boost";
import { notify } from "@/lib/notifications/service";
import { listingBrief, projectBrief, requirementBrief } from "@/lib/notifications/subjects";

/**
 * Moderation — the half of Module 4 that decides whether anything ever goes
 * live (Doc2 §5.4, Doc4 §31).
 *
 * Until this existed, `pending_review` was a trap: a seller paid, submitted,
 * and the row sat there forever because no code path could move it. The
 * columns were already in the schema since migration 0005 (`review_notes`,
 * `reject_count`, `is_locked`) and nothing had ever written one.
 *
 * Three decisions, and only three:
 *   approve          → live, timestamps set, notes cleared
 *   request_changes  → changes_requested + PER-FIELD notes the form can show
 *   reject           → rejected + reason; the THIRD reject locks the listing
 *
 * The 3-reject lock is the point of the counter: a seller who has been told
 * three times cannot keep re-submitting the same thing. A locked row can still
 * be read and appealed (appeals are P13-15) but not re-submitted.
 *
 * The admin DASHBOARD is P13-15. This is the state machine underneath it, so
 * the UI is a rendering job later rather than a rewrite.
 */

const db = () => createServiceClient();

export const MAX_REJECTS = 3;

export type ModerationAction = "approve" | "request_changes" | "reject";
export type ModerationSubject = "listing" | "requirement" | "project";

export interface ModerationInput {
  action: ModerationAction;
  /** request_changes only: {"photos": "too dark", "price": "looks off"}. */
  notes?: Record<string, string> | null;
  /** reject only. */
  reason?: string | null;
}

export type ModerationResult =
  | { ok: true; status: string; locked: boolean; rejectCount: number }
  | { ok: false; reason: "not_found" | "bad_state" | "locked" | "validation" };

/**
 * The moderating staff member, or null — server-only, table-driven.
 *
 * This is the gate for the Module 4/6/9 endpoints, which are driven by an
 * ORDINARY user session rather than the admin panel's isolated one. It has to
 * ask the same three questions `lib/admin/guard.ts` asks, or the panel's
 * guarantees stop at the panel door:
 *
 *   · `is_active` AND `state = 'active'` — the panel refuses a row that is
 *     merely pending or suspended; a row it refuses must not moderate here.
 *   · the LEVEL comes back with the answer, so a caller can require the same
 *     minimum the panel's screen does. Without it every one of these endpoints
 *     was open to `staff` level, including the ones the panel gates at `admin`.
 *
 * The name is returned too, because every decision taken through here now
 * writes an audit row and a trail with no actor is not a trail.
 */
export type StaffLevel = "staff" | "admin" | "super";
export const STAFF_RANK: Record<StaffLevel, number> = { staff: 1, admin: 2, super: 3 };

export type ModeratingStaff = { profileId: string; level: StaffLevel; name: string };

export async function staffIdentity(profileId: string): Promise<ModeratingStaff | null> {
  const { data } = await db()
    .from("staff")
    .select("profile_id, level, display_name")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .eq("state", "active")
    .maybeSingle();
  const level = data?.level;
  if (!data || (level !== "staff" && level !== "admin" && level !== "super")) return null;
  return { profileId: data.profile_id, level, name: data.display_name ?? "Staff" };
}

/** Is this profile allowed to moderate at all? */
export async function isStaff(profileId: string): Promise<boolean> {
  return (await staffIdentity(profileId)) !== null;
}

/** Which statuses a moderator may act on. Anything else is a no-op, not an error path. */
const REVIEWABLE = ["pending_review", "changes_requested"];

/** What the seller calls the thing, on their own Account status screen. */
const SUBJECT_WORD: Record<ModerationSubject, string> = {
  listing: "Listing",
  requirement: "Requirement",
  project: "Project",
};

const TABLE: Record<ModerationSubject, string> = {
  listing: "listings",
  requirement: "requirements",
  project: "projects",
};

/**
 * Apply a decision.
 *
 * Deliberately reads the row first and writes with the status still in the
 * WHERE clause, so two moderators hitting Approve at the same moment can't both
 * "win" — the second update matches nothing and reports bad_state.
 */
export async function moderate(
  subject: ModerationSubject,
  id: string,
  actorId: string,
  input: ModerationInput,
): Promise<ModerationResult> {
  const table = TABLE[subject];

  const { data: row } = await db()
    .from(table)
    .select("id,status,reject_count,is_locked,profile_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };

  const current = row as { id: string; status: string; reject_count: number | null; is_locked: boolean | null; profile_id: string };
  if (current.is_locked) return { ok: false, reason: "locked" };
  if (!REVIEWABLE.includes(current.status)) return { ok: false, reason: "bad_state" };

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let nextRejects = current.reject_count ?? 0;
  let locked = false;

  if (input.action === "approve") {
    patch = {
      status: "live",
      approved_at: now,
      live_at: now,
      // A previously-rejected item that is now approved must not keep showing
      // the old complaint.
      review_notes: null,
      reject_reason: null,
      // This IS the approval, so the content and the approval are back in sync.
      // From here a pause/hide/rented round-trip re-lives without a second pass
      // over identical content (migration 0050).
      edited_since_approval: false,
    };
  } else if (input.action === "request_changes") {
    const notes = input.notes ?? {};
    // "Changes requested" with nothing to change is a dead-end for the seller.
    if (!Object.keys(notes).length) return { ok: false, reason: "validation" };
    patch = { status: "changes_requested", review_notes: notes, reject_reason: null };
  } else {
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) return { ok: false, reason: "validation" };
    nextRejects = (current.reject_count ?? 0) + 1;
    locked = nextRejects >= MAX_REJECTS;
    patch = {
      status: "rejected",
      reject_reason: reason,
      reject_count: nextRejects,
      // Third strike: no further re-submissions (Doc2 §5.4).
      is_locked: locked,
      review_notes: null,
    };
  }

  const { data: updated } = await db()
    .from(table)
    .update(patch)
    .eq("id", id)
    .in("status", REVIEWABLE) // concurrency guard — see the doc comment above
    .select("id,status,reject_count,is_locked")
    .maybeSingle();
  if (!updated) return { ok: false, reason: "bad_state" };

  await db().from("moderation_log").insert({
    subject,
    subject_id: id,
    actor_id: actorId,
    action: input.action,
    notes: input.action === "request_changes" ? input.notes : null,
    reason: input.action === "reject" ? input.reason : null,
  });

  const u = updated as { status: string; reject_count: number | null; is_locked: boolean | null };

  /**
   * The seller's own record of it (Doc2 §11 — the P9 "Account status" screen).
   *
   * `moderation_log` is the ADMIN's audit trail, keyed by subject id; the
   * screen reads `moderation_events`, keyed by profile. Nothing has ever
   * written a row there for a rejection, so Account status answered "Your
   * listings are in good standing" to a broker with three rejects and a locked
   * listing — the screen has never shown a moderation action to anybody.
   * Approvals are not events: the screen lists what went WRONG.
   */
  if (input.action === "reject" || input.action === "request_changes") {
    const rejected = input.action === "reject";
    await db().from("moderation_events").insert({
      profile_id: current.profile_id,
      kind: rejected ? "rejection" : "warning",
      severity: rejected ? "error" : "warning",
      title: rejected
        ? `${SUBJECT_WORD[subject]} not approved${u.is_locked ? " · no further re-submissions" : ""}`
        : `Changes requested on your ${SUBJECT_WORD[subject].toLowerCase()}`,
      detail: rejected
        ? (input.reason ?? "").slice(0, 300)
        : Object.values(input.notes ?? {}).join(" · ").slice(0, 300) || null,
    });
  }

  // Back in the feed → resume any boost that was paused while it was hidden or
  // under review, so the buyer gets those days back (Doc2 §13 pause/resume).
  if (u.status === "live") await resumeBoostsForSubject(id);
  // Rejected outright → it will not be placed, so a boost on it cannot stand.
  // Pending-approval boosts are refunded by the same shared path.
  if (u.status === "rejected") await stopBoostsForSubject(id, "Not approved by moderation · boost stopped");

  // Doc2 §5.4: "Approve: live + … + NOTIFICATION". Until now a decision changed
  // a row and told nobody — the seller's listing went live, or was rejected,
  // and the only way to find out was to go and look. designs/P11 S7 has all
  // three rows; this is what writes them.
  await notifyModerationDecision(subject, id, current.profile_id, input, u.status, Boolean(u.is_locked));

  // A requirement going live is what brokers and builders in that city are
  // waiting for (Doc2 §14 "matching requirement"). Capped at 3/day each.
  if (subject === "requirement" && u.status === "live") {
    const { notifyMatchingRequirement } = await import("@/lib/notifications/jobs");
    await notifyMatchingRequirement(id);
  }

  return { ok: true, status: u.status, locked: Boolean(u.is_locked), rejectCount: u.reject_count ?? 0 };
}

/**
 * The moderation queue — oldest first, because review is FIFO.
 *
 * Ordered by `created_at`, which exists on all three tables. It used to order
 * by `submitted_at`, which projects don't have — so the projects queue errored
 * and silently returned nothing, and no project could ever be reviewed.
 */
export async function reviewQueue(subject: ModerationSubject, limit = 50) {
  const { data, error } = await db()
    .from(TABLE[subject])
    .select("*")
    .in("status", REVIEWABLE)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error; // fail loud rather than pretend the queue is empty
  return data ?? [];
}

/** Decision history for one item — what the appeals screen (P13-15) will read. */
export async function moderationHistory(subject: ModerationSubject, id: string) {
  const { data } = await db()
    .from("moderation_log")
    .select("action,notes,reason,created_at")
    .eq("subject", subject)
    .eq("subject_id", id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * The notification half of a decision (Doc2 §5.4 / §14, designs/P11 S7).
 *
 * Approvals GROUP: a moderator clearing a queue produces "10 listings approved
 * — tap to review", not ten rows (Doc2 §14 batch dedup). The group key is the
 * owner's daily approval bucket, and the count comes back from the atomic
 * upsert — a real count, never a client-side tally.
 */
/**
 * The three link shapes a decision needs, per SUBJECT.
 *
 * This function is shared by listings, projects and requirements, but the
 * notification types it uses are listing-shaped (`/listings/{listingId}`,
 * `/create/form?edit={listingId}`). Letting the template resolve meant an
 * approved REQUIREMENT linked to `/listings/<requirement id>` and an approved
 * PROJECT to `/listings/<project id>` — a real page showing the wrong thing,
 * or nothing. The href is therefore built from the subject, here, once.
 */
const ownerHref = (subject: ModerationSubject, id: string) =>
  subject === "project" ? `/projects/${id}`
  : subject === "requirement" ? `/requirements/${id}`
  : `/listings/${id}`;

const editHref = (subject: ModerationSubject, id: string) =>
  subject === "project" ? `/projects/new?edit=${id}`
  : subject === "requirement" ? `/requirements/new?edit=${id}`
  : `/create/form?edit=${id}`;

const listHref = (subject: ModerationSubject) =>
  subject === "requirement" ? "/requirements/mine" : "/listings";

async function notifyModerationDecision(
  subject: ModerationSubject,
  id: string,
  ownerId: string,
  input: ModerationInput,
  status: string,
  locked: boolean,
) {
  const brief =
    subject === "project" ? await projectBrief(id)
    : subject === "requirement" ? await requirementBrief(id)
    : await listingBrief(id);
  const noun = subject === "project" ? "project" : subject === "requirement" ? "requirement" : "listing";

  if (status === "live") {
    const res = await notify({
      profileId: ownerId,
      type: "listing_approved",
      title: `Your ${noun} **${brief.title}** is now live`,
      body: "It is visible in the feed and in search.",
      thumbUrl: brief.thumbUrl,
      groupKey: `approved:${subject}`,
      href: ownerHref(subject, id),
      entityKind: subject, entityId: id,
      // `title`/`area` also feed A20's "listing_approved_email" ({{title}},
      // {{area}}, {{name}}, {{link}}) and the "listing_live" push ({{title}});
      // {{name}} and {{link}} are supplied centrally by the dispatcher.
      data: { listingId: id, subject, title: brief.title, area: brief.area ?? "" },
    });
    if (res.grouped && res.groupCount > 1 && res.id) {
      await db().from("notifications")
        .update({ title: `**${res.groupCount} ${noun}s approved** — tap to review`, href: listHref(subject), thumb_url: null })
        .eq("id", res.id);
    }
    return;
  }

  if (status === "changes_requested") {
    // The per-field notes are what the seller has to act on, so the row says
    // what to change rather than "changes requested".
    const notes = Object.values(input.notes ?? {}).filter(Boolean).join(" · ").slice(0, 160);
    await notify({
      profileId: ownerId,
      type: "listing_changes_requested",
      title: `Changes requested on **${brief.title}**${notes ? ` — ${notes}` : ""}`,
      body: notes || "Open the listing to see what needs changing.",
      // "Edit listing" has to open the right FORM — the project and
      // requirement forms take ?edit= too, on their own routes.
      href: editHref(subject, id),
      entityKind: subject, entityId: id,
      // `title`/`notes` also feed A20's "listing_changes" email template
      // ({{title}}, {{notes}}, {{name}}, {{link}}).
      data: {
        listingId: id,
        subject,
        title: brief.title,
        notes: notes || "Open the listing to see what needs changing.",
      },
    });
    return;
  }

  if (status === "rejected") {
    const reason = (input.reason ?? "").trim().slice(0, 160);
    await notify({
      profileId: ownerId,
      type: "listing_rejected",
      title: `Your ${noun} was rejected — **${reason || "does not meet our guidelines"}**`,
      body: locked ? "This item is locked after three rejections. You can appeal." : "Fix the reason and re-submit.",
      href: ownerHref(subject, id),
      entityKind: subject, entityId: id,
      data: { listingId: id, subject, rejectReason: reason },
    });
  }
}
