import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { replyToTicket } from "@/lib/support/service";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/support/tickets/:id/messages — reply in the thread. A closed
 * ticket is rejected with LISTING_STATE_LOCKED semantics (reopen first), which is
 * exactly what the design's closed-state bar offers.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const gate = await rateLimit(`support:reply:${claims.sub}`, 30, 3600);
  if (!gate.allowed) return fail("RATE_LIMITED");

  const profile = await getProfileById(claims.sub);
  const result = await replyToTicket(claims.sub, profile?.name ?? "You", params.id, body.body ?? "");
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return fail("NOT_FOUND");
    if (result.reason === "CLOSED") return fail("LISTING_STATE_LOCKED");
    return fail("VALIDATION_ERROR");
  }
  return ok(result.message);
}
