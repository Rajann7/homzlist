import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { listRecents, recordRecent, deleteRecent, clearRecents } from "@/lib/search/recents";

/**
 * Recent searches (Doc7 §110 GET, §111 DELETE) + POST to record one.
 *
 * All three are authenticated: recents are per-user server state. A guest gets
 * an empty list rather than a 401, because the search home renders the section
 * for everyone and the design's empty state is the correct guest view.
 */
export const dynamic = "force-dynamic";

function modeOf(url: URL) {
  return url.searchParams.get("mode") === "requirement" ? "requirement" as const : "property" as const;
}

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return ok({ items: [] });
  const url = new URL(req.url);
  return ok({ items: await listRecents(claims.sub, modeOf(url)) });
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(`recent:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { query?: string; mode?: string; targetKind?: string; targetSlug?: string | null };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 120) return fail("VALIDATION_ERROR");

  const mode = body.mode === "requirement" ? "requirement" as const : "property" as const;
  const kind = (["area", "city", "landing", "text"] as const).includes(body.targetKind as never)
    ? (body.targetKind as "area" | "city" | "landing" | "text")
    : "text";

  await recordRecent(claims.sub, query, mode, {
    kind,
    slug: typeof body.targetSlug === "string" ? body.targetSlug.slice(0, 160) : null,
  });
  return ok({ items: await listRecents(claims.sub, mode) });
}

export async function DELETE(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const mode = modeOf(url);

  // No id → "Clear all" for that mode. With an id → remove one row, scoped to
  // the caller (never by id alone — that would be a trivial IDOR).
  if (id) await deleteRecent(claims.sub, id);
  else await clearRecents(claims.sub, mode);

  return ok({ items: await listRecents(claims.sub, mode) });
}
