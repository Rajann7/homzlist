import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { ADMIN_COOKIE } from "@/lib/admin/session";
import { switchToParkedAdmin } from "@/lib/admin/sign-in";
import { takeFromAdminPool, writeAdminPool } from "@/lib/admin/account-pool";

/**
 * POST /api/v1/admin/accounts/switch — become another account already signed in
 * on this device.
 *
 * The request names an id, and that is ALL it may do: the id has to match an
 * entry already in this device's pool cookie, and the switch runs on that
 * entry's own refresh token. Naming an arbitrary staff id gets a 404 — there is
 * no path here from "I know a uuid" to "I am that admin".
 *
 * Both sides are audited: the account being left records who left it, and the
 * next action the new account takes carries its own identity. A switch that
 * fails leaves the current session untouched.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    const body = (await req.json().catch(() => null)) as { staffId?: string } | null;
    if (!body?.staffId) return fail("VALIDATION_ERROR");
    if (body.staffId === me.id) return ok({ switched: true });

    const { entry, rest } = takeFromAdminPool(body.staffId);
    if (!entry) return fail("NOT_FOUND");

    // Capture the outgoing token BEFORE the switch overwrites the cookie.
    const outgoing = cookies().get(ADMIN_COOKIE.REFRESH)?.value;

    // Drop the entry from the pool first: whether the switch succeeds or the
    // token turns out to be dead, that parked account is spent either way.
    writeAdminPool(rest);

    const switched = await switchToParkedAdmin(entry.token, outgoing);
    if (!switched) return fail("NOT_FOUND");

    await writeAudit(me, {
      action: "account_switch",
      entityType: "staff",
      entityId: body.staffId,
      entityLabel: me.email,
      summary: "Switched to another admin account signed in on this device",
    });

    return ok({ switched: true });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
