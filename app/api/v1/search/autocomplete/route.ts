import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { autocomplete } from "@/lib/search/service";

/**
 * GET /api/v1/search/autocomplete?q= (Doc7 §108).
 *
 * Debounced by the client, but rate-limited here too — a keystroke endpoint is
 * the easiest thing on the site to hammer.
 *
 * All-Indian-script input: `q` is passed through verbatim (no transliteration,
 * no ASCII folding) and matched by trigram indexes on `name` AND `name_gu`, so
 * "મવડી" finds Mavdi the same way "mavdi" does.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`ac:${clientIp(req.headers)}`, 300, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const modeRaw = url.searchParams.get("mode");
  const mode = modeRaw === "requirement" ? "requirement" : "property";

  try {
    const result = await autocomplete(q, claims?.sub ?? null, mode);
    return ok(result);
  } catch (err) {
    console.error("[autocomplete] failed", err);
    return fail("SERVER_ERROR");
  }
}
