/** @type {import('next').NextConfig} */
import os from "node:os";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// App version shown in Settings (Doc3 §98 "version in settings"). Read from the
// package + the commit being built, so it can never be a number someone typed
// into a component and forgot — the screen used to read "Version 1.0.2 (build
// 148)" on every build, which told support nothing about what the user is on.
const pkgVersion = (() => {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
const buildRef = (() => {
  // Vercel/CI expose the SHA; a local build asks git; neither = the build date,
  // which is still a real fact about this bundle.
  const ci = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (ci) return ci.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }
})();

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

// Next 16 blocks /_next/static/* and /_next/hmr when the request's origin is not
// localhost. Opening the dev server from a phone on the LAN (http://<ip>:3000)
// therefore serves the HTML but NONE of the chunks: the page renders its
// skeleton, never hydrates, and sits on the loading shimmer forever — while
// desktop-on-localhost looks perfectly fine.
//
// Allow this machine's own LAN addresses (read at startup, so a new hotspot/IP
// needs no edit) plus their nip.io forms, which are how the seller/account
// subdomains are reached from a phone. Dev only — prod never sets this.
const devOrigins = isProd
  ? undefined
  : (() => {
      const ips = Object.values(os.networkInterfaces())
        .flat()
        .filter((n) => n && n.family === "IPv4" && !n.internal)
        .map((n) => n.address);
      return [
        "localhost",
        // The subdomain hosts this product is ROUTED on. Next 16 refuses a dev
        // asset request whose Origin is not listed — with a 403, not a warning
        // — so on seller.lvh.me every /_next/static chunk was blocked, React
        // never hydrated, and the whole app rendered as dead SSR HTML. It looks
        // exactly like "nothing works", and nothing in the app is at fault.
        // `localhost` does NOT cover `seller.localhost`, and lvh.me was never
        // listed at all even though it is what we test subdomain cookies on.
        "*.localhost",
        "lvh.me",
        "*.lvh.me",
        ...ips,
        // seller.<ip>.nip.io / account.<ip>.nip.io — subdomain routing on a phone
        ...ips.map((ip) => `*.${ip}.nip.io`),
        ...ips.map((ip) => `${ip}.nip.io`),
      ];
    })();

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkgVersion,
    NEXT_PUBLIC_APP_BUILD: buildRef,
  },
  ...(devOrigins ? { allowedDevOrigins: devOrigins } : {}),
  // Next 15 walks up looking for a lockfile to decide what to trace into the
  // standalone output. A stray package-lock.json in the home directory made it
  // pick C:\Users\RAJAN as the root, which would trace the wrong tree at deploy
  // time. Pin it to this project.
  outputFileTracingRoot: new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
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
