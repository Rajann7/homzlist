import type { Metadata } from "next";
import { LegalIndex } from "@/components/legal/LegalIndex";
import { getLegalIndex } from "@/lib/legal/service";
import { siteUrl } from "@/lib/seo/schema";

/**
 * P12 S3 — the legal shelf on the public host. Guest-readable, SSR, indexable
 * (Doc10 implementation notes: legal pages are public and crawlable).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "HomzList's Terms of Service, Privacy Policy, Refund Policy, Disclaimer, Community Guidelines, Cookie Policy and Grievance Officer details.",
  alternates: { canonical: `${siteUrl()}/legal` },
  robots: { index: true, follow: true },
};

export default async function PublicLegalIndexPage() {
  return <LegalIndex pages={await getLegalIndex()} guest />;
}
