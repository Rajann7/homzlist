import { sitemapRoute } from "@/lib/seo/sitemap-route";

/** GET /sitemap-listings.xml (Doc7 §115). See lib/seo/sitemap-route.ts. */
export const dynamic = "force-dynamic";
export const GET = sitemapRoute("listings");
