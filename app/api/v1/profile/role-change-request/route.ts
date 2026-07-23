import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getProfileById, requestRoleChange } from "@/lib/profile/service";

/**
 * POST /api/v1/profile/role-change-request (Doc7 §26 / Doc2 §2) — role change is
 * an admin-approval request, never a direct self-change.
 */
export const dynamic = "force-dynamic";
const ROLES = ["owner", "broker", "builder"];

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Throttle so a user can't spam the admin role-change queue (service layer also
  // dedupes an already-pending request).
  const limited = await rateLimit(`role-change:${claims.sub}`, 5, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });

  let body: { toRole?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.toRole || !ROLES.includes(body.toRole)) return fail("VALIDATION_ERROR", { field: "toRole" });

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");
  if (profile.role === body.toRole) return fail("VALIDATION_ERROR", { field: "toRole" });

  const result = await requestRoleChange(claims.sub, profile.role, body.toRole);
  return ok({ requested: true, status: "pending", alreadyPending: result === "already_pending" });
}
