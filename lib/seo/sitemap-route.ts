import "server-only";
import { renderUrlset, sitemapFor, type SitemapType } from "./sitemap";

/**
 * Shared handler for the five per-type sitemaps (Doc7 §115).
 *
 * They are five explicit routes (`app/sitemap-listings.xml/route.ts`, …) rather
 * than one dynamic one because the App Router does not support a PARTIAL
 * dynamic segment — `sitemap-[type].xml` is a literal folder name, not a
 * pattern, and 404s. The URLs are fixed by the spec, so five one-line routes
 * over this factory is the honest way to get them.
 */
export function sitemapRoute(type: SitemapType) {
  return async function GET() {
    const entries = await sitemapFor(type);
    return new Response(renderUrlset(entries), {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  };
}
