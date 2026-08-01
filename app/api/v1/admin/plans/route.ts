import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin, ROLE_RANK } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import {
  createPlan,
  deletePlan,
  duplicatePlan,
  planDetail,
  planList,
  planPurchases,
  savePlan,
} from "@/lib/admin/catalog";

/**
 * A13 — Plans (template 1197-1216) and its edit panel (1276+).
 *
 * A list, not the engine: the design draws CARDS in a two-column grid, there
 * are seven of them, and there is no filter bar, no search and no pagination to
 * resolve. Registering it as a list resource would be machinery in place of a
 * `select *`.
 *
 * Every write is Super-only. A price is the one number on this panel that takes
 * money from someone, and the design gates plan editing behind the highest role
 * it has (SCREEN_MIN_ROLE puts the screen at admin; the WRITES go further).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const code = new URL(req.url).searchParams.get("code");
    if (code) {
      const purchases = new URL(req.url).searchParams.get("purchases") === "1";
      if (purchases) return ok(await planPurchases(code));
      const detail = await planDetail(code);
      return detail ? ok(detail) : fail("NOT_FOUND");
    }
    return ok({ rows: await planList() });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    if (ROLE_RANK[me.role] < ROLE_RANK.super) return fail("FORBIDDEN");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const code = String(body.code ?? "");

    const result =
      action === "create"
        ? await createPlan(me, body)
        : action === "save"
          ? await savePlan(code, me, (body.changes ?? {}) as Record<string, unknown>)
          : action === "duplicate"
            ? await duplicatePlan(code, me)
            : action === "delete"
              ? await deletePlan(code, me)
              : null;

    if (!result) return fail("VALIDATION_ERROR", { field: "action" });
    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: action === "save" ? "plan_edit" : `plan_${action}`,
      entityType: "plan",
      entityId: null,
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
