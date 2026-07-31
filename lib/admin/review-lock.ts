import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdminIdentity } from "./guard";

/**
 * "Priya Shah is reviewing this listing (started 3 min ago)" — template 693-696.
 *
 * Two admins working the same queue at 9am will open the same top item. The
 * lock is what stops the second one from spending five minutes on a listing the
 * first one is about to approve, and what makes the design's greyed-out row and
 * "Skip to next" mean something.
 *
 * It is advisory, deliberately: the DECISION endpoints do not require the lock.
 * A lock that could block an approval would turn a crashed browser into a
 * listing nobody can ever action, and the moderation layer already refuses a
 * second decision on an item that has left `pending_review`. So the lock
 * prevents wasted work, and the state machine prevents double decisions —
 * neither is asked to do the other's job.
 */

export type ReviewSubject = "listing" | "requirement" | "project";

export type LockState = {
  /** true when THIS admin holds it */
  mine: boolean;
  holderId: string | null;
  holderName: string | null;
  /** "3 min ago" — how long the holder has had it */
  since: string | null;
  expiresAt: string | null;
};

/** Long enough to read a listing properly, short enough that a closed tab frees it. */
const TTL_SECONDS = 600;

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

export async function claimReviewLock(
  subject: ReviewSubject,
  subjectId: string,
  me: AdminIdentity,
): Promise<LockState> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("hz_claim_review_lock", {
    p_subject_type: subject,
    p_subject_id: subjectId,
    p_staff_id: me.id,
    p_ttl_seconds: TTL_SECONDS,
  });
  if (error) throw new Error(`claim review lock: ${error.message}`);

  const row = (data ?? [])[0] as
    | { locked_by: string; locked_at: string; expires_at: string; is_mine: boolean }
    | undefined;
  if (!row) return { mine: true, holderId: me.id, holderName: me.name, since: null, expiresAt: null };

  if (row.is_mine) {
    return {
      mine: true,
      holderId: me.id,
      holderName: me.name,
      since: agoLabel(row.locked_at),
      expiresAt: row.expires_at,
    };
  }

  const { data: holder } = await db
    .from("staff")
    .select("display_name, email")
    .eq("profile_id", row.locked_by)
    .maybeSingle();

  return {
    mine: false,
    holderId: row.locked_by,
    holderName: holder?.display_name ?? holder?.email ?? "Another admin",
    since: agoLabel(row.locked_at),
    expiresAt: row.expires_at,
  };
}

/** Called when the review screen closes, and after every decision. */
export async function releaseReviewLock(
  subject: ReviewSubject,
  subjectId: string,
  me: AdminIdentity,
): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("hz_release_review_lock", {
    p_subject_type: subject,
    p_subject_id: subjectId,
    p_staff_id: me.id,
  });
  if (error) throw new Error(`release review lock: ${error.message}`);
  return data === true;
}
