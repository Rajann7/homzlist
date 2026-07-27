import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSettingsOverview } from "@/lib/settings/service";

/**
 * GET /api/v1/settings/overview (Doc7 §60) — the Settings home summary: identity
 * card, verification badges, account-status label and the row counts. Own data
 * only (gated on the session), computed server-side.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const overview = await getSettingsOverview(claims.sub);
  if (!overview) return fail("NOT_FOUND");
  return ok(overview);
}
