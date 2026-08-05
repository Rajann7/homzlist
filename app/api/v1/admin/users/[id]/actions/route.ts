import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin, ROLE_RANK, type AdminIdentity } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import type { AdminRole } from "@/lib/admin/session";
import {
  addNote,
  adjustBalance,
  banUserDevices,
  changeRole,
  deleteNote,
  deleteUser,
  editProfileField,
  forceExpireRequirement,
  grantTrial,
  liftSuspension,
  mergeAccounts,
  sendAdminMessage,
  signOutUser,
  suspendUser,
  type UserActionResult,
} from "@/lib/admin/users";

/**
 * POST /api/v1/admin/users/:id/actions — every button on A11's action bar.
 *
 * One route because there is one gate and one audit rule. Each action declares
 * the ROLE it needs and the audit action it writes; the design's `gatedBtn`
 * (template 961) draws the same gate in the UI, but the UI half is never the
 * whole of it — a staff account POSTing here directly is refused by
 * `ROLE_RANK`, not by the button being dimmed.
 *
 * The audit row is written from what the library returned, so the trail and the
 * response can never disagree about whether the thing happened.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = Record<string, unknown>;

const str = (b: Body, k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
const num = (b: Body, k: string) => (typeof b[k] === "number" ? (b[k] as number) : null);

/** action → the role the design gates it behind, and its audit verb. */
const GATE: Record<string, { role: AdminRole; audit: string; entity?: string; sensitive?: boolean }> = {
  suspend: { role: "admin", audit: "suspend" },
  lift_suspension: { role: "admin", audit: "lift_suspension" },
  role_change: { role: "admin", audit: "role_change" },
  grant_trial: { role: "admin", audit: "grant" },
  adjust_balance: { role: "admin", audit: "adjust_balance" },
  send_message: { role: "staff", audit: "message" },
  add_note: { role: "staff", audit: "note" },
  delete_note: { role: "staff", audit: "note_delete" },
  edit_field: { role: "admin", audit: "edit" },
  merge: { role: "super", audit: "merge" },
  ban_device: { role: "super", audit: "ban_device", sensitive: true },
  delete_user: { role: "super", audit: "delete", sensitive: true },
  sign_out: { role: "admin", audit: "revoke_session" },
  force_expire_requirement: { role: "admin", audit: "force_expire", entity: "requirement" },
};

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("staff");
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

    const result = await run(action, params.id, me, body);

    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: gate.audit,
      entityType: gate.entity ?? "user",
      entityId: params.id,
      entityLabel: result.label,
      summary: result.summary,
      diff: result.diff ?? null,
      sensitive: gate.sensitive ?? false,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

async function run(
  action: string,
  id: string,
  me: AdminIdentity,
  body: Body,
): Promise<UserActionResult> {
  switch (action) {
    case "suspend": {
      // "7 days · 30 days · Until review" (template 1695) — "until review" is a
      // null duration, not a very large one.
      const days = num(body, "days");
      return suspendUser(id, me, days && days > 0 ? Math.min(365, Math.floor(days)) : null, str(body, "reason"));
    }
    case "lift_suspension":
      return liftSuspension(id, me);
    case "role_change": {
      const to = str(body, "role");
      if (to !== "owner" && to !== "broker" && to !== "builder")
        return { ok: false, reason: "validation", message: "Unknown role" };
      return changeRole(id, me, to, str(body, "reason"));
    }
    case "grant_trial": {
      const c = (body.contents ?? {}) as Record<string, unknown>;
      const int = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.min(50, Math.floor(v)) : 0);
      return grantTrial(
        id,
        me,
        {
          listings: int(c.listings),
          requirements: int(c.requirements),
          proposals: int(c.proposals),
          projects: int(c.projects),
        },
        num(body, "durationDays") ?? 14,
        str(body, "reason"),
        str(body, "note") || null,
      );
    }
    case "adjust_balance": {
      const kind = str(body, "kind");
      if (!["proposal", "listing", "requirement", "project"].includes(kind))
        return { ok: false, reason: "validation", message: "Unknown balance" };
      return adjustBalance(
        id,
        me,
        kind as "proposal" | "listing" | "requirement" | "project",
        num(body, "delta") ?? 0,
        str(body, "reason"),
      );
    }
    case "send_message": {
      const channels = Array.isArray(body.channels) ? (body.channels as string[]) : ["in_app"];
      const ids = Array.isArray(body.ids) && (body.ids as string[]).length
        ? (body.ids as string[]).filter((x) => UUID_RE.test(x)).slice(0, 200)
        : [id];
      return sendAdminMessage(ids, me, channels, str(body, "subject"), str(body, "body"));
    }
    case "add_note":
      return addNote(id, me, str(body, "body"));
    case "delete_note": {
      const noteId = str(body, "noteId");
      if (!UUID_RE.test(noteId)) return { ok: false, reason: "validation" };
      return deleteNote(noteId, me);
    }
    case "edit_field":
      return editProfileField(id, me, str(body, "field"), str(body, "value"));
    case "merge": {
      const other = str(body, "mergedId");
      if (!UUID_RE.test(other)) return { ok: false, reason: "validation", message: "Pick an account" };
      if (str(body, "confirm") !== "MERGE")
        return { ok: false, reason: "validation", message: "Type MERGE to confirm" };
      return mergeAccounts(id, other, me, str(body, "reason") || null);
    }
    case "ban_device":
      return banUserDevices(id, me, str(body, "reason"));
    case "delete_user": {
      // The dialog demands the word; so does the server (template 1776).
      if (str(body, "confirm") !== "DELETE")
        return { ok: false, reason: "validation", message: "Type DELETE to confirm" };
      return deleteUser(id, me);
    }
    case "sign_out":
      return signOutUser(id, str(body, "sid") || null);
    case "force_expire_requirement": {
      const reqId = str(body, "requirementId");
      if (!UUID_RE.test(reqId)) return { ok: false, reason: "validation" };
      return forceExpireRequirement(reqId, me);
    }
    default:
      return { ok: false, reason: "validation" };
  }
}
