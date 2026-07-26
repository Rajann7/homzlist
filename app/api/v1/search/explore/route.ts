import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { exploreGrid } from "@/lib/search/service";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/search/explore — the P3-S1 Explore grid.
 *
 * Real live listings, newest first, with the BOOSTED one hoisted into the 2×2
 * hero cell. The design's "Promoted" chip therefore only ever appears on a
 * listing that is genuinely boosted (Doc2 §13) — never as decoration.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`explore:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const url = new URL(req.url);

  try {
    let cityId = url.searchParams.get("city");
    if (!cityId && claims) {
      const { data } = await createServiceClient().from("profiles").select("city_id").eq("id", claims.sub).maybeSingle();
      cityId = (data as { city_id: string | null } | null)?.city_id ?? null;
    }
    const tiles = await exploreGrid(cityId, claims?.sub ?? null);
    return ok({ tiles });
  } catch (err) {
    console.error("[search/explore] failed", err);
    return fail("SERVER_ERROR");
  }
}
