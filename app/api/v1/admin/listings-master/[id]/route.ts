import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { listingHeader, listingTab, type ListingTab, type MasterKind } from "@/lib/admin/listings-master";

/** GET /api/v1/admin/listings-master/:id?kind=listing|project&tab=… — A12's panel. */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = new Set<ListingTab>([
  "preview",
  "fields",
  "photos",
  "leads",
  "boost",
  "reports",
  "timeline",
]);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const url = new URL(req.url);
    const kind: MasterKind = url.searchParams.get("kind") === "project" ? "project" : "listing";
    const header = await listingHeader(kind, params.id);
    if (!header) return fail("NOT_FOUND");

    const asked = (url.searchParams.get("tab") ?? "preview") as ListingTab;
    const tab = TABS.has(asked) ? asked : "preview";
    const data = await listingTab(kind, params.id, tab);

    return ok({ header, tab, data });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
