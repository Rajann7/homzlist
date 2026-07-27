import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserPrefs, updateUserPrefs, type UserPrefs } from "@/lib/settings/service";

/**
 * GET   /api/v1/settings/prefs — the user's locale + privacy toggles (own only).
 * PATCH /api/v1/settings/prefs — persist a subset; returns the STORED prefs so a
 * rejected/coerced value snaps the UI back rather than letting it lie.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getUserPrefs(claims.sub));
}

export async function PATCH(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const patch: Partial<UserPrefs> = {};
  if (body.locale !== undefined) {
    if (body.locale !== "en" && body.locale !== "hi" && body.locale !== "gu") return fail("VALIDATION_ERROR");
    patch.locale = body.locale;
  }
  for (const key of ["showNumberDefault", "showLastSeen", "showActivity", "findableByPhone"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return fail("VALIDATION_ERROR");
      patch[key] = body[key] as boolean;
    }
  }
  if (Object.keys(patch).length === 0) return fail("VALIDATION_ERROR");

  return ok(await updateUserPrefs(claims.sub, patch));
}
