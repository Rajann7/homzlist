import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountStatus } from "@/lib/profile/service";

/**
 * GET /api/v1/profile/account-status (Doc7 §25) — rejections/warnings/report
 * outcomes against the current user (their own moderation history only).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const events = await getAccountStatus(claims.sub);
  return ok({ inGoodStanding: events.filter((e: { kind: string }) => e.kind !== "bio_flag").length === 0, events });
}
