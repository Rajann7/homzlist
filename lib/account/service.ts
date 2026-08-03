import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { putObject, readObject, deleteObject, BUCKET } from "@/lib/storage";
import { notify } from "@/lib/notifications/service";

/**
 * P12 S5 + S6 — DPDP data download, and the deactivate / delete lifecycle
 * (Doc4 §70–71, Doc7 §201–203, Doc10 Privacy §8).
 *
 * Every date these screens print is computed here, from stored timestamps:
 *
 *   "This link expires in 48 hours"          → data_export_requests.expires_at
 *   "Deletion is available 7 days after a
 *    payment · Available from 19 Jan"        → the last captured payment + 7d
 *   "Your account will be deleted on 12 Feb" → deletion_scheduled_at
 *
 * The 30-day grace period and the 48-hour link expiry are only real because
 * /api/v1/cron/accounts sweeps them. A grace period nothing ever reaches the
 * end of is a screen that lies politely for ever.
 */

const db = () => createServiceClient();

export const EXPORT_TTL_HOURS = 48;
/**
 * Key for the OTP-bound intent (deactivate vs delete). It lives here rather
 * than in the route so both halves of the flow import it from one place — and
 * because a Next route file that exports anything other than handlers fails the
 * route type-check.
 */
export const accountIntentKey = (otpSession: string) => `acct:intent:${otpSession}`;
export const ACCOUNT_INTENT_TTL_SEC = 15 * 60;
export const DELETE_GRACE_DAYS = 30;
export const PAYMENT_HOLD_DAYS = 7;

/* ═══════════════════════════════════════════════ 1 · data download ═══ */

export type ExportStatus = "queued" | "processing" | "ready" | "expired" | "failed";

export interface ExportRow {
  id: string;
  format: "json" | "csv";
  status: ExportStatus;
  requestedAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  fileName: string | null;
}

export interface DataView {
  current: ExportRow | null;
  previous: ExportRow[];
}

const fileName = (r: { requested_at: string; format: string }) => {
  const d = new Date(r.requested_at);
  const stamp = `${d.getDate()}${d.toLocaleString("en-GB", { month: "short" }).toLowerCase()}${d.getFullYear()}`;
  return `homzlist-data-${stamp}.${r.format === "csv" ? "zip" : "json"}`;
};

const toRow = (r: Record<string, unknown>): ExportRow => ({
  id: r.id as string,
  format: (r.format as "json" | "csv") ?? "json",
  status: r.status as ExportStatus,
  requestedAt: r.requested_at as string,
  readyAt: (r.ready_at as string) ?? null,
  expiresAt: (r.expires_at as string) ?? null,
  sizeBytes: (r.size_bytes as number) ?? null,
  fileName: r.status === "ready" ? fileName(r as { requested_at: string; format: string }) : null,
});

export async function getDataView(profileId: string): Promise<DataView> {
  // Sweep this user's own stale links on read, so the screen is never showing a
  // Download button for a link the cron has not got to yet.
  await db()
    .from("data_export_requests")
    .update({ status: "expired" })
    .eq("profile_id", profileId)
    .eq("status", "ready")
    .lt("expires_at", new Date().toISOString());

  const { data } = await db()
    .from("data_export_requests")
    .select("id, format, status, requested_at, ready_at, expires_at, size_bytes")
    .eq("profile_id", profileId)
    .order("requested_at", { ascending: false })
    .limit(20);

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toRow);
  const live = rows.find((r) => r.status === "queued" || r.status === "processing" || r.status === "ready") ?? null;
  return { current: live, previous: rows.filter((r) => r.id !== live?.id) };
}

/**
 * Build the export. Runs inline — a user's own rows are small, and a "queued"
 * row with no worker behind it would be the exact dead state this module is
 * meant to hunt down. The status transitions are still written, so the state
 * machine is real and an admin can see a failure.
 */
export async function requestDataExport(profileId: string, format: "json" | "csv"): Promise<ExportRow> {
  // One live request at a time — re-requesting supersedes rather than stacking.
  const { data: existing } = await db()
    .from("data_export_requests")
    .select("id")
    .eq("profile_id", profileId)
    .in("status", ["queued", "processing"]);
  if ((existing as unknown[])?.length) {
    const { data } = await db()
      .from("data_export_requests")
      .select("id, format, status, requested_at, ready_at, expires_at, size_bytes")
      .eq("id", (existing as { id: string }[])[0].id)
      .single();
    return toRow(data as Record<string, unknown>);
  }

  const { data: created } = await db()
    .from("data_export_requests")
    .insert({ profile_id: profileId, format, status: "queued" })
    .select("id, format, status, requested_at, ready_at, expires_at, size_bytes")
    .single();
  const row = created as Record<string, unknown>;
  const id = row.id as string;

  try {
    await db().from("data_export_requests").update({ status: "processing" }).eq("id", id);
    const payload = await collectUserData(profileId, format);
    const key = `exports/${profileId}/${id}.${format === "csv" ? "csv" : "json"}`;
    await putObject(key, payload, format === "csv" ? "text/csv" : "application/json", BUCKET.userExports);

    const now = new Date();
    const { data: done } = await db()
      .from("data_export_requests")
      .update({
        status: "ready",
        file_key: key,
        size_bytes: payload.byteLength,
        ready_at: now.toISOString(),
        expires_at: new Date(now.getTime() + EXPORT_TTL_HOURS * 3600_000).toISOString(),
      })
      .eq("id", id)
      .select("id, format, status, requested_at, ready_at, expires_at, size_bytes")
      .single();

    await notify({
      profileId,
      type: "data_export_ready",
      title: "Your data is ready",
      body: `Download it within ${EXPORT_TTL_HOURS} hours.`,
      href: "/settings/data",
    }).catch(() => {});

    return toRow(done as Record<string, unknown>);
  } catch (err) {
    const { data: failed } = await db()
      .from("data_export_requests")
      .update({ status: "failed", error: String(err).slice(0, 400) })
      .eq("id", id)
      .select("id, format, status, requested_at, ready_at, expires_at, size_bytes")
      .single();
    return toRow(failed as Record<string, unknown>);
  }
}

/**
 * The user's own data — and ONLY their own.
 *
 * The exclusions are the point, and they are enforced in the query rather than
 * filtered afterwards: `chat_messages` is restricted to messages this profile
 * SENT, and no counterparty's name, number or profile is read at all. An export
 * that leaked the other side of a conversation would be a privacy incident
 * dressed up as a privacy feature.
 */
async function collectUserData(profileId: string, format: "json" | "csv"): Promise<Buffer> {
  const d = db();
  const [profile, listings, requirements, messages, payments, invoices, consents, tickets] = await Promise.all([
    d.from("profiles").select("id, phone, name, username, email, role, bio, city_id, created_at").eq("id", profileId).maybeSingle(),
    d.from("listings").select("id, title, description, kind, price_paise, area_label, status, created_at").eq("profile_id", profileId),
    d.from("requirements").select("id, title, budget_min_paise, budget_max_paise, status, created_at").eq("profile_id", profileId),
    d.from("chat_messages").select("id, thread_id, body, created_at").eq("sender_id", profileId),
    d.from("payments").select("id, razorpay_payment_id, amount_paise, status, method, created_at").eq("profile_id", profileId),
    d.from("invoices").select("id, number, amount_paise, created_at").eq("profile_id", profileId),
    d.from("auth_consents").select("kind, version, accepted, accepted_at").eq("profile_id", profileId),
    d.from("support_tickets").select("number, subject, category, status, created_at").eq("profile_id", profileId),
  ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    notice:
      "This export contains only your own data. Messages other people sent to you, and other users' contact details, are excluded to protect their privacy.",
    profile: profile.data ?? null,
    listings: listings.data ?? [],
    requirements: requirements.data ?? [],
    messages_you_sent: messages.data ?? [],
    payments: payments.data ?? [],
    invoices: invoices.data ?? [],
    consents: consents.data ?? [],
    support_tickets: tickets.data ?? [],
  };

  if (format === "json") return Buffer.from(JSON.stringify(bundle, null, 2), "utf8");

  // CSV: one section per table, because a single flat sheet of eight different
  // shapes is not usable by the person who asked for it.
  const csv = (rows: Record<string, unknown>[]): string => {
    if (!rows.length) return "(no rows)\n";
    const cols = Object.keys(rows[0]);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
  };
  const parts = [
    `HomzList data export,${bundle.exported_at}\n"${bundle.notice}"\n`,
    "\n## profile\n", csv(bundle.profile ? [bundle.profile as Record<string, unknown>] : []),
    "\n## listings\n", csv(bundle.listings as Record<string, unknown>[]),
    "\n## requirements\n", csv(bundle.requirements as Record<string, unknown>[]),
    "\n## messages_you_sent\n", csv(bundle.messages_you_sent as Record<string, unknown>[]),
    "\n## payments\n", csv(bundle.payments as Record<string, unknown>[]),
    "\n## invoices\n", csv(bundle.invoices as Record<string, unknown>[]),
    "\n## consents\n", csv(bundle.consents as Record<string, unknown>[]),
    "\n## support_tickets\n", csv(bundle.support_tickets as Record<string, unknown>[]),
  ];
  return Buffer.from(parts.join(""), "utf8");
}

export interface DownloadHandle {
  body: Buffer;
  fileName: string;
  contentType: string;
}

export async function downloadExport(profileId: string, id: string): Promise<DownloadHandle | null> {
  const { data } = await db()
    .from("data_export_requests")
    .select("id, format, status, file_key, expires_at, requested_at")
    .eq("id", id)
    .eq("profile_id", profileId) // ownership is the query
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; format: string; status: string; file_key: string | null; expires_at: string | null; requested_at: string };
  if (r.status !== "ready" || !r.file_key) return null;
  if (r.expires_at && new Date(r.expires_at) < new Date()) {
    await db().from("data_export_requests").update({ status: "expired" }).eq("id", id);
    return null;
  }

  const body = await readObject(r.file_key, BUCKET.userExports);
  if (!body) return null;
  await db().from("data_export_requests").update({ downloaded_at: new Date().toISOString() }).eq("id", id);
  return {
    body,
    fileName: fileName(r as { requested_at: string; format: string }),
    contentType: r.format === "csv" ? "text/csv" : "application/json",
  };
}

/* ══════════════════════════════════════ 2 · deactivate / delete ═══ */

export interface AccountLifecycle {
  state: string;
  /** Blocked because a payment landed inside the hold window. */
  paymentHold: { active: boolean; lastPaymentAt: string | null; availableFrom: string | null };
  deactivatedAt: string | null;
  deletionScheduledAt: string | null;
  /** What the delete dialog must warn about — read, never assumed. */
  atRisk: { activePlans: number; liveListings: number; activeBoosts: number };
}

export async function getAccountLifecycle(profileId: string): Promise<AccountLifecycle> {
  const d = db();
  const [{ data: prof }, { data: pay }, plans, listings, boosts] = await Promise.all([
    d.from("profiles").select("state, deactivated_at, deletion_scheduled_at").eq("id", profileId).maybeSingle(),
    d.from("payments")
      .select("captured_at, created_at")
      .eq("profile_id", profileId)
      .eq("status", "captured")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    d.from("user_plans").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("status", "active"),
    d.from("listings").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("status", "live"),
    d.from("boosts").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("status", "active"),
  ]);

  const p = (prof ?? {}) as { state?: string; deactivated_at?: string | null; deletion_scheduled_at?: string | null };
  const lastPaid = (pay as { captured_at: string | null; created_at: string } | null);
  const lastAt = lastPaid?.captured_at ?? lastPaid?.created_at ?? null;
  const availableFrom = lastAt
    ? new Date(new Date(lastAt).getTime() + PAYMENT_HOLD_DAYS * 86_400_000)
    : null;

  return {
    state: p.state ?? "active",
    paymentHold: {
      active: Boolean(availableFrom && availableFrom > new Date()),
      lastPaymentAt: lastAt,
      availableFrom: availableFrom ? availableFrom.toISOString() : null,
    },
    deactivatedAt: p.deactivated_at ?? null,
    deletionScheduledAt: p.deletion_scheduled_at ?? null,
    atRisk: {
      activePlans: plans.count ?? 0,
      liveListings: listings.count ?? 0,
      activeBoosts: boosts.count ?? 0,
    },
  };
}

export type LifecycleOutcome =
  | { ok: true; state: string; deletionScheduledAt?: string | null }
  | { ok: false; reason: "PAYMENT_HOLD" | "NOT_FOUND" | "ALREADY" ; availableFrom?: string | null };

export async function deactivateAccount(profileId: string, reason: string | null): Promise<LifecycleOutcome> {
  const now = new Date().toISOString();
  const { error } = await db()
    .from("profiles")
    .update({ state: "deactivated", deactivated_at: now })
    .eq("id", profileId);
  if (error) return { ok: false, reason: "NOT_FOUND" };

  await db().from("account_events").insert({ profile_id: profileId, kind: "deactivate", reason });
  return { ok: true, state: "deactivated" };
}

/** Logging in reverses a deactivation — this is what the auth path calls. */
export async function reactivateAccount(profileId: string): Promise<void> {
  await db().from("profiles").update({ state: "active", deactivated_at: null }).eq("id", profileId);
  await db().from("account_events").insert({ profile_id: profileId, kind: "reactivate" });
}

export async function requestDeletion(profileId: string, reason: string | null): Promise<LifecycleOutcome> {
  const life = await getAccountLifecycle(profileId);
  // The 7-day payment hold is enforced HERE. The design disables the button;
  // disabling a button is a hint, and a hint is not a guard.
  if (life.paymentHold.active) {
    return { ok: false, reason: "PAYMENT_HOLD", availableFrom: life.paymentHold.availableFrom };
  }
  if (life.deletionScheduledAt) return { ok: false, reason: "ALREADY" };

  const now = new Date();
  const scheduled = new Date(now.getTime() + DELETE_GRACE_DAYS * 86_400_000);
  await db()
    .from("profiles")
    .update({
      state: "deactivated", // hidden immediately; the row is purged when grace ends
      deactivated_at: now.toISOString(),
      deletion_requested_at: now.toISOString(),
      deletion_scheduled_at: scheduled.toISOString(),
      deletion_reason: reason,
    })
    .eq("id", profileId);

  await db().from("account_events").insert({
    profile_id: profileId,
    kind: "delete_request",
    reason,
    meta: { scheduled_at: scheduled.toISOString(), grace_days: DELETE_GRACE_DAYS },
  });

  await notify({
    profileId,
    type: "account_deletion_scheduled",
    title: "Account scheduled for deletion",
    body: `Your account will be deleted on ${scheduled.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Log in before then to cancel.`,
    href: "/settings/account",
  }).catch(() => {});

  return { ok: true, state: "deactivated", deletionScheduledAt: scheduled.toISOString() };
}

export async function cancelDeletion(profileId: string): Promise<LifecycleOutcome> {
  const { data } = await db()
    .from("profiles")
    .select("deletion_scheduled_at")
    .eq("id", profileId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "NOT_FOUND" };

  await db()
    .from("profiles")
    .update({
      state: "active",
      deactivated_at: null,
      deletion_requested_at: null,
      deletion_scheduled_at: null,
      deletion_reason: null,
    })
    .eq("id", profileId);
  await db().from("account_events").insert({ profile_id: profileId, kind: "delete_cancel" });
  return { ok: true, state: "active" };
}

/* ══════════════════════════════════════════════════ 3 · the sweeps ═══ */

export interface SweepResult {
  expiredExports: number;
  purgedAccounts: number;
  deletedExportObjects: number;
}

/**
 * What /api/v1/cron/accounts runs. Without it the 48-hour link and the 30-day
 * grace period are both just text on a screen.
 */
export async function sweepAccounts(): Promise<SweepResult> {
  const now = new Date().toISOString();
  const result: SweepResult = { expiredExports: 0, purgedAccounts: 0, deletedExportObjects: 0 };

  // 1 · expire ready exports past their TTL, and remove the object with them —
  // an expired link whose file is still sitting in the bucket is a retained
  // copy of personal data with no purpose.
  const { data: stale } = await db()
    .from("data_export_requests")
    .select("id, file_key")
    .eq("status", "ready")
    .lt("expires_at", now);
  for (const r of (stale ?? []) as { id: string; file_key: string | null }[]) {
    if (r.file_key) {
      try { await deleteObject(r.file_key, BUCKET.userExports); result.deletedExportObjects++; } catch { /* keep sweeping */ }
    }
    await db().from("data_export_requests").update({ status: "expired", file_key: null }).eq("id", r.id);
    result.expiredExports++;
  }

  // 2 · accounts whose 30-day grace has run out.
  const { data: due } = await db()
    .from("profiles")
    .select("id")
    .not("deletion_scheduled_at", "is", null)
    .lt("deletion_scheduled_at", now);
  for (const p of (due ?? []) as { id: string }[]) {
    await purgeAccount(p.id);
    result.purgedAccounts++;
  }

  return result;
}

/**
 * The end of the grace period.
 *
 * Content goes; payment records stay, anonymised, because tax law requires
 * seven years — which is exactly what the delete dialog and the Privacy Policy
 * both tell the user, so it had better be what the code does.
 */
async function purgeAccount(profileId: string): Promise<void> {
  const d = db();
  await d.from("listings").update({ status: "deleted" }).eq("profile_id", profileId);
  await d.from("requirements").update({ status: "deleted" }).eq("profile_id", profileId);
  await d.from("saves").delete().eq("profile_id", profileId);
  await d.from("saved_searches").delete().eq("profile_id", profileId);
  await d.from("push_tokens").delete().eq("profile_id", profileId);
  await d.from("notifications").delete().eq("profile_id", profileId);
  await d.from("data_export_requests").delete().eq("profile_id", profileId);

  // The profile row itself is retained in a scrubbed form rather than deleted:
  // `payments.profile_id` is a foreign key, and cascading it away would take
  // the seven-year records with it.
  await d
    .from("profiles")
    .update({
      state: "deleted",
      name: "Deleted user",
      username: null,
      email: null,
      bio: null,
      photo_url: null,
      company_logo_url: null,
      office_address: null,
      phone: `deleted:${profileId.slice(0, 8)}`,
      deletion_scheduled_at: null,
    })
    .eq("id", profileId);

  await d.from("account_events").insert({ profile_id: profileId, kind: "delete_purge" });
}
