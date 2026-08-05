import { ok } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { kv } from "@/lib/kv";

/**
 * GET /api/v1/locations/cities (Doc7 §11 public read) — the city sheet's list.
 * Guest-usable and backend-driven. Optional `?q=` searches by name.
 *
 * With no `q` this answers "popular cities": the launched ones, with a live
 * listing count. It used to answer with EVERY city, which was fine while the
 * master held five of them — migration 0054 seeded the whole India Post
 * directory (104,612 cities and villages), so an unfiltered list is now a
 * payload nobody can scroll. Search is therefore resolved by the database, not
 * by filtering a cached array in the browser.
 */
export const dynamic = "force-dynamic";
// v3: `q` is resolved server-side and the default list is launched cities only.
const CACHE_KEY = "cache:cities:popular:v3";
const CACHE_TTL = 300;
const LIMIT = 40;

interface CityDTO { id: string; name: string; state: string; slug: string; propertyCount: number }
interface CityRow { id: string; name: string; slug: string; parent_id: string | null; is_launched: boolean }

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const db = createServiceClient();

  if (!q) {
    const cached = await kv.get(CACHE_KEY).catch(() => null);
    if (cached) return ok({ cities: JSON.parse(cached) as CityDTO[] });
    const cities = await decorate(db, await launchedCities(db));
    await kv.set(CACHE_KEY, JSON.stringify(cities), CACHE_TTL).catch(() => {});
    return ok({ cities });
  }

  // Searching reaches the whole master, launched or not: a seller in a town we
  // haven't launched still has to be able to name it, and the coming-soon
  // screen is what handles the rest (Doc2 §12).
  const safe = q.replace(/[%_,]/g, " ").slice(0, 60);

  // The candidate set is built from THREE queries, not one, because a single
  // `%term%` ordered by name and capped would slice the master alphabetically
  // BEFORE ranking — "raj" would fill up on "Abbarajupalem…" and never fetch
  // launched "Rajkot" (starts R) at all. So we guarantee the two buckets the
  // ranking cares about are always present: every launched match, and every
  // prefix match, then fill the rest with substring matches.
  const base = () => db
    .from("locations")
    .select("id,name,slug,parent_id,is_launched")
    .eq("level", "city")
    .eq("is_active", true);
  const [launched, prefix, substr] = await Promise.all([
    base().eq("is_launched", true).ilike("name", `%${safe}%`).order("name").limit(LIMIT),
    base().ilike("name", `${safe}%`).order("name").limit(LIMIT * 4),
    base().ilike("name", `%${safe}%`).order("name").limit(LIMIT * 4),
  ]);

  // Union by id — a launched prefix match must appear once, not three times.
  const byId = new Map<string, CityRow>();
  for (const r of [...(launched.data ?? []), ...(prefix.data ?? []), ...(substr.data ?? [])] as CityRow[]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const rows = [...byId.values()];
  const term = safe.toLowerCase();
  // Launched first, then exact/prefix matches — typing "raj" should surface
  // Rajkot before a hamlet called Rajapur.
  rows.sort((a, b) =>
    Number(b.is_launched) - Number(a.is_launched) ||
    rank(a.name, term) - rank(b.name, term) ||
    a.name.localeCompare(b.name));

  return ok({ cities: await decorate(db, rows.slice(0, LIMIT)) });
}

function rank(name: string, term: string) {
  const n = name.toLowerCase();
  return n === term ? 0 : n.startsWith(term) ? 1 : 2;
}

async function launchedCities(db: ReturnType<typeof createServiceClient>) {
  const { data } = await db
    .from("locations")
    .select("id,name,slug,parent_id,is_launched")
    .eq("level", "city")
    .eq("is_active", true)
    .eq("is_launched", true)
    .order("name")
    .limit(LIMIT);
  return (data ?? []) as CityRow[];
}

/** Attach the state name and a live listing count to one page of cities. */
async function decorate(db: ReturnType<typeof createServiceClient>, rows: CityRow[]): Promise<CityDTO[]> {
  if (!rows.length) return [];
  const [states, counts] = await Promise.all([resolveStates(db, rows), listingCounts(db, rows.map((r) => r.id))]);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    state: states[c.id] ?? "",
    slug: c.slug,
    // Live count of what's actually listed there — never a stored guess.
    propertyCount: counts[c.id] ?? 0,
  }));
}

/** Live listings per city, for the page being returned only. */
async function listingCounts(db: ReturnType<typeof createServiceClient>, cityIds: string[]) {
  const out: Record<string, number> = {};
  const { data } = await db.from("listings").select("city_id").eq("status", "live").in("city_id", cityIds);
  for (const row of (data ?? []) as { city_id: string | null }[]) {
    if (row.city_id) out[row.city_id] = (out[row.city_id] ?? 0) + 1;
  }
  return out;
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

  const climb = async (ids: (string | null)[]) => {
    const clean = [...new Set(ids.filter(Boolean))] as string[];
    if (!clean.length) return [] as { id: string; name: string; level: string; parent_id: string | null }[];
    const { data } = await db.from("locations").select("id,name,level,parent_id").in("id", clean);
    return (data ?? []) as { id: string; name: string; level: string; parent_id: string | null }[];
  };

  const talukas = await climb(cities.map((c) => c.parent_id));
  const districts = await climb(talukas.map((t) => t.parent_id));
  const states = await climb(districts.map((d) => d.parent_id));

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const tMap = byId(talukas), dMap = byId(districts), sMap = byId(states);

  for (const c of cities) {
    const t = c.parent_id ? tMap.get(c.parent_id) : null;
    const d = t?.parent_id ? dMap.get(t.parent_id) : null;
    const s = d?.parent_id ? sMap.get(d.parent_id) : null;
    if (s) out[c.id] = s.name;
  }
  return out;
}
