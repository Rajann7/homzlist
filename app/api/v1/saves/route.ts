import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { toggleSave } from "@/lib/feed/interactions";

/**
 * POST /api/v1/saves — toggle the wishlist heart. Persists to `saves` (the P10
 * Saved module will extend it). Guests can't save (login gate is client-side;
 * this returns 401 as the wall).
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`save:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  if (!UUID_RE.test(listingId)) return fail("VALIDATION_ERROR", { field: "listingId" });

  const { saved } = await toggleSave(claims.sub, listingId);
  return ok({ saved });
}
