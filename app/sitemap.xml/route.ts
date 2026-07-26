import { renderIndex, sitemapLastmod, type SitemapType } from "@/lib/seo/sitemap";

/**
 * GET /sitemap.xml — the sitemap INDEX (Doc3 §4 "separate … + index").
 *
 * Regenerated on demand and cached for an hour; approvals purge it via the
 * admin "Regenerate sitemaps" action (Doc5 A22). Public host only — the seller
 * and admin subdomains have nothing indexable.
 */
export const dynamic = "force-dynamic";

const TYPES: SitemapType[] = ["listings", "projects", "landing", "areas", "static"];

export async function GET() {
  const entries = await Promise.all(
    TYPES.map(async (type) => ({ type, lastmod: await sitemapLastmod(type) })),
  );
  return new Response(renderIndex(entries), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
