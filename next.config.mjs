/** @type {import('next').NextConfig} */

// Doc9 §14 — HTTP security headers applied at the app layer (Cloudflare adds edge layer too).
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy (Doc9 §14/§31). Baseline defense-in-depth: locks down
// framing/object/base-uri and scopes connect-src to our own API + the Supabase
// host. Next App Router injects inline bootstrap/hydration scripts and styled-jsx
// / Tailwind emit inline styles, so 'unsafe-inline' is required until a nonce
// pipeline lands (full nonce hardening is deferred to the Module 15 pass, Doc9).
// Dev additionally needs 'unsafe-eval' + ws: for webpack HMR.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^http/, "ws") : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", // R2 / Cloudflare CDN images + data/blob avatars
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}${isProd ? "" : " ws: wss:"}`.replace(/\s+/g, " ").trim(),
  "worker-src 'self' blob:", // PWA service worker
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // mirrors X-Frame-Options: DENY
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" }, // clickjacking (Doc9 §14)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Two dev servers on one checkout (e.g. a second Claude session) corrupt each
  // other's webpack cache and can deadlock the compiler. Set NEXT_DIST_DIR to
  // give a secondary server its own build directory.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false, // don't leak framework (Doc9 §20)
  productionBrowserSourceMaps: false, // no source maps in prod (Doc9 §20)
  images: {
    // R2 / Cloudflare CDN — real host wired from env at deploy. Kept empty-safe for scaffold.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
