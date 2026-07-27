import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSaved } from "@/lib/saved/service";

/**
 * GET /api/v1/saved (Doc7 §57) — the Saved screen: tiles (optionally filtered to
 * a collection via ?collection=<id>), the collection chips with real counts, and
 * how many saves have changed. Own wishlist only.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const collection = req.nextUrl.searchParams.get("collection");
  return ok(await getSaved(claims.sub, collection || null));
}
