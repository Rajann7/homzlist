import "server-only";
import { cookies } from "next/headers";
import { COOKIE, verifyAccess, type AccessClaims } from "./session";

/**
 * Resolve the current user from the access-token cookie (Route Handlers /
 * Server Components). The API's source of truth for gating — never a client flag.
 */
export async function getCurrentUser(): Promise<AccessClaims | null> {
  const token = (await cookies()).get(COOKIE.ACCESS)?.value;
  if (!token) return null;
  return verifyAccess(token);
}
