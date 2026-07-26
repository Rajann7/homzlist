import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingView } from "@/components/search/LandingView";
import { buildLandingPage } from "@/lib/seo/landing";
import { parseLandingSlug } from "@/lib/seo/slugs";
import { siteUrl } from "@/lib/seo/schema";

/**
 * The programmatic landing matrix at the ROOT (Doc3 §4):
 *
 *   /flats-for-sale-in-rajkot
 *   /flats-for-sale-in-mavdi-rajkot
 *   /2-bhk-flats-for-rent-in-rajkot
 *   /plots-for-sale-in-mavdi-rajkot
 *   /pg-in-rajkot
 *   /commercial-shops-for-rent-in-rajkot
 *   /new-projects-in-rajkot
 *   /rajkot
 *
 * A root-level catch-all is deliberate — these URLs have to be short to rank —
 * and it is SAFE here because Next.js resolves static segments first, so every
 * real route (/search, /property, /saved, …) still wins. Anything the parser
 * does not recognise as real master data returns null and 404s, which is what
 * stops the catch-all from minting a thin page for every typo.
 */
export const dynamic = "force-dynamic";
/**
 * `force-dynamic` alone is NOT enough here.
 *
 * Next patches global `fetch`, and supabase-js reads go through it, so the
 * Supabase responses land in Next's DATA cache — which is separate from the
 * route cache, persists on disk under `.next/cache`, and survives a server
 * restart. Verified in dev: after updating a listing's title, the API route
 * returned the new value while this page kept serving the old row set.
 *
 * On a freshness-critical SEO surface that is a real bug, not a dev quirk: an
 * approved listing would never appear, and Doc3 §4's "lastmod / cache purge on
 * approvals / Updated this week" would all be lying. `force-no-store` opts
 * every fetch in this route out of that cache.
 */
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { landing: string } }): Promise<Metadata> {
  const spec = await parseLandingSlug(params.landing);
  if (!spec) return { title: "Not found", robots: { index: false, follow: false } };

  const page = await buildLandingPage(spec, null);
  const url = `${siteUrl()}${page.canonical}`;

  return {
    // `absolute` bypasses the root layout's "%s · HomzList" template. The
    // formula in buildTitle already carries the brand and is capped at 60
    // chars — letting the template append would blow the cap and render
    // "… | HomzList · HomzList".
    title: { absolute: page.title },
    description: page.description,
    // Self-canonical. A page reached at a non-canonical spelling points here.
    alternates: { canonical: url },
    robots: page.indexable ? { index: true, follow: true } : { index: false, follow: true },
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
  };
}

export default async function LandingPage({ params }: { params: { landing: string } }) {
  const spec = await parseLandingSlug(params.landing);
  if (!spec) notFound();
  const page = await buildLandingPage(spec, null);
  return <LandingView page={page} />;
}
