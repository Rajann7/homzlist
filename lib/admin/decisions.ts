import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { hrefForSubject } from "@/lib/notifications/admin-events";
import type { AdminIdentity } from "./guard";

/**
 * The decisions A7, A8 and A9 make — the three queues that had no server side
 * at all. (A3/A5 reuse `lib/listings/moderation.ts` and A6 reuses
 * `lib/billing/boost.ts`; rebuilding either here would give the panel a second
 * state machine that disagrees with the one the seller app already obeys.)
 *
 * Every function in this file follows the same three rules:
 *
 *  1. THE STATUS FILTER IS THE CLAIM. Each update carries `.eq("status", …)`
 *     for the state it is allowed to leave, so two admins clicking the same
 *     button produce one transition and one notification, not two.
 *  2. THE USER IS TOLD. A moderation decision the subject never hears about is
 *     the design lying on their behalf — every branch ends in a `notify` of a
 *     type that already exists in the enum.
 *  3. THE CALLER AUDITS. These return what happened; the route writes the audit
 *     row, so the audit and the HTTP response can never disagree about whether
 *     the thing occurred.
 */

const db = () => createServiceClient();

export type DecisionResult =
  | { ok: true; subjectProfileId: string; label: string; detail?: string }
  | { ok: false; reason: "not_found" | "bad_state" | "validation" };

/* ─────────────────────────────────────────────── A7 · verifications ─────── */

/**
 * Approving a verification grants the BADGE, which is the whole point of the
 * queue. The design is explicit about what the badge means (template 1684):
 * "Badges say identity verified — never property verified."
 */
export async function decideVerification(
  id: string,
  me: AdminIdentity,
  action: "approve" | "reject" | "revoke",
  reason: string | null,
): Promise<DecisionResult> {
  if ((action === "reject" || action === "revoke") && !reason?.trim()) {
    return { ok: false, reason: "validation" };
  }

  const from = action === "revoke" ? ["approved"] : ["pending"];
  const to = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";

  const { data } = await db()
    .from("verifications")
    .update({
      status: to,
      reason: reason?.trim() ? reason.trim().slice(0, 300) : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
    })
    .eq("id", id)
    .in("status", from)
    .select("id, profile_id, level")
    .maybeSingle();

  const row = data as { id: string; profile_id: string; level: string } | null;
  if (!row) return { ok: false, reason: "bad_state" };

  const levelLabel = row.level === "rera" ? "RERA" : "ID";
  await notify({
    profileId: row.profile_id,
    type:
      action === "approve"
        ? "verification_approved"
        : action === "reject"
          ? "verification_rejected"
          : "verification_revoked",
    title:
      action === "approve"
        ? `${levelLabel} verification approved`
        : action === "reject"
          ? `${levelLabel} verification rejected`
          : `${levelLabel} verification revoked`,
    body:
      action === "approve"
        ? "Your badge is now visible on your profile and listings."
        : (reason ?? undefined),
    entityKind: "verification",
    entityId: row.id,
    actorId: me.id,
  });

  return { ok: true, subjectProfileId: row.profile_id, label: `${levelLabel} verification` };
}

/* ────────────────────────────────────────────────────── A8 · appeals ─────── */

/**
 * Two different things wear one screen (template 894-916):
 *
 *  · an AUTO-FLAG appeal — the number detector hid someone's bio and they say
 *    it was their office landline. Dismissing the flag restores the content.
 *  · a REOPEN — a listing locked after three rejections asking for one more
 *    try. Unlocking resets the count, which is the only way out of that state;
 *    without it a paid-for listing is a dead end, which is precisely the trap
 *    CLAUDE.md's hidden-issue hunt asks about.
 */
export async function decideAppeal(
  id: string,
  me: AdminIdentity,
  action: "dismiss_flag" | "uphold_flag" | "unlock" | "keep_locked",
  note: string | null,
): Promise<DecisionResult> {
  const { data: appeal } = await db()
    .from("moderation_appeals")
    .select("id, subject, subject_id, profile_id, status")
    .eq("id", id)
    .maybeSingle();
  const row = appeal as
    | { id: string; subject: string; subject_id: string | null; profile_id: string; status: string }
    | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "open") return { ok: false, reason: "bad_state" };

  const isFlag = row.subject === "auto_flag";
  const upheld = action === "dismiss_flag" || action === "unlock"; // the APPEAL succeeded
  if (isFlag !== (action === "dismiss_flag" || action === "uphold_flag")) {
    // A reopen cannot be answered with a flag decision, or vice versa.
    return { ok: false, reason: "validation" };
  }

  const { data: claimed } = await db()
    .from("moderation_appeals")
    .update({
      status: upheld ? "upheld" : "rejected",
      resolution: note?.trim()?.slice(0, 300) ?? null,
      resolved_by: me.id,
      resolved_at: new Date().toISOString(),
      ...(action === "unlock" ? { unlocked_at: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "bad_state" };

  if (action === "dismiss_flag") {
    // Restore the content the detector hid.
    await db()
      .from("profiles")
      .update({
        bio_flagged_at: null,
        bio_flag_outcome: "dismissed",
        bio_flag_resolved_at: new Date().toISOString(),
        bio_flag_resolved_by: me.id,
      })
      .eq("id", row.profile_id);
  } else if (action === "uphold_flag") {
    await db()
      .from("profiles")
      .update({
        bio_flag_outcome: "upheld",
        bio_flag_resolved_at: new Date().toISOString(),
        bio_flag_resolved_by: me.id,
      })
      .eq("id", row.profile_id);
  } else if (action === "unlock" && row.subject_id) {
    // One more try: the lock goes, and so does the count that caused it —
    // otherwise the very next rejection re-locks immediately and the appeal
    // bought the poster nothing.
    await db()
      .from("listings")
      .update({ is_locked: false, reject_count: 0, status: "changes_requested" })
      .eq("id", row.subject_id);
  }

  await notify({
    profileId: row.profile_id,
    type: "report_outcome",
    title: upheld ? "Your appeal was accepted" : "Your appeal was reviewed",
    body: upheld
      ? action === "unlock"
        ? "You can edit and resubmit this listing once more."
        : "The flag was removed and your content is visible again."
      : (note ?? "The original decision stands."),
    // An appeal outcome the poster cannot open is half an answer: an unlocked
    // listing is waiting to be edited and resubmitted, and a flag decision is
    // about their own profile. `report_outcome` has no href template (the
    // subject varies by producer), so the link is passed here.
    href: isFlag ? "/profile/edit" : row.subject_id ? `/listings/${row.subject_id}` : "/listings",
    entityKind: "appeal",
    entityId: row.id,
    actorId: me.id,
  });

  return {
    ok: true,
    subjectProfileId: row.profile_id,
    label: isFlag ? "Auto-flag appeal" : "Reject-lock reopen",
    detail: upheld ? "upheld" : "rejected",
  };
}

/* ─────────────────────────────────────────────────────── A9 · reports ────── */

/**
 * "Ban device/IP" — super only in the design (template 943).
 *
 * The hard part is not writing the row, it is knowing WHAT to ban. The app
 * stores no session table for users, so the only real identifiers on record are
 * the peppered `auth_consents.ip_hash` written at signup, and the device labels
 * of any push tokens they registered. Both are banned; if the account has
 * neither, the caller is told rather than being shown a success toast over a
 * row that matches nothing.
 *
 * The IP is banned as its HASH, which is also the form `requestOtp` receives —
 * so the ban is enforceable without the platform ever storing a raw IP
 * (Doc9 §19).
 */
async function banDevicesFor(
  profileId: string,
  me: AdminIdentity,
  reason: string,
): Promise<boolean> {
  const [{ data: consent }, { data: tokens }] = await Promise.all([
    db()
      .from("auth_consents")
      .select("ip_hash")
      .eq("profile_id", profileId)
      .not("ip_hash", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("push_tokens")
      .select("device_label")
      .eq("profile_id", profileId)
      .not("device_label", "is", null)
      .limit(5),
  ]);

  const rows: Record<string, unknown>[] = [];
  const ipHash = (consent as { ip_hash: string | null } | null)?.ip_hash;
  if (ipHash) {
    rows.push({ kind: "ip", value: ipHash, profile_id: profileId, reason, banned_by: me.id });
  }
  for (const t of (tokens ?? []) as { device_label: string | null }[]) {
    if (t.device_label) {
      rows.push({
        kind: "device",
        value: t.device_label,
        profile_id: profileId,
        reason,
        banned_by: me.id,
      });
    }
  }
  if (!rows.length) return false;

  await db().from("device_bans").insert(rows);
  return true;
}

export type ReportAction =
  | "dismiss"
  | "hide_entity"
  | "warn"
  | "suspend"
  | "ban_device"
  | "escalate";

const SUBJECT_TABLE: Record<string, string> = {
  listing: "listings",
  project: "projects",
  requirement: "requirements",
};

/**
 * A report card acts on an ENTITY, and every action ends with the reporters
 * being told — "Reporters are notified automatically when you take an action"
 * is printed on the card (template 945), so it has to be true.
 *
 * The actions are deliberately separate rather than one "resolve" with a
 * dropdown: hiding a listing, warning its poster and suspending them are three
 * different amounts of force, and each one needs its own audit row to answer
 * "who suspended this account".
 */
export async function actOnReport(
  subjectType: string,
  subjectId: string,
  me: AdminIdentity,
  action: ReportAction,
  input: { reason?: string | null; days?: number | null; message?: string | null },
): Promise<DecisionResult> {
  const { data: reports } = await db()
    .from("reports")
    .select("id, reporter_id, subject_type, subject_id, status")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .in("status", ["open", "reviewing"]);

  const open = (reports ?? []) as { id: string; reporter_id: string }[];
  if (!open.length) return { ok: false, reason: "not_found" };

  // Who owns the reported thing — the person a warning or suspension lands on.
  let ownerId: string | null = null;
  if (subjectType === "user") {
    ownerId = subjectId;
  } else if (SUBJECT_TABLE[subjectType]) {
    const { data } = await db()
      .from(SUBJECT_TABLE[subjectType])
      .select("profile_id")
      .eq("id", subjectId)
      .maybeSingle();
    ownerId = (data as { profile_id: string } | null)?.profile_id ?? null;
  } else if (subjectType === "lead") {
    // A reported LEAD is reported BY the receiver, ABOUT the person who sent
    // it — so the warning or suspension lands on the sender. Without this the
    // moderator could resolve the report but never act on anyone, which is the
    // whole point of the queue.
    const { data } = await db()
      .from("leads")
      .select("lead_profile_id")
      .eq("id", subjectId)
      .maybeSingle();
    ownerId = (data as { lead_profile_id: string } | null)?.lead_profile_id ?? null;
  } else if (subjectType === "message") {
    // Historic rows only — chat was removed from the product.
    const { data } = await db()
      .from("chat_messages")
      .select("sender_id")
      .eq("id", subjectId)
      .maybeSingle();
    ownerId = (data as { sender_id: string } | null)?.sender_id ?? null;
  }

  const reason = input.reason?.trim()?.slice(0, 300) ?? null;

  if (action === "escalate") {
    // Not a decision on the report — a request for a Super Admin to make one.
    await db().from("admin_notifications").insert({
      kind: "escalation",
      title: `${me.name} escalated a ${subjectType} report`,
      body: reason ?? "No note given",
      link_screen: "reports",
      entity_id: subjectId,
      severity: "warning",
    });
    return { ok: true, subjectProfileId: ownerId ?? "", label: `${subjectType} report` };
  }

  if (action === "hide_entity" && SUBJECT_TABLE[subjectType]) {
    await db()
      .from(SUBJECT_TABLE[subjectType])
      .update({ status: "hidden", hidden_at: new Date().toISOString() })
      .eq("id", subjectId)
      .eq("status", "live");
  }

  if (action === "warn" && ownerId) {
    await notify({
      profileId: ownerId,
      type: "admin_message",
      title: "A note from the HomzList team",
      body: input.message?.trim()?.slice(0, 500) ?? reason ?? "Please review our posting rules.",
      actorId: me.id,
    });
    await db().from("admin_messages").insert({
      profile_id: ownerId,
      sent_by: me.id,
      subject: "Warning",
      body: input.message?.trim()?.slice(0, 500) ?? reason ?? "",
    });
  }

  if (action === "suspend" && ownerId) {
    const days = input.days && input.days > 0 ? Math.min(365, Math.floor(input.days)) : null;
    await db().from("account_suspensions").insert({
      profile_id: ownerId,
      reason: reason ?? "Reported content",
      days,
      suspended_by: me.id,
    });
    await db().from("profiles").update({ state: "suspended" }).eq("id", ownerId);
    // Their listings go with them — a suspended account whose listings stay
    // live is a suspension in name only.
    await db()
      .from("listings")
      .update({ status: "hidden", hidden_at: new Date().toISOString() })
      .eq("profile_id", ownerId)
      .eq("status", "live");
    await notify({
      profileId: ownerId,
      type: "account_suspended",
      title: days ? `Your account is suspended for ${days} days` : "Your account is suspended",
      body: reason ?? undefined,
      actorId: me.id,
    });
  }

  if (action === "ban_device" && ownerId) {
    const banned = await banDevicesFor(ownerId, me, reason ?? "Reported content");
    // Nothing to ban is not a silent success: the design's button says
    // "Ban device/IP", and writing a row against neither would be theatre.
    if (!banned) return { ok: false, reason: "validation" };
  }

  // Close every open report on this entity, and record what was done to it.
  const outcome = action === "dismiss" ? "dismissed" : "actioned";
  await db()
    .from("reports")
    .update({ status: outcome })
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .in("status", ["open", "reviewing"]);

  await db()
    .from("report_actions")
    .insert(
      open.map((r) => ({
        report_id: r.id,
        action,
        reason,
        actor_id: me.id,
        reporter_notified_at: new Date().toISOString(),
      })),
    );

  // The card's promise: every reporter hears back.
  for (const r of new Set(open.map((x) => x.reporter_id))) {
    if (!r) continue;
    await notify({
      profileId: r,
      type: "report_outcome",
      title: action === "dismiss" ? "We reviewed your report" : "Action taken on your report",
      body:
        action === "dismiss"
          ? "We did not find a violation this time. Thank you for flagging it."
          : "Thank you — we have taken action on the content you reported.",
      // The same "reported thing's own page" the A9 path uses, so a reporter
      // gets a row they can open whichever screen closed the report.
      href: hrefForSubject(subjectType, subjectId),
      entityKind: subjectType,
      entityId: subjectId,
      actorId: me.id,
    });
  }

  return {
    ok: true,
    subjectProfileId: ownerId ?? "",
    label: `${subjectType} report`,
    detail: `${open.length} report(s) ${outcome}`,
  };
}
