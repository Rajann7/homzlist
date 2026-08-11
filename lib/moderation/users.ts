import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Block / report a USER, independent of any conversation.
 *
 * Both used to live in the chat module, which meant blocking existed only as a
 * property of a thread. With chat gone that would have left an owner no way to
 * stop a harasser re-inquiring — so the block is now a first-class relationship
 * (`user_blocks`) that the inquiry path checks in both directions.
 */

const db = () => createServiceClient();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function blockUserById(blockerId: string, targetId: string, reason?: string | null): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(targetId) || targetId === blockerId) return { ok: false };
  const { data: target } = await db().from("profiles").select("id").eq("id", targetId).maybeSingle();
  if (!target) return { ok: false };
  const { error } = await db().from("user_blocks").upsert(
    { blocker_id: blockerId, blocked_id: targetId, reason: reason?.slice(0, 200) ?? null },
    { onConflict: "blocker_id,blocked_id" },
  );
  return { ok: !error };
}

export async function unblockUserById(blockerId: string, targetId: string): Promise<{ ok: boolean }> {
  const { error } = await db().from("user_blocks").delete()
    .eq("blocker_id", blockerId).eq("blocked_id", targetId);
  return { ok: !error };
}

export async function listBlockedUsers(blockerId: string) {
  const { data } = await db()
    .from("user_blocks").select("blocked_id,created_at")
    .eq("blocker_id", blockerId).order("created_at", { ascending: false });
  const rows = (data ?? []) as { blocked_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: profs } = await db().from("profiles").select("id,name,role,photo_url").in("id", rows.map((r) => r.blocked_id));
  const map = new Map(((profs ?? []) as { id: string }[]).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...(map.get(r.blocked_id) as Record<string, unknown> ?? { id: r.blocked_id }), blockedAt: r.created_at }));
}

const USER_REPORT_REASONS = new Set(["spam", "fake", "abusive", "fraud", "impersonation", "other"]);

/** Report a user into the SAME admin queue every other report goes to. */
export async function reportUserById(
  reporterId: string, targetId: string, reason: string, note: string | null,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(targetId) || targetId === reporterId) return { ok: false };
  const safeReason = USER_REPORT_REASONS.has(reason) ? reason : "other";
  const { error } = await db().from("reports").insert({
    reporter_id: reporterId,
    subject_type: "user",
    subject_id: targetId,
    reason: safeReason,
    note: note?.trim().slice(0, 1000) || null,
  });
  // The unique (reporter, subject_type, subject_id) index makes a re-report a
  // no-op rather than a second queue item.
  return { ok: true, ...(error ? {} : {}) };
}
