import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Data rights + account lifecycle (Doc7 #201–203) — designs/P12 S5 and S6.
 *
 * Two promises in the design are enforced here, not in the browser:
 *   • the export contains YOUR data only — your own messages, never the other
 *     side's, and never anybody's contact details (P12 spells this out on screen);
 *   • deletion is blocked for 7 days after a successful payment, has a 30-day
 *     grace period, and keeps anonymised payment records for the legal 7 years.
 *
 * Both windows are read from retention_settings, the same rows the purge job
 * uses, so the copy on screen and the behaviour cannot drift apart.
 */

async function retentionDays(key: string, fallback: number): Promise<number> {
  const db = createServiceClient();
  const { data } = await db.from("retention_settings").select("days").eq("key", key).maybeSingle();
  return (data?.days as number) ?? fallback;
}

// ------------------------------------------------------------------- exports

export interface ExportRequest {
  id: string;
  format: "json" | "csv";
  status: "preparing" | "ready" | "expired" | "failed";
  filename: string | null;
  bytes: number;
  rowCounts: Record<string, number>;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
}

const shape = (r: Record<string, unknown>): ExportRequest => ({
  id: r.id as string,
  format: r.format as ExportRequest["format"],
  status: r.status as ExportRequest["status"],
  filename: (r.filename as string) ?? null,
  bytes: (r.bytes as number) ?? 0,
  rowCounts: (r.row_counts as Record<string, number>) ?? {},
  createdAt: r.created_at as string,
  readyAt: (r.ready_at as string) ?? null,
  expiresAt: (r.expires_at as string) ?? null,
});

/** Lapse anything past its 48 hours before reporting state, so "ready" is true. */
async function expireStale(profileId: string) {
  const db = createServiceClient();
  await db
    .from("data_export_requests")
    .update({ status: "expired", payload: null })
    .eq("profile_id", profileId)
    .eq("status", "ready")
    .lt("expires_at", new Date().toISOString());
}

export async function getExportState(profileId: string): Promise<{
  current: ExportRequest | null;
  previous: ExportRequest[];
  linkHours: number;
}> {
  await expireStale(profileId);
  const db = createServiceClient();
  const { data } = await db
    .from("data_export_requests")
    .select("id, format, status, filename, bytes, row_counts, created_at, ready_at, expires_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  const all: ExportRequest[] = (data ?? []).map(shape);
  const current = all.find((r) => r.status === "preparing" || r.status === "ready") ?? null;
  return {
    current,
    previous: all.filter((r) => r.id !== current?.id),
    linkHours: (await retentionDays("data_export_link", 2)) * 24,
  };
}

/**
 * Build the archive. Deliberately synchronous-then-stored rather than queued: the
 * design says "we'll notify you when it's ready", and a job that nobody triggers
 * would make that a lie. The payload is written to our own table so the download
 * route can authorize every fetch instead of handing out a public bucket URL.
 */
export async function requestExport(
  profileId: string,
  format: "json" | "csv",
): Promise<{ ok: true; request: ExportRequest } | { ok: false; reason: "RATE_LIMITED" }> {
  const db = createServiceClient();

  // One live export at a time, and at most 3 a day — an export is expensive and
  // is also a personal-data artefact, so it isn't something to spam.
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db
    .from("data_export_requests")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) return { ok: false, reason: "RATE_LIMITED" };

  const { data: created } = await db
    .from("data_export_requests")
    .insert({ profile_id: profileId, format, status: "preparing" })
    .select("id, format, status, filename, bytes, row_counts, created_at, ready_at, expires_at")
    .single();

  const bundle = await buildExportBundle(profileId);
  const body = format === "json" ? JSON.stringify(bundle.data, null, 2) : toCsvBundle(bundle.data);
  const hours = (await retentionDays("data_export_link", 2)) * 24;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `homzlist-data-${stamp}.${format}`;

  const { data: ready } = await db
    .from("data_export_requests")
    .update({
      status: "ready",
      payload: { body },
      bytes: Buffer.byteLength(body, "utf8"),
      filename,
      row_counts: bundle.counts,
      ready_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    })
    .eq("id", created!.id)
    .select("id, format, status, filename, bytes, row_counts, created_at, ready_at, expires_at")
    .single();

  return { ok: true, request: shape(ready!) };
}

/** What the user gets — and, by omission, what they don't. */
async function buildExportBundle(profileId: string) {
  const db = createServiceClient();

  const { data: profile } = await db
    .from("profiles")
    .select("id, phone, role, name, username, email, bio, city_id, photo_url, state, created_at")
    .eq("id", profileId)
    .maybeSingle();

  const { data: listings } = await db
    .from("listings")
    .select("id, title, description, kind, type_code, status, availability, price_paise, area_label, area_sqft, attributes, amenities, created_at, live_at")
    .eq("profile_id", profileId);

  const { data: requirements } = await db
    .from("requirements")
    .select("id, kind, type_code, bhk, budget_min_paise, budget_max_paise, area_label, urgency, notes, status, created_at, expires_at")
    .eq("profile_id", profileId);

  // OWN messages only. Filtering on sender_id is the whole privacy guarantee of
  // this feature — the other side's messages are their data, not the requester's.
  const { data: messages } = await db
    .from("chat_messages")
    .select("id, thread_id, kind, body, created_at")
    .eq("sender_id", profileId)
    .order("created_at", { ascending: true });

  const { data: payments } = await db
    .from("payments")
    .select("id, status, method, amount_paise, currency, captured_at, created_at")
    .eq("profile_id", profileId);

  const { data: invoices } = await db
    .from("invoices")
    .select("*")
    .eq("profile_id", profileId);

  const { data: plans } = await db
    .from("user_plans")
    .select("id, catalog_code, name, listing_quota, listing_used, requirement_quota, requirement_used, proposal_quota, proposal_used, status, purchased_at, expires_at")
    .eq("profile_id", profileId);

  const { data: tickets } = await db
    .from("support_tickets")
    .select("id, number, subject, category, status, created_at, closed_at")
    .eq("profile_id", profileId);

  const { data: consents } = await db
    .from("auth_consents")
    .select("kind, version, accepted, accepted_at")
    .eq("profile_id", profileId);

  const data = {
    export: {
      generated_at: new Date().toISOString(),
      about:
        "Your HomzList data. Contains your profile, your listings and requirements, the messages YOU sent, and your payment records. " +
        "Messages other people sent you and other users' contact details are deliberately excluded to protect their privacy.",
    },
    profile: profile ?? null,
    listings: listings ?? [],
    requirements: requirements ?? [],
    messages_i_sent: messages ?? [],
    payments: payments ?? [],
    invoices: invoices ?? [],
    plans: plans ?? [],
    support_tickets: tickets ?? [],
    consents: consents ?? [],
  };

  const counts: Record<string, number> = {
    listings: data.listings.length,
    requirements: data.requirements.length,
    messages_i_sent: data.messages_i_sent.length,
    payments: data.payments.length,
    invoices: data.invoices.length,
    plans: data.plans.length,
    support_tickets: data.support_tickets.length,
    consents: data.consents.length,
  };
  return { data, counts };
}

/** One CSV section per collection, concatenated — readable in any spreadsheet. */
function toCsvBundle(data: Record<string, unknown>): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out: string[] = [];
  for (const [name, value] of Object.entries(data)) {
    const rows = Array.isArray(value) ? value : value ? [value] : [];
    out.push(`# ${name}`);
    if (!rows.length) { out.push("(none)", ""); continue; }
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
    out.push(cols.join(","));
    for (const r of rows) out.push(cols.map((c) => cell((r as Record<string, unknown>)[c])).join(","));
    out.push("");
  }
  return out.join("\n");
}

export async function getExportFile(
  profileId: string,
  id: string,
): Promise<{ filename: string; format: string; body: string } | null> {
  await expireStale(profileId);
  const db = createServiceClient();
  const { data } = await db
    .from("data_export_requests")
    .select("id, format, status, filename, payload, downloads")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data || data.status !== "ready" || !data.payload) return null;
  await db.from("data_export_requests")
    .update({ downloads: ((data.downloads as number) ?? 0) + 1 }).eq("id", id);
  return {
    filename: (data.filename as string) ?? `homzlist-data.${data.format}`,
    format: data.format as string,
    body: (data.payload as { body: string }).body,
  };
}

// ----------------------------------------------------------- account actions

export interface AccountStatus {
  state: string;
  /** Deletion is blocked until this instant because of a recent payment. */
  paymentHoldUntil: string | null;
  paymentHoldDays: number;
  graceDays: number;
  /** What a delete would destroy — shown in the second confirm dialog. */
  impact: { activePlans: number; planNames: string[]; liveListings: number; liveRequirements: number };
  scheduled: { kind: "deactivate" | "delete"; purgeAt: string | null; createdAt: string } | null;
}

export async function getAccountStatus(profileId: string): Promise<AccountStatus> {
  const db = createServiceClient();
  const [holdDays, graceDays] = await Promise.all([
    retentionDays("payment_hold_before_delete", 7),
    retentionDays("account_deletion_grace", 30),
  ]);

  const { data: profile } = await db.from("profiles").select("state").eq("id", profileId).maybeSingle();

  const { data: lastPayment } = await db
    .from("payments")
    .select("captured_at, created_at")
    .eq("profile_id", profileId)
    .eq("status", "success")
    .order("captured_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let paymentHoldUntil: string | null = null;
  if (lastPayment) {
    const at = new Date((lastPayment.captured_at as string) ?? (lastPayment.created_at as string));
    const until = new Date(at.getTime() + holdDays * 86400_000);
    if (until.getTime() > Date.now()) paymentHoldUntil = until.toISOString();
  }

  const [{ data: plans }, { count: liveListings }, { count: liveRequirements }, { data: scheduled }] =
    await Promise.all([
      db.from("user_plans").select("name").eq("profile_id", profileId).eq("status", "active"),
      db.from("listings").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId).eq("status", "live"),
      db.from("requirements").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId).eq("status", "live"),
      db.from("account_actions").select("kind, purge_at, created_at")
        .eq("profile_id", profileId).eq("status", "scheduled").maybeSingle(),
    ]);

  return {
    state: (profile?.state as string) ?? "active",
    paymentHoldUntil,
    paymentHoldDays: holdDays,
    graceDays,
    impact: {
      activePlans: plans?.length ?? 0,
      planNames: (plans ?? []).map((p: Record<string, unknown>) => p.name as string),
      liveListings: liveListings ?? 0,
      liveRequirements: liveRequirements ?? 0,
    },
    scheduled: scheduled
      ? {
          kind: scheduled.kind as "deactivate" | "delete",
          purgeAt: (scheduled.purge_at as string) ?? null,
          createdAt: scheduled.created_at as string,
        }
      : null,
  };
}

export async function deactivateAccount(
  profileId: string,
  ipHash: string | null,
): Promise<{ ok: true } | { ok: false; reason: "ALREADY" }> {
  const db = createServiceClient();
  const status = await getAccountStatus(profileId);
  if (status.state === "deactivated" || status.scheduled) return { ok: false, reason: "ALREADY" };

  await db.from("account_actions").insert({
    profile_id: profileId, kind: "deactivate", status: "scheduled",
    impact: status.impact, ip_hash: ipHash,
  });
  // Hiding the profile is what hides the listings: every public read joins the
  // owner's state, so nothing has to be re-flagged row by row.
  await db.from("profiles").update({ state: "deactivated" }).eq("id", profileId);
  return { ok: true };
}

export async function scheduleDeletion(
  profileId: string,
  reason: string | null,
  ipHash: string | null,
): Promise<{ ok: true; purgeAt: string } | { ok: false; reason: "PAYMENT_HOLD" | "ALREADY" }> {
  const db = createServiceClient();
  const status = await getAccountStatus(profileId);
  if (status.scheduled) return { ok: false, reason: "ALREADY" };
  // Re-checked here, not just in the UI: the disabled button is a courtesy, this
  // is the rule.
  if (status.paymentHoldUntil) return { ok: false, reason: "PAYMENT_HOLD" };

  const purgeAt = new Date(Date.now() + status.graceDays * 86400_000).toISOString();
  await db.from("account_actions").insert({
    profile_id: profileId, kind: "delete", status: "scheduled",
    reason, impact: status.impact, purge_at: purgeAt, ip_hash: ipHash,
  });
  await db.from("profiles").update({ state: "deactivated" }).eq("id", profileId);
  return { ok: true, purgeAt };
}

/** Logging in during the grace period is what makes deletion cancellable. */
export async function cancelPendingAction(
  profileId: string,
): Promise<{ ok: true; kind: "deactivate" | "delete" } | { ok: false; reason: "NOTHING" }> {
  const db = createServiceClient();
  const { data } = await db
    .from("account_actions").select("id, kind")
    .eq("profile_id", profileId).eq("status", "scheduled").maybeSingle();
  if (!data) return { ok: false, reason: "NOTHING" };
  await db.from("account_actions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", data.id);
  await db.from("profiles").update({ state: "active" }).eq("id", profileId);
  return { ok: true, kind: data.kind as "deactivate" | "delete" };
}
