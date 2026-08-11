import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { CONSENT_VERSION, loadRequirementSnapshot, resolvePreferredDate } from "@/lib/inquiry/service";
import { isNumberVerified } from "@/lib/inquiry/numbers";

/**
 * A proposal becomes a lead the moment it is sent.
 *
 * Requirements are answered two ways — "I Have a Property" (offer one of my
 * live posts) and "I Can Arrange It" (no listing yet) — and both land on the
 * requirement owner's Leads screen as the same kind of card, with Call and
 * WhatsApp ready. There is nothing to accept and no thread to open.
 */

const db = () => createServiceClient();

export async function leadFromProposal(input: {
  proposalId: string;
  requirementId: string;
  senderId: string;
  posterId: string;
  offerListingId: string | null;
  offerProjectId: string | null;
  offers: string[];
  contactPref: "call" | "whatsapp";
  contactNumber: string | null;
  whenToken: string;
  preferredDate: string | null;
  ip: string | null;
}): Promise<string | null> {
  const [{ data: sender }, snapshot, { data: optRows }] = await Promise.all([
    db().from("profiles").select("id,name,phone").eq("id", input.senderId).maybeSingle(),
    loadRequirementSnapshot(input.requirementId),
    db().from("inquiry_options").select("code,label").in("kind", ["offer", "when"]).eq("is_active", true),
  ]);
  const me = sender as { id: string; name: string | null; phone: string | null } | null;
  if (!me) return null;

  const valid = new Set(((optRows ?? []) as { code: string }[]).map((o) => o.code));
  const offers = [...new Set(input.offers)].filter((o) => valid.has(o)).slice(0, 10);
  const labelOf = (code: string) =>
    ((optRows ?? []) as { code: string; label: string }[]).find((o) => o.code === code)?.label ?? code;

  // Same rule as a property inquiry: a custom number must hold a live
  // verification, otherwise the profile number is what gets shared.
  let contactNumber = me.phone ?? null;
  if (input.contactNumber && input.contactNumber !== me.phone) {
    if (await isNumberVerified(input.senderId, input.contactNumber)) contactNumber = input.contactNumber;
  }

  const preferredOn = resolvePreferredDate(input.whenToken, input.preferredDate);
  const now = new Date().toISOString();

  const patch = {
    owner_id: input.posterId,
    lead_profile_id: input.senderId,
    requirement_id: input.requirementId,
    proposal_id: input.proposalId,
    offer_listing_id: input.offerListingId,
    offer_project_id: input.offerProjectId,
    source: "proposal" as const,
    wants: offers,
    contact_pref: input.contactPref,
    contact_number: contactNumber,
    when_token: input.whenToken,
    preferred_on: preferredOn,
    subject_snapshot: snapshot?.snapshot ?? {},
    is_relevant: true,
    closed_reason: null,
    seen_at: null,
    last_activity: "New proposal",
    last_activity_at: now,
  };

  const { data: existing } = await db()
    .from("leads").select("id")
    .eq("owner_id", input.posterId).eq("lead_profile_id", input.senderId)
    .eq("requirement_id", input.requirementId).maybeSingle();

  let leadId: string | null;
  if (existing) {
    leadId = (existing as { id: string }).id;
    await db().from("leads").update(patch).eq("id", leadId);
  } else {
    const { data: made } = await db().from("leads").insert({ ...patch, stage: "new" }).select("id").single();
    leadId = (made as { id: string } | null)?.id ?? null;
  }

  // Consent is recorded against the proposal the same way it is against an
  // inquiry — a ticked box with no row is not evidence of anything.
  await db().from("proposals").update({
    consent_version: CONSENT_VERSION, consent_at: now, consent_ip: input.ip,
  }).eq("id", input.proposalId).then(() => undefined, () => undefined);

  await notify({
    profileId: input.posterId,
    type: "proposal_received",
    title: `${me.name ?? "Someone"} answered your requirement`,
    body: [
      input.offerListingId || input.offerProjectId ? "Offered a property" : offers.map(labelOf).join(", "),
      input.contactPref === "call" ? "Call" : "WhatsApp",
    ].filter(Boolean).join(" · "),
    actorId: input.senderId,
    groupKey: `lead:${input.posterId}:${input.requirementId}`,
    href: `/leads/requirement/${input.requirementId}`,
    entityKind: "lead",
    entityId: leadId,
  });

  return leadId;
}
