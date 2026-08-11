import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { exportLeadsCsv, CSV_FIELDS, type CsvField } from "@/lib/leads/service";

/**
 * GET /api/v1/leads/export?fields=name,phone,… (Doc7 §105) — CSV of the owner's
 * leads, built + escaped server-side. Returns text/csv with a download filename;
 * the client triggers the save. Only the caller's own leads are ever in the file.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  // Consistency with every other Module-5 route — the export reads the whole
  // pipeline, so cap it even though it's own-data only.
  const limited = await rateLimit(`leads-export:${claims.sub}`, 30, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const raw = (new URL(req.url).searchParams.get("fields") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fields = raw.filter((f): f is CsvField => (CSV_FIELDS as readonly string[]).includes(f));

  const csv = await exportLeadsCsv(claims.sub, fields);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homzlist-leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
