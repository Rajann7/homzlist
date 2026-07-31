import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { resourceByName } from "@/lib/admin/resources";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Saved views — the design's "All users ⌄" / "All pending ⌄" menu (template 999,
 * 608). Persisted to admin_saved_views (0088) and reloaded, per §3.
 *
 * Visibility rule: an admin sees their OWN views plus anything explicitly shared.
 * A shared view is a small piece of team configuration, so creating one is
 * audited; a private one is not.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get("resource") ?? "";
  const resource = resourceByName(name);
  if (!resource) return fail("NOT_FOUND");
  try {
    const me = await requireAdmin(resource.minRole);
    const db = createServiceClient();
    const { data, error } = await db
      .from("admin_saved_views")
      .select("id, name, filters, is_shared, owner_id, created_at")
      .eq("queue", resource.name)
      .or(`owner_id.eq.${me.id},is_shared.eq.true`)
      .order("created_at", { ascending: true });
    if (error) return fail("SERVER_ERROR");
    return ok({
      views: ((data ?? []) as { owner_id: string | null }[]).map((v) => ({
        ...v,
        mine: v.owner_id === me.id,
      })),
    });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    resource?: string;
    name?: string;
    filters?: Record<string, unknown>;
    shared?: boolean;
  } | null;
  const resource = resourceByName(body?.resource ?? "");
  if (!resource) return fail("NOT_FOUND");
  if (!body?.name?.trim()) return fail("VALIDATION_ERROR");

  try {
    const me = await requireAdmin(resource.minRole);
    // Only filter keys this resource declares are stored, so a saved view can
    // never replay a filter the engine would refuse to apply.
    const allowed = new Set(resource.filters.map((f) => f.key));
    const filters = Object.fromEntries(
      Object.entries(body.filters ?? {}).filter(([k]) => allowed.has(k)),
    );

    const db = createServiceClient();
    const { data, error } = await db
      .from("admin_saved_views")
      .insert({
        queue: resource.name,
        name: body.name.trim(),
        filters,
        owner_id: me.id,
        is_shared: body.shared === true,
      })
      .select("id, name, filters, is_shared, created_at")
      .single();
    if (error || !data) return fail("SERVER_ERROR");

    if (body.shared === true) {
      await writeAudit(me, {
        action: "create",
        entityType: "saved_view",
        entityId: data.id,
        entityLabel: `${resource.name} · ${data.name}`,
        summary: `Shared saved view created on ${resource.name}`,
        diff: { filters },
      });
    }
    return ok({ view: data });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const name = new URL(req.url).searchParams.get("resource") ?? "";
  const resource = resourceByName(name);
  if (!resource || !id) return fail("NOT_FOUND");

  try {
    const me = await requireAdmin(resource.minRole);
    const db = createServiceClient();
    const { data: view } = await db
      .from("admin_saved_views")
      .select("id, name, owner_id, is_shared")
      .eq("id", id)
      .eq("queue", resource.name)
      .maybeSingle();
    if (!view) return fail("NOT_FOUND");

    // Own it, or be a Super Admin cleaning up a shared one. An Admin cannot
    // delete a colleague's private view.
    const mayDelete = view.owner_id === me.id || (view.is_shared && me.role === "super");
    if (!mayDelete) return fail("FORBIDDEN");

    const { error } = await db.from("admin_saved_views").delete().eq("id", id);
    if (error) return fail("SERVER_ERROR");

    if (view.is_shared) {
      await writeAudit(me, {
        action: "delete",
        entityType: "saved_view",
        entityId: view.id,
        entityLabel: `${resource.name} · ${view.name}`,
        summary: `Shared saved view deleted from ${resource.name}`,
      });
    }
    return ok({ deleted: id });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
