import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The header bell (template 1574-1578) — a right sheet of admin notifications
 * with a red/blue dot and "Mark all read".
 *
 * `admin_notifications` is a PANEL-WIDE feed, not a per-admin inbox: the rows
 * are things the panel needs someone to look at ("12 listings pending review",
 * "payment failure spike"), and marking one read means the team has seen it.
 * That is why `read_at` is a single column on the row rather than a join table
 * — recorded here so a later part does not "fix" it into a per-admin feed by
 * accident and quietly split the team's view of the queue.
 */

export type AdminNotification = {
  id: string;
  text: string;
  unread: boolean;
  /** the design's dot: red for an error, blue for everything else */
  severity: "error" | "info";
  screen: string | null;
};

const LIMIT = 20;

export async function bellFeed(): Promise<{ unread: number; items: AdminNotification[] }> {
  const db = createServiceClient();

  const { count } = await db
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const { data, error } = await db
    .from("admin_notifications")
    .select("id, title, body, severity, link_screen, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`bell feed: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    title: string;
    severity: string;
    link_screen: string | null;
    read_at: string | null;
  }[];

  return {
    unread: count ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      text: r.title,
      unread: r.read_at === null,
      severity: (r.severity === "error" ? "error" : "info") as AdminNotification["severity"],
      screen: r.link_screen,
    })),
  };
}

/** Returns how many rows actually changed — the toast should not claim more. */
export async function markAllNotificationsRead(): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .select("id");
  if (error) throw new Error(`mark all read: ${error.message}`);
  return (data ?? []).length;
}
