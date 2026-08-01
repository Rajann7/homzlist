import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { resourceByName } from "@/lib/admin/resources";
import { bulkHandler, runBulk } from "@/lib/admin/bulk";
// Importing the registrations is what makes the registry non-empty — without
// this the endpoint 404s every action, which is what it did before P4.
import "@/lib/admin/bulk-actions";

/**
 * POST /api/v1/admin/bulk/:resource/:action  { ids: string[] }
 *
 * Authorized twice: the RESOURCE's minimum role to be here at all, then the
 * ACTION's own — approving is not the same privilege as reading a queue. The cap
 * is enforced here, not only in the bulk bar, so a client that sends 500 ids is
 * rejected rather than trusted.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(
  req: NextRequest,
  { params }: { params: { resource: string; action: string } },
) {
  const resource = resourceByName(params.resource);
  if (!resource) return fail("NOT_FOUND");
  const handler = bulkHandler(params.resource, params.action);
  if (!handler) return fail("NOT_FOUND");

  const body = (await req.json().catch(() => null)) as
    | { ids?: unknown; input?: Record<string, unknown> }
    | null;
  if (!Array.isArray(body?.ids) || !body.ids.length) return fail("VALIDATION_ERROR");
  const ids = (body.ids as unknown[]).map(String);

  try {
    await requireAdmin(resource.minRole);
    const me = await requireAdmin(handler.minRole);
    if (ids.length > handler.cap) return fail("VALIDATION_ERROR", { cap: handler.cap });
    const result = await runBulk(me, handler, ids, body?.input ?? {});
    return ok(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
