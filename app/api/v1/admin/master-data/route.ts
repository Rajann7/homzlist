import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import {
  addLocation,
  approveAreaRequest,
  deleteAmenity,
  deleteBlocklistWord,
  deletePattern,
  dismissAreaRequest,
  fieldCatalog,
  importBlocklist,
  locationChildren,
  locationDetail,
  mergeAmenity,
  saveAmenity,
  saveBlocklistWord,
  saveLocation,
  savePattern,
  savePropertyType,
  savePropertyTypeConfig,
  searchLocations,
  testRules,
  toggleAmenity,
  toggleBlocklistWord,
  togglePattern,
  togglePropertyType,
  type ActionResult,
} from "@/lib/admin/master-data";

/**
 * A19 — Master data (Doc5 A19, template 2032-2180).
 *
 * The GET half serves the two things the shared list engine cannot: the
 * location TREE (lazy, one level at a time — the table has 163,424 rows) and
 * the field catalogue the config editor validates against. Every flat list on
 * this screen goes through /list/:resource like every other screen's.
 *
 * The POST half is one switch over the design's own row-menu actions. Each one
 * is authorised, audited and — where it changes moderation behaviour — busts
 * the rule cache, so an admin's edit is live on the next request.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "tree";

    if (what === "tree") {
      const parent = url.searchParams.get("parent");
      return ok({ nodes: await locationChildren(parent && parent !== "root" ? parent : null) });
    }
    if (what === "search") {
      return ok({ nodes: await searchLocations(url.searchParams.get("q") ?? "") });
    }
    if (what === "node") {
      const node = await locationDetail(url.searchParams.get("id") ?? "");
      return node ? ok(node) : fail("NOT_FOUND");
    }
    if (what === "fields") {
      return ok(await fieldCatalog());
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
    const on = body.active === true;

    let result: ActionResult;
    switch (action) {
      // locations
      case "location_save":   result = await saveLocation(id, body, me); break;
      case "location_add":    result = await addLocation(body, me); break;
      // amenities
      case "amenity_save":    result = await saveAmenity(body, me); break;
      case "amenity_toggle":  result = await toggleAmenity(id, on, me); break;
      case "amenity_merge":   result = await mergeAmenity(id, String(body.into ?? ""), me); break;
      case "amenity_delete":  result = await deleteAmenity(id, me); break;
      // property types
      case "type_toggle":     result = await togglePropertyType(id, on, me); break;
      case "type_save":       result = await savePropertyType({ ...body, code: id }, me); break;
      case "type_config":     result = await savePropertyTypeConfig(id, body.config, me); break;
      // the content rules
      case "word_save":       result = await saveBlocklistWord(body, me); break;
      case "word_toggle":     result = await toggleBlocklistWord(id, on, me); break;
      case "word_delete":     result = await deleteBlocklistWord(id, me); break;
      case "word_import":     result = await importBlocklist(String(body.text ?? ""), String(body.severity ?? "flag"), me); break;
      case "pattern_save":    result = await savePattern(body, me); break;
      case "pattern_toggle":  result = await togglePattern(id, on, me); break;
      case "pattern_delete":  result = await deletePattern(id, me); break;
      // "Test match" reads nothing and writes nothing, so it is not audited and
      // does not need a subject.
      case "rules_test":      return ok(await testRules(String(body.text ?? "")));
      // area requests
      case "area_approve":    result = await approveAreaRequest(id, me); break;
      case "area_dismiss":    result = await dismissAreaRequest(id, String(body.reason ?? ""), me); break;
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
