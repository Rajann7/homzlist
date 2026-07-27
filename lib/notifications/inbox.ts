import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/listings/matching";
import { loadTypes, loadCategories, type NotificationAction } from "./catalog";

/**
 * The notifications SCREEN's read + mutation side (designs/P11 S7, Doc4 §61).
 *
 * Everything the screen shows is a query: the group a row falls in
 * (Today / This week / Earlier), the chip counts, the unread dot, the lead
 * avatar-or-icon, the inline action buttons and the deep link. No count is
 * computed in the browser and no option list is hardcoded in the component.
 *
 * Row TEXT carries `**bold**` markers rather than HTML. The design bolds parts
 * of the sentence ("<b>Nirav Shah</b> sent an inquiry…"); shipping HTML from
 * the server into a row would be a stored-XSS hole, so the client splits on the
 * markers and renders <b> itself.
 */

const db = () => createServiceClient();

export type GroupKey = "today" | "week" | "earlier";

export interface NotificationRow {
  id: string;
  type: string;
  category: string;
  /** Row text with **bold** markers — see the note above. */
  text: string;
  timeLabel: string;
  unread: boolean;
  group: GroupKey;
  groupCount: number;
  href: string | null;
  thumbUrl: string | null;
  lead:
    | { kind: "avatar"; name: string; photo: string | null }
    | { kind: "icon"; icon: string; tone: string };
  actions: NotificationAction[];
  actionTaken: string | null;
  /** Server-written resolution line that REPLACES the row text once acted on. */
  actionResult: string | null;
  createdAt: string;
}

export interface InboxChip {
  key: string;
  label: string;
  count: number | null;
}

export interface Inbox {
  rows: NotificationRow[];
  chips: InboxChip[];
  total: number;
  unread: number;
}

const IST = "Asia/Kolkata";

/** Local (IST) midnight boundaries — "Today" means today to the user. */
function boundaries(now = new Date()) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: IST }));
  const offset = local.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const midnightLocal = new Date(local);
  midnightLocal.setHours(0, 0, 0, 0);
  const todayStart = new Date(midnightLocal.getTime() - offset);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
  return { todayStart, weekStart };
}

function groupOf(iso: string, b: ReturnType<typeof boundaries>): GroupKey {
  const t = new Date(iso).getTime();
  if (t >= b.todayStart.getTime()) return "today";
  if (t >= b.weekStart.getTime()) return "week";
  return "earlier";
}

export async function getInbox(
  profileId: string,
  opts: { filter?: string; limit?: number } = {},
): Promise<Inbox> {
  const filter = opts.filter ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const [types, cats] = await Promise.all([loadTypes(), loadCategories()]);

  let q = db()
    .from("notifications")
    .select("id,type,category,title,body,read_at,last_event_at,created_at,group_count,href,thumb_url,actions,action_taken,action_result,actor_id,data")
    .eq("profile_id", profileId)
    .is("dismissed_at", null)
    .order("last_event_at", { ascending: false })
    .limit(limit);

  if (filter === "unread") q = q.is("read_at", null);
  else if (filter !== "all") q = q.eq("category", filter);

  const [{ data }, counts] = await Promise.all([q, inboxCounts(profileId)]);

  // Actor profiles for the avatar-lead rows, in one query.
  const rowsRaw = (data ?? []) as any[];
  const actorIds = [...new Set(rowsRaw.map((r) => r.actor_id).filter(Boolean))];
  const actors = new Map<string, { name: string | null; photo_url: string | null }>();
  if (actorIds.length) {
    const { data: ps } = await db().from("profiles").select("id,name,photo_url").in("id", actorIds);
    for (const p of (ps ?? []) as any[]) actors.set(p.id, { name: p.name, photo_url: p.photo_url });
  }

  const b = boundaries();
  const rows: NotificationRow[] = rowsRaw.map((r) => {
    const cfg = types.get(r.type);
    const actor = r.actor_id ? actors.get(r.actor_id) : null;
    const lead: NotificationRow["lead"] =
      cfg?.leadKind === "avatar"
        ? { kind: "avatar", name: actor?.name ?? "HomzList user", photo: actor?.photo_url ?? null }
        : { kind: "icon", icon: cfg?.leadIcon ?? "bell", tone: cfg?.leadTone ?? "neutral" };

    return {
      id: r.id,
      type: r.type,
      category: r.category,
      text: r.action_result ?? r.title,
      timeLabel: timeAgo(r.last_event_at ?? r.created_at),
      unread: !r.read_at,
      group: groupOf(r.last_event_at ?? r.created_at, b),
      groupCount: r.group_count ?? 1,
      href: r.href ?? null,
      thumbUrl: r.thumb_url ?? null,
      lead,
      // An action already taken removes the buttons — the row can't be
      // allowed twice, and the server is what decides that, not the DOM.
      actions: r.action_taken ? [] : ((Array.isArray(r.actions) ? r.actions : []) as NotificationAction[]),
      actionTaken: r.action_taken ?? null,
      actionResult: r.action_result ?? null,
      createdAt: r.created_at,
    };
  });

  const chips: InboxChip[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "unread", label: "Unread", count: counts.unread },
    ...cats.map((c) => ({ key: c.code, label: c.label, count: null })),
  ];

  return { rows, chips, total: counts.total, unread: counts.unread };
}

export async function inboxCounts(profileId: string): Promise<{ total: number; unread: number }> {
  const [{ count: total }, { count: unread }] = await Promise.all([
    db().from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profileId).is("dismissed_at", null),
    db().from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profileId).is("dismissed_at", null).is("read_at", null),
  ]);
  return { total: total ?? 0, unread: unread ?? 0 };
}

/** The header bell badge — a real unread count, never a fabricated number. */
export async function unreadCount(profileId: string): Promise<number> {
  return (await inboxCounts(profileId)).unread;
}

// ---------------------------------------------------------------------------
// Mutations. Every one is scoped to the caller's own profile_id, so an id
// belonging to someone else simply matches nothing (Doc9 IDOR posture).
// ---------------------------------------------------------------------------

export async function markRead(profileId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data } = await db()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .in("id", ids)
    .is("read_at", null)
    .select("id");
  return (data ?? []).length;
}

export async function markAllRead(profileId: string): Promise<number> {
  const { data } = await db()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .is("read_at", null)
    .is("dismissed_at", null)
    .select("id");
  return (data ?? []).length;
}

/** Swipe-to-dismiss. Soft: the row leaves the list, the audit trail stays. */
export async function dismiss(profileId: string, id: string): Promise<boolean> {
  const { data } = await db()
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("id", id)
    .is("dismissed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}

/** "Clear all" from the ⋯ sheet. */
export async function clearAll(profileId: string): Promise<number> {
  const { data } = await db()
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .is("dismissed_at", null)
    .select("id");
  return (data ?? []).length;
}
