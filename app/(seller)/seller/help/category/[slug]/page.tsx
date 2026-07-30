import { notFound } from "next/navigation";
import { HelpCategoryView } from "@/components/help/HelpCategoryView";
import { getHelpCategory } from "@/lib/help/service";

export const metadata = { title: "Help" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerHelpCategoryPage({ params }: { params: { slug: string } }) {
  const cat = await getHelpCategory(params.slug);
  if (!cat) notFound();
  return <HelpCategoryView title={cat.title} articles={cat.articles} supportHref="/support/new" />;
}
