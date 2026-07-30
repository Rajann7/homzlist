import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExportState, requestExport } from "@/lib/account/service";

/**
 * GET  /api/v1/data/exports — current + previous requests (P12 S5).
 * POST /api/v1/data/exports — build an export of the caller's OWN data (Doc7 #201).
 *
 * The profile id always comes from the session; there is no parameter that could
 * point the export at another account.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getExportState(claims.sub));
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { format?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const format = body.format === "csv" ? "csv" : "json";

  const result = await requestExport(claims.sub, format);
  if (!result.ok) return fail("RATE_LIMITED");
  return ok(result.request);
}
