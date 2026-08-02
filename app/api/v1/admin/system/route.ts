import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import {
  addStaff,
  revokeStaff,
  revokeStaffSessions,
  setStaffRole,
  staffPerformance,
  CAPABILITIES,
  type ActionResult,
} from "@/lib/admin/staff-admin";
import {
  analyticsCities,
  analyticsContent,
  analyticsDefinitions,
  analyticsEvents,
  analyticsFunnel,
  cronRuns,
  purgeTrashItem,
  restoreTrashItem,
  runCronJob,
  systemStatus,
  toggleCronJob,
} from "@/lib/admin/system";

/**
 * A25 Staff · A27 System status · A28 Analytics · A29 Trash.
 *
 * Grouped because they are the operator's screens and they share one rule: the
 * role gate is per ACTION, not per screen. Staff management and purge are
 * Super-only inside an endpoint an Admin may otherwise call.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "";
    const id = url.searchParams.get("id") ?? "";

    if (what === "status") return ok(await systemStatus());
    if (what === "cron-runs") return ok({ runs: await cronRuns(url.searchParams.get("code") ?? "") });

    if (what === "funnel") {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
      return ok(await analyticsFunnel(days, url.searchParams.get("segment")));
    }
    if (what === "events") return ok({ rows: await analyticsEvents() });
    if (what === "content") return ok(await analyticsContent());
    if (what === "cities") return ok(await analyticsCities());
    if (what === "definitions") return ok({ rows: await analyticsDefinitions() });

    // Staff is Super-only, including its read side: the list is the whitelist.
    if (what === "staff-perf") {
      if (me.role !== "super") return fail("FORBIDDEN");
      const perf = await staffPerformance(id);
      return perf ? ok(perf) : fail("NOT_FOUND");
    }
    if (what === "capabilities") {
      if (me.role !== "super") return fail("FORBIDDEN");
      return ok({ capabilities: CAPABILITIES });
    }
    return fail("VALIDATION_ERROR", { field: "what" });
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

    const superOnly = () => me.role === "super";

    let result: ActionResult;
    switch (action) {
      // ---- A25 · staff — every one of these is Super-only -------------------
      case "staff_add":      if (!superOnly()) return fail("FORBIDDEN"); result = await addStaff(body, me); break;
      case "staff_role":     if (!superOnly()) return fail("FORBIDDEN"); result = await setStaffRole(id, String(body.level ?? ""), me); break;
      case "staff_revoke":   if (!superOnly()) return fail("FORBIDDEN"); result = await revokeStaff(id, me); break;
      case "staff_signout":  if (!superOnly()) return fail("FORBIDDEN"); result = await revokeStaffSessions(id, me); break;

      // ---- A27 · cron ------------------------------------------------------
      case "cron_run":       result = await runCronJob(String(body.code ?? ""), me); break;
      case "cron_toggle":    result = await toggleCronJob(String(body.code ?? ""), body.enabled === true, me); break;

      // ---- A29 · trash -----------------------------------------------------
      case "trash_restore":  result = await restoreTrashItem(id, me); break;
      case "trash_purge":
        // Super-only in the design (template 2712) — it is the one action in
        // the panel that destroys data with no way back.
        if (!superOnly()) return fail("FORBIDDEN");
        result = await purgeTrashItem(id, String(body.confirm ?? ""), me);
        break;
      default:
        return fail("VALIDATION_ERROR", { field: "action" });
    }

    if (!result.ok) {
      return result.message === "Not found"
        ? fail("NOT_FOUND")
        : fail("VALIDATION_ERROR", { message: result.message });
    }
    return ok({ done: true, label: result.label, summary: result.summary, ...(result.data ?? {}) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
