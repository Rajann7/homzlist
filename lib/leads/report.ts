import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Reporting a lead.
 *
 * With chat gone there are no messages for a moderator to read, so the lead
 * itself — who sent it, what they asked for, which number was shared, when — is
 * the evidence. A report therefore points at the LEAD, not at a message.
 *
 * It is written into the existing `reports` table with subject_type='lead', so
 * the admin reports queue picks it up with assignment, resolution, act-on-user
 * and audit already wired, instead of growing a second moderation surface.
 */

const db = () => createServiceClient();

export const LEAD_REPORT_REASONS = [
  { code: "spam", label: "Spam or repeated inquiries" },
  { code: "fake", label: "Fake or time-wasting inquiry" },
  { code: "abusive", label: "Abusive or harassing" },
  { code: "wrong_number", label: "Wrong or someone else's number" },
  { code: "broker", label: "Broker posing as a buyer" },
  { code: "other", label: "Something else" },
] as const;

const REASONS = new Set(LEAD_REPORT_REASONS.map((r) => r.code));

export type ReportResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; reason: "not_found" | "invalid" };

export async function reportLead(
  leadId: string,
  reporterId: string,
  reason: string,
  note: string | null,
): Promise<ReportResult> {
  if (!REASONS.has(reason as (typeof LEAD_REPORT_REASONS)[number]["code"])) return { ok: false, reason: "invalid" };

  // Only the two people on the lead may report it, and only their own side of
  // it — a stranger with a lead id gets a 404, not a moderation entry.
  const { data } = await db()
    .from("leads").select("id,owner_id,lead_profile_id").eq("id", leadId).maybeSingle();
  const lead = data as { id: string; owner_id: string; lead_profile_id: string } | null;
  if (!lead || (lead.owner_id !== reporterId && lead.lead_profile_id !== reporterId)) {
    return { ok: false, reason: "not_found" };
  }

  const { error } = await db().from("reports").insert({
    reporter_id: reporterId,
    subject_type: "lead",
    subject_id: leadId,
    reason,
    note: note?.trim().slice(0, 1000) || null,
  });
  // The unique (reporter, subject_type, subject_id) index makes a re-report a
  // no-op rather than a second queue item.
  if (error) return { ok: true, alreadyReported: true };

  await db().from("leads").update({
    last_activity: "Reported",
    last_activity_at: new Date().toISOString(),
  }).eq("id", leadId);

  return { ok: true, alreadyReported: false };
}

/**
 * What the admin queue needs to render a lead report: the two people, the
 * subject the lead was about, and the payload that IS the evidence.
 */
export async function leadReportContext(leadId: string) {
  const { data } = await db()
    .from("leads")
    .select("id,owner_id,lead_profile_id,wants,contact_pref,contact_number,when_token,preferred_on,subject_snapshot,stage,created_at")
    .eq("id", leadId).maybeSingle();
  const lead = data as Record<string, unknown> | null;
  if (!lead) return null;
  const ids = [lead.owner_id as string, lead.lead_profile_id as string];
  const { data: profs } = await db().from("profiles").select("id,name,phone,role").in("id", ids);
  const map = new Map(((profs ?? []) as { id: string }[]).map((p) => [p.id, p]));
  return {
    lead,
    owner: map.get(lead.owner_id as string) ?? null,
    sender: map.get(lead.lead_profile_id as string) ?? null,
  };
}
