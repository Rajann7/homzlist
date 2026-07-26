import { CityComingSoon } from "@/components/search/CityComingSoon";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * P3 S5 — reached when the search bar resolves a city we have not launched, or
 * a place name we have no master data for at all.
 */
export const dynamic = "force-dynamic";
// Supabase reads go through Next's patched fetch and land in its persistent
// DATA cache, which outlives a restart and is separate from the route cache.
// On a freshness-critical SEO surface that means an approved listing may never
// appear (Doc3 §4). Opt every fetch in this route out.
export const fetchCache = "force-no-store";

export const metadata = {
  title: "Coming soon",
  // A city with no inventory has nothing to offer a crawler.
  robots: { index: false, follow: true },
};

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: { city?: string };
}) {
  const city = (searchParams.city ?? "").trim().slice(0, 80) || "your city";
  const db = createServiceClient();

  // Resolve the master-data row when we have one, so the interest signal is
  // filed against the real city rather than a loose string.
  const { data: match } = await db
    .from("locations").select("id").eq("level", "city").ilike("name", city).maybeSingle();

  // Offer a launched city as the alternative — the one with the MOST live
  // inventory, so "Explore X instead" sends the visitor somewhere worth
  // exploring. Ranked from data, never a hardcoded city name.
  const { data: alt } = await db
    .from("locations").select("id,name,slug")
    .eq("level", "city").eq("is_active", true).eq("is_launched", true)
    .limit(20);

  const ranked = await Promise.all(
    ((alt ?? []) as { id: string; name: string; slug: string }[]).map(async (c) => {
      const { count } = await db.from("listings").select("id", { count: "exact", head: true })
        .eq("status", "live").eq("availability", "available").eq("city_id", c.id);
      return { ...c, count: count ?? 0 };
    }),
  );
  const best = ranked.filter((c) => c.count > 0).sort((a, b) => b.count - a.count)[0];
  const fallback = best ? { name: best.name, slug: best.slug } : null;

  return (
    <CityComingSoon
      city={city}
      cityId={(match as { id: string } | null)?.id ?? null}
      fallbackCity={fallback}
    />
  );
}
