import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/auth/phone";
import { isNumberVerified } from "./numbers";

/**
 * The number a POST publishes — one layer, shared with the sender side.
 *
 * A listing could be published with any string as its contact number: the
 * create route took `body.contactNumber` and stored it. That is somebody else's
 * phone ringing for a flat they have never heard of, published by us, and it
 * predates this module. The sender-side "use a different number" already has an
 * OTP layer (`verified_contact_numbers`), so the publisher side points at the
 * same one rather than growing a second.
 *
 * The rule, in one place:
 *   • the account's own registered number is always allowed (it was verified at
 *     sign-in and is the common case);
 *   • any OTHER number must hold a live verification by THIS profile;
 *   • anything else is dropped back to the account's number, and the post is
 *     marked `contact_verified = false` rather than quietly publishing it.
 */

const db = () => createServiceClient();

export interface ResolvedContact {
  number: string | null;
  whatsapp: string | null;
  alt: string | null;
  verified: boolean;
  /** Set when a submitted number was refused, so the caller can say why. */
  rejected: "unverified" | "invalid" | null;
}

export async function resolvePublisherContact(
  profileId: string,
  input: { number?: string | null; whatsapp?: string | null; alt?: string | null },
): Promise<ResolvedContact> {
  const { data } = await db().from("profiles").select("phone").eq("id", profileId).maybeSingle();
  const own = (data as { phone: string | null } | null)?.phone ?? null;

  const check = async (raw: string | null | undefined): Promise<{ value: string | null; ok: boolean; bad: ResolvedContact["rejected"] }> => {
    if (!raw || !raw.trim()) return { value: null, ok: true, bad: null };
    const e164 = toE164(raw);
    if (!e164) return { value: null, ok: false, bad: "invalid" };
    if (own && e164 === own) return { value: e164, ok: true, bad: null };
    if (await isNumberVerified(profileId, e164)) return { value: e164, ok: true, bad: null };
    return { value: null, ok: false, bad: "unverified" };
  };

  const [main, wa, alt] = await Promise.all([check(input.number), check(input.whatsapp), check(input.alt)]);
  const rejected = main.bad ?? wa.bad ?? alt.bad;

  // A refused main number falls back to the account's own rather than
  // publishing nothing — the post stays contactable, just not with a number
  // this person has not proved they hold.
  const number = main.value ?? (main.bad ? own : null);

  return {
    number,
    whatsapp: wa.value,
    alt: alt.value,
    verified: Boolean(number) && !rejected,
    rejected,
  };
}
