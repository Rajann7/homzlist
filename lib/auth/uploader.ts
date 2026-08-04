import "server-only";
import { cookies } from "next/headers";
import { COOKIE, verifyAccess, verifyRegisterToken } from "./session";

/**
 * Identity for the upload endpoints.
 *
 * A full session is the normal case. The registration window (P1 S7 "Set up
 * your profile") has no access token yet — only the OTP-verified register
 * cookie — so it gets a narrower scope: avatar only, and only under its own
 * `avatars/<id>/` prefix. That keeps S7's photo picker on the real
 * presign → PUT → commit pipeline instead of a client-side data URL.
 */
export interface Uploader {
  id: string;
  scope: "session" | "register";
}

export async function getUploader(): Promise<Uploader | null> {
  const jar = await cookies();

  const access = await verifyAccess(jar.get(COOKIE.ACCESS)?.value ?? "");
  if (access) return { id: access.sub, scope: "session" };

  const registering = await verifyRegisterToken(jar.get(COOKIE.REGISTER)?.value ?? "");
  if (registering) return { id: registering, scope: "register" };

  return null;
}

/** The register window may only ever touch its own profile photo. */
export function registerScopeAllows(u: Uploader, kind: string): boolean {
  return u.scope === "session" || kind === "avatar";
}
