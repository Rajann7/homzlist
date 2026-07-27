import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getPrefs, setPrefs } from "@/lib/notifications/prefs";

/**
 * GET/PATCH /api/v1/profile/notification-prefs — designs/P10 S7 (Doc4 §63).
 *
 * The payload is the SERVER's state: the group list comes from
 * `notification_pref_groups`, so the screen renders whatever the database
 * defines and can never show a switch that governs nothing. `expiryReminders`
 * stays in the payload because the My Plan screen (Module 3) writes the same
 * row through this endpoint.
 *
 * Always scoped to the caller's own session — there is no id in the payload, so
 * one user can never write another's preferences. A LOCKED group ("Payment
 * updates · Can't be turned off") is dropped server-side, not merely disabled
 * in the UI: a hand-crafted PATCH cannot switch off payment or security
 * notices. Marketing consent is separate and its moment is recorded (DPDP).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getPrefs(claims.sub));
}

export async function PATCH(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`notif-prefs:${claims.sub}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const groups: Record<string, boolean> = {};
  if (body.groups && typeof body.groups === "object" && !Array.isArray(body.groups)) {
    for (const [k, v] of Object.entries(body.groups as Record<string, unknown>)) {
      if (typeof v === "boolean") groups[k] = v;
    }
  }

  const patch = {
    groups: Object.keys(groups).length ? groups : undefined,
    marketingConsent: typeof body.marketingConsent === "boolean" ? body.marketingConsent : undefined,
    quietHours: typeof body.quietHours === "boolean" ? body.quietHours : undefined,
    quietStart: typeof body.quietStart === "string" ? body.quietStart : undefined,
    quietEnd: typeof body.quietEnd === "string" ? body.quietEnd : undefined,
    expiryReminders: typeof body.expiryReminders === "boolean" ? body.expiryReminders : undefined,
  };

  if (Object.values(patch).every((v) => v === undefined)) return fail("VALIDATION_ERROR");

  // Echo back what is now STORED, not what was sent — a dropped or coerced
  // write can never leave the UI showing something the server didn't accept.
  return ok(await setPrefs(claims.sub, patch));
}
