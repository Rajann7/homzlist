import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clearRecentlyViewed } from "@/lib/activity/service";

/** DELETE /api/v1/activity/recently-viewed — clear the caller's view history. */
export const dynamic = "force-dynamic";

export async function DELETE() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await clearRecentlyViewed(claims.sub));
}
