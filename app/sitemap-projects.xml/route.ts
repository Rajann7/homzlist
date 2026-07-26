import { sitemapRoute } from "@/lib/seo/sitemap-route";

/** GET /sitemap-projects.xml (Doc7 §115). See lib/seo/sitemap-route.ts. */
export const dynamic = "force-dynamic";
export const GET = sitemapRoute("projects");
