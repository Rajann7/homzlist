import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getFeedSectionItems } from "@/lib/feed/sections";
import type { FeedFilter, FeedSort } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/section?key=…&cursor=… — one rail's page.
 *
 * `key` is the opaque id /api/v1/feed/sections handed out ("projects",
 * "newly_added", "featured", "builders", "brokers", "news"). It is validated by
 * SHAPE here and resolved server-side; an unknown key returns an empty page
 * rather than an error, so a stale client cannot make the feed fail.
 *
 * The rail carries no ranking of its own — this is the same getFeed query the
 * vertical feed ran, narrowed to one type, so boosts and the not-interested
 * rules apply identically inside a rail.
 */
export const dynamic = "force-dynamic";

/**
 * The keys /feed/sections hands out, plus the two it no longer does.
 *
 * `type:`/`ptype:` stay accepted on purpose: the per-type rails left the home
 * screen on 8 Aug 2026, but a PWA still running the cached bundle from before
 * that asks for them, and a 422 would turn its feed into a wall of retry rows.
 */
const KEY_RE = /^(projects|newly_added|featured|builders|brokers|news|sell_cta|type:[a-z0-9_]{1,40}|ptype:[a-z0-9_]{1,40})$/;

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!KEY_RE.test(key)) return fail("VALIDATION_ERROR");

  const filterRaw = url.searchParams.get("filter");
  const sortRaw = url.searchParams.get("sort");
  const filter: FeedFilter = filterRaw === "buy" || filterRaw === "rent" ? filterRaw : "all";
  const sort: FeedSort = ["latest", "nearby", "price_asc", "price_desc"].includes(sortRaw ?? "") ? (sortRaw as FeedSort) : "latest";

  try {
    const page = await getFeedSectionItems(claims?.sub ?? null, key, {
      filter, sort, cursor: url.searchParams.get("cursor"), cityId: url.searchParams.get("city"),
    });
    return ok(page);
  } catch (err) {
    console.error("[feed/section] failed", err);
    return fail("SERVER_ERROR");
  }
}
