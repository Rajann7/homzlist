import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { staffIdentity, STAFF_RANK, type StaffLevel } from "@/lib/listings/moderation";
import { writeAudit } from "@/lib/admin/audit";
import { resolveReport, liftSuspension, approveAreaRequest } from "@/lib/notifications/admin-events";

/**
 * POST /api/v1/admin/account-action — the three admin decisions that a USER is
 * notified about (Doc2 §14): report outcome, suspension lifted, area approved.
 *
 * The P13-15 dashboard will call this; it exists now because the transitions
 * and their notifications are Module 10's job, and a state nothing can enter is
 * a state that has never run.
 *
 * Staff-gated by the `staff` table, exactly like /admin/moderate. A non-staff
 * caller gets 404, not 403, so probing cannot confirm the endpoint exists
 * (Doc9 §API1).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["resolve_report", "lift_suspension", "approve_area"] as const;

/**
 * The level each action needs, taken from the PANEL's own gate for the same
 * decision so the two doors cannot disagree:
 *   · resolve_report  — A9 Reports queue is staff-gated
 *   · lift_suspension — A11's action bar gates it at Admin
 *   · approve_area    — Master data is an Admin screen
 *
 * Before this, all three were open to any `staff`-level account, which is the
 * hole: the panel would not let a Staff admin lift a suspension, and this
 * endpoint would.
 */
const ACTION_LEVEL: Record<(typeof ACTIONS)[number], StaffLevel> = {
  resolve_report: "staff",
  lift_suspension: "admin",
  approve_area: "admin",
};

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("NOT_FOUND");
  const staff = await staffIdentity(claims.sub);
  if (!staff) return fail("NOT_FOUND");

  const limited = await rateLimit(`admin-account-action:${claims.sub}`, 300, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const action = body.action;
  if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return fail("VALIDATION_ERROR", { field: "id" });
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : undefined;

  // FORBIDDEN, not NOT_FOUND: this caller has already proved they are staff, so
  // there is nothing left to hide from them — only something to refuse.
  if (STAFF_RANK[staff.level] < STAFF_RANK[ACTION_LEVEL[action as (typeof ACTIONS)[number]]]) {
    return fail("FORBIDDEN");
  }

  const audit = (entityType: string, summary: string) =>
    writeAudit(
      { id: staff.profileId, name: staff.name, role: staff.level },
      { action, entityType, entityId: id, entityLabel: `${entityType} ${id.slice(0, 8)}`, summary },
    );

  if (action === "resolve_report") {
    const outcome = body.outcome === "dismissed" ? "dismissed" : "actioned";
    const r = await resolveReport(id, claims.sub, outcome, note);
    if (!r.ok) return fail("NOT_FOUND");
    await audit("report", `Report ${outcome}`);
    return ok(r);
  }

  if (action === "lift_suspension") {
    const r = await liftSuspension(id, claims.sub, note);
    if (!r.ok) return fail("LISTING_STATE_LOCKED", { reason: r.reason });
    await audit("user", "Suspension lifted");
    return ok(r);
  }

  const slug = typeof body.areaSlug === "string" ? body.areaSlug.slice(0, 120) : null;
  const r = await approveAreaRequest(id, claims.sub, slug);
  if (!r.ok) return fail("NOT_FOUND");
  await audit("area_request", `Area approved${slug ? ` · ${slug}` : ""}`);
  return ok(r);
}
