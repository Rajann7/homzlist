import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { answerStillAvailable } from "@/lib/listings/lifecycle";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/listings/:id/still-available (Doc7 §57) — the inline Yes/No on
 * the 2-month lifecycle prompt. "No" marks the listing sold and stops any boost.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`still-available:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (typeof body.stillAvailable !== "boolean") return fail("VALIDATION_ERROR", { field: "stillAvailable" });

  const done = await answerStillAvailable(params.id, claims.sub, body.stillAvailable);
  if (!done) return fail("NOT_FOUND");
  return ok({ stillAvailable: body.stillAvailable });
}
