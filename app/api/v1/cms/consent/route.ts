import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPendingConsents, recordConsent } from "@/lib/legal/service";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";

/**
 * Re-acceptance interstitial (Doc7 §12 #176) — P12's dg-terms dialog.
 *
 * GET  → the documents this user has not yet accepted at their current version.
 * POST → record acceptance of one document AT A SPECIFIC VERSION. The version is
 *        re-read from the published page server-side; a client that posts an old
 *        version cannot mark itself compliant with a document it never saw.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ pending: await getPendingConsents(claims.sub) });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const slug = (body.slug ?? "").trim();
  if (!slug) return fail("VALIDATION_ERROR");

  const pending = await getPendingConsents(claims.sub);
  const doc = pending.find((p) => p.slug === slug);
  if (!doc) return fail("NOT_FOUND");

  await recordConsent(claims.sub, doc.slug, doc.version, await hashIp(clientIp(req.headers)));
  const left = (await getPendingConsents(claims.sub)).length;
  return ok({ accepted: doc.slug, version: doc.version, remaining: left });
}
