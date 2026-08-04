import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin, ROLE_RANK, type AdminIdentity } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import type { AdminRole } from "@/lib/admin/session";
import {
  deleteListing,
  editListing,
  moderateFromMaster,
  forceExpireListing,
  hideListing,
  markSold,
  pauseBoost,
  photoAction,
  removeStory,
  restoreListing,
  type MasterKind,
  type MasterResult,
} from "@/lib/admin/listings-master";

/**
 * POST /api/v1/admin/listings-master/:id/actions — the A12 panel and its row
 * menu (template 1707, 1712), all through one gate with one audit rule.
 *
 * "Delete" is Super only because the design's own bulk bar gates it that way
 * (template 1071); everything else is Admin, which is the screen's minimum.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = Record<string, unknown>;
const str = (b: Body, k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");

const GATE: Record<string, { role: AdminRole; audit: string }> = {
  edit: { role: "admin", audit: "edit" },
  hide: { role: "admin", audit: "hide" },
  restore: { role: "admin", audit: "restore" },
  mark_sold: { role: "admin", audit: "mark_sold" },
  force_expire: { role: "admin", audit: "force_expire" },
  remove_story: { role: "admin", audit: "remove_story" },
  pause_boost: { role: "admin", audit: "pause_boost" },
  resume_boost: { role: "admin", audit: "resume_boost" },
  photo_cover: { role: "admin", audit: "photo_cover" },
  photo_remove: { role: "admin", audit: "photo_remove" },
  delete: { role: "super", audit: "delete" },
  // The three moderation decisions, reachable from A12 because a PROJECT has no
  // other screen that can make them (A3's queue is listings-only by design).
  approve: { role: "admin", audit: "approve" },
  request_changes: { role: "admin", audit: "request_changes" },
  reject: { role: "admin", audit: "reject" },
};

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return fail("VALIDATION_ERROR", { field: "body" });
    }

    const action = str(body, "action");
    const gate = GATE[action];
    if (!gate) return fail("VALIDATION_ERROR", { field: "action" });
    if (ROLE_RANK[me.role] < ROLE_RANK[gate.role]) return fail("FORBIDDEN");

    const kind: MasterKind = str(body, "kind") === "project" ? "project" : "listing";
    const result = await run(action, kind, params.id, me, body);

    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: gate.audit,
      entityType: kind,
      entityId: params.id,
      entityLabel: result.label,
      summary: result.summary,
      diff: result.diff ?? null,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

async function run(
  action: string,
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  body: Body,
): Promise<MasterResult> {
  switch (action) {
    case "edit": {
      const changes = (body.changes ?? {}) as Record<string, unknown>;
      return editListing(kind, id, me, changes, str(body, "reason"), Boolean(body.reReview));
    }
    case "hide":
      return hideListing(kind, id, me, str(body, "reason") || null);
    case "restore":
      return restoreListing(kind, id, me);
    case "mark_sold":
      return markSold(kind, id, me);
    case "force_expire":
      return forceExpireListing(kind, id, me);
    case "remove_story":
      return removeStory(kind, id, me);
    case "pause_boost":
      return pauseBoost(kind, id, me, false);
    case "resume_boost":
      return pauseBoost(kind, id, me, true);
    case "photo_cover":
    case "photo_remove": {
      const photoId = str(body, "photoId");
      if (!UUID_RE.test(photoId)) return { ok: false, reason: "validation" };
      return photoAction(kind, id, photoId, me, action === "photo_cover" ? "cover" : "remove");
    }
    case "delete":
      return deleteListing(kind, id, me, str(body, "reason") || null);
    case "approve":
    case "request_changes":
    case "reject": {
      const notes =
        body.notes && typeof body.notes === "object"
          ? Object.fromEntries(
              Object.entries(body.notes as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string" && v.trim())
                .slice(0, 30)
                .map(([k, v]) => [k, String(v).slice(0, 300)]),
            )
          : null;
      return moderateFromMaster(kind, id, me, action, str(body, "reason") || null, notes);
    }
    default:
      return { ok: false, reason: "validation" };
  }
}
