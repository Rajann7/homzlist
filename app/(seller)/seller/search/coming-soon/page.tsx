import { CityComingSoon } from "@/components/search/CityComingSoon";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coming soon", robots: { index: false, follow: false } };

export default async function SellerComingSoonPage(props: { searchParams: Promise<{ city?: string }> }) {
  const searchParams = await props.searchParams;
  const city = (searchParams.city ?? "").trim().slice(0, 80) || "your city";
  const db = createServiceClient();
  const { data: match } = await db
    .from("locations").select("id").eq("level", "city").ilike("name", city).maybeSingle();

  return (
    // No basePath: the seller host REWRITES / → /seller internally, so the URL
    // in the browser is already /search/... — prefixing again would 404.
    <CityComingSoon city={city} cityId={(match as { id: string } | null)?.id ?? null} />
  );
}
