import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import {
  churnTab,
  financeExportHistory,
  recheckMismatch,
  reconTab,
  resolveMismatch,
  revenueTab,
  sendRenewalReminder,
  type Range,
} from "@/lib/admin/finance";

/**
 * A16 — Finance (Doc5 A16, template 1148-1163).
 *
 * One route, four tabs. Each tab is fetched when it is OPENED: the revenue tab
 * scans orders and the churn tab scans plans, so loading all four to show one
 * would be three scans nobody asked for.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const RANGES = new Set<Range>(["7d", "30d", "6m", "12m"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") ?? "revenue";

    if (tab === "churn") return ok(await churnTab());
    if (tab === "recon") return ok(await reconTab());
    if (tab === "exports") return ok(await financeExportHistory());

    const range = (url.searchParams.get("range") ?? "30d") as Range;
    const gran = url.searchParams.get("gran");
    return ok(
      await revenueTab(
        RANGES.has(range) ? range : "30d",
        gran === "day" || gran === "month" ? gran : "week",
      ),
    );
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return fail("NOT_FOUND");
    const note = typeof body.note === "string" ? body.note : "";

    const result =
      action === "remind"
        ? await sendRenewalReminder(id, me)
        : action === "recheck"
          ? await recheckMismatch(id, me)
          : action === "resolve"
            ? await resolveMismatch(id, me, note)
            : null;

    if (!result) return fail("VALIDATION_ERROR", { field: "action" });
    if (!result.ok) return fail("VALIDATION_ERROR", { message: result.message ?? "Failed" });

    await writeAudit(me, {
      action: `finance_${action}`,
      entityType: action === "remind" ? "user_plan" : "reconciliation",
      entityId: id,
      entityLabel: result.label,
      summary: result.summary,
      diff: ("diff" in result ? (result.diff as Record<string, unknown>) : null) ?? null,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
