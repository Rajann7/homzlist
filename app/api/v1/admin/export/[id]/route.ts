import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { readObject, BUCKET } from "@/lib/storage";

/**
 * GET /api/v1/admin/export/:id — download an export that was generated earlier.
 *
 * The file lives in a PRIVATE bucket (migration 0092), which is the point: a
 * public URL would make an export of every user's phone number a link anybody
 * could forward. So the bytes are streamed through here, behind requireAdmin,
 * and a download of a file that CONTAINS PERSONAL DATA writes its own sensitive
 * audit row — generating an export and taking it away are two different acts,
 * and only the second one puts the data on somebody's laptop.
 *
 * Built in P5b because A16's Exports tab has a Download button; A30 (Exports
 * Center, P7) reads the same route rather than growing a second one.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const db = createServiceClient();
    const { data } = await db
      .from("exports")
      .select("id, name, entity, format, status, file_key, contains_personal_data, expires_at, row_count")
      .eq("id", params.id)
      .maybeSingle();
    const row = data as
      | {
          id: string;
          name: string;
          entity: string;
          format: string;
          status: string;
          file_key: string | null;
          contains_personal_data: boolean;
          expires_at: string | null;
          row_count: number;
        }
      | null;

    if (!row || !row.file_key || row.status !== "ready") return fail("NOT_FOUND");
    // An export that has aged out is gone on purpose (7-day retention). Serving
    // it anyway would make the retention window decorative.
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return fail("NOT_FOUND");
    }

    // Through the storage layer, not a raw Supabase call: this project can be
    // driven by R2 or Supabase depending on the environment, and a download
    // that only knew one of them would 404 on the other.
    const file = await readObject(row.file_key, BUCKET.adminExports);
    if (!file) return fail("NOT_FOUND");

    await writeAudit(me, {
      action: "export_download",
      entityType: "export",
      entityId: row.id,
      entityLabel: row.name,
      summary: `Downloaded ${row.row_count} rows${row.contains_personal_data ? " (contains personal data)" : ""}`,
      sensitive: row.contains_personal_data,
    });

    const ext = row.format === "xlsx" ? "xlsx" : "csv";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "content-type":
          ext === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${row.name.replace(/[^\w. -]/g, "")}.${ext}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
