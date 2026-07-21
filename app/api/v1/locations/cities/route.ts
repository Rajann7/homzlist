import { ok } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { kv } from "@/lib/kv";

/**
 * GET /api/v1/locations/cities (Doc7 §11 public read) — cities for the city
 * sheet. Guest-usable, cached (Doc8 §5). Backend-driven, never hardcoded.
 * Optional `?q=` filters by name.
 */
export const dynamic = "force-dynamic";
const CACHE_KEY = "cache:cities:v1";
const CACHE_TTL = 300;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  let cities: Array<{ id: string; name: string; state: string; slug: string; propertyCount: number }>;
  const cached = await kv.get(CACHE_KEY).catch(() => null);
  if (cached) {
    cities = JSON.parse(cached);
  } else {
    const db = createServiceClient();
    const { data } = await db
      .from("cities")
      .select("id,name,state,slug,property_count")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    cities = (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      slug: c.slug,
      propertyCount: c.property_count,
    }));
    await kv.set(CACHE_KEY, JSON.stringify(cities), CACHE_TTL).catch(() => {});
  }

  const filtered = q ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
  return ok({ cities: filtered });
}
