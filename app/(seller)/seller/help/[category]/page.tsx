import { HelpCategory } from "@/components/help/HelpCategory";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { category: string } }) {
  const { getHelpCategory } = await import("@/lib/help/service");
  const c = await getHelpCategory(params.category);
  return { title: c?.title ?? "Help centre" };
}

export default function SellerHelpCategoryPage({ params }: { params: { category: string } }) {
  return <HelpCategory slug={params.category} />;
}
