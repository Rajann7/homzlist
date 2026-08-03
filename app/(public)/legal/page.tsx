import type { Metadata } from "next";
import { LegalIndex } from "@/components/legal/LegalIndex";
import { getLegalIndex } from "@/lib/legal/service";
import { siteUrl } from "@/lib/seo/schema";

/**
 * /legal — the public legal index (Doc10: "Guest-accessible + SEO").
 * SSR, indexable, no login wall. `fetchCache` is opted out for the reason in
 * memory/nextjs-data-cache-ssr-staleness: force-dynamic alone leaves Supabase
 * reads in Next's persistent Data cache, so a republished page never appears.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: { absolute: "Legal — HomzList" },
  description:
    "HomzList's Terms of Service, Privacy Policy, Refund Policy, Disclaimer, Community Guidelines, Cookie Policy and Grievance Officer details.",
  alternates: { canonical: `${siteUrl()}/legal` },
  robots: { index: true, follow: true },
};

export default async function PublicLegalIndexPage() {
  return <LegalIndex pages={await getLegalIndex()} guest />;
}
