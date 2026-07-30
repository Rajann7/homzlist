import { HelpCentre } from "@/components/help/HelpCentre";
import { getHelpHome } from "@/lib/help/service";

/** P12 S1 — Help centre inside the app (Settings → Support → Help centre). */
export const metadata = { title: "Help centre" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerHelpPage() {
  const { categories, popular } = await getHelpHome();
  return <HelpCentre categories={categories} popular={popular} supportHref="/support/new" />;
}
