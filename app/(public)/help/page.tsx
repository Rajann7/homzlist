import type { Metadata } from "next";
import { HelpCentre } from "@/components/help/HelpCentre";
import { getHelpHome } from "@/lib/help/service";
import { siteUrl } from "@/lib/seo/schema";

/**
 * P12 S1 — the help centre on the public host. Guest-readable and indexable:
 * help content is the cheapest support channel there is, and it answers the
 * questions people search before they ever sign up.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about plans, posting listings, requirements, chat and numbers, payments, verification and your account on HomzList.",
  alternates: { canonical: `${siteUrl()}/help` },
  robots: { index: true, follow: true },
};

export default async function PublicHelpPage() {
  const { categories, popular } = await getHelpHome();
  // A guest cannot file a ticket — the CTA goes to login, which is on the
  // seller host, rather than to a form that would 404 here.
  return <HelpCentre categories={categories} popular={popular} supportHref="/login" />;
}
