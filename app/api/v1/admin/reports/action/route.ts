import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability, requireStaff } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/reports/action — A9's action row (Doc5 A9, Doc3 §1.6).
 *
 * A report action is taken on the GROUP, not on one row: three people reporting
 * the same listing is one decision, so every report id in the group is closed
 * together and every reporter is notified. The card's footer promises exactly
 * that ("Reporters are notified automatically when you take an action") — this is
 * the code behind it.
 *
 * Actions and what each one actually does:
 *   dismiss  → reports closed as `dismissed`, reporters told nothing was wrong
 *   hide     → the reported item is hidden from feed and search, owner notified
 *   warn     → an admin_messages row the user receives, reports actioned
 *   suspend  → profiles.state = suspended + an account_suspensions row
 *   ban      → a device_bans row (SUPER only — the design gates this button)
 *   escalate → left open, addressed to a Super Admin's bell
 *
 * Capabilities are per action, not per endpoint: `queues.decide` covers the queue
 * verbs, but banning a device needs `devicebans` (Super) and suspending needs
 * `users.edit` (Admin). A Staff seat can dismiss a report and cannot suspend
 * anybody — and that is enforced here, not by hiding the button.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["dismiss", "hide", "warn", "suspend", "ban", "escalate", "note"] as const;
type Action = (typeof ACTIONS)[number];

const ITEM_TABLE: Record<string, string> = { listing: "listings", project: "projects", requirement: "requirements" };

export async function POST(req: NextRequest) {
  // Every action needs at least a seat that can work the queues; the heavier ones
  // re-check below.
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  const staff = gate.staff;

  let body: {
    action?: unknown;
    reportIds?: unknown;
    subjectType?: unknown;
    subjectId?: unknown;
    ownerId?: unknown;
    reason?: unknown;
    /** suspend: `moderation_action_options` kind=suspend_duration value. */
    days?: unknown;
    /** warn: the template value; the body is sent as `reason`. */
    template?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });

  const reportIds = Array.isArray(body.reportIds)
    ? body.reportIds.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 100)
    : [];
  if (!reportIds.length) return fail("VALIDATION_ERROR", { field: "reportIds" });

  const subjectType = typeof body.subjectType === "string" ? body.subjectType : "";
  const subjectId = typeof body.subjectId === "string" && UUID_RE.test(body.subjectId) ? body.subjectId : "";
  if (!subjectType || !subjectId) return fail("VALIDATION_ERROR", { field: "subjectId" });

  const ownerId = typeof body.ownerId === "string" && UUID_RE.test(body.ownerId) ? body.ownerId : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const db = createServiceClient();

  // The ids must really belong to this subject — otherwise a crafted request
  // could close somebody else's reports under cover of this one.
  const { data: found } = await db
    .from("reports")
    .select("id, status")
    .in("id", reportIds)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId);
  const rows = (found ?? []) as Array<Record<string, unknown>>;
  if (rows.length !== reportIds.length) return fail("VALIDATION_ERROR", { field: "reportIds" });
  if (!rows.some((r) => r.status === "open" || r.status === "reviewing")) {
    return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
  }

  let summary = "";
  let closeAs: "dismissed" | "actioned" | null = "actioned";
  let sensitive = false;

  switch (action) {
    // -------------------------------------------------------------- internal note
    case "note": {
      const seat = await requireStaff();
      if (isDenial(seat)) return seat.response;
      if (reason.length < 2) return fail("VALIDATION_ERROR", { field: "reason" });
      await db.from("admin_notes").insert({
        subject_type: subjectType,
        subject_id: subjectId,
        author_id: staff.id,
        author_name: staff.name,
        body: reason,
      });
      // A note is not a decision — the reports stay open.
      closeAs = null;
      summary = "Added an internal note on a reported item";
      break;
    }

    // ------------------------------------------------------------------- dismiss
    case "dismiss": {
      closeAs = "dismissed";
      summary = `Dismissed ${reportIds.length} report${reportIds.length === 1 ? "" : "s"}${reason ? ` — ${reason}` : ""}`;
      break;
    }

    // ---------------------------------------------------------------------- hide
    case "hide": {
      const table = ITEM_TABLE[subjectType];
      if (!table) return fail("VALIDATION_ERROR", { field: "subjectType" });
      const cap = await requireCapability("listings.edit");
      if (isDenial(cap)) return cap.response;

      const { data: hidden } = await db
        .from(table)
        .update({ status: "hidden", hidden_at: new Date().toISOString() })
        .eq("id", subjectId)
        .select("id")
        .maybeSingle();
      if (!hidden) return fail("LISTING_STATE_LOCKED", { notHidden: true });

      if (ownerId) {
        await notifyOwner(
          ownerId,
          "Your listing was **hidden** after a report",
          `${reason || "It was reported and does not meet our content rules."} You can edit it and contact support to restore it.`,
        );
      }
      summary = `Hid a reported ${subjectType} — ${reason || "reported content"}`;
      break;
    }

    // ---------------------------------------------------------------------- warn
    case "warn": {
      if (!ownerId) return fail("VALIDATION_ERROR", { field: "ownerId" });
      const cap = await requireCapability("users.edit");
      if (isDenial(cap)) return cap.response;
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

      await db.from("admin_messages").insert({
        profile_id: ownerId,
        channel: "in_app",
        subject: "A warning about your account",
        body: reason,
        sent_by: staff.id,
        sent_by_name: staff.name,
        delivered_at: new Date().toISOString(),
      });
      await db.from("moderation_events").insert({
        profile_id: ownerId,
        kind: "warning",
        severity: "warning",
        title: "Warning from the HomzList team",
        detail: reason.slice(0, 300),
      });
      await notifyOwner(ownerId, "A **warning** about your account", reason.slice(0, 200));
      summary = "Warned a reported user";
      break;
    }

    // ------------------------------------------------------------------- suspend
    case "suspend": {
      if (!ownerId) return fail("VALIDATION_ERROR", { field: "ownerId" });
      const cap = await requireCapability("users.edit");
      if (isDenial(cap)) return cap.response;
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

      // The duration must be one the config offers ("0" = until review).
      const durations = await actionOptions("suspend_duration");
      const value = typeof body.days === "string" ? body.days : "";
      const chosen = durations.find((d) => d.value === value);
      if (!chosen) return fail("VALIDATION_ERROR", { field: "days" });
      const days = Number(chosen.value) || 0;

      await db.from("profiles").update({ state: "suspended" }).eq("id", ownerId);
      await db.from("account_suspensions").insert({
        profile_id: ownerId,
        reason,
        days: days || null,
        suspended_by: staff.id,
      });
      await db.from("moderation_events").insert({
        profile_id: ownerId,
        kind: "rejection",
        severity: "error",
        title: `Account suspended · ${chosen.label}`,
        detail: reason.slice(0, 300),
      });
      await notifyOwner(
        ownerId,
        "Your account has been **suspended**",
        `${chosen.label} · ${reason.slice(0, 180)} Your listings are hidden and chats are frozen.`,
      );
      summary = `Suspended a reported user (${chosen.label}) — ${reason}`;
      sensitive = true;
      break;
    }

    // ----------------------------------------------------------------------- ban
    case "ban": {
      // Super only, exactly as the design gates the button — and enforced here.
      const cap = await requireCapability("devicebans");
      if (isDenial(cap)) return cap.response;
      if (!ownerId) return fail("VALIDATION_ERROR", { field: "ownerId" });
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

      /**
       * What gets banned is not something this endpoint can invent — it has to be
       * something the user really connected from.
       *
       * HomzList never stores a user's raw IP (Doc9 §26), so the ban is keyed on
       * `auth_consents.ip_hash`: the same salted hash the app computes at request
       * time, which makes the ban enforceable without ever holding the address.
       * A device string from `push_tokens.user_agent` is the fallback for a user
       * who has a push registration but no consent row.
       *
       * With neither on record there is nothing to ban, and saying so beats
       * writing a row that blocks nobody.
       */
      const [{ data: consent }, { data: push }] = await Promise.all([
        db
          .from("auth_consents")
          .select("ip_hash, accepted_at")
          .eq("profile_id", ownerId)
          .not("ip_hash", "is", null)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("push_tokens")
          .select("user_agent")
          .eq("profile_id", ownerId)
          .not("user_agent", "is", null)
          .limit(1)
          .maybeSingle(),
      ]);

      const ipHash = ((consent ?? {}) as Record<string, unknown>).ip_hash as string | undefined;
      const device = ((push ?? {}) as Record<string, unknown>).user_agent as string | undefined;
      const kind = ipHash ? "ip_hash" : device ? "device" : null;
      const value = ipHash ?? device ?? "";
      if (!kind) return fail("VALIDATION_ERROR", { field: "ownerId", detail: "no_device_on_record" });

      await db.from("device_bans").insert({
        kind,
        value,
        profile_id: ownerId,
        reason,
        banned_by: staff.id,
      });
      summary = `Banned the ${kind === "ip_hash" ? "IP" : "device"} behind a reported user — ${reason}`;
      sensitive = true;
      break;
    }

    // ------------------------------------------------------------------ escalate
    case "escalate": {
      // Escalation deliberately leaves the reports OPEN: it hands the decision up,
      // it does not make one.
      closeAs = null;
      const { data: supers } = await db.from("staff").select("profile_id").eq("level", "super").eq("is_active", true);
      const seats = ((supers ?? []) as Array<{ profile_id: string }>).map((s) => s.profile_id);
      if (!seats.length) return fail("VALIDATION_ERROR", { field: "action", detail: "no_super_admin" });

      await db.from("admin_notifications").insert(
        seats.map((id) => ({
          kind: "report",
          severity: "error",
          staff_id: id,
          title: `${staff.name} escalated a reported ${subjectType}`,
          body: reason || `${reportIds.length} report(s) on #${subjectId.slice(0, 8)} need a Super Admin decision.`,
          link_screen: "/queues/reports",
        })),
      );
      summary = `Escalated a reported ${subjectType} to Super Admin${reason ? ` — ${reason}` : ""}`;
      break;
    }
  }

  // ---- close the group + notify every reporter -----------------------------
  let notified = 0;
  if (closeAs) {
    await db.from("reports").update({ status: closeAs }).in("id", reportIds);

    await db.from("report_actions").insert(
      reportIds.map((id) => ({
        report_id: id,
        action,
        reason: reason || null,
        actor_id: staff.id,
        reporter_notified_at: new Date().toISOString(),
      })),
    );

    notified = await notifyReporters(db, reportIds, action);
  } else {
    // A note or an escalation is still recorded against each report, so A9's
    // history shows what happened even though nothing was decided.
    await db.from("report_actions").insert(
      reportIds.map((id) => ({ report_id: id, action, reason: reason || null, actor_id: staff.id })),
    );
  }

  await audit({
    actor: staff,
    action:
      action === "dismiss" ? "reject"
      : action === "suspend" ? "suspend"
      : action === "ban" ? "device_ban"
      : action === "hide" ? "edit"
      : "send",
    entityType: "report",
    entityId: subjectId,
    entityLabel: `${subjectType} #${subjectId.slice(0, 8)} · ${reportIds.length} report${reportIds.length === 1 ? "" : "s"}`,
    summary,
    reason: reason || null,
    sensitive,
  });

  return ok({ closed: closeAs ? reportIds.length : 0, status: closeAs, reportersNotified: notified });
}

type Db = ReturnType<typeof createServiceClient>;

async function notifyOwner(profileId: string, title: string, body: string): Promise<void> {
  const { notify } = await import("@/lib/notifications/service");
  await notify({ profileId, type: "report_outcome", title, body });
}

/**
 * "Reporters are notified automatically when you take an action" — the card says
 * it, so it happens here. One notification per reporter, never one per report, so
 * somebody who reported twice is not messaged twice.
 */
async function notifyReporters(db: Db, reportIds: string[], action: Action): Promise<number> {
  const { data } = await db.from("reports").select("reporter_id").in("id", reportIds);
  const ids = [...new Set(((data ?? []) as Array<{ reporter_id: string }>).map((r) => r.reporter_id).filter(Boolean))];
  if (!ids.length) return 0;

  const copy =
    action === "dismiss"
      ? {
          title: "We reviewed your report",
          body: "We looked into it and did not find a breach of our rules. Thank you for telling us.",
        }
      : {
          title: "We **acted** on your report",
          body: "Thank you — we reviewed it and took action. We can't share the details of what we did.",
        };

  const { notify } = await import("@/lib/notifications/service");
  for (const id of ids) {
    await notify({ profileId: id, type: "report_outcome", title: copy.title, body: copy.body });
  }
  return ids.length;
}

/**
 * POST-only, but Next.js answers an unmatched method with 405 — and a 405 on
 * account.homzlist.com confirms the route exists to anyone walking paths, which
 * Doc9 §API1 does not allow. An explicit GET that 404s keeps every probe
 * indistinguishable from a path that was never there.
 */
export async function GET() {
  return fail("NOT_FOUND");
}
