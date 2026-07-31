import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { resourceByName } from "@/lib/admin/resources";
import { createServiceClient } from "@/lib/supabase/server";
import { columnKeys } from "@/lib/admin/list-query";

/**
 * Column settings — "persist per admin and survive reload" (§3).
 *
 * Per ADMIN, not per browser: localStorage would lose them on a new device and
 * would let the client assert a column set the server never agreed to. The
 * stored value is the ORDERED list of visible keys, so show/hide and reorder are
 * one value. Keys the resource does not declare are dropped on write, so a
 * crafted body cannot smuggle a column into the sheet.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: NextRequest, { params }: { params: { resource: string } }) {
  const resource = resourceByName(params.resource);
  if (!resource) return fail("NOT_FOUND");
  try {
    const me = await requireAdmin(resource.minRole);
    const db = createServiceClient();
    const { data } = await db
      .from("admin_column_prefs")
      .select("columns")
      .eq("staff_id", me.id)
      .eq("resource", resource.name)
      .maybeSingle();
    // No stored preference = the design's own column order, not an empty table.
    return ok({ columns: (data?.columns as string[] | undefined) ?? columnKeys(resource) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { resource: string } }) {
  const resource = resourceByName(params.resource);
  if (!resource) return fail("NOT_FOUND");
  try {
    const me = await requireAdmin(resource.minRole);
    const body = (await req.json().catch(() => null)) as { columns?: unknown } | null;
    if (!Array.isArray(body?.columns)) return fail("VALIDATION_ERROR");

    const columns = (body.columns as unknown[])
      .map(String)
      .filter((k) => columnKeys(resource).includes(k));
    if (!columns.length) return fail("VALIDATION_ERROR");

    const db = createServiceClient();
    const { error } = await db
      .from("admin_column_prefs")
      .upsert(
        { staff_id: me.id, resource: resource.name, columns, updated_at: new Date().toISOString() },
        { onConflict: "staff_id,resource" },
      );
    if (error) return fail("SERVER_ERROR");
    return ok({ columns });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
