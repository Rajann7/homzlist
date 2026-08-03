import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountLifecycle } from "@/lib/account/service";

/**
 * GET /api/v1/account/lifecycle — everything P12 S6 prints: the payment-hold
 * banner and its "Available from" date, the deletion schedule, and the real
 * counts behind "You have 1 active ₹999 plan and 1 live listing".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getAccountLifecycle(claims.sub));
}
