import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { adminSearch } from "@/lib/admin/search";

/**
 * GET /api/v1/admin/search?q= — the header's global search.
 *
 * Not audited: it is a read, and auditing every keystroke would bury the log
 * that matters. The rows it can return are already limited by role in
 * lib/admin/search.ts, and opening any of them lands on a screen that audits
 * for itself.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok({ groups: await adminSearch(me, q) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
