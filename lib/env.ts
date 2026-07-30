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
/** Exported so the dev-only code paths (admin DEV sign-in) can refuse to run in prod. */
export const isProd = process.env.NODE_ENV === "production";

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

/** Assert critical secrets exist in production; call from a startup/health path. */
export function assertProdSecrets(): string[] {
  if (!isProd) return [];
  const e = serverEnv();
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!e.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!e.jwt.accessSecret) missing.push("JWT_ACCESS_SECRET");
  // Audit M1: the dev OTP provider must never ship to production.
  if (e.otp.provider !== "msg91") missing.push("OTP_PROVIDER=msg91 (dev OTP provider is not allowed in production)");
  // Doc3 §1.1: admin sign-in is Google-only. Without a real OAuth client the
  // panel falls back to its DEV sign-in, which must never reach production —
  // lib/admin/google.ts also refuses it at runtime, this is the deploy-time half.
  if (!e.googleOauth.clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID (admin panel is Google-only)");
  if (!e.googleOauth.clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET (admin panel is Google-only)");
  return missing;
}
