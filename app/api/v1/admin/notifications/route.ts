import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET  /api/v1/admin/notifications — the bell drawer's feed.
 * POST /api/v1/admin/notifications — "Mark all read".
 *
 * admin_notifications is mostly a shared panel-wide feed — a queue of things the
 * on-duty admin should see — so "read" is a property of the notice, not of the
 * reader. Migration 0101 added `staff_id` for the one notice that IS personal:
 * A4's "assign to another admin". Panel-wide rows keep staff_id null, so this
 * reader asks for "mine or everyone's" and an assignment never leaks into
 * somebody else's bell.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  const db = createServiceClient();
  const { data } = await db
    .from("admin_notifications")
    .select("id, kind, severity, title, body, link_screen, read_at, created_at, staff_id")
    .or(`staff_id.is.null,staff_id.eq.${gate.staff.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  return ok({
    items: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      kind: r.kind as string,
      severity: r.severity as string,
      title: r.title as string,
      body: (r.body as string) ?? null,
      linkScreen: (r.link_screen as string) ?? null,
      read: Boolean(r.read_at),
      createdAt: r.created_at as string,
    })),
  });
}

export async function POST(_req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  const db = createServiceClient();
  const { data } = await db
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    // Same scope the drawer reads, or "Mark all read" would clear notices this
    // admin was never shown — including another admin's assignment.
    .or(`staff_id.is.null,staff_id.eq.${gate.staff.id}`)
    .select("id");

  return ok({ marked: data?.length ?? 0 });
}
