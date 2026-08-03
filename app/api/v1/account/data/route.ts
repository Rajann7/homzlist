import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDataView, requestDataExport } from "@/lib/account/service";

/**
 * GET  /api/v1/account/data — the S5 screen: the live request (if any) and the
 *                             "Previous requests" rows.
 * POST /api/v1/account/data — request one (Doc7 §201, DPDP §8).
 *
 * The export contains the caller's OWN data only, and the exclusions (other
 * people's messages, other people's contact details) are enforced in the
 * queries that build it — see lib/account/service.ts.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getDataView(claims.sub));
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { format?: string };
  try { body = await req.json(); } catch { body = {}; }
  const format = body.format === "csv" ? "csv" : "json";

  const row = await requestDataExport(claims.sub, format);
  if (row.status === "failed") return fail("SERVER_ERROR");
  return ok(row);
}
