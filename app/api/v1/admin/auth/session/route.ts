import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { currentStaff } from "@/lib/admin/auth";
import { capabilitiesFor, LEVEL_LABEL } from "@/lib/admin/permissions";
import {
  ADMIN_IDLE_LIMIT_SEC,
  clearAdminCookie,
  endAdminSession,
  currentJti,
} from "@/lib/admin/session";
import { audit } from "@/lib/admin/audit";
import { googleMode } from "@/lib/admin/google";

/**
 * GET  /api/v1/admin/auth/session — who am I, and is my session still alive?
 * POST /api/v1/admin/auth/session — heartbeat (Doc3 §1.1's 2h idle rule).
 * DELETE                          — sign out.
 *
 * The GET doubles as the revoked-mid-session detector A1 state (b) renders:
 * currentStaff() re-reads the seat on every call, so a removed email turns into
 * `{ reason: "revoked" }` on the admin's very next request rather than whenever
 * their token happens to expire.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const r = await currentStaff();
  if (!r.ok) {
    // 200 with a reason, not 401: A1 needs to tell "your access was removed"
    // apart from "you were never signed in" to pick the right screen state.
    clearAdminCookie();
    return ok({ signedIn: false as const, reason: r.reason, googleMode: googleMode() });
  }
  return ok({
    signedIn: true as const,
    staff: {
      id: r.staff.id,
      name: r.staff.name,
      email: r.staff.email,
      level: r.staff.level,
      levelLabel: LEVEL_LABEL[r.staff.level],
      capabilities: capabilitiesFor(r.staff.level),
    },
    idleLimitSeconds: ADMIN_IDLE_LIMIT_SEC,
  });
}

export async function POST(_req: NextRequest) {
  const r = await currentStaff();
  // currentStaff() already touched last_seen_at — that IS the heartbeat.
  if (!r.ok) return ok({ signedIn: false as const, reason: r.reason });
  return ok({ signedIn: true as const });
}

export async function DELETE(_req: NextRequest) {
  const jti = await currentJti();
  const r = await currentStaff();
  if (r.ok) {
    await audit({
      actor: r.staff,
      action: "logout",
      entityType: "session",
      entityLabel: r.staff.email,
      summary: "Signed out of the admin panel",
    });
  }
  if (jti) await endAdminSession(jti, "logout");
  clearAdminCookie();
  if (!jti) return fail("NOT_FOUND");
  return ok({ signedOut: true });
}
