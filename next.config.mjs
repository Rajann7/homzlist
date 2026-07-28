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

// Razorpay Checkout.js (Doc9 §12). WITHOUT these the payment flow is dead: the
// browser refuses to load checkout.js under `script-src 'self'`, our loader's
// onerror fires, and every attempt lands on the "Payment failed" screen having
// never reached Razorpay at all (zero payment attempts on the order).
//
// Explicit hosts, never a wildcard — this is the one third party allowed to run
// script in our page, so the list stays exactly as long as Razorpay needs:
//   checkout.razorpay.com  the SDK + the sheet's iframe
//   cdn.razorpay.com       the risk-detection bundle checkout.js pulls in itself
//   api.razorpay.com       the sheet's XHR and the bank/3DS redirect target
//   lumberjack*            its telemetry beacons (blocked = console errors only)
const RAZORPAY = {
  script: "https://checkout.razorpay.com https://cdn.razorpay.com",
  frame: "https://api.razorpay.com https://checkout.razorpay.com",
  connect: "https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-metrics.razorpay.com",
  form: "https://api.razorpay.com",
};

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RAZORPAY.script}${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", // R2 / Cloudflare CDN images + data/blob avatars
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${RAZORPAY.connect}${isProd ? "" : " ws: wss:"}`.replace(/\s+/g, " ").trim(),
  // The checkout sheet renders in an iframe. Absent, this fell back to
  // `default-src 'self'` and the sheet could not be framed even once the SDK
  // was allowed to load.
  `frame-src 'self' ${RAZORPAY.frame}`,
  "worker-src 'self' blob:", // PWA service worker
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Net-banking / 3-D Secure hand off by POSTing the browser to the gateway.
  `form-action 'self' ${RAZORPAY.form}`,
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
