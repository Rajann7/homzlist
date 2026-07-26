import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getFilterConfig } from "@/lib/search/filters";
import { popularAreas } from "@/lib/search/service";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/search/config — everything the filter sheet and search home need
 * to RENDER, all of it master data.
 *
 * This endpoint exists because of CLAUDE.md rule 12: the P3 filter sheet's type
 * chips, amenity chips, per-type sections, BHK/furnishing/facing options, area
 * list and budget bounds are option lists, and option lists come from config
 * tables — not from arrays inside a component. Add a property type in the admin
 * panel and the sheet grows a chip with no deploy.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Cheap and process-cached, but it still fans out to 5 tables per cold call —
  // and every other endpoint in this module is guarded, so this one is too.
  const limited = await rateLimit(`cfg:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const url = new URL(req.url);

  try {
    // Scope the area list to the requested city, else the viewer's own city.
    let cityId = url.searchParams.get("city");
    if (!cityId && claims) {
      const { data } = await createServiceClient().from("profiles").select("city_id").eq("id", claims.sub).maybeSingle();
      cityId = (data as { city_id: string | null } | null)?.city_id ?? null;
    }

    const [config, popular] = await Promise.all([
      getFilterConfig(cityId),
      popularAreas(cityId),
    ]);

    return ok({ ...config, popularAreas: popular, cityId });
  } catch (err) {
    console.error("[search/config] failed", err);
    return fail("SERVER_ERROR");
  }
}
