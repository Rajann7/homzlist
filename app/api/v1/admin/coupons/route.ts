import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { couponDetail, deleteCoupon, endCoupon, saveCoupon } from "@/lib/admin/catalog";

/** A14 — the coupon editor (template 1218-1240). The LIST is the engine. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const id = new URL(req.url).searchParams.get("id");
    // A missing or malformed `id` is a bad REQUEST, not a missing coupon — the
    // sibling detail endpoints (content, support, system, templates) all answer
    // VALIDATION_ERROR here, and a caller cannot act on "not found" when the
    // truth is "you didn't say which one".
    if (!id || !UUID_RE.test(id)) return fail("VALIDATION_ERROR", { field: "id" });
    const detail = await couponDetail(id);
    return detail ? ok(detail) : fail("NOT_FOUND");
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "save");
    const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;

    const result =
      action === "save"
        ? await saveCoupon(id, me, body)
        : action === "end" && id
          ? await endCoupon(id, me)
          : action === "delete" && id
            ? await deleteCoupon(id, me)
            : null;

    if (!result) return fail("VALIDATION_ERROR", { field: "action" });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: `coupon_${action}`,
      entityType: "coupon",
      entityId: id,
      entityLabel: result.label,
      summary: result.summary,
      diff: result.diff ?? null,
      sensitive: true,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
