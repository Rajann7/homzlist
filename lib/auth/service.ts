import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Profile persistence (Doc2 §3.2 / §11). Service-role client on the server AFTER
 * the OTP/session gate authorizes the operation. RLS stays ON (deny-all for
 * clients); these are trusted system writes.
 */
export interface Profile {
  id: string;
  phone: string;
  role: "owner" | "broker" | "builder" | null;
  name: string | null;
  city_id: string | null;
  photo_url: string | null;
  state: "active" | "suspended" | "deactivated" | "deleted" | "archived";
  is_registered: boolean;
  last_active_at: string;
  created_at: string;
}

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export async function getProfileByPhone(phone: string): Promise<Profile | null> {
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("*").eq("phone", phone).maybeSingle();
  return (data as Profile) ?? null;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  return (data as Profile) ?? null;
}

async function createPendingProfile(phone: string): Promise<Profile> {
  const db = createServiceClient();

  // Create the Supabase Auth identity (auth.users) server-side via the
  // service-role admin API, then anchor the profile row to it: profiles.id =
  // auth.users.id. Identity lives in Supabase, not the frontend. On the rare
  // recycled-SIM re-registration the phone may already have an auth user →
  // fall back to a standalone id so signup never blocks.
  let id: string;
  const { data: created, error: authErr } = await db.auth.admin.createUser({ phone, phone_confirm: true });
  if (!authErr && created?.user?.id) {
    id = created.user.id;
  } else {
    console.warn(`[auth] admin.createUser skipped for a recycled number: ${authErr?.message ?? "exists"}`);
    id = randomUUID();
  }

  const { data, error } = await db.from("profiles").insert({ id, phone, is_registered: false }).select("*").single();
  if (error) throw error;
  return data as Profile;
}

/**
 * Resolve the profile at OTP-verify time. Handles the recycled-SIM rule (Doc2 §3.3):
 * a registered account inactive 12+ months + a fresh verification → old account
 * archived, a new pending account created (old data via support only).
 */
export async function resolveProfileForLogin(phone: string): Promise<{ profile: Profile; recycled: boolean }> {
  const existing = await getProfileByPhone(phone);
  if (!existing) return { profile: await createPendingProfile(phone), recycled: false };

  const inactiveMs = Date.now() - new Date(existing.last_active_at).getTime();
  if (existing.is_registered && inactiveMs > TWELVE_MONTHS_MS) {
    const db = createServiceClient();
    await db.from("profiles").update({ state: "archived", phone: `${phone}#archived:${existing.id}` }).eq("id", existing.id);
    return { profile: await createPendingProfile(phone), recycled: true };
  }
  return { profile: existing, recycled: false };
}

export async function touchLastActive(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", id);
}

export interface RegistrationInput {
  role: "owner" | "broker" | "builder";
  name: string;
  cityId: string;
  photoUrl?: string | null;
  tcVersion: string;
  ipHash?: string;
}

/**
 * Complete registration. Writable fields are whitelisted here — the client can
 * never set state/is_registered/role beyond the enum (Doc9 §3 mass-assignment).
 */
/** Slug a name → base username; a short id suffix guarantees uniqueness. */
function makeUsername(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  return `${base}${id.slice(0, 4)}`;
}

export async function completeRegistration(profileId: string, input: RegistrationInput): Promise<Profile> {
  const db = createServiceClient();

  // `locations` is the single city master (migration 0014) — the same rows
  // listings and requirements reference, so a profile's city is comparable to a
  // listing's city instead of living in its own namespace.
  const { data: city } = await db
    .from("locations")
    .select("id")
    .eq("id", input.cityId)
    .eq("level", "city")
    .maybeSingle();
  if (!city) throw new Error("INVALID_CITY");

  const { data, error } = await db
    .from("profiles")
    .update({
      role: input.role,
      name: input.name,
      username: makeUsername(input.name, profileId),
      city_id: input.cityId,
      photo_url: input.photoUrl ?? null,
      is_registered: true,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select("*")
    .single();
  if (error) throw error;

  await db.from("auth_consents").insert([
    { profile_id: profileId, kind: "age18", version: input.tcVersion, ip_hash: input.ipHash ?? null },
    { profile_id: profileId, kind: "dpdp", version: input.tcVersion, ip_hash: input.ipHash ?? null },
    { profile_id: profileId, kind: "tc", version: input.tcVersion, ip_hash: input.ipHash ?? null },
  ]);

  // Phone is verified at registration (Doc2 §11 — phone level auto-approved).
  await db
    .from("verifications")
    .insert({ profile_id: profileId, level: "phone", status: "approved", reviewed_at: new Date().toISOString() });

  // Best-effort: mirror role/name into the Supabase Auth identity metadata
  // (dashboard visibility). Ignored if this profile has no linked auth user.
  try {
    await db.auth.admin.updateUserById(profileId, { user_metadata: { name: input.name, role: input.role, username: makeUsername(input.name, profileId) } });
  } catch {
    /* non-fatal */
  }

  return data as Profile;
}
