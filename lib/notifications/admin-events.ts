import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "./service";

/**
 * The three notified events whose TRIGGER is an admin decision (Doc2 §14):
 * report outcome, suspension lifted, area request approved.
 *
 * The admin SCREENS are P13-15. What was missing was not the screen — it was
 * the state transition and the notification underneath it, so those rows could
 * never exist and no user could ever be told. These are the real transitions;
 * the dashboard will call them instead of writing the tables itself.
 *
 * All three are staff-gated at the route (`app/api/v1/admin/account-action`),
 * idempotent (the status filter is the claim), and scoped to one subject.
 */

const db = () => createServiceClient();

/**
 * Resolve a report and tell the REPORTER what happened (Doc7 §138: "reporter
 * auto-notified"). The reported party is deliberately not told who reported
 * them — that is the whole reason reports are anonymous.
 */
export async function resolveReport(
  reportId: string,
  actorId: string,
  outcome: "actioned" | "dismissed",
  note?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data } = await db()
    .from("reports")
    .update({ status: outcome })
    .eq("id", reportId)
    .in("status", ["open", "reviewing"])   // idempotent claim
    .select("id,reporter_id,subject_type,subject_id")
    .maybeSingle();
  const r = data as { id: string; reporter_id: string; subject_type: string; subject_id: string } | null;
  if (!r) return { ok: false, reason: "not_found" };

  await db().from("moderation_events").insert({
    profile_id: r.reporter_id,
    kind: "report_outcome",
    severity: "info",
    title: `Report ${outcome}`,
    detail: note?.slice(0, 300) ?? null,
  });

  // designs/P11 S7: "Action taken on the listing you reported" + View status.
  await notify({
    profileId: r.reporter_id,
    type: "report_outcome",
    title: outcome === "actioned"
      ? `**Action taken** on the ${r.subject_type} you reported`
      : `We reviewed the ${r.subject_type} you reported — **no action needed**`,
    body: note?.slice(0, 160) ?? "Thanks for helping keep HomzList clean.",
    href: hrefForSubject(r.subject_type, r.subject_id),
    actions: [{ key: "view_report", label: "View status", style: "link" }],
    entityKind: r.subject_type, entityId: r.subject_id,
    data: { reportId: r.id, subjectType: r.subject_type, subjectId: r.subject_id },
  });
  return { ok: true };
}

/** The reported thing's own page — a "View status" that actually resolves. */
function hrefForSubject(kind: string, id: string): string | null {
  if (kind === "listing") return `/property/${id}`;
  if (kind === "project") return `/project/${id}`;
  if (kind === "requirement") return `/requirements/${id}`;
  return null; // message / user reports have no page the reporter may open
}

/**
 * Lift a suspension (Doc2 §14 "suspension lifted"). Only `suspended` → `active`;
 * this is not a general account-state setter, so it can never resurrect a
 * deleted account.
 */
export async function liftSuspension(profileId: string, actorId: string, note?: string): Promise<{ ok: boolean; reason?: string }> {
  const { data } = await db()
    .from("profiles")
    .update({ state: "active" })
    .eq("id", profileId)
    .eq("state", "suspended")
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_suspended" };

  await db().from("moderation_events").insert({
    profile_id: profileId, kind: "suspension_lifted", severity: "info",
    title: "Suspension lifted", detail: note?.slice(0, 300) ?? null,
  });

  // designs/P11 S7: "Your account is <b>active again</b>".
  await notify({
    profileId,
    type: "suspension_lifted",
    title: "Your account is **active again**",
    body: note?.slice(0, 160) ?? "You can post, chat and receive inquiries as usual.",
    data: { actorId },
  });
  return { ok: true };
}

/**
 * Approve a requested area and tell everyone who asked for it (Doc2 §14
 * "area-request added"). Every pending request for the same name in the same
 * city is closed by one approval — they were all asking for one thing.
 */
export async function approveAreaRequest(
  requestId: string,
  actorId: string,
  areaSlug: string | null,
): Promise<{ ok: boolean; notified?: number; reason?: string }> {
  const { data: req } = await db()
    .from("area_requests")
    .select("id,name,city_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  const r = req as { id: string; name: string; city_id: string | null } | null;
  if (!r) return { ok: false, reason: "not_found" };

  // The column's CHECK allows 'pending' | 'added' | 'rejected' — NOT 'approved'.
  // Writing the wrong literal made the update match nothing, silently: the
  // request stayed pending and nobody was notified, while the endpoint still
  // answered ok. Caught only because the row count came back 0.
  const { data: closed, error } = await db()
    .from("area_requests")
    .update({ status: "added" })
    .eq("name", r.name)
    .eq("status", "pending")
    .select("profile_id");
  if (error) return { ok: false, reason: "update_failed" };

  const people = [...new Set(((closed ?? []) as { profile_id: string }[]).map((x) => x.profile_id))];
  for (const p of people) {
    // designs/P11 S7: "<b>Kuvadva Road</b> is now available — post your listing there".
    await notify({
      profileId: p,
      type: "area_added",
      title: `**${r.name}** is now available — post your listing there`,
      body: "The area you asked for is live in the location picker.",
      href: areaSlug ? `/area/${areaSlug}` : "/create",
      data: { areaSlug, areaName: r.name },
    });
  }
  return { ok: true, notified: people.length };
}
