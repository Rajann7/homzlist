import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Profile persistence (Doc2 §11 / Doc7 §2). Service-role on the server after the
 * session gate authorizes. RLS stays deny-all for clients. Private fields
 * (Views/Leads/email/docs) are stripped in the public DTO, never sent for others.
 */

export interface FullProfile {
  id: string;
  username: string | null;
  phone: string;
  role: "owner" | "broker" | "builder" | null;
  name: string | null;
  city_id: string | null;
  photo_url: string | null;
  bio: string | null;
  email: string | null;
  company_logo_url: string | null;
  established_year: number | null;
  projects_done: number | null;
  office_address: string | null;
  areas_covered: string[] | null;
  response_label: string | null;
  state: string;
  is_registered: boolean;
  created_at: string;
}

export interface VerificationRow {
  level: "phone" | "id" | "rera";
  status: "not_started" | "pending" | "approved" | "rejected" | "revoked";
  doc_type: string | null;
  rera_number: string | null;
  reason: string | null;
  valid_till: string | null;
  reviewed_at: string | null;
}

const SELECT =
  "id,username,phone,role,name,city_id,photo_url,bio,email,company_logo_url,established_year,projects_done,office_address,areas_covered,response_label,state,is_registered,created_at";

export async function getProfileById(id: string): Promise<FullProfile | null> {
  const db = createServiceClient();
  const { data } = await db.from("profiles").select(SELECT).eq("id", id).maybeSingle();
  return (data as FullProfile) ?? null;
}

/** Valid username shape — also blocks LIKE metacharacters (%, _) reaching the query. */
export const USERNAME_RE = /^[a-z0-9]{3,40}$/;
// A username can never contain a hyphen, so the two forms can't collide.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a public profile by its @username OR by its id.
 *
 * The id form matters because the places that link to a person from a
 * conversation only ever hold an id: chat's ⋯ → "View profile", the Message
 * Requests cards, the Blocked-users list. They all pushed `/profile/<uuid>`,
 * which matched no username and left the profile screen on a permanent skeleton
 * with the raw UUID as its title.
 *
 * Both forms are exact matches on an indexed column, so neither enables
 * enumeration any more than the other: a UUID is not guessable, and usernames
 * were already publicly addressable.
 */
export async function getProfileByUsername(handle: string): Promise<FullProfile | null> {
  const db = createServiceClient();
  // Audit M1: exact (case-insensitive) match, never `ilike` with a raw param —
  // `%`/`_` would act as wildcards and enable enumeration. Stored usernames are
  // always lowercased (makeUsername), so a lowercased `eq` is an exact match.
  const uname = handle.toLowerCase();
  if (UUID_RE.test(uname)) {
    const { data } = await db.from("profiles").select(SELECT).eq("id", uname).maybeSingle();
    return (data as FullProfile) ?? null;
  }
  if (!USERNAME_RE.test(uname)) return null;
  const { data } = await db.from("profiles").select(SELECT).eq("username", uname).maybeSingle();
  return (data as FullProfile) ?? null;
}

export async function getVerifications(profileId: string): Promise<VerificationRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("verifications")
    .select("level,status,doc_type,rera_number,reason,valid_till,reviewed_at")
    .eq("profile_id", profileId);
  return (data as VerificationRow[]) ?? [];
}

export async function getCityName(cityId: string | null): Promise<string | null> {
  if (!cityId) return null;
  const db = createServiceClient();
  // Single city master since migration 0014 — see lib/auth/service.ts.
  const { data } = await db.from("locations").select("name").eq("id", cityId).eq("level", "city").maybeSingle();
  return data ? `${data.name}` : null;
}

// ---- Edit (whitelisted; bio auto-flag) -------------------------------------

const NUMBER_RE = /\d[\d\s-]{8,}\d/; // 10+ digit sequences
const URL_RE = /(https?:\/\/|www\.|\.[a-z]{2,}\/|\b[a-z0-9-]+\.(com|in|net|org|co)\b)/i;

export interface ProfilePatch {
  name?: string;
  bio?: string;
  cityId?: string;
  email?: string;
  officeAddress?: string;
  establishedYear?: number;
  projectsDone?: number;
  areasCovered?: string[];
}

/**
 * Update own profile. Writable fields whitelisted (Doc9 §3 — no role/state/
 * verified via this path). Bio number/URL → still saved (warnings-only, Doc2)
 * but flagged to the admin queue (moderation_events).
 */
export async function updateOwnProfile(profileId: string, patch: ProfilePatch): Promise<FullProfile> {
  const db = createServiceClient();
  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.bio !== undefined) update.bio = patch.bio;
  if (patch.email !== undefined) update.email = patch.email.trim() || null;
  if (patch.cityId !== undefined) {
    const { data: city } = await db
      .from("locations")
      .select("id")
      .eq("id", patch.cityId)
      .eq("level", "city")
      .maybeSingle();
    if (!city) throw new Error("INVALID_CITY");
    update.city_id = patch.cityId;
  }
  if (patch.officeAddress !== undefined) update.office_address = patch.officeAddress;
  if (patch.establishedYear !== undefined) update.established_year = patch.establishedYear;
  if (patch.projectsDone !== undefined) update.projects_done = patch.projectsDone;
  if (patch.areasCovered !== undefined) update.areas_covered = patch.areasCovered.slice(0, 10);

  const { data, error } = await db.from("profiles").update(update).eq("id", profileId).select(SELECT).single();
  if (error) throw error;

  // Bio auto-flag → admin queue (Doc2 §11).
  if (patch.bio && (NUMBER_RE.test(patch.bio) || URL_RE.test(patch.bio))) {
    await db.from("moderation_events").insert({
      profile_id: profileId,
      kind: "bio_flag",
      severity: "info",
      title: "Bio flagged for review",
      detail: "Bio contains a phone number or link.",
    });
  }

  return data as FullProfile;
}

/** Does bio contain a number/URL? (used by the client warning + server flag). */
export function bioHasContact(bio: string): boolean {
  return NUMBER_RE.test(bio) || URL_RE.test(bio);
}

// ---- Verification submissions ----------------------------------------------

export async function submitIdVerification(profileId: string, docType: string, docKey: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("verifications")
    .upsert(
      { profile_id: profileId, level: "id", status: "pending", doc_type: docType, doc_key: docKey, submitted_at: new Date().toISOString(), reason: null },
      { onConflict: "profile_id,level" },
    );
}

export async function submitReraVerification(profileId: string, reraNumber: string, docKey: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("verifications")
    .upsert(
      { profile_id: profileId, level: "rera", status: "pending", rera_number: reraNumber, doc_key: docKey, submitted_at: new Date().toISOString(), reason: null },
      { onConflict: "profile_id,level" },
    );
}

/**
 * Withdraw a PENDING verification request (P9 verification screen "Cancel
 * request"). Only a pending row is removed — an approved/rejected level is never
 * touched — so the user can re-submit. Owner-scoped by profileId.
 */
export async function cancelVerification(profileId: string, level: "id" | "rera"): Promise<boolean> {
  if (level !== "id" && level !== "rera") return false;
  const db = createServiceClient();
  const { data } = await db
    .from("verifications")
    .delete()
    .eq("profile_id", profileId)
    .eq("level", level)
    .eq("status", "pending")
    .select("profile_id");
  return Boolean(data && data.length);
}

// ---- Account status + role change ------------------------------------------

export async function getAccountStatus(profileId: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_events")
    .select("kind,severity,title,detail,created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Returns "created" or "already_pending" (audit L2: no queue flooding). */
export async function requestRoleChange(profileId: string, fromRole: string | null, toRole: string): Promise<"created" | "already_pending"> {
  const db = createServiceClient();
  const { data: open } = await db
    .from("role_change_requests")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .maybeSingle();
  if (open) return "already_pending";
  await db.from("role_change_requests").insert({ profile_id: profileId, from_role: fromRole, to_role: toRole, status: "pending" });
  return "created";
}
