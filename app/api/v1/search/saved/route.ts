import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { listSaved, saveSearch, setAlerts, deleteSaved } from "@/lib/search/recents";
import { countProperties } from "@/lib/search/service";
import { paramsToFilters } from "@/lib/search/filters";
import type { SearchFilters } from "@/lib/search/types";

/**
 * Saved searches + new-match alerts (Doc7 §112 POST, §113 GET, §114 PATCH/DELETE).
 *
 * The saved row stores the filter payload whole, plus the match count AT SAVE
 * TIME. The alert job (cron) re-runs the same filters and notifies only when
 * the count has grown — which is why the watermark has to be server state and
 * cannot live in the browser.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ items: await listSaved(claims.sub) });
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(`saved:${clientIp(req.headers)}`, 30, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { label?: string; params?: unknown; query?: string; mode?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  // Accept the filters either as an object or as the results-page query string,
  // and re-parse them through the SAME validator the search endpoint uses — an
  // arbitrary client-supplied jsonb blob must never reach the query builder.
  let filters: SearchFilters;
  if (typeof body.query === "string") {
    filters = paramsToFilters(new URLSearchParams(body.query));
  } else if (body.params && typeof body.params === "object") {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(body.params as Record<string, unknown>)) {
      if (v == null) continue;
      p.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    filters = paramsToFilters(p);
  } else {
    return fail("VALIDATION_ERROR");
  }

  const label = typeof body.label === "string" && body.label.trim()
    ? body.label.trim()
    : (filters.q || "Saved search");
  const mode = body.mode === "requirement" ? "requirement" as const : "property" as const;

  const count = await countProperties(filters, claims.sub);
  const row = await saveSearch(claims.sub, label, filters, mode, count);
  if (!row) return fail("SERVER_ERROR");
  return ok({ saved: row });
}

export async function PATCH(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { id?: string; alertsEnabled?: boolean };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (!body.id || typeof body.alertsEnabled !== "boolean") return fail("VALIDATION_ERROR");

  const okd = await setAlerts(claims.sub, body.id, body.alertsEnabled);
  if (!okd) return fail("NOT_FOUND");
  return ok({ items: await listSaved(claims.sub) });
}

export async function DELETE(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("VALIDATION_ERROR");
  const okd = await deleteSaved(claims.sub, id);
  if (!okd) return fail("NOT_FOUND");
  return ok({ items: await listSaved(claims.sub) });
}
