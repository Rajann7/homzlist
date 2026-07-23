import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listDrafts, saveDraft } from "@/lib/listings/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * GET  /api/v1/listings/drafts (Doc7 §45) — own drafts (max 3, 90-day expiry).
 * POST /api/v1/listings/drafts (Doc7 §44) — create/update a draft (auto-save).
 * A draft is scratch data, so it's stored as-is; nothing here grants anything.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const drafts = await listDrafts(claims.sub);
  return ok({
    items: drafts.map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updated_at,
      expiresAt: d.expires_at,
      payload: d.payload,
    })),
    max: 3,
  });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Draft auto-save fires on a timer, so this ceiling is deliberately high.
  const limited = await rateLimit(`draft-save:${claims.sub}`, 600, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  try {
    const id = await saveDraft(claims.sub, {
      id: typeof body.id === "string" ? body.id : undefined,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      title: typeof body.title === "string" ? body.title.slice(0, 120) : null,
    });
    if (!id) return fail("NOT_FOUND");
    return ok({ id });
  } catch (e) {
    if (e instanceof Error && e.message === "DRAFT_LIMIT") {
      return fail("VALIDATION_ERROR", { code: "DRAFT_LIMIT", max: 3 });
    }
    throw e;
  }
}
