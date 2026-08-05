import { HelpCategory } from "@/components/help/HelpCategory";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ category: string }> }) {
  const params = await props.params;
  const { getHelpCategory } = await import("@/lib/help/service");
  const c = await getHelpCategory(params.category);
  return { title: c?.title ?? "Help centre" };
}

export default async function SellerHelpCategoryPage(props: { params: Promise<{ category: string }> }) {
  const params = await props.params;
  return <HelpCategory slug={params.category} />;
}
