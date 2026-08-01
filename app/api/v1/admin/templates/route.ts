import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import {
  exportStrings,
  importStrings,
  saveString,
  saveTemplate,
  templateDetail,
  testSendTemplate,
  toggleTemplate,
  TEMPLATE_VARIABLES,
  type ActionResult,
} from "@/lib/admin/templates";

/** A21 — Templates & strings (Doc5 A21, template 2237-2322). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "";

    if (what === "template") {
      const tpl = await templateDetail(url.searchParams.get("id") ?? "");
      return tpl ? ok({ ...tpl, variables_allowed: TEMPLATE_VARIABLES }) : fail("NOT_FOUND");
    }
    if (what === "strings-csv") {
      // A file of every user-facing string is a real export, so it is audited
      // like one — the same rule the exports machinery applies.
      const csv = await exportStrings();
      await writeAudit(me, {
        action: "export",
        entityType: "ui_string",
        entityLabel: "UI strings",
        summary: "Exported all UI strings as CSV",
        sensitive: false,
      });
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="ui-strings.csv"',
          "cache-control": "no-store",
        },
      });
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

    let result: ActionResult;
    switch (action) {
      case "template_save":   result = await saveTemplate(body, me); break;
      case "template_toggle": result = await toggleTemplate(id, body.active === true, me); break;
      case "template_test":   result = await testSendTemplate(id, String(body.lang ?? "en"), me); break;
      case "string_save":     result = await saveString(body, me); break;
      case "string_import":   result = await importStrings(String(body.csv ?? ""), me); break;
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
