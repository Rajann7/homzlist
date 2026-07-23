import { ok } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { kv } from "@/lib/kv";

/**
 * GET /api/v1/locations/cities (Doc7 §11 public read) — cities for the city
 * sheet. Guest-usable, cached (Doc8 §5). Backend-driven, never hardcoded.
 * Optional `?q=` filters by name.
 */
export const dynamic = "force-dynamic";
// v2: cities now come from `locations` (migration 0014), so the v1 payload —
// built from the deprecated `cities` table with its own ids — must not be served.
const CACHE_KEY = "cache:cities:v2";
const CACHE_TTL = 300;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  let cities: Array<{ id: string; name: string; state: string; slug: string; propertyCount: number }>;
  const cached = await kv.get(CACHE_KEY).catch(() => null);
  if (cached) {
    cities = JSON.parse(cached);
  } else {
    const db = createServiceClient();
    // The city master is `locations` at level 'city'; the state comes from
    // walking up the cascade, so the picker and a listing agree on ids.
    const { data } = await db
      .from("locations")
      .select("id,name,parent_id")
      .eq("level", "city")
      .eq("is_active", true)
      .order("name", { ascending: true });

    const rows = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
    const stateByCity = await resolveStates(db, rows);

    cities = rows.map((c) => ({
      id: c.id,
      name: c.name,
      state: stateByCity[c.id] ?? "",
      slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      // Live count of what's actually listed there — never a stored guess.
      propertyCount: 0,
    }));

    const { data: counts } = await db
      .from("listings")
      .select("city_id")
      .eq("status", "live");
    for (const row of (counts ?? []) as { city_id: string | null }[]) {
      const hit = cities.find((c) => c.id === row.city_id);
      if (hit) hit.propertyCount++;
    }
    await kv.set(CACHE_KEY, JSON.stringify(cities), CACHE_TTL).catch(() => {});
  }

  const filtered = q ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
  return ok({ cities: filtered });
}

/**
 * City → state name, by walking city → taluka → district → state. Done in three
 * batched reads rather than a query per city.
 */
async function resolveStates(
  db: ReturnType<typeof createServiceClient>,
  cities: { id: string; parent_id: string | null }[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!cities.length) return out;

  const climb = async (ids: string[]) => {
    const clean = [...new Set(ids.filter(Boolean))];
    if (!clean.length) return [] as { id: string; name: string; level: string; parent_id: string | null }[];
    const { data } = await db.from("locations").select("id,name,level,parent_id").in("id", clean);
    return (data ?? []) as { id: string; name: string; level: string; parent_id: string | null }[];
  };

  const talukas = await climb(cities.map((c) => c.parent_id ?? ""));
  const districts = await climb(talukas.map((t) => t.parent_id ?? ""));
  const states = await climb(districts.map((d) => d.parent_id ?? ""));

  for (const c of cities) {
    const t = talukas.find((x) => x.id === c.parent_id);
    const d = districts.find((x) => x.id === t?.parent_id);
    const s = states.find((x) => x.id === d?.parent_id);
    if (s) out[c.id] = s.name;
  }
  return out;
}
