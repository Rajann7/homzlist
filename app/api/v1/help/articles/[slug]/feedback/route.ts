import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordHelpFeedback } from "@/lib/help/service";
import { clientIp, hashIp, rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/help/articles/:slug/feedback — "Was this helpful?" (Doc7 #178,
 * helpful-votes + feedback view). Persists a real row; the counters on the
 * article follow the delta so changing a vote never double-counts.
 *
 * Guests may vote (help is public), so the write is rate-limited per IP to stop
 * a single client stuffing the counter.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  let body: { helpful?: boolean; note?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (typeof body.helpful !== "boolean") return fail("VALIDATION_ERROR");

  const claims = await getCurrentUser();
  const ipHash = await hashIp(clientIp(req.headers));
  const gate = await rateLimit(`help:fb:${claims?.sub ?? ipHash}`, 20, 3600);
  if (!gate.allowed) return fail("RATE_LIMITED");

  const note = (body.note ?? "").trim().slice(0, 500) || null;
  const saved = await recordHelpFeedback(params.slug, claims?.sub ?? null, body.helpful, note);
  if (!saved) return fail("NOT_FOUND");
  return ok({ recorded: true, helpful: body.helpful });
}
