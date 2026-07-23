import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/billing/service";

/**
 * GET/PATCH /api/v1/profile/notification-prefs — the user's real notification
 * preferences (currently expiry reminders, shown on the My Plan screen).
 *
 * The preference is stored per profile in `notification_prefs` and is always
 * scoped to the caller's own session — there is no id in the payload, so one
 * user can never write another's prefs.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getNotificationPrefs(claims.sub));
}

export async function PATCH(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  if (typeof body.expiryReminders !== "boolean") {
    return fail("VALIDATION_ERROR", { field: "expiryReminders" });
  }

  // Echo back what is now STORED, not what was sent — the client renders the
  // server's truth, so a rejected or coerced write can't leave the UI lying.
  return ok(await setNotificationPrefs(claims.sub, { expiryReminders: body.expiryReminders }));
}
