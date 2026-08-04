import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { revokeSession } from "@/lib/auth/session";

/** POST /api/v1/auth/sessions/:id/revoke (Doc7 §1.8) — log out a device (ownership-scoped, IDOR-safe). */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!params.id) return fail("VALIDATION_ERROR");

  // sid is namespaced under the caller's profile id → cannot touch another user's.
  await revokeSession(claims.sub, params.id);
  return ok({ revoked: true });
}
