import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Chat retention (Doc2 §10, Doc9 §26 — data minimisation).
 *
 * Two dormant-data sweeps, both server-only and idempotent:
 *   1. 12-MONTH PURGE — a conversation with no message in 12 months is deleted
 *      (cascade drops its messages / participants / number_requests). Real-estate
 *      chats that have been silent a full year are dead leads, not records worth
 *      keeping indefinitely.
 *   2. TOMBSTONE PURGE — messages that were "deleted for everyone" more than 30
 *      days ago are hard-removed. The tombstone existed only so admin could
 *      inspect a reported message during its live window; past that it is noise.
 *
 * Auto-unarchive on a new message is handled in the send path, not here.
 *
 * Run by POST/GET /api/v1/cron/chat behind CRON_SECRET (never open).
 */

const db = () => createServiceClient();

const DORMANT_DAYS = 365;
const TOMBSTONE_DAYS = 30;
const AUTO_ARCHIVE_DAYS = 30;

export interface ChatRetentionReport {
  autoArchived: number;
  dormantThreadsPurged: number;
  tombstonesPurged: number;
  ranAt: string;
}

export async function runChatRetention(): Promise<ChatRetentionReport> {
  const now = Date.now();
  const dormantCutoff = new Date(now - DORMANT_DAYS * 86_400_000).toISOString();
  const tombstoneCutoff = new Date(now - TOMBSTONE_DAYS * 86_400_000).toISOString();
  const archiveCutoff = new Date(now - AUTO_ARCHIVE_DAYS * 86_400_000).toISOString();

  // 0. AUTO-ARCHIVE — a thread silent for 30 days is archived for both sides
  //    (Doc2 §10.2; the Archived screen's note promises this). A new message
  //    auto-unarchives it in the send path, so this only touches dormant chats.
  const { data: stale } = await db()
    .from("chat_threads")
    .select("id")
    .lt("last_message_at", archiveCutoff)
    .gte("last_message_at", dormantCutoff); // not the ones about to be purged
  const staleIds = (stale as { id: string }[] ?? []).map((t) => t.id);
  let autoArchived = 0;
  if (staleIds.length) {
    const { count } = await db()
      .from("thread_participants")
      .update({ archived: true }, { count: "exact" })
      .in("thread_id", staleIds)
      .eq("archived", false);
    autoArchived = count ?? 0;
  }

  // 1. Dormant threads → delete (cascade). Select ids first so we can report a count.
  const { data: dormant } = await db()
    .from("chat_threads")
    .select("id")
    .lt("last_message_at", dormantCutoff);
  const dormantIds = (dormant as { id: string }[] ?? []).map((t) => t.id);
  if (dormantIds.length) {
    await db().from("chat_threads").delete().in("id", dormantIds);
  }

  // 2. Old delete-for-everyone tombstones → hard delete (skip any in a thread we
  //    just purged; those are already gone via cascade).
  const { data: tombstones } = await db()
    .from("chat_messages")
    .select("id")
    .eq("deleted_all", true)
    .lt("created_at", tombstoneCutoff);
  const tombstoneIds = (tombstones as { id: string }[] ?? []).map((m) => m.id);
  if (tombstoneIds.length) {
    await db().from("chat_messages").delete().in("id", tombstoneIds);
  }

  return {
    autoArchived,
    dormantThreadsPurged: dormantIds.length,
    tombstonesPurged: tombstoneIds.length,
    ranAt: new Date(now).toISOString(),
  };
}
