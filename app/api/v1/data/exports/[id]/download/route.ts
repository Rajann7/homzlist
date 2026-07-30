import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExportFile } from "@/lib/account/service";

/**
 * GET /api/v1/data/exports/:id/download — the 48-hour link on P12 S5.
 *
 * Served through our own authorized route rather than a signed bucket URL: the
 * archive is the most personal payload in the product, so every fetch is checked
 * against the session and the expiry, and the link genuinely stops working.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const file = await getExportFile(claims.sub, params.id);
  if (!file) return fail("NOT_FOUND");

  return new NextResponse(file.body, {
    headers: {
      "content-type": file.format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store, private",
    },
  });
}
