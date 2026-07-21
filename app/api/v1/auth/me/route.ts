import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/auth/service";
import { toUserDTO } from "@/lib/auth/dto";

/** GET /api/v1/auth/me (Doc7 §1.10) — current user, server-derived (client's gating truth). */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state === "deleted") return fail("UNAUTHORIZED");

  return ok({ user: toUserDTO(profile) });
}
