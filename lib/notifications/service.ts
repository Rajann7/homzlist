import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "./push";
import { sendEmail, renderEmail } from "./email";
import { renderTemplate } from "./templates";
import { getPrefs, globalSettings, quietHold, type Prefs } from "./prefs";
import { typeConfig, resolveHref, type NotificationType, type NotificationAction } from "./catalog";

/**
 * The notification engine (Doc2 §14).
 *
 * ONE entry point — `notify` — that is responsible for the whole rule set:
 *
 *   grouping        per-thread / per-batch collapse ("Rahul: 5 new messages",
 *                   "10 listings approved") — done atomically in SQL by
 *                   notify_upsert so two concurrent events can't split a group.
 *   preferences     per-category toggles; marketing needs explicit DPDP consent
 *                   before ANY channel fires.
 *   quiet hours     non-urgent events at night hold their CHANNELS until
 *                   morning; the in-app row still appears immediately.
 *   channel dedup   push first. If a device was actually reached, email is
 *                   HELD, not sent — and the release sweep only sends it if the
 *                   notification is still unread. That is "push-seen → email
 *                   skipped" implemented rather than asserted.
 *   ledger          every channel decision (sent/skipped/held/failed) is a row
 *                   in notification_deliveries, so a silent drop is visible.
 *
 * Everything is swallowed on error: a notification must NEVER break the action
 * that produced it.
 */

const db = () => createServiceClient();

/** How long after a push we wait before falling back to email (Doc2 §14). */
const PUSH_SEEN_GRACE_MINUTES = 30;

/**
 * Reasons that mean "we never actually tried", not "the send failed". Keeping
 * them out of `failed` is what lets the ledger be read as a health signal: a
 * `failed` row means a provider rejected us, nothing else.
 */
const NOT_ATTEMPTED = new Set(["no_credentials", "no_tokens", "no_address"]);

export type { NotificationType } from "./catalog";

export interface NotifyInput {
  profileId: string;                        // recipient
  type: NotificationType;
  title: string;
  body?: string;
  threadId?: string | null;
  actorId?: string | null;                  // who caused it
  data?: Record<string, unknown>;
  /** Collapse key. Same key + open row + inside the type's window = one row. */
  groupKey?: string | null;
  /** Overrides the type's deep link when the row needs a specific target. */
  href?: string | null;
  thumbUrl?: string | null;
  /** Overrides the type's default inline actions (e.g. a priced Renew button). */
  actions?: NotificationAction[] | null;
  entityKind?: string | null;
  entityId?: string | null;
}

export interface NotifyResult {
  id: string | null;
  grouped: boolean;
  groupCount: number;
  channels: Record<string, string>;         // channel → status
}

const NOTHING: NotifyResult = { id: null, grouped: false, groupCount: 0, channels: {} };

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const cfg = await typeConfig(input.type);
    if (!cfg) return NOTHING;

    const prefs = await getPrefs(input.profileId);
    const data = input.data ?? {};

    // ---- 1. Write the in-app row (atomic group-or-insert) -------------------
    // The template's placeholders, filled from what the caller already told
    // us. `threadId` and the entity are first-class fields on NotifyInput, so
    // a producer that sets `entityKind: "listing", entityId: x` should not
    // ALSO have to repeat it in `data` to get a deep link — forgetting that
    // silently downgraded the row to its list page (127 approvals landed on
    // /listings instead of the listing).
    const entityKeys: Record<string, string> = {
      listing: "listingId",
      project: "projectId",
      requirement: "requirementId",
      ticket: "ticketId",
    };
    const entityKey = input.entityKind ? entityKeys[input.entityKind] : undefined;
    const href =
      input.href ??
      resolveHref(
        cfg.hrefTemplate,
        {
          ...(entityKey && input.entityId ? { [entityKey]: input.entityId } : {}),
          ...data,                                        // an explicit value still wins
          threadId: input.threadId ?? data.threadId,
        },
        cfg.hrefFallback,
      );
    const { data: rpc, error } = await db().rpc("notify_upsert", {
      p_profile: input.profileId,
      p_type: input.type,
      p_title: input.title,
      p_body: input.body ?? null,
      p_group_key: input.groupKey ?? null,
      p_href: href,
      p_thumb_url: input.thumbUrl ?? null,
      p_actions: input.actions ?? null,
      p_thread_id: input.threadId ?? null,
      p_actor_id: input.actorId ?? null,
      p_data: data,
      p_entity_kind: input.entityKind ?? null,
      p_entity_id: input.entityId ?? null,
      p_hold_until: null,
    });
    if (error) return NOTHING;

    const row = (Array.isArray(rpc) ? rpc[0] : rpc) as { id: string; grouped: boolean; group_count: number } | null;
    if (!row?.id) return NOTHING;

    await recordDelivery(row.id, input.profileId, "inapp", "sent");

    // ---- 2. Decide whether any CHANNEL may fire ----------------------------
    const gate = channelGate(cfg.prefGroup, cfg.isMarketing, prefs);
    if (gate) {
      await recordDelivery(row.id, input.profileId, "push", "skipped", gate);
      await recordDelivery(row.id, input.profileId, "email", "skipped", gate);
      return { id: row.id, grouped: !!row.grouped, groupCount: row.group_count ?? 1, channels: { push: gate, email: gate } };
    }

    // ---- 3. Quiet hours — hold the channels, keep the in-app row ------------
    if (!cfg.isUrgent && prefs.quietHours) {
      const g = await globalSettings();
      const hold = quietHold(new Date(), prefs.quietStart?.slice(0, 5) ?? g.quietStart, prefs.quietEnd?.slice(0, 5) ?? g.quietEnd, g.timezone);
      if (hold) {
        await db().from("notifications").update({ hold_until: hold.toISOString() }).eq("id", row.id);
        await recordDelivery(row.id, input.profileId, "push", "held", "quiet_hours");
        await recordDelivery(row.id, input.profileId, "email", "held", "quiet_hours");
        return { id: row.id, grouped: !!row.grouped, groupCount: row.group_count ?? 1, channels: { push: "held", email: "held" } };
      }
    }

    const channels = await deliverChannels({
      notificationId: row.id,
      profileId: input.profileId,
      title: input.title,
      body: input.body ?? "",
      href,
      type: input.type,
      data: input.data ?? {},
      threadId: input.threadId ?? null,
      wantPush: cfg.defaultPush,
      wantEmail: cfg.defaultEmail,
      prefs,
    });

    return { id: row.id, grouped: !!row.grouped, groupCount: row.group_count ?? 1, channels };
  } catch {
    // never propagate — the primary action already succeeded
    return NOTHING;
  }
}

/**
 * Why no channel may fire, or null when they may.
 *
 * Marketing is checked FIRST: no consent means no promotional message on any
 * channel, whatever a transactional toggle says (DPDP). A type with no
 * preference group is CRITICAL (suspension lifted, report outcome) — the design
 * gives it no switch, so nothing here can suppress it.
 */
function channelGate(prefGroup: string | null, isMarketing: boolean, prefs: Prefs): string | null {
  if (isMarketing && !prefs.marketingConsent) return "no_marketing_consent";
  if (prefGroup && prefs.enabled[prefGroup] === false) return "pref_off";
  return null;
}

interface DeliverArgs {
  notificationId: string;
  profileId: string;
  title: string;
  body: string;
  href: string | null;
  type: string;
  data: Record<string, unknown>;
  threadId: string | null;
  wantPush: boolean;
  wantEmail: boolean;
  prefs: Prefs;
}

/**
 * Push first, then email — with the dedup rule between them.
 * A push that reached at least one device HOLDS the email; the release sweep
 * sends it only if the notification is still unread after the grace window.
 */
async function deliverChannels(a: DeliverArgs): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  let pushed = 0;
  if (!a.wantPush) {
    out.push = "skipped";
    await recordDelivery(a.notificationId, a.profileId, "push", "skipped", "type_default_off");
  } else if (!a.prefs.push) {
    out.push = "skipped";
    await recordDelivery(a.notificationId, a.profileId, "push", "skipped", "push_off");
  } else {
    // Prefer the admin-managed A20 PUSH template for this type when every {{var}}
    // it needs is present; otherwise keep the built-in copy (renderTemplate
    // returns null). Same contract as the email path above.
    const pushVars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(a.data ?? {}))
      if (typeof v === "string" || typeof v === "number") pushVars[k] = v;
    const pushTpl = await renderTemplate(a.type, "push", pushVars);
    const res = await sendPushToProfile(a.profileId, {
      title: a.title,
      body: pushTpl?.body ?? a.body,
      data: { type: a.type, notificationId: a.notificationId, threadId: a.threadId ?? "", href: a.href ?? "" },
    });
    pushed = res.sent;
    // "No devices registered" and "FCM isn't configured here" are NOT failures —
    // recording them as such would make the ledger read like an outage. Only a
    // real send attempt that came back empty is a failure.
    const status = res.sent > 0 ? "sent" : NOT_ATTEMPTED.has(res.reason ?? "") ? "skipped" : "failed";
    out.push = status;
    await recordDelivery(a.notificationId, a.profileId, "push", status, res.reason);
  }

  if (!a.wantEmail) {
    out.email = "skipped";
    await recordDelivery(a.notificationId, a.profileId, "email", "skipped", "type_default_off");
  } else if (!a.prefs.email) {
    out.email = "skipped";
    await recordDelivery(a.notificationId, a.profileId, "email", "skipped", "email_off");
  } else if (pushed > 0) {
    // Channel dedup: the device already has it. Give the user a chance to SEE
    // it before we also mail them.
    out.email = "held";
    await recordDelivery(a.notificationId, a.profileId, "email", "held", "awaiting_push_seen");
  } else {
    const r = await emailNotification(a.profileId, a.title, a.body, a.href, a.type, a.data);
    const status = r.sent ? "sent" : NOT_ATTEMPTED.has(r.reason ?? "") ? "skipped" : "failed";
    out.email = status;
    await recordDelivery(a.notificationId, a.profileId, "email", status, r.reason, r.providerId);
  }

  return out;
}

async function emailNotification(
  profileId: string,
  title: string,
  body: string,
  href: string | null,
  type?: string,
  vars?: Record<string, unknown>,
) {
  const { data } = await db().from("profiles").select("email, name").eq("id", profileId).maybeSingle();
  const profile = data as { email?: string | null; name?: string | null } | null;
  const to = profile?.email ?? "";
  if (!to) return { sent: false, reason: "no_address" as const };

  // Prefer the admin-managed A20 email template for this notification type, when
  // one exists AND every {{var}} it needs is present in `vars` (renderTemplate
  // returns null otherwise). Falls back to the built-in copy — strictly no worse
  // than before (memory: message_templates was read by nothing).
  let subject = title;
  let html = renderEmail({ title, body, href });
  if (type) {
    const flat: Record<string, string | number> = {};
    // `{{name}}` and `{{link}}` are needed by nearly every template and are known
    // HERE, so they are supplied centrally — a call site only has to pass the
    // variables that are specific to its own message.
    if (profile?.name) flat.name = profile.name;
    if (href) flat.link = href;
    for (const [k, v] of Object.entries(vars ?? {}))
      if (typeof v === "string" || typeof v === "number") flat[k] = v;
    const tpl = await renderTemplate(type, "email", flat);
    if (tpl) {
      subject = tpl.subject ?? title;
      html = renderEmail({ title: subject, body: tpl.body, href });
    }
  }
  return sendEmail({ to, subject, html });
}

async function recordDelivery(
  notificationId: string,
  profileId: string,
  channel: "inapp" | "push" | "email" | "whatsapp",
  status: "sent" | "skipped" | "failed" | "held",
  reason?: string | null,
  providerId?: string | null,
) {
  await db()
    .from("notification_deliveries")
    .upsert(
      { notification_id: notificationId, profile_id: profileId, channel, status, reason: reason ?? null, provider_id: providerId ?? null, created_at: new Date().toISOString() },
      { onConflict: "notification_id,channel" },
    );
}

// ---------------------------------------------------------------------------
// Jobs — the code behind the promises the screen and the rules make
// ---------------------------------------------------------------------------

export interface NotificationJobReport {
  quietReleased: number;
  emailsAfterPush: number;
  emailsSkippedSeen: number;
  purged: number;
}

/**
 * Release quiet-hours holds whose morning has come, then resolve the
 * "push-seen → email skipped" decision, then purge past retention.
 * Idempotent: each step clears the flag it acted on.
 */
export async function runNotificationJobs(): Promise<NotificationJobReport> {
  return {
    quietReleased: await releaseQuietHolds(),
    ...(await resolveHeldEmails()),
    purged: await purgeOld(),
  };
}

async function releaseQuietHolds(): Promise<number> {
  const now = new Date().toISOString();
  const { data } = await db()
    .from("notifications")
    .select("id,profile_id,type,title,body,href,thread_id,read_at,data")
    .not("hold_until", "is", null)
    .lte("hold_until", now)
    .limit(500);

  const rows = (data ?? []) as any[];
  let released = 0;
  for (const r of rows) {
    // Already read overnight → the user has it; sending now is noise.
    if (!r.read_at) {
      const cfg = await typeConfig(r.type);
      const prefs = await getPrefs(r.profile_id);
      await deliverChannels({
        notificationId: r.id,
        profileId: r.profile_id,
        title: r.title,
        body: r.body ?? "",
        href: r.href,
        type: r.type,
        data: (r.data ?? {}) as Record<string, unknown>,
        threadId: r.thread_id,
        wantPush: cfg?.defaultPush ?? true,
        wantEmail: cfg?.defaultEmail ?? false,
        prefs,
      });
      released++;
    } else {
      await recordDelivery(r.id, r.profile_id, "push", "skipped", "read_before_release");
      await recordDelivery(r.id, r.profile_id, "email", "skipped", "read_before_release");
    }
    await db().from("notifications").update({ hold_until: null }).eq("id", r.id);
  }
  return released;
}

/**
 * The second half of channel dedup. An email held because a push landed is
 * either dropped (the user read the notification — "push seen") or finally sent
 * (still unread after the grace window).
 */
async function resolveHeldEmails(): Promise<{ emailsAfterPush: number; emailsSkippedSeen: number }> {
  const cutoff = new Date(Date.now() - PUSH_SEEN_GRACE_MINUTES * 60_000).toISOString();
  const { data } = await db()
    .from("notification_deliveries")
    .select("id,notification_id,profile_id,notifications!inner(id,title,body,href,read_at,dismissed_at)")
    .eq("channel", "email")
    .eq("status", "held")
    .eq("reason", "awaiting_push_seen")
    .lte("created_at", cutoff)
    .limit(500);

  let sent = 0;
  let skipped = 0;
  for (const d of (data ?? []) as any[]) {
    const n = d.notifications;
    if (!n) continue;
    if (n.read_at || n.dismissed_at) {
      await db().from("notification_deliveries").update({ status: "skipped", reason: "push_seen" }).eq("id", d.id);
      skipped++;
      continue;
    }
    const prefs = await getPrefs(d.profile_id);
    if (!prefs.email) {
      await db().from("notification_deliveries").update({ status: "skipped", reason: "email_off" }).eq("id", d.id);
      skipped++;
      continue;
    }
    const r = await emailNotification(d.profile_id, n.title, n.body ?? "", n.href);
    await db()
      .from("notification_deliveries")
      .update({ status: r.sent ? "sent" : "failed", reason: r.sent ? "push_unseen_fallback" : r.reason, provider_id: r.providerId ?? null })
      .eq("id", d.id);
    if (r.sent) sent++;
  }
  return { emailsAfterPush: sent, emailsSkippedSeen: skipped };
}

/** 90-day purge (Doc2 §14, retention configurable in notification_settings). */
async function purgeOld(): Promise<number> {
  const { data } = await db().rpc("purge_old_notifications");
  return typeof data === "number" ? data : 0;
}

/** True when the recipient has muted this thread (skip chat push/notify). */
export async function threadMutedFor(threadId: string, profileId: string): Promise<boolean> {
  try {
    const { data } = await db()
      .from("thread_participants")
      .select("muted")
      .eq("thread_id", threadId)
      .eq("profile_id", profileId)
      .maybeSingle();
    return !!(data as { muted?: boolean } | null)?.muted;
  } catch {
    return false;
  }
}
