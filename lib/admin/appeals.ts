import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { MAX_REJECTS } from "@/lib/listings/moderation";
import { ageLabel } from "./risk";
import { flagText, type FlaggedText } from "./textFlags";

/**
 * A8 — Appeals queue (Doc5 A8).
 *
 * Two genuinely different things, which is why the design gives them separate
 * tabs and separate buttons:
 *
 *   AUTO-FLAG APPEAL — the detector caught a bio and the user says it is a false
 *   positive. The content is withheld while it waits (migration 0106), so
 *   "Dismiss flag" restores it and "Uphold flag" leaves it withheld.
 *
 *   REJECT-LOCK REOPEN — a listing hit three rejections and locked (Doc2 §5.4).
 *   The only way out of that state is here: "Unlock & allow resubmit" clears
 *   `is_locked` and gives the poster one more try, or the lock stands.
 *
 * The second is the one that matters most: without it, three rejections is a
 * dead-end state a user can reach and never leave — the trap PROOF.md's question
 * 3 is about.
 */

export interface AppealPoster {
  id: string;
  name: string;
  initials: string;
  role: string | null;
}

export interface AutoFlagAppeal {
  id: string;
  kind: "auto_flag";
  poster: AppealPoster;
  appealedLabel: string;
  /** The user's own words, quoted in the design. */
  reason: string | null;
  /** The flagged bio with the offending span highlighted. */
  content: FlaggedText | null;
  flagReason: string | null;
  /** True while the bio is actually withheld from other people. */
  withheld: boolean;
  status: string;
  resolution: string | null;
}

export interface RejectLockAppeal {
  id: string;
  kind: "reject_lock";
  /** listing | requirement | project. */
  subject: string;
  subjectId: string;
  subjectTitle: string;
  subjectShortId: string;
  coverUrl: string | null;
  poster: AppealPoster;
  appealedLabel: string;
  reason: string | null;
  /** Every rejection, with its reason and who decided it. */
  history: Array<{ dateLabel: string; reason: string; by: string }>;
  rejectCount: number;
  maxRejects: number;
  isLocked: boolean;
  status: string;
  resolution: string | null;
  unlockedAt: string | null;
}

export type Appeal = AutoFlagAppeal | RejectLockAppeal;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function roleLabel(role: string | null): string | null {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : null;
}

/** Both tabs' counts, so the strip is never a guess. */
export async function appealCounts(): Promise<{ flag: number; reopen: number }> {
  const db = createServiceClient();
  const [flag, reopen] = await Promise.all([
    db.from("moderation_appeals").select("id", { count: "exact", head: true }).eq("status", "open").eq("subject", "auto_flag"),
    db.from("moderation_appeals").select("id", { count: "exact", head: true }).eq("status", "open").neq("subject", "auto_flag"),
  ]);
  return { flag: flag.count ?? 0, reopen: reopen.count ?? 0 };
}

async function posterOf(db: ReturnType<typeof createServiceClient>, ids: string[]) {
  const map = new Map<string, AppealPoster>();
  if (!ids.length) return map;
  const { data } = await db.from("profiles").select("id, name, role").in("id", ids);
  for (const p of (data ?? []) as Array<Record<string, unknown>>) {
    const name = (p.name as string) || "Unnamed";
    map.set(p.id as string, {
      id: p.id as string,
      name,
      initials: initialsOf(name),
      role: roleLabel((p.role as string) ?? null),
    });
  }
  return map;
}

export async function autoFlagAppeals(status = "open", limit = 50): Promise<AutoFlagAppeal[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_appeals")
    .select("id, subject_id, profile_id, reason, status, resolution, created_at")
    .eq("subject", "auto_flag")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => r.profile_id as string))];
  const [posters, { data: profiles }] = await Promise.all([
    posterOf(db, ids),
    db.from("profiles").select("id, bio, bio_flag_reason, bio_flag_outcome, bio_flagged_at").in("id", ids),
  ]);
  const bios = new Map(((profiles ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]));

  return Promise.all(
    rows.map(async (r) => {
      const p = bios.get(r.profile_id as string);
      const bio = (p?.bio as string) ?? null;
      return {
        id: r.id as string,
        kind: "auto_flag" as const,
        poster:
          posters.get(r.profile_id as string) ??
          { id: r.profile_id as string, name: "Unnamed", initials: "?", role: null },
        appealedLabel: ageLabel(r.created_at as string) ?? "—",
        reason: (r.reason as string) ?? null,
        // The reviewer has to see the exact text and what matched in it — the
        // whole question is whether the match is a false positive.
        content: bio ? await flagText(bio) : null,
        flagReason: (p?.bio_flag_reason as string) ?? null,
        withheld: Boolean(p?.bio_flagged_at) && p?.bio_flag_outcome !== "dismissed",
        status: r.status as string,
        resolution: (r.resolution as string) ?? null,
      };
    }),
  );
}

const TABLE: Record<string, string> = { listing: "listings", requirement: "requirements", project: "projects" };

export async function rejectLockAppeals(status = "open", limit = 50): Promise<RejectLockAppeal[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_appeals")
    .select("id, subject, subject_id, profile_id, reason, status, resolution, unlocked_at, created_at")
    .neq("subject", "auto_flag")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const posters = await posterOf(db, [...new Set(rows.map((r) => r.profile_id as string))]);

  return Promise.all(
    rows.map(async (r) => {
      const subject = r.subject as string;
      const subjectId = r.subject_id as string;
      const table = TABLE[subject] ?? "listings";

      const [{ data: item }, history] = await Promise.all([
        db
          .from(table)
          .select(table === "listings" ? "id, title, cover_url, reject_count, is_locked, status" : "id, area_label, reject_count, is_locked, status")
          .eq("id", subjectId)
          .maybeSingle(),
        rejectionHistory(subject, subjectId),
      ]);

      const it = (item ?? {}) as Record<string, unknown>;
      return {
        id: r.id as string,
        kind: "reject_lock" as const,
        subject,
        subjectId,
        subjectTitle: (it.title as string) || (it.area_label as string) || "(no longer available)",
        subjectShortId: subjectId.slice(0, 8),
        coverUrl: (it.cover_url as string) ?? null,
        poster:
          posters.get(r.profile_id as string) ??
          { id: r.profile_id as string, name: "Unnamed", initials: "?", role: null },
        appealedLabel: ageLabel(r.created_at as string) ?? "—",
        reason: (r.reason as string) ?? null,
        history,
        rejectCount: (it.reject_count as number) ?? 0,
        maxRejects: MAX_REJECTS,
        isLocked: Boolean(it.is_locked),
        status: r.status as string,
        resolution: (r.resolution as string) ?? null,
        unlockedAt: (r.unlocked_at as string) ?? null,
      };
    }),
  );
}

/** The design's rejection timeline: "5 Jan — Duplicate listing by Priya". */
async function rejectionHistory(subject: string, subjectId: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_log")
    .select("action, reason, created_at, actor_id")
    .eq("subject", subject)
    .eq("subject_id", subjectId)
    .eq("action", "reject")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id as string).filter(Boolean))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: staff } = await db.from("staff").select("profile_id, display_name, email").in("profile_id", actorIds);
    for (const s of (staff ?? []) as Array<Record<string, unknown>>) {
      names.set(s.profile_id as string, (s.display_name as string) || (s.email as string) || "an admin");
    }
  }

  return rows.map((r) => ({
    dateLabel: new Date(r.created_at as string).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }),
    reason: (r.reason as string) ?? "No reason recorded",
    by: names.get(r.actor_id as string) ?? "an admin",
  }));
}
