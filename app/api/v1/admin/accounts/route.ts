import { ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { createServiceClient } from "@/lib/supabase/server";
import { peekAdminRefresh } from "@/lib/admin/session";
import { readAdminPool, writeAdminPool, type AdminPoolEntry } from "@/lib/admin/account-pool";
import { initialsOf } from "@/lib/admin/identity";

/**
 * GET /api/v1/admin/accounts — the accounts the "Switch account" sheet lists
 * (template 1597-1601).
 *
 * Every row is a live staff read behind a refresh session verified against KV,
 * exactly like the user-side sheet. The browser holds no names and no roles, so
 * the list cannot be edited into offering an account this device never signed
 * into, and a staff member revoked since they were parked simply stops
 * appearing.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const me = await requireAdmin("staff");
    const db = createServiceClient();

    const pool = readAdminPool();
    const alive: AdminPoolEntry[] = [];
    const accounts = [
      { id: me.id, name: me.name, email: me.email, initials: initialsOf(me.name), current: true },
    ];

    for (const e of pool) {
      if (e.staffId === me.id) continue;
      if (!(await peekAdminRefresh(e.token))) continue;
      const { data: staff } = await db
        .from("staff")
        .select("profile_id, display_name, email, is_active, state")
        .eq("profile_id", e.staffId)
        .maybeSingle();
      if (!staff || staff.is_active !== true || staff.state !== "active") continue;
      alive.push(e);
      accounts.push({
        id: staff.profile_id,
        name: staff.display_name ?? staff.email ?? "",
        email: staff.email ?? "",
        initials: initialsOf(staff.display_name ?? staff.email ?? ""),
        current: false,
      });
    }

    // Self-healing: anything that no longer resolves is dropped for good.
    if (alive.length !== pool.length) writeAdminPool(alive);

    return ok({ accounts });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
