import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";

/**
 * Shared chat-route guard. Returns the active profile id, or an error code the
 * route maps to a fail() envelope. Admin is READ-ONLY on chat — even an admin
 * session cannot POST a message (Doc9 §22); the mutating routes call
 * `requireActive` which is a plain participant check, never an admin bypass.
 */
export async function requireActive(): Promise<{ id: string } | { error: "UNAUTHORIZED" | "FORBIDDEN" | "PROFILE_INCOMPLETE" }> {
  const claims = await getCurrentUser();
  if (!claims) return { error: "UNAUTHORIZED" };
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return { error: "FORBIDDEN" };
  // Min-profile = NAME + CITY (Doc2 §10.1). Only the name was ever checked, so a
  // cityless account could open threads the poster then had no location context
  // for — the whole point of the rule.
  if (!profile.name || !profile.city_id) return { error: "PROFILE_INCOMPLETE" };
  return { id: claims.sub };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
