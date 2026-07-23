import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLocationChildren, getLocationsByIds, requestArea } from "@/lib/listings/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * GET  /api/v1/locations/children — one level of the location cascade
 *      (State→District→Taluka→City→Area — Doc2 §5.1). PUBLIC: guests search by
 *      location before signing in.
 * POST — "Request area" → admin queue. Requires a session (it writes a row
 *      attributed to a user) and is rate-limited.
 */
export const dynamic = "force-dynamic";

const LEVELS = ["state", "district", "taluka", "city", "area"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  // Deliberately GUEST-READABLE. This is public master data (place names), and
  // guests filter the feed and search by location before ever logging in
  // (Doc2 §12). It carries no user data, so requiring a session here would
  // break public search without protecting anything.
  const url = new URL(req.url);

  // `?ids=` resolves specific nodes by id — the edit forms hold ids (a
  // requirement's preferred areas) and need their names back to redraw the
  // chips. Without it they had to guess a parent they don't know.
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, 20);
  if (ids.length) return ok({ items: await getLocationsByIds(ids) });

  const level = url.searchParams.get("level") ?? "state";
  const parent = url.searchParams.get("parent");
  if (!LEVELS.includes(level)) return fail("VALIDATION_ERROR", { field: "level" });
  if (parent && !UUID_RE.test(parent)) return fail("VALIDATION_ERROR", { field: "parent" });

  return ok({ items: await getLocationChildren(parent, level) });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Area requests land in a human review queue — cap them so it can't be spammed.
  const limited = await rateLimit(`area-request:${claims.sub}`, 10, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) return fail("VALIDATION_ERROR", { field: "name" });

  await requestArea(claims.sub, name, typeof body.cityId === "string" ? body.cityId : null);
  return ok({ requested: true });
}
