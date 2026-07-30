import "server-only";
import type { FullProfile, VerificationRow } from "./service";
import { maskPhone } from "@/lib/auth/phone";

/**
 * Profile DTOs (Doc9 §17 — explicit fields only). Public strips Views/Leads,
 * email, docs, and the raw phone (number-rule). Verification summary lists which
 * levels are approved — labelled "Phone/ID/RERA verified", NEVER "property
 * verified" (Doc2 §11).
 */

function badges(v: VerificationRow[]) {
  const by = (l: string) => v.find((x) => x.level === l);
  return {
    phone: by("phone")?.status === "approved",
    id: by("id")?.status === "approved",
    rera: by("rera")?.status === "approved",
  };
}

/** Member-since as "Jan 2025". */
function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/**
 * An auto-flagged bio is WITHHELD from other people until an admin decides the
 * appeal (migration 0106, A8's auto-flag tab).
 *
 * The flag used to be advisory only — a `moderation_events` row — so a bio with a
 * phone number in it stayed on the public profile the entire time it sat in the
 * queue, which is exactly what the number rule exists to stop. Stripped here, in
 * the payload, not hidden by the client (Doc9 §17): a viewer opening DevTools
 * finds nothing, because nothing was sent.
 *
 * The OWNER always sees their own text — they have to be able to edit it.
 */
function bioFlagOpen(p: FullProfile): boolean {
  return Boolean(p.bio_flagged_at) && p.bio_flag_outcome !== "dismissed";
}

/** Full own profile (server is the gating truth). Stats come from listings later. */
export function ownProfileDTO(
  p: FullProfile,
  v: VerificationRow[],
  cityName: string | null,
  // `requirements` (owner/broker) and `messages` (builder) replaced Views on the
  // P9 stat row — Views is still computed and still shown in the listing
  // manager, it just isn't one of the three profile tiles any more.
  stats: { listings: number; views: number; leads: number; projects?: number; requirements: number; messages: number },
) {
  return {
    id: p.id,
    username: p.username,
    name: p.name,
    role: p.role,
    photoUrl: p.photo_url,
    // The owner's own view keeps the text (they must be able to edit it) and is
    // told it is under review, so a hidden bio is never a silent change.
    bio: p.bio,
    bioFlag: p.bio_flagged_at
      ? {
          flaggedAt: p.bio_flagged_at,
          reason: p.bio_flag_reason,
          outcome: p.bio_flag_outcome,
          withheld: bioFlagOpen(p),
        }
      : null,
    email: p.email,
    cityId: p.city_id,
    cityName,
    phoneMasked: maskPhone(p.phone),
    memberSince: memberSince(p.created_at),
    responseLabel: p.response_label, // null → hidden by client
    badges: badges(v),
    stats,
    state: p.state,
    // role extras (Edit)
    company: { logoUrl: p.company_logo_url, establishedYear: p.established_year, projectsDone: p.projects_done, officeAddress: p.office_address, areasCovered: p.areas_covered ?? [] },
  };
}

/** Public profile of ANOTHER user — no Views/Leads, no email, no raw phone. */
export function publicProfileDTO(p: FullProfile, v: VerificationRow[], cityName: string | null, stats: { listings: number; projects?: number }) {
  if (p.state === "deleted") return { deleted: true as const, name: "Deleted user" };
  if (p.state === "suspended") return { suspended: true as const, username: p.username, name: p.name };
  return {
    id: p.id,
    username: p.username,
    name: p.name,
    role: p.role,
    photoUrl: p.photo_url,
    bio: bioFlagOpen(p) ? null : p.bio,
    cityName,
    memberSince: memberSince(p.created_at),
    responseLabel: p.response_label,
    badges: badges(v),
    stats, // listings (+ projects for builder) only
    // Number is NEVER in the payload here; Call/WhatsApp gate on a separate public-number flow (Module 7).
  };
}

/** Verification screen shape (all three levels + their states). */
export function verificationDTO(v: VerificationRow[]) {
  const by = (l: string) => v.find((x) => x.level === l) ?? { level: l, status: "not_started" as const, doc_type: null, rera_number: null, reason: null, valid_till: null, reviewed_at: null };
  return { phone: by("phone"), id: by("id"), rera: by("rera") };
}
