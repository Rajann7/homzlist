import "server-only";
import { randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Where the admin's EMAIL comes from — and nothing else.
 *
 * This is the same provider-layer shape the project already uses for OTP (dev
 * fixed code now, MSG91 later). The point is that the provider answers exactly
 * one question — "which Google account is this?" — and every decision that
 * matters happens after it, in lib/admin/sign-in.ts: the staff whitelist, the
 * active/revoked check, the role, the session, the audit row. Swapping dev for
 * google changes how we learn the email and nothing else, so the authorization
 * path proven in dev is the one that runs in production.
 *
 * The dev provider REFUSES to run in production, and is only selected when no
 * Google credentials are configured.
 */

export type AdminAuthProviderKind = "google" | "dev" | "unconfigured";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * `unconfigured` is the third answer, and it is why this returns a value where
 * it used to throw.
 *
 * The dev provider must never ship — that part was right. But throwing made the
 * MISCONFIGURATION indistinguishable from a crash: `POST /auth/start` had no
 * catch, so a production deploy without Google credentials answered the A1
 * button with a raw 500 and no log anyone would look for. The refusal is a
 * known state, so it is now a value the caller handles, exactly as the sibling
 * "ADMIN_DEV_EMAIL is not set" branch already did.
 */
export function adminAuthProviderKind(): AdminAuthProviderKind {
  const { clientId, clientSecret } = serverEnv().googleOauth;
  if (clientId && clientSecret) return "google";
  if (process.env.NODE_ENV === "production") return "unconfigured";
  return "dev";
}

export const newOauthState = () => randomBytes(16).toString("base64url");

/** Google's consent screen for this callback. `state` is verified on return. */
export function googleAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = serverEnv().googleOauth;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export type ProviderIdentity = { email: string; name: string | null; emailVerified: boolean };

/**
 * Exchange the authorization code for an id_token and read the email out of it.
 *
 * The id_token is read, not trusted blindly: it came straight from Google's
 * token endpoint over TLS in response to our own client secret, which is the
 * condition under which Google documents it as verifiable without re-fetching
 * JWKS. An unverified email is rejected outright — a Google account whose email
 * is unconfirmed must not be able to match a whitelist entry.
 */
export async function googleIdentityFromCode(
  code: string,
  redirectUri: string,
): Promise<ProviderIdentity> {
  const { clientId, clientSecret } = serverEnv().googleOauth;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("google token exchange failed");
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("google returned no id_token");

  const payloadPart = body.id_token.split(".")[1];
  if (!payloadPart) throw new Error("malformed id_token");
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    aud?: string;
  };
  if (claims.aud !== clientId) throw new Error("id_token audience mismatch");
  if (!claims.email) throw new Error("id_token carried no email");

  return {
    email: claims.email.toLowerCase(),
    name: claims.name ?? null,
    emailVerified: claims.email_verified === true,
  };
}

/**
 * Dev provider. Takes the email the operator typed and vouches for nothing else
 * — the whitelist check downstream is what decides whether that email may sign
 * in, which is exactly the check Google's answer would face.
 */
export function devIdentity(email: string): ProviderIdentity {
  if (process.env.NODE_ENV === "production") {
    throw new Error("the dev admin sign-in provider is not allowed in production");
  }
  return { email: email.trim().toLowerCase(), name: null, emailVerified: true };
}
