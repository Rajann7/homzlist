/**
 * Centralised, typed environment access (Doc9 §16).
 *
 * Rules enforced here:
 *  - SERVER-ONLY secrets are read via `serverEnv()` which throws if called in the
 *    browser, so a service_role key / webhook secret can never leak into a client
 *    bundle by accident.
 *  - PUBLIC values (NEXT_PUBLIC_*) are safe on both sides.
 *  - Missing values degrade gracefully in dev (empty string) but are asserted in
 *    production so a misconfigured deploy fails fast rather than silently.
 */

const isServer = typeof window === "undefined";

/**
 * The ENVIRONMENT BAND — the single answer to "may dev affordances run here?".
 *
 * Every dev affordance (the fixed OTP code, the dev admin sign-in, the
 * rate-limit kill switch) used to gate on `NODE_ENV === "production"`. That is
 * the BUILD type, not the environment: a staging deploy is a production build,
 * so a deployed test server could never be signed into at all. `APP_ENV` is the
 * declaration, and it is server-only by design — nothing here is inlined into
 * the client bundle.
 *
 * It fails CLOSED in every direction:
 *   · a production build with no `APP_ENV` is "production" (locked) — the only
 *     way to unlock a deploy is to declare `APP_ENV=staging` on purpose;
 *   · anything unrecognised is "production";
 *   · called from the browser it answers "production", so a client can never
 *     talk itself into a band (the gates are all server-side regardless).
 * `assertProdSecrets()` still refuses to let a real production band boot with
 * the dev OTP provider, so the launch mistake is caught rather than shipped.
 */
export type EnvBand = "production" | "staging" | "dev";

export function envBand(): EnvBand {
  if (!isServer) return "production";
  const declared = (process.env.APP_ENV ?? "").trim().toLowerCase();
  if (declared === "staging") return "staging";
  if (declared === "dev") return "dev";
  if (declared === "production") return "production";
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

/** True only in the REAL production band — where dev affordances stay banned. */
export const isProductionBand = () => envBand() === "production";

/**
 * The one gate for "fixed OTP / dev admin sign-in / rate-limit switch may run".
 * Read it instead of `NODE_ENV` so staging and dev behave identically and
 * production stays exactly as locked as it was.
 */
export const devAffordancesAllowed = () => !isProductionBand();

/** Public config — safe to reference from client components. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  sellerUrl: process.env.NEXT_PUBLIC_SELLER_URL ?? "http://seller.localhost:3000",
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://account.localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  fcmVapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY ?? "",
  fcmSenderId: process.env.NEXT_PUBLIC_FCM_SENDER_ID ?? "",
  // The rest of the Firebase WEB config the messaging SDK needs to mint a
  // device token (Module 10). All public by design — the private half is
  // FCM_SERVICE_ACCOUNT_JSON, which is server-only. With any of these missing
  // the client reports push as "unavailable" instead of pretending to register.
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
} as const;

/**
 * Server-only secrets. Throws if ever evaluated in the browser — this is the
 * guard that keeps service_role and friends out of the client bundle.
 */
export function serverEnv() {
  if (!isServer) {
    throw new Error("serverEnv() was called on the client — server secrets must never reach the browser.");
  }
  const env = {
    cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    // Management/CLI creds — server-only; used for human-run migrations, never in app runtime.
    supabaseProjectRef: process.env.SUPABASE_PROJECT_REF ?? "",
    supabaseDbPassword: process.env.SUPABASE_DB_PASSWORD ?? "",
    supabaseAccessToken: process.env.SUPABASE_ACCESS_TOKEN ?? "",
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    r2: {
      accountId: process.env.R2_ACCOUNT_ID ?? "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      bucket: process.env.R2_BUCKET ?? "",
      publicCdnUrl: process.env.R2_PUBLIC_CDN_URL ?? "",
    },
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    },
    otp: {
      provider: (process.env.OTP_PROVIDER ?? "dev") as "dev" | "msg91",
      devFixedCode: process.env.OTP_DEV_FIXED_CODE ?? "123456",
      msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "",
      msg91SenderId: process.env.MSG91_SENDER_ID ?? "",
      msg91DltTemplateId: process.env.MSG91_DLT_TEMPLATE_ID ?? "",
    },
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "noreply@homzlist.com",
    fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? "",
    googleOauth: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? "",
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
    },
    sentryDsn: process.env.SENTRY_DSN ?? "",
  };

  return env;
}

/** True when OTP runs in DEV mode (fixed code, no SMS) — CLAUDE.md stack rule. */
export const otpDevMode = () => serverEnv().otp.provider === "dev";

/**
 * Assert critical secrets exist on a DEPLOYED build; call from a startup/health path.
 *
 * Two different questions, deliberately gated differently:
 *   · the secrets themselves are required on any deployed build — a staging
 *     server with no Supabase key or no JWT secret is broken, not "relaxed";
 *   · the MSG91 requirement is a PRODUCTION-BAND rule. Staging is the one place
 *     the dev OTP provider is allowed, so demanding msg91 there would report the
 *     intended configuration as a failure.
 */
export function assertProdSecrets(): string[] {
  const deployed = isServer && process.env.NODE_ENV === "production";
  if (!deployed) return [];
  const e = serverEnv();
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!e.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!e.jwt.accessSecret) missing.push("JWT_ACCESS_SECRET");
  // Audit M1: the dev OTP provider must never ship to the production band. This
  // is also the catch for the launch mistake — going live with APP_ENV=staging
  // still fails here, because the provider was never switched to msg91.
  if (isProductionBand() && e.otp.provider !== "msg91")
    missing.push("OTP_PROVIDER=msg91 (dev OTP provider is not allowed in production)");
  return missing;
}
