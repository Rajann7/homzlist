import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { createServiceClient } from "@/lib/supabase/server";
import {
  brandingSettings,
  maintenanceState,
  runSystemAction,
  saveBoostRate,
  saveBranding,
  saveCityCap,
  saveRateLimit,
  saveRetention,
  saveVelocityRule,
  setFlagScope,
  setMaintenance,
  toggleFlag,
  type ActionResult,
} from "@/lib/admin/settings";

/**
 * A22 — Settings & flags (Doc5 A22, template 2323-2426).
 *
 * SUPER ONLY, all of it — `SCREEN_MIN_ROLE.settings = 'super'` (template 248).
 * The guard is the first line of every handler, so the screen's lock gate is
 * never the only thing standing between an Admin and the maintenance switch.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("super");
    const what = new URL(req.url).searchParams.get("what") ?? "";
    const db = createServiceClient();

    if (what === "branding") return ok(await brandingSettings());
    if (what === "maintenance") return ok(await maintenanceState());
    if (what === "boost") {
      const [{ data: rates }, { data: caps }, { data: topup }] = await Promise.all([
        db.from("boost_rates").select("*").order("days"),
        db
          .from("city_caps")
          .select("city_id, max_active_boosts, is_launched, locations(name)")
          .order("city_id"),
        db.from("plan_catalog").select("code, name, price_paise, is_active").eq("kind", "topup"),
      ]);
      // The design prints "Currently active" beside each cap — a live count, so
      // an admin lowering a cap can see what it would mean.
      const { data: active } = await db
        .from("boosts")
        .select("target_city_id")
        .eq("status", "active");
      const activeBy = new Map<string, number>();
      for (const b of (active ?? []) as { target_city_id: string | null }[]) {
        if (b.target_city_id) activeBy.set(b.target_city_id, (activeBy.get(b.target_city_id) ?? 0) + 1);
      }
      // Sales (30d) per rate, also real.
      const { data: sales } = await db
        .from("orders")
        .select("catalog_code")
        .eq("kind", "boost")
        .eq("status", "paid")
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
      const salesBy = new Map<string, number>();
      for (const s of (sales ?? []) as { catalog_code: string }[]) {
        salesBy.set(s.catalog_code, (salesBy.get(s.catalog_code) ?? 0) + 1);
      }
      return ok({
        rates: ((rates ?? []) as Record<string, unknown>[]).map((r) => ({
          ...r,
          sales_30d: salesBy.get(String(r.code)) ?? 0,
        })),
        caps: ((caps ?? []) as Record<string, unknown>[]).map((c) => ({
          ...c,
          active_now: activeBy.get(String(c.city_id)) ?? 0,
        })),
        topups: topup ?? [],
      });
    }
    if (what === "retention") {
      const { data } = await db.from("retention_settings").select("*").order("label");
      return ok({ rows: data ?? [] });
    }
    return fail("VALIDATION_ERROR", { field: "what" });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("super");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const id = typeof body.id === "string" ? body.id : "";

    let result: ActionResult;
    switch (action) {
      case "flag_toggle":   result = await toggleFlag(id, body.enabled === true, me); break;
      case "flag_scope":
        result = await setFlagScope(
          id,
          String(body.scope ?? "all"),
          typeof body.scope_value === "string" ? body.scope_value : null,
          me,
        );
        break;
      case "branding_save": result = await saveBranding(body, String(body.reason ?? ""), me); break;
      case "rate_save":     result = await saveBoostRate(id, body, me); break;
      case "cap_save":      result = await saveCityCap(id, Number(body.cap), me); break;
      case "limit_save":    result = await saveRateLimit(id, body, me); break;
      case "velocity_save": result = await saveVelocityRule(id, body, me); break;
      case "retention_save":result = await saveRetention(id, Number(body.days), me); break;
      case "maintenance":   result = await setMaintenance(body.enabled === true, body, me); break;
      case "system_action": result = await runSystemAction(String(body.op ?? ""), me); break;
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
