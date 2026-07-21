/** @type {import('next').NextConfig} */

// Doc9 §14 — HTTP security headers applied at the app layer (Cloudflare adds edge layer too).
// CSP is intentionally conservative; extend connect/img-src as real CDN + Supabase hosts are wired.
const securityHeaders = [
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
