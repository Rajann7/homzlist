import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin, type AdminIdentity } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { releaseReviewLock } from "@/lib/admin/review-lock";
import { decideAppeal, decideVerification, actOnReport, type ReportAction } from "@/lib/admin/decisions";
import { moderate } from "@/lib/listings/moderation";
import { approveBoost, rejectBoost } from "@/lib/billing/boost";

/**
 * POST /api/v1/admin/queues/:queue/:id — every decision A3-A9 can make.
 *
 * One route because there is one gate. The alternative — a route per queue —
 * is six places to forget `requireAdmin`, six places to forget the audit row,
 * and six subtly different error shapes for the same six buttons.
 *
 * WHY THIS EXISTS ALONGSIDE /api/v1/admin/moderate: that endpoint authorizes
 * with the USER session (`getCurrentUser` + `isStaff`), which is host-only to
 * the public and seller hosts. An admin signed into account.homzlist.com has no
 * such cookie, so the panel literally cannot call it — the same class of bug as
 * the middleware gate P2 fixed. This authorizes with the ADMIN session and then
 * calls the SAME library functions, so there is still exactly one state machine
 * for listings, one for boosts, and the seller app and the panel cannot drift.
 *
 * Every branch writes an audit row naming the subject, because "who approved
 * #4521" must have an answer that is not "someone, in a bulk action".
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  action?: string;
  reason?: string | null;
  notes?: Record<string, string> | null;
  message?: string | null;
  days?: number | null;
  subjectType?: string | null;
};

/** The listing/requirement state machine, reused verbatim. */
async function moderationDecision(
  subject: "listing" | "requirement",
  id: string,
  me: AdminIdentity,
  body: Body,
) {
  const action = body.action;
  if (action !== "approve" && action !== "request_changes" && action !== "reject") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }

  // Per-field notes — the design's "click any field → attach note" composer.
  const notes =
    body.notes && typeof body.notes === "object"
      ? Object.fromEntries(
          Object.entries(body.notes)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string" && v.trim())
            .slice(0, 30)
            .map(([k, v]) => [k, String(v).slice(0, 300)]),
        )
      : null;

  if (action === "request_changes" && !notes && !body.reason?.trim()) {
    // "Request changes" with nothing attached tells the poster nothing.
    return fail("VALIDATION_ERROR", { field: "notes" });
  }

  const res = await moderate(subject, id, me.id, {
    action,
    notes,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
  });

  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "locked") return fail("LISTING_STATE_LOCKED", { locked: true });
    if (res.reason === "bad_state") return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
    return fail("VALIDATION_ERROR");
  }

  await writeAudit(me, {
    action,
    entityType: subject,
    entityId: id,
    entityLabel: `${subject === "listing" ? "Listing" : "Requirement"} ${id.slice(0, 8)}`,
    summary:
      action === "approve"
        ? `Approved a ${subject}`
        : action === "reject"
          ? `Rejected a ${subject}${res.locked ? " — third rejection, now locked" : ""}`
          : `Requested changes on a ${subject}`,
    diff: { reason: body.reason ?? null, notes, rejectCount: res.rejectCount },
  });

  // The decision is made; holding the lock afterwards only blocks the next admin.
  await releaseReviewLock(subject, id, me).catch(() => {});

  return ok({ status: res.status, locked: res.locked, rejectCount: res.rejectCount });
}

async function boostDecision(id: string, me: AdminIdentity, body: Body) {
  if (body.action !== "approve" && body.action !== "reject") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }
  if (body.action === "reject" && !body.reason?.trim()) {
    // Rejecting sends money back; a refund with no stated reason is not
    // something anyone should be able to do by accident.
    return fail("VALIDATION_ERROR", { field: "reason" });
  }

  const res =
    body.action === "approve"
      ? await approveBoost(id, me.id)
      : await rejectBoost(id, me.id, body.reason!.slice(0, 300));

  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "validation") return fail("VALIDATION_ERROR", { field: "reason" });
    if (res.reason === "ineligible") {
      return fail("LISTING_STATE_LOCKED", { autoRejected: true, refunding: true });
    }
    if (res.reason === "city_cap") return fail("LISTING_STATE_LOCKED", { cityCapReached: true });
    // The order was never paid, or has since been refunded — see approveBoost.
    if (res.reason === "unpaid") return fail("PAYMENT_PENDING", { unpaid: true });
    return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
  }

  await writeAudit(me, {
    action: body.action === "approve" ? "boost_approve" : "boost_reject",
    entityType: "boost",
    entityId: id,
    entityLabel: `Boost ${id.slice(0, 8)}`,
    summary:
      body.action === "approve"
        ? "Approved a paid boost — the window starts now"
        : "Rejected a paid boost — refund queued",
    diff: { reason: body.reason ?? null },
    // Money moves. That is a sensitive action by definition.
    sensitive: body.action === "reject",
  });

  return ok(res);
}

export async function POST(req: NextRequest, { params }: { params: { queue: string; id: string } }) {
  try {
    const me = await requireAdmin("staff");
    const body = ((await req.json().catch(() => null)) ?? {}) as Body;
    const { queue, id } = params;

    // Reports act on an ENTITY id, which is a uuid too, so one shape covers all.
    if (!UUID_RE.test(id)) return fail("NOT_FOUND");

    if (queue === "listings") return await moderationDecision("listing", id, me, body);
    if (queue === "requirements") return await moderationDecision("requirement", id, me, body);
    if (queue === "boosts") return await boostDecision(id, me, body);

    if (queue === "verifications") {
      const action = body.action;
      if (action !== "approve" && action !== "reject" && action !== "revoke") {
        return fail("VALIDATION_ERROR", { field: "action" });
      }
      const res = await decideVerification(id, me, action, body.reason ?? null);
      if (!res.ok) {
        if (res.reason === "not_found") return fail("NOT_FOUND");
        if (res.reason === "validation") return fail("VALIDATION_ERROR", { field: "reason" });
        return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
      }
      await writeAudit(me, {
        action: `verification_${action}`,
        entityType: "verification",
        entityId: id,
        entityLabel: res.label,
        summary:
          action === "approve"
            ? "Approved a verification and granted the badge"
            : action === "reject"
              ? "Rejected a verification"
              : "Revoked a verification badge",
        diff: { reason: body.reason ?? null },
        sensitive: action === "revoke",
      });
      return ok({ decided: action });
    }

    if (queue === "appeals") {
      const action = body.action;
      if (
        action !== "dismiss_flag" &&
        action !== "uphold_flag" &&
        action !== "unlock" &&
        action !== "keep_locked"
      ) {
        return fail("VALIDATION_ERROR", { field: "action" });
      }
      const res = await decideAppeal(id, me, action, body.reason ?? null);
      if (!res.ok) {
        if (res.reason === "not_found") return fail("NOT_FOUND");
        if (res.reason === "validation") return fail("VALIDATION_ERROR", { field: "action" });
        return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
      }
      await writeAudit(me, {
        action: `appeal_${action}`,
        entityType: "appeal",
        entityId: id,
        entityLabel: res.label,
        summary:
          action === "unlock"
            ? "Unlocked a rejection-locked listing — the poster gets one more try"
            : action === "dismiss_flag"
              ? "Dismissed an auto-flag — the content is visible again"
              : action === "uphold_flag"
                ? "Upheld an auto-flag"
                : "Kept a listing locked",
        diff: { note: body.reason ?? null },
      });
      return ok({ decided: action });
    }

    if (queue === "reports") {
      const action = body.action as ReportAction;
      const allowed: ReportAction[] = [
        "dismiss",
        "hide_entity",
        "warn",
        "suspend",
        "ban_device",
        "escalate",
      ];
      if (!allowed.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });
      // The design gates this one on super (template 943) — and so does the
      // server, because the client's copy of the role decides nothing.
      if (action === "ban_device") await requireAdmin("super");
      if (action === "suspend") await requireAdmin("admin");

      const subjectType = body.subjectType ?? "listing";
      const res = await actOnReport(subjectType, id, me, action, {
        reason: body.reason ?? null,
        days: body.days ?? null,
        message: body.message ?? null,
      });
      if (!res.ok) {
        if (res.reason === "not_found") return fail("NOT_FOUND");
        return fail("VALIDATION_ERROR");
      }
      await writeAudit(me, {
        action: `report_${action}`,
        entityType: subjectType,
        entityId: id,
        entityLabel: res.label,
        summary: `${action.replace(/_/g, " ")} — ${res.detail ?? "report resolved"}`,
        diff: { reason: body.reason ?? null, days: body.days ?? null },
        sensitive: action === "suspend" || action === "ban_device",
      });
      return ok({ decided: action, detail: res.detail ?? null });
    }

    return fail("NOT_FOUND");
  } catch (e) {
    return adminErrorResponse(e);
  }
}
