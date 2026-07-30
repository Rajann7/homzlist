import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The job that makes the 30-day grace period real (P12 S6).
 *
 * Without this, "your account will be deleted on 12 Feb" is a promise with
 * nothing behind it — the state would sit in `scheduled` forever. It runs on the
 * daily cron and is idempotent: a second run finds nothing left to do.
 *
 * What deletion means here, per Doc10 §6:
 *   • profile → state 'deleted', identity fields cleared, phone replaced with a
 *     one-way tag so the number can be re-registered later by its real owner;
 *   • content → soft-deleted (listings/requirements already carry deleted_at,
 *     and the existing purge path removes their photos from R2);
 *   • payments/invoices → KEPT, de-linked from identity. Tax law requires 7
 *     years, so these rows outlive the account by design, not by accident;
 *   • sessions and push tokens → revoked, so the account cannot come back.
 */
export interface PurgeResult {
  due: number;
  purged: number;
  listings: number;
  requirements: number;
  failures: Array<{ profileId: string; error: string }>;
}

export async function purgeScheduledDeletions(now = new Date()): Promise<PurgeResult> {
  const db = createServiceClient();
  const result: PurgeResult = { due: 0, purged: 0, listings: 0, requirements: 0, failures: [] };

  const { data: due } = await db
    .from("account_actions")
    .select("id, profile_id")
    .eq("kind", "delete")
    .eq("status", "scheduled")
    .lte("purge_at", now.toISOString());

  result.due = due?.length ?? 0;

  for (const row of due ?? []) {
    const profileId = row.profile_id as string;
    try {
      const stamp = now.toISOString();

      const { count: listings } = await db
        .from("listings")
        .update({ status: "deleted", deleted_at: stamp }, { count: "exact" })
        .eq("profile_id", profileId)
        .neq("status", "deleted");
      result.listings += listings ?? 0;

      const { count: reqs } = await db
        .from("requirements")
        .update({ status: "deleted", is_active: false }, { count: "exact" })
        .eq("profile_id", profileId)
        .neq("status", "deleted");
      result.requirements += reqs ?? 0;

      // Identity out, row kept: foreign keys from payments/invoices/audit rows
      // must not break, and the phone must be freeable for its real owner.
      await db
        .from("profiles")
        .update({
          state: "deleted",
          name: "Deleted account",
          username: null,
          email: null,
          bio: null,
          photo_url: null,
          company_logo_url: null,
          office_address: null,
          phone: `deleted:${profileId}`,
        })
        .eq("id", profileId);

      await db.from("push_tokens").delete().eq("profile_id", profileId);

      await db.from("account_actions")
        .update({ status: "done", done_at: stamp })
        .eq("id", row.id as string);

      result.purged += 1;
    } catch (e) {
      result.failures.push({ profileId, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return result;
}

/** Drop export payloads whose 48-hour link has lapsed — they are personal data. */
export async function purgeExpiredExports(now = new Date()): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("data_export_requests")
    .update({ status: "expired", payload: null }, { count: "exact" })
    .in("status", ["ready", "preparing"])
    .lt("expires_at", now.toISOString());
  return count ?? 0;
}
