import { HelpArticle } from "@/components/help/HelpArticle";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { getHelpArticle } = await import("@/lib/help/service");
  const a = await getHelpArticle(params.slug, { profileId: null, visitorKey: null });
  return { title: a?.question ?? "Help centre" };
}

export default async function SellerHelpArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return <HelpArticle slug={params.slug} />;
}
