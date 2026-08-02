import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import {
  assignTicket,
  closeTicket,
  disputeDetail,
  escalateTicket,
  preserveEvidence,
  reopenTicket,
  replyToTicket,
  resolveDispute,
  setDisputeStatus,
  setTicketPriority,
  ticketDetail,
  type ActionResult,
} from "@/lib/admin/tickets";

/**
 * A23 — Tickets · A24 — Disputes (Doc5, template 2427-2521).
 *
 * One route for both because they share a shape and a set of guarantees: an
 * internal note is never delivered, a grievance clock cannot be set by hand,
 * and evidence preservation is one-way.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "";
    const id = url.searchParams.get("id") ?? "";

    if (what === "ticket") {
      const t = await ticketDetail(id);
      return t ? ok(t) : fail("NOT_FOUND");
    }
    if (what === "dispute") {
      const d = await disputeDetail(id);
      return d ? ok(d) : fail("NOT_FOUND");
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
      case "ticket_assign": {
        // `null` unassigns. "me" is resolved from the VERIFIED session rather
        // than trusted from the payload — the design's "Assign to me" must mean
        // the caller, not whichever id a crafted request supplies.
        const raw = typeof body.assignee === "string" ? body.assignee : null;
        result = await assignTicket(id, raw === "me" ? me.id : raw, me);
        break;
      }
      case "ticket_priority": result = await setTicketPriority(id, String(body.priority ?? ""), me); break;
      case "ticket_reply":
        result = await replyToTicket(id, String(body.body ?? ""), body.internal === true, me);
        break;
      case "ticket_close":    result = await closeTicket(id, String(body.resolution ?? ""), me); break;
      case "ticket_reopen":   result = await reopenTicket(id, me); break;
      case "ticket_escalate": result = await escalateTicket(id, String(body.reason ?? ""), me); break;

      // Evidence preservation is Super-only (the design's permission matrix,
      // template 2538) — it changes what we can be compelled to produce.
      case "dispute_preserve": {
        if (me.role !== "super") return fail("FORBIDDEN");
        result = await preserveEvidence(id, me);
        break;
      }
      case "dispute_status":  result = await setDisputeStatus(id, String(body.status ?? ""), me); break;
      case "dispute_resolve":
        result = await resolveDispute(id, String(body.outcome ?? ""), String(body.resolution ?? ""), me);
        break;
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
