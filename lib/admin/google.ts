import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv, publicEnv, isProd } from "@/lib/env";
import { cookieOpts } from "@/lib/auth/session";

/**
 * Google sign-in for the admin panel (Doc3 §1.1: "Login: Google Authentication
 * ONLY — no email/password, no OTP").
 *
 * A provider layer, the same shape as lib/auth/otp-provider: real Google OIDC
 * when GOOGLE_OAUTH_CLIENT_ID/SECRET are set, and a DEV mode when they are not,
 * so the panel is buildable and testable before the OAuth client exists. This
 * mirrors the decision already recorded for OTP in CLAUDE.md ("DEV MODE now →
 * MSG91+DLT later via provider layer") rather than inventing a new pattern.
 *
 * DEV mode is not a bypass of the whitelist. It skips only the step where
 * *Google* proves the address; `staff` still has to contain it and still has to
 * be active, so every authorisation rule below this line is identical in both
 * modes. It is also hard-blocked in production by assertProdSecrets() and by the
 * guard in devSignIn().
 */

export type GoogleMode = "live" | "dev";

export function googleMode(): GoogleMode {
  const g = serverEnv().googleOauth;
  return g.clientId && g.clientSecret ? "live" : "dev";
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  sub: string;
  name: string;
  picture: string | null;
}

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const STATE_COOKIE = "hz_ast_state";

export function redirectUri(): string {
  const base = publicEnv.adminUrl || publicEnv.appUrl || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/v1/admin/auth/google/callback`;
}

/**
 * Start the flow. `state` is bound to a cookie (CSRF), and the PKCE verifier is
 * stored beside it so the callback can prove it started here — Doc9 §22 asks for
 * CSRF protection on every state-changing entry point, and a login is one.
 */
export function buildAuthUrl(): string {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  cookies().set(STATE_COOKIE, `${state}.${verifier}`, cookieOpts(10 * 60));

  const p = new URLSearchParams({
    client_id: serverEnv().googleOauth.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // The panel is staff-only, so always let them pick the right Google account
    // rather than silently reusing whatever session the browser already has.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

function takeStateCookie(): { state: string; verifier: string } | null {
  const raw = cookies().get(STATE_COOKIE)?.value;
  cookies().delete(STATE_COOKIE);
  if (!raw) return null;
  const [state, verifier] = raw.split(".");
  return state && verifier ? { state, verifier } : null;
}

function sameState(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Exchange the code for an identity. Returns null on any failure — never partly. */
export async function exchangeCode(code: string, state: string): Promise<GoogleIdentity | null> {
  const stored = takeStateCookie();
  if (!stored || !sameState(stored.state, state)) return null;

  const g = serverEnv().googleOauth;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: g.clientId,
      client_secret: g.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: stored.verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) return null;
  return verifyIdToken(body.id_token);
}

/**
 * Verify Google's ID token against Google's JWKS. Doing this rather than
 * decoding the payload is the difference between authentication and trusting a
 * string the browser handed us.
 */
export async function verifyIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const jwks = createRemoteJWKSet(new URL(JWKS_URL));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: serverEnv().googleOauth.clientId,
    });

    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email || !payload.sub) return null;
    // An unverified Google address proves nothing about who controls the mailbox.
    if (payload.email_verified === false) return null;

    return {
      email: email.toLowerCase(),
      emailVerified: payload.email_verified !== false,
      sub: payload.sub,
      name: typeof payload.name === "string" ? payload.name : email,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

/**
 * DEV-mode sign-in. Accepts an email and returns a synthetic identity for it.
 * Authorisation still happens against `staff` in the caller, so this cannot
 * grant access to an address a Super Admin has not whitelisted.
 */
export function devSignIn(email: string): GoogleIdentity | null {
  if (isProd || googleMode() !== "dev") return null;
  const clean = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return null;
  return {
    email: clean,
    emailVerified: true,
    // Stable per address so the google_sub uniqueness rule behaves as it will live.
    sub: `dev:${createHash("sha256").update(clean).digest("hex").slice(0, 32)}`,
    name: clean.split("@")[0].replace(/\b\w/g, (c) => c.toUpperCase()),
    picture: null,
  };
}
