import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { extendGrant, grantDetail, revokeGrant } from "@/lib/admin/catalog";

/**
 * A15 — the grants log's row actions (template 1252-1272).
 *
 * Creating a grant is A11's sheet, reachable from here through the same
 * endpoint (/users/:id/actions), so there is ONE grant path and the log cannot
 * disagree with what the user panel did.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const id = new URL(req.url).searchParams.get("id");
    // Bad request, not missing resource — same contract as the other admin
    // detail endpoints. See the note in app/api/v1/admin/coupons/route.ts.
    if (!id || !UUID_RE.test(id)) return fail("VALIDATION_ERROR", { field: "id" });
    const detail = await grantDetail(id);
    return detail ? ok(detail) : fail("NOT_FOUND");
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
    if (!id) return fail("NOT_FOUND");
    const action = String(body.action ?? "");
    const reason = typeof body.reason === "string" ? body.reason : "";

    const result =
      action === "revoke"
        ? await revokeGrant(id, me, reason)
        : action === "extend"
          ? await extendGrant(id, me, Number(body.days ?? 0), reason)
          : null;

    if (!result) return fail("VALIDATION_ERROR", { field: "action" });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: `grant_${action}`,
      entityType: "grant",
      entityId: id,
      entityLabel: result.label,
      summary: result.summary,
      diff: result.diff ?? null,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
