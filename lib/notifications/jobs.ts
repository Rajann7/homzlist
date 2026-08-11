import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "./service";
import { requirementBrief, requirementBriefPreview, listingBrief, rupeesExact } from "./subjects";
import { flagEnabled } from "@/lib/system/flags";

/**
 * The scheduled half of the Doc2 §14 event catalog — the events that are a JOB,
 * not a user action:
 *
 *   requirement expiry 5d / 1d, then the actual expiry
 *   plan expired → grace notice
 *   performance nudge (0 inquiries in 30 days)
 *   weekly digests (buyer: saved-search matches · seller: views + leads)
 *
 * Every one of these was a promise the product makes with nothing behind it.
 * "Your requirement expires in 5 days" had no sender AND requirements never
 * actually expired; the weekly digest had no job at all.
 *
 * Idempotency: `notification_sends` is claimed BEFORE sending. The insert
 * winning is the permission to send, so an hourly re-run is a no-op.
 */

const db = () => createServiceClient();
const DAY = 86_400_000;

export interface ScheduledReport {
  requirementReminders: number;
  requirementsExpired: number;
  planGraceNotices: number;
  performanceNudges: number;
  digests: number;
  leadDueToday: number;
  leadUnanswered: number;
}

/** Claim one send. Returns false when it already went out. */
async function claim(profileId: string, kind: string, subjectId: string | null, milestone: string): Promise<boolean> {
  const { error } = await db().from("notification_sends").insert({
    profile_id: profileId, kind, subject_id: subjectId, milestone,
  });
  return !error;
}

export async function runScheduledNotifications(): Promise<ScheduledReport> {
  return {
    requirementReminders: await requirementExpiryReminders(),
    requirementsExpired: await expireRequirements(),
    planGraceNotices: await planGraceNotices(),
    performanceNudges: await performanceNudges(),
    digests: await weeklyDigests(),
    leadDueToday: await leadDueTodayNudges(),
    leadUnanswered: await leadUnansweredNudges(),
  };
}

// ---------------------------------------------------------------------------
// Leads — the two nudges that make "when should they contact you?" mean
// something. A promise with no job behind it is the failure mode CLAUDE.md's
// hidden-issue hunt asks about: the sender picks a time, so something has to
// act at that time.
// ---------------------------------------------------------------------------

/** Today in IST — "due today" must not flip at UTC midnight. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** The sender asked to be contacted TODAY and nobody has yet. */
async function leadDueTodayNudges(): Promise<number> {
  const today = istToday();
  const { data } = await db()
    .from("leads")
    .select("id,owner_id,lead_profile_id,subject_snapshot,contact_pref,preferred_on")
    .eq("stage", "new")
    .eq("is_relevant", true)
    .eq("preferred_on", today)
    .limit(500);

  let sent = 0;
  for (const l of ((data ?? []) as Record<string, any>[])) {
    if (!(await claim(l.owner_id, "lead_due", l.id, today))) continue;
    const who = await nameOfProfile(l.lead_profile_id);
    const title = (l.subject_snapshot?.title as string | undefined) ?? "your listing";
    await notify({
      profileId: l.owner_id,
      type: "inquiry_received",
      title: `${who} asked to be contacted today`,
      body: `About ${title} · by ${l.contact_pref === "whatsapp" ? "WhatsApp" : "call"}`,
      actorId: l.lead_profile_id,
      href: `/leads/lead/${l.id}`,
      entityKind: "lead",
      entityId: l.id,
      groupKey: `lead-due:${l.owner_id}:${today}`,
    });
    sent += 1;
  }
  return sent;
}

/** Two days old, still New, and nobody has tapped Call or WhatsApp on it. */
async function leadUnansweredNudges(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * DAY).toISOString();
  const { data } = await db()
    .from("leads")
    .select("id,owner_id,lead_profile_id,subject_snapshot,created_at")
    .eq("stage", "new")
    .eq("is_relevant", true)
    .lt("created_at", cutoff)
    .limit(500);

  const rows = ((data ?? []) as Record<string, any>[]);
  if (!rows.length) return 0;

  // One read for every candidate rather than one per lead.
  const { data: events } = await db()
    .from("lead_contact_events")
    .select("lead_id")
    .in("lead_id", rows.map((r) => r.id));
  const touched = new Set(((events ?? []) as { lead_id: string }[]).map((e) => e.lead_id));

  let sent = 0;
  for (const l of rows) {
    if (touched.has(l.id)) continue;
    if (!(await claim(l.owner_id, "lead_unanswered", l.id, "48h"))) continue;
    const who = await nameOfProfile(l.lead_profile_id);
    const title = (l.subject_snapshot?.title as string | undefined) ?? "your listing";
    await notify({
      profileId: l.owner_id,
      type: "inquiry_received",
      title: `${who} is still waiting to hear from you`,
      body: `About ${title} · sent 2 days ago`,
      actorId: l.lead_profile_id,
      href: `/leads/lead/${l.id}`,
      entityKind: "lead",
      entityId: l.id,
      groupKey: `lead-unanswered:${l.owner_id}`,
    });
    sent += 1;
  }
  return sent;
}

async function nameOfProfile(id: string): Promise<string> {
  const { data } = await db().from("profiles").select("name").eq("id", id).maybeSingle();
  return ((data as { name: string | null } | null)?.name ?? "Someone");
}

// ---------------------------------------------------------------------------
// Requirements — 5-day and 1-day notice, then expiry (Doc2 §7 / §14)
// ---------------------------------------------------------------------------

const REQUIREMENT_MILESTONES = [5, 1];

async function requirementExpiryReminders(): Promise<number> {
  let sent = 0;
  for (const days of REQUIREMENT_MILESTONES) {
    const { data } = await db()
      .from("requirements")
      .select("id,profile_id,expires_at")
      .eq("status", "live")
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .lte("expires_at", new Date(Date.now() + days * DAY).toISOString());

    for (const r of (data ?? []) as { id: string; profile_id: string }[]) {
      if (!(await claim(r.profile_id, "requirement_expiry", r.id, String(days)))) continue;
      // designs/P11 S7: "Your <b>requirement expires in 5 days</b>" + View.
      await notify({
        profileId: r.profile_id,
        type: "requirement_expiring",
        title: `Your **requirement expires in ${days} day${days === 1 ? "" : "s"}**`,
        body: `${(await requirementBrief(r.id)).title} — reopen it to keep receiving proposals.`,
        entityKind: "requirement", entityId: r.id,
        // `area`/`days` also feed A20's "requirement_expiring" push template
        // ("Your requirement in {{area}} expires in {{days}} days").
        data: {
          requirementId: r.id,
          milestone: days,
          days,
          area: (await requirementBrief(r.id)).area ?? (await requirementBrief(r.id)).title,
        },
      });
      sent++;
    }
  }
  return sent;
}

/**
 * Requirements past their window actually expire now. Nothing did this before,
 * so a "live" requirement with an expiry two months in the past kept collecting
 * proposals that its owner had stopped looking at.
 */
async function expireRequirements(): Promise<number> {
  const { data } = await db()
    .from("requirements")
    .update({ status: "expired" })
    .eq("status", "live")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .select("id,profile_id");

  const rows = (data ?? []) as { id: string; profile_id: string }[];
  for (const r of rows) {
    await notify({
      profileId: r.profile_id,
      type: "requirement_expiring",
      title: "Your **requirement has expired**",
      body: `${(await requirementBrief(r.id)).title} — reopen it to start receiving proposals again.`,
      entityKind: "requirement", entityId: r.id,
      data: { requirementId: r.id, expired: true },
    });
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Plans — the grace notice AFTER expiry (Doc2 §4.2 "+ grace")
// ---------------------------------------------------------------------------

async function planGraceNotices(): Promise<number> {
  const { data } = await db()
    .from("user_plans")
    .select("id,profile_id,name,is_trial,terms,expires_at")
    .eq("status", "expired")
    .gte("expires_at", new Date(Date.now() - 3 * DAY).toISOString());

  let sent = 0;
  for (const p of (data ?? []) as any[]) {
    if (!(await claim(p.profile_id, "plan_grace", p.id, "expired"))) continue;
    const price = p.terms?.price_paise != null ? rupeesExact(p.terms.price_paise) : "";
    await notify({
      profileId: p.profile_id,
      type: p.is_trial ? "trial_ending" : "plan_expired",
      title: p.is_trial
        ? "Your **free trial has ended**"
        : `Your **${[price, p.name].filter(Boolean).join(" ")}** has expired`,
      body: "Your live listings stay up for the grace period. Renew to keep posting.",
      entityKind: "user_plan", entityId: p.id,
      data: { userPlanId: p.id },
    });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Performance nudge — a live listing with 0 inquiries in 30 days (Doc2 §14)
// ---------------------------------------------------------------------------

async function performanceNudges(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await db()
    .from("listings")
    .select("id,profile_id,title,area_label")
    .eq("status", "live")
    .eq("availability", "available")
    .lt("live_at", cutoff)
    .limit(500);

  let sent = 0;
  for (const l of (data ?? []) as { id: string; profile_id: string; title: string; area_label: string }[]) {
    const { count } = await db()
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", l.id)
      .gte("created_at", cutoff);
    if ((count ?? 0) > 0) continue;

    // Once per listing per 30-day window, not once per run.
    const window = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (!(await claim(l.profile_id, "performance_nudge", l.id, window))) continue;

    // designs/P11 S7: "No inquiries in 30 days on 2 BHK, Kalawad Road — add
    // daylight photos to get up to <b>3× more</b>" + Edit.
    const name = [l.title, l.area_label].filter(Boolean).join(", ");
    await notify({
      profileId: l.profile_id,
      type: "performance_nudge",
      title: `No inquiries in 30 days on ${name} — add daylight photos to get up to **3× more**`,
      body: "Bright, wide photos are the single biggest driver of inquiries.",
      entityKind: "listing", entityId: l.id,
      data: { listingId: l.id },
    });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Weekly digest — seller: views + leads · buyer: saved-search matches
// (Doc2 §14: "weekly digests (buyer ≤5 matches; seller views/leads)")
// ---------------------------------------------------------------------------

function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+t - +yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function weeklyDigests(): Promise<number> {
  // A22 Feature flags → Weekly digest. Off = the digest run is skipped entirely.
  if (!(await flagEnabled("weekly_digest"))) return 0;
  const week = isoWeek();
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  let sent = 0;

  // ---- sellers: views + leads on their own listings ------------------------
  const { data: sellers } = await db()
    .from("listings")
    .select("profile_id")
    .eq("status", "live")
    .limit(2000);
  const sellerIds = [...new Set(((sellers ?? []) as { profile_id: string }[]).map((s) => s.profile_id))];

  for (const profileId of sellerIds) {
    const { data: mine } = await db().from("listings").select("id").eq("profile_id", profileId).eq("status", "live");
    const ids = ((mine ?? []) as { id: string }[]).map((m) => m.id);
    if (!ids.length) continue;

    const [{ count: views }, { count: leads }] = await Promise.all([
      db().from("listing_views").select("id", { count: "exact", head: true }).in("listing_id", ids).gte("created_at", since),
      db().from("inquiries").select("id", { count: "exact", head: true }).in("listing_id", ids).gte("created_at", since),
    ]);
    // Nothing happened → no digest. An empty digest is spam, not a summary.
    if (!(views ?? 0) && !(leads ?? 0)) continue;
    if (!(await claim(profileId, "weekly_digest", null, week))) continue;

    // designs/P11 S7: "Your week: <b>340 views, 6 leads</b>" + See details.
    await notify({
      profileId,
      type: "weekly_digest",
      title: `Your week: **${views ?? 0} view${views === 1 ? "" : "s"}, ${leads ?? 0} lead${leads === 1 ? "" : "s"}**`,
      body: "Across all your live listings in the last 7 days.",
      // A20's "weekly_digest" email template takes {{views}}, {{leads}} AND
      // {{matches}} — all three must be present or the admin copy is skipped.
      data: { views: views ?? 0, leads: leads ?? 0, matches: 0, week },
    });
    sent++;
  }

  // ---- buyers: up to 5 new saved-search matches ----------------------------
  const { data: savers } = await db()
    .from("saved_searches")
    .select("profile_id,label,last_match_count")
    .eq("alerts_enabled", true)
    .limit(2000);

  const byBuyer = new Map<string, { labels: string[]; total: number }>();
  for (const s of ((savers ?? []) as { profile_id: string; label: string; last_match_count: number }[])) {
    const e = byBuyer.get(s.profile_id) ?? { labels: [], total: 0 };
    if (e.labels.length < 5) e.labels.push(s.label);
    e.total += s.last_match_count ?? 0;
    byBuyer.set(s.profile_id, e);
  }
  for (const [profileId, e] of byBuyer) {
    if (!e.total) continue;
    if (sellerIds.includes(profileId)) continue; // already digested above
    if (!(await claim(profileId, "weekly_digest", null, week))) continue;
    await notify({
      profileId,
      type: "weekly_digest",
      title: `**${e.total} propert${e.total === 1 ? "y" : "ies"}** match your saved searches this week`,
      body: e.labels.join(" · "),
      href: "/saved",
      // Same three variables as the seller digest above (this reader has matches,
      // not views/leads — but the template needs all three to render).
      data: { week, total: e.total, views: 0, leads: 0, matches: e.total },
    });
    sent++;
  }

  return sent;
}

/**
 * Builder/broker "matching requirement" alerts (Doc2 §14: "matching requirement
 * (builder: 3/day live + digest)"). Called when a requirement goes live.
 *
 * The 3/day cap is enforced with the same ledger: three claims per recipient
 * per day, then nothing more until tomorrow. Without a cap a busy city would
 * push a builder's phone every few minutes.
 */
export async function notifyMatchingRequirement(requirementId: string): Promise<number> {
  const { data } = await db()
    .from("requirements")
    .select("id,profile_id,city_id,area_ids,area_label,bhk,budget_min_paise,budget_max_paise")
    .eq("id", requirementId)
    .eq("status", "live")
    .maybeSingle();
  const r = data as any;
  if (!r) return 0;

  // Brokers and builders operating in the same city, excluding the poster.
  const { data: pros } = await db()
    .from("profiles")
    .select("id,role")
    .in("role", ["broker", "builder"])
    .eq("city_id", r.city_id)
    .eq("state", "active")
    .limit(500);

  const day = new Date().toISOString().slice(0, 10);
  // Two briefs, chosen per recipient: the paid one carries the budget, the
  // unpaid one must not. This alert fans out to every broker and builder in the
  // city, so using the full brief for all of them handed the budget — the one
  // thing the ₹2,999 wall exists to sell — to people who had not bought it.
  const [briefFull, briefPreview] = await Promise.all([
    requirementBrief(requirementId),
    requirementBriefPreview(requirementId),
  ]);

  // One query for the whole fan-out rather than a plan lookup per recipient.
  const proIds = ((pros ?? []) as { id: string }[]).map((p) => p.id);
  const unlocked = new Set<string>();
  if (proIds.length) {
    const { data: plans } = await db()
      .from("user_plans")
      .select("profile_id,terms")
      .in("profile_id", proIds)
      .eq("status", "active");
    for (const p of ((plans ?? []) as { profile_id: string; terms?: Record<string, unknown> }[])) {
      if (p.terms?.requirement_access) unlocked.add(p.profile_id);
    }
  }
  let sent = 0;

  for (const p of ((pros ?? []) as { id: string; role: string }[])) {
    if (p.id === r.profile_id) continue;
    // 3/day: slots 1..3. The first free slot wins; all taken → skip.
    let slot = 0;
    for (let i = 1; i <= 3; i++) {
      if (await claim(p.id, "requirement_match", null, `${day}#${i}`)) { slot = i; break; }
    }
    if (!slot) continue;

    await notify({
      profileId: p.id,
      type: "requirement_match",
      title: `New requirement matches your area — **${(unlocked.has(p.id) ? briefFull : briefPreview).title}**`,
      body: unlocked.has(p.id)
        ? "Send a proposal before someone else does."
        : "Unlock requirements to see the budget and send a proposal.",
      groupKey: `req-match:${day}`,
      entityKind: "requirement", entityId: requirementId,
      data: { requirementId },
    });
    sent++;
  }
  return sent;
}
