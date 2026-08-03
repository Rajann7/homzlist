import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { submitHelpFeedback, visitorKey } from "@/lib/help/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clientIp } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/help/articles/:slug/feedback — "Was this helpful?" and the
 * "Tell us what's missing" box behind a No.
 *
 * One vote per reader: a second submit updates the existing row, and the
 * aggregate counters on `faqs` are recomputed FROM the rows, so the admin FAQ
 * screen's "92% · 41 votes" cannot drift away from the votes behind it.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  let body: { helpful?: boolean; comment?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (typeof body.helpful !== "boolean") return fail("VALIDATION_ERROR");

  const claims = await getCurrentUser();
  const res = await submitHelpFeedback(params.slug, body.helpful, body.comment?.trim() || null, {
    profileId: claims?.sub ?? null,
    visitorKey: claims ? null : visitorKey(clientIp(req.headers), req.headers.get("user-agent") ?? ""),
  });
  if (!res.ok) return fail("NOT_FOUND");
  return ok({ recorded: true, helpful: body.helpful });
}
