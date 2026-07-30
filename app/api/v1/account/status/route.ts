import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountStatus } from "@/lib/account/service";

/**
 * GET /api/v1/account/status — everything P12 S6 needs: the payment hold and the
 * date it lifts, the grace-period length, what a deletion would actually destroy
 * (active plans by name, live listings, live requirements), and any action
 * already scheduled.
 *
 * All of it computed server-side. The disabled Delete button and the "Available
 * from 19 Jan" note are a rendering of this response, never a client guess.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getAccountStatus(claims.sub));
}
