import { siteUrl } from "@/lib/seo/schema";

/**
 * GET /robots.txt (Doc7 §116, Doc3 §4).
 *
 * Disallowed: admin, chat, requirements, API — plus every authenticated
 * surface. The rule of thumb is that anything requiring a session has nothing
 * to offer a crawler and, if indexed, leaks a URL shape worth probing.
 *
 * Note this is a CRAWL directive, not an access control: /api and /seller are
 * gated server-side (middleware + per-route authz). robots.txt keeps them out
 * of the index; it is not what keeps them private.
 */
export const dynamic = "force-dynamic";

const DISALLOW = [
  "/api/",
  "/account",          // admin subdomain paths, if ever reached by path
  "/seller",
  "/messages",
  "/leads",
  "/requirements",     // Doc3 §4 — requirement pages are not indexable
  "/notifications",
  "/saved",
  "/create",
  "/story/",
  "/login",
  "/offline",
  "/_next/",
  "/_dx/",             // the design-prototype harness
];

export async function GET() {
  const base = siteUrl();
  const body = [
    "User-agent: *",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    // Filtered/sorted result URLs are noindex,follow via the page's metadata —
    // blocking them here as well would stop the crawler seeing that directive
    // and following through to the canonical landing pages.
    "Allow: /",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
