import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/**
 * POST /api/v1/city/request (Doc7 §118) — the Coming-soon "Notify me" button.
 *
 * The design's button becomes a disabled "You'll be notified ✓" and fires a
 * toast. That promise needs a row behind it, or the screen is lying: this
 * writes a real expansion signal the admin panel reports on, and `notified_at`
 * is the hook the launch announcement will mark.
 *
 * Guests can register (the screen is public), deduped by a hashed IP+UA rather
 * than by storing a raw fingerprint.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = await rateLimit(`cityreq:${clientIp(req.headers)}`, 10, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: { city?: string; cityId?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const cityName = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
  if (!cityName) return fail("VALIDATION_ERROR");

  const claims = await getCurrentUser();
  const db = createServiceClient();

  // Resolve to a master-data row when we have one, so admin sees the signal
  // against the real city rather than a loose string.
  let cityId: string | null = null;
  if (body.cityId && /^[0-9a-f-]{36}$/i.test(body.cityId)) {
    const { data } = await db.from("locations").select("id").eq("id", body.cityId).eq("level", "city").maybeSingle();
    cityId = (data as { id: string } | null)?.id ?? null;
  }
  if (!cityId) {
    const { data } = await db.from("locations").select("id").eq("level", "city").ilike("name", cityName).maybeSingle();
    cityId = (data as { id: string } | null)?.id ?? null;
  }

  const anonKey = claims
    ? null
    : createHash("sha256")
        .update(`${clientIp(req.headers)}|${req.headers.get("user-agent") ?? ""}`)
        .digest("hex")
        .slice(0, 32);

  // The dedupe indexes are on `lower(city_name)`, i.e. EXPRESSION indexes, which
  // ON CONFLICT cannot target by column name — so this inserts and treats the
  // unique violation as success. A repeat tap is idempotent either way, and the
  // count below stays honest.
  const { error } = await db.from("city_interest_requests").insert({
    city_id: cityId, city_name: cityName, profile_id: claims?.sub ?? null, anon_key: anonKey,
  });
  if (error && error.code !== "23505") {
    console.error("[city/request] failed", error);
    return fail("SERVER_ERROR");
  }

  const { count } = await db.from("city_interest_requests")
    .select("id", { count: "exact", head: true })
    .ilike("city_name", cityName);

  return ok({ registered: true, city: cityName, interestCount: count ?? 0 });
}
