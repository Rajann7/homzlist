import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getPincodesFor } from "@/lib/listings/service";

/**
 * GET /api/v1/locations/pincodes?city=<uuid>&area=<uuid>
 *
 * The pincodes covered by a location. Pincode is a required field on a listing
 * and on a project, and it is PICKED from this list rather than typed — a city
 * has many of them (Rajkot fourteen, Bengaluru a hundred and six) and the free
 * text box it replaces produced typos and, far more often, nulls.
 *
 * Public for the same reason as the cascade: this is place-name master data
 * with no user content in it, and guests filter by location before signing in.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city");
  const area = url.searchParams.get("area");

  if (city && !UUID_RE.test(city)) return fail("VALIDATION_ERROR", { field: "city" });
  if (area && !UUID_RE.test(area)) return fail("VALIDATION_ERROR", { field: "area" });
  if (!city && !area) return fail("VALIDATION_ERROR", { field: "city" });

  return ok({ pincodes: await getPincodesFor(city, area) });
}
