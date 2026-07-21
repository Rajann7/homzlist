import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getVerifications } from "@/lib/profile/service";
import { verificationDTO } from "@/lib/profile/dto";

/** GET /api/v1/profile/verification/status (Doc7 §20) — phone/id/rera levels + states. */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ verification: verificationDTO(await getVerifications(claims.sub)) });
}
