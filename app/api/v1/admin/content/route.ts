import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import {
  audienceCount,
  broadcastReport,
  cancelBroadcast,
  deleteBlogPost,
  deleteFaq,
  blogCategories,
  blogDetail,
  faqCategories,
  pageDetail,
  saveBanner,
  saveBlogPost,
  saveBroadcast,
  saveFaq,
  savePage,
  sendBroadcast,
  toggleBanner,
  unpublishPage,
  type ActionResult,
} from "@/lib/admin/content";

/**
 * A20 — Content (Doc5 A20, template 2161-2236).
 *
 * The send lives here, not in a cron: the design's Broadcasts tab has a "Send"
 * button an admin presses, and a scheduled one is a row a job picks up later
 * (docs/PENDING-INTEGRATIONS.md tracks the scheduler). Everything an admin can
 * press today actually delivers, and reports what each channel did.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "";

    if (what === "page") {
      const page = await pageDetail(url.searchParams.get("id") ?? "");
      return page ? ok(page) : fail("NOT_FOUND");
    }
    if (what === "blog") {
      // The full post, so the edit panel opens on the real body instead of an
      // empty box it would then save over the article.
      const post = await blogDetail(url.searchParams.get("id") ?? "");
      return post ? ok(post) : fail("NOT_FOUND");
    }
    if (what === "blog-categories") return ok({ categories: await blogCategories() });
    if (what === "faq-categories") return ok({ categories: await faqCategories() });
    if (what === "broadcast-report") {
      const report = await broadcastReport(url.searchParams.get("id") ?? "");
      return report ? ok(report) : fail("NOT_FOUND");
    }
    if (what === "audience") {
      // The compose screen's live count. It runs the SAME resolver the send
      // runs, so the number on screen is the number of people who get it.
      const raw = url.searchParams.get("audience") ?? "{}";
      let audience: Record<string, unknown>;
      try {
        audience = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return fail("VALIDATION_ERROR", { field: "audience" });
      }
      return ok({ count: await audienceCount(audience) });
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
      case "page_save":        result = await savePage(id, body, me); break;
      case "page_unpublish":   result = await unpublishPage(id, me); break;
      case "blog_save":        result = await saveBlogPost(body, me); break;
      case "blog_delete":      result = await deleteBlogPost(id, me); break;
      case "faq_save":         result = await saveFaq(body, me); break;
      case "faq_delete":       result = await deleteFaq(id, me); break;
      case "banner_save":      result = await saveBanner(body, me); break;
      case "banner_toggle":    result = await toggleBanner(id, on, me); break;
      case "broadcast_save":   result = await saveBroadcast(body, me); break;
      case "broadcast_send":   result = await sendBroadcast(id, me); break;
      // "Resend to non-openers" (template 2233) — the same send, skipping
      // everyone already marked delivered.
      case "broadcast_resend": result = await sendBroadcast(id, me, { onlyPending: true }); break;
      case "broadcast_cancel": result = await cancelBroadcast(id, me); break;
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
