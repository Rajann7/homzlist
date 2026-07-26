import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { resumeBoostsForSubject, stopBoostsForSubject } from "@/lib/billing/boost";

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

/** Is this profile allowed to moderate? Server-only, table-driven. */
export async function isStaff(profileId: string): Promise<boolean> {
  const { data } = await db()
    .from("staff")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

/** Which statuses a moderator may act on. Anything else is a no-op, not an error path. */
const REVIEWABLE = ["pending_review", "changes_requested"];

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
    .select("id,status,reject_count,is_locked")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };

  const current = row as { id: string; status: string; reject_count: number | null; is_locked: boolean | null };
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

  // Back in the feed → resume any boost that was paused while it was hidden or
  // under review, so the buyer gets those days back (Doc2 §13 pause/resume).
  if (u.status === "live") await resumeBoostsForSubject(id);
  // Rejected outright → it will not be placed, so a boost on it cannot stand.
  // Pending-approval boosts are refunded by the same shared path.
  if (u.status === "rejected") await stopBoostsForSubject(id, "Not approved by moderation · boost stopped");

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
