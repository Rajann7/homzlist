import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { resourceByName } from "@/lib/admin/resources";
import { parseListParams, runList } from "@/lib/admin/list-query";

/**
 * GET /api/v1/admin/list/:resource
 *
 * The one endpoint behind every admin list. Filters, search, sort, tab, page and
 * page size all resolve to SQL in lib/admin/list-query.ts — the client never
 * receives more rows than it asked for and then narrows them itself.
 *
 * The role gate is the RESOURCE's own `minRole`, mirroring the design's
 * SCREEN_MIN_ROLE (template 248), so a screen cannot be reached through its data
 * endpoint by someone the sidebar would not even show the link to.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { resource: string } }) {
  const resource = resourceByName(params.resource);
  if (!resource) return fail("NOT_FOUND");

  try {
    await requireAdmin(resource.minRole);
    const listParams = parseListParams(new URL(req.url), resource);
    const result = await runList(resource, listParams);
    return ok(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
