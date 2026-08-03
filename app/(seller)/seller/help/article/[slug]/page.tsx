import { HelpArticle } from "@/components/help/HelpArticle";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { getHelpArticle } = await import("@/lib/help/service");
  const a = await getHelpArticle(params.slug, { profileId: null, visitorKey: null });
  return { title: a?.question ?? "Help centre" };
}

export default function SellerHelpArticlePage({ params }: { params: { slug: string } }) {
  return <HelpArticle slug={params.slug} />;
}
