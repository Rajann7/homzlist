import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { resourceByName } from "@/lib/admin/resources";
import { parseListParams } from "@/lib/admin/list-query";
import { runExport, type ExportFormat } from "@/lib/admin/export";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/admin/export
 *
 * The filters come from the QUERY STRING of the list the admin was looking at,
 * parsed by the same code the list endpoint uses — so the export cannot drift
 * from the table it was launched from.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// exceljs is a Node library, and the whole-set paging can outrun the edge budget.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    resource?: string;
    query?: string;
    format?: string;
    fields?: unknown;
    name?: string;
  } | null;

  const resource = resourceByName(body?.resource ?? "");
  if (!resource) return fail("NOT_FOUND");
  if (!Array.isArray(body?.fields) || !body.fields.length) return fail("VALIDATION_ERROR");
  const format: ExportFormat = body.format === "xlsx" ? "xlsx" : "csv";

  try {
    const me = await requireAdmin(resource.minRole);
    // Governed by the admin `admin_export` rule (A22). Exports are sensitive and
    // heavy; the numbers here are the fallback if the rule is unreachable.
    const limited = await rateLimit(`admin-export:${me.id}`, 20, 86_400, "admin_export");
    if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });
    const url = new URL(`http://x/?${body.query ?? ""}`);
    const params = parseListParams(url, resource);
    const outcome = await runExport(me, resource, params, {
      format,
      fields: (body.fields as unknown[]).map(String),
      name: body.name,
    });
    return ok(outcome);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
