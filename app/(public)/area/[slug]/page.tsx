import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingView } from "@/components/search/LandingView";
import { buildLandingPage, INDEX_FLOOR } from "@/lib/seo/landing";
import { parseAreaSlug } from "@/lib/seo/slugs";
import { siteUrl } from "@/lib/seo/schema";

/**
 * GET /area/mavdi-rajkot (Doc7 §117, Doc4 §14) — the area page, which is also
 * an SEO landing page. SSR, guest-readable, no login wall.
 */
export const dynamic = "force-dynamic";
// Supabase reads go through Next's patched fetch and land in its persistent
// DATA cache, which outlives a restart and is separate from the route cache.
// On a freshness-critical SEO surface that means an approved listing may never
// appear (Doc3 §4). Opt every fetch in this route out.
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const spec = await parseAreaSlug(params.slug);
  if (!spec) return { title: "Not found", robots: { index: false, follow: false } };

  const page = await buildLandingPage(spec, null);
  const url = `${siteUrl()}${page.canonical}`;

  return {
    // `absolute` bypasses the root layout's "%s · HomzList" template — the
    // formula already carries the brand and is capped at 60 chars.
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: url },
    // Doc3 §4: indexable ONLY with ≥3 live listings. Below the floor the page
    // still renders (it is useful to a human, and carries a requirement CTA)
    // but it is noindex,follow so it cannot become a thin indexed page.
    robots: page.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      type: "website",
      siteName: "HomzList",
      images: [{
        url: `${siteUrl()}/api/og?title=${encodeURIComponent(page.h1)}&subtitle=${encodeURIComponent(`${page.stats.count} listings on HomzList`)}`,
        width: 1200, height: 630,
      }],
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
    other: { "hz:index-floor": String(INDEX_FLOOR) },
  };
}

export default async function AreaPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const spec = await parseAreaSlug(params.slug);
  if (!spec) notFound();

  // Guest render on the public host — the viewer is always null here, which is
  // what keeps this page cacheable and identical for crawler and human.
  const page = await buildLandingPage(spec, null);
  return <LandingView page={page} />;
}
