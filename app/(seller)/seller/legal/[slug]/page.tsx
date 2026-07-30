import { LegalPageView } from "@/components/legal/LegalPageView";

/** P12 S3 — a legal document inside the app. Same reader, user chrome. */
export const metadata = { title: "Legal" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerLegalPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { version?: string };
}) {
  return <LegalPageView slug={params.slug} version={searchParams.version} guest={false} />;
}
