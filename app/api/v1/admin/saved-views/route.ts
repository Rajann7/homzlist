import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

/**
 * Saved filter views (Doc3 §1.4: "saved filter views — 'Rajkot pending flats'").
 *
 * A view is either shared with the whole panel or private to the admin who made
 * it, which is why the read filters on `is_shared OR owner_id = me` rather than
 * returning the table.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  const queue = (req.nextUrl.searchParams.get("queue") ?? "").slice(0, 40);
  if (!queue) return fail("VALIDATION_ERROR", { field: "queue" });

  const db = createServiceClient();
  const { data } = await db
    .from("admin_saved_views")
    .select("id, queue, name, filters, owner_id, is_shared")
    .eq("queue", queue)
    .or(`is_shared.eq.true,owner_id.eq.${gate.staff.id}`)
    .order("name");

  return ok({
    views: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      filters: (r.filters as Record<string, unknown>) ?? {},
      shared: Boolean(r.is_shared),
      mine: r.owner_id === gate.staff.id,
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  let body: { queue?: unknown; name?: unknown; filters?: unknown; shared?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const queue = typeof body.queue === "string" ? body.queue.slice(0, 40) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!queue || name.length < 2) return fail("VALIDATION_ERROR", { field: "name" });

  const filters = body.filters && typeof body.filters === "object" ? body.filters : {};

  const db = createServiceClient();
  const { data, error } = await db
    .from("admin_saved_views")
    .insert({ queue, name, filters, owner_id: gate.staff.id, is_shared: body.shared === true })
    .select("id")
    .single();

  if (error) return fail("SERVER_ERROR");

  await audit({
    actor: gate.staff,
    action: "edit",
    entityType: "settings",
    entityId: data.id,
    entityLabel: `Saved view · ${name}`,
    summary: `Saved a ${body.shared === true ? "shared" : "private"} view on the ${queue} queue`,
  });

  return ok({ id: data.id });
}
