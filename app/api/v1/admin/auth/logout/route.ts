import { ok } from "@/lib/api";
import { signOutAdmin } from "@/lib/admin/sign-in";
import { currentAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { clearAdminPool } from "@/lib/admin/account-pool";

/**
 * Log out — the avatar menu's third item (template 1583).
 *
 * Unauthenticated is not an error here: the goal is "no session afterwards",
 * and a caller with no session has already arrived. It answers ok either way so
 * a stale tab's log-out button cannot dead-end on a 401.
 *
 * The parked accounts go too. Leaving them would mean "log out" left a
 * one-click path back into the panel on a shared machine, which is the opposite
 * of what the person clicking it asked for.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const me = await currentAdmin();
  if (me) {
    await writeAudit(me, {
      action: "logout",
      entityType: "staff",
      entityId: me.id,
      entityLabel: me.email,
      summary: "Signed out of the admin panel",
    });
  }
  await signOutAdmin();
  clearAdminPool();
  return ok({ signedOut: true });
}
