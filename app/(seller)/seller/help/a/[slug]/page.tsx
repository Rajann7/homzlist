import { HelpArticlePage } from "@/components/help/HelpArticlePage";

export const metadata = { title: "Help" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerHelpArticleRoute({ params }: { params: { slug: string } }) {
  return <HelpArticlePage slug={params.slug} />;
}
