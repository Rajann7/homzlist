import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { CurrentStaff } from "./auth";

/**
 * Review locks (Doc3 §1.4: item lock — "X is reviewing" + auto-skip for others).
 *
 * Two admins clearing the same night queue must not both approve #4521, and the
 * second one must find out BEFORE they have read the whole listing — which is
 * why A3 dims the row and disables its checkbox, and A4 renders read-only with
 * "Priya Shah is reviewing this listing (started 3 min ago) · Skip to next".
 *
 * A lock expires rather than being held forever: an admin who closes the tab
 * must not freeze an item until someone notices. The TTL is refreshed while the
 * panel is open, so a lock only dies when the reviewer really has gone.
 */

const LOCK_TTL_MIN = 10;

export interface Lock {
  subjectType: string;
  subjectId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: string;
  expiresAt: string;
  /** True when the lock belongs to the admin asking. */
  mine: boolean;
}

const expiry = () => new Date(Date.now() + LOCK_TTL_MIN * 60_000).toISOString();

/**
 * Take the lock, or report who already holds it. Expired locks are treated as
 * absent and overwritten — that is what makes the TTL real.
 */
export async function acquireLock(
  subjectType: string,
  subjectId: string,
  staff: CurrentStaff,
): Promise<{ ok: true; lock: Lock } | { ok: false; heldBy: Lock }> {
  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("review_locks")
    .select("subject_type, subject_id, locked_by, locked_at, expires_at")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (existing && existing.locked_by !== staff.id && (existing.expires_at as string) > now) {
    return { ok: false, heldBy: await hydrate(existing as Record<string, unknown>, staff.id) };
  }

  const row = {
    subject_type: subjectType,
    subject_id: subjectId,
    locked_by: staff.id,
    locked_at: existing?.locked_by === staff.id ? existing.locked_at : now,
    expires_at: expiry(),
  };
  await db.from("review_locks").upsert(row, { onConflict: "subject_type,subject_id" });

  return { ok: true, lock: await hydrate(row, staff.id) };
}

export async function releaseLock(subjectType: string, subjectId: string, staffId: string): Promise<void> {
  const db = createServiceClient();
  // Only the holder may release — otherwise "skip to next" would steal a lock.
  await db
    .from("review_locks")
    .delete()
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("locked_by", staffId);
}

/** Live locks for a page of queue rows, in one query. */
export async function locksFor(subjectType: string, ids: string[], staffId: string): Promise<Map<string, Lock>> {
  const out = new Map<string, Lock>();
  if (!ids.length) return out;

  const db = createServiceClient();
  const { data } = await db
    .from("review_locks")
    .select("subject_type, subject_id, locked_by, locked_at, expires_at")
    .eq("subject_type", subjectType)
    .in("subject_id", ids)
    .gt("expires_at", new Date().toISOString());

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const names = await nameMap(rows.map((r) => r.locked_by as string));

  for (const r of rows) {
    out.set(r.subject_id as string, {
      subjectType: r.subject_type as string,
      subjectId: r.subject_id as string,
      lockedBy: r.locked_by as string,
      lockedByName: names.get(r.locked_by as string) ?? "Another admin",
      lockedAt: r.locked_at as string,
      expiresAt: r.expires_at as string,
      mine: r.locked_by === staffId,
    });
  }
  return out;
}

async function hydrate(row: Record<string, unknown>, staffId: string): Promise<Lock> {
  const names = await nameMap([row.locked_by as string]);
  return {
    subjectType: row.subject_type as string,
    subjectId: row.subject_id as string,
    lockedBy: row.locked_by as string,
    lockedByName: names.get(row.locked_by as string) ?? "Another admin",
    lockedAt: row.locked_at as string,
    expiresAt: row.expires_at as string,
    mine: row.locked_by === staffId,
  };
}

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;

  const db = createServiceClient();
  const { data } = await db.from("staff").select("profile_id, display_name, email").in("profile_id", unique);
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(r.profile_id as string, (r.display_name as string) || (r.email as string) || "Another admin");
  }
  return out;
}

/** "started 3 min ago" — A4's lock banner wording. */
export function lockAgeLabel(lockedAt: string): string {
  const mins = Math.max(1, Math.floor((Date.now() - new Date(lockedAt).getTime()) / 60_000));
  if (mins < 60) return `started ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `started ${hours}h ago`;
}
