import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { tMany } from "@/lib/system/strings";

/**
 * GET /api/v1/config/strings?keys=a,b,c — admin-managed UI copy (A20 → UI
 * strings) for client components. Each key comes back with the value the admin
 * set, or the caller's fallback when the row is missing/empty, so a client can
 * render immediately without waiting on this.
 *
 * Fallbacks are passed as `keys=key|fallback`, url-encoded. Public: these are
 * UI labels, not data.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("keys") ?? "";
  const entries: Record<string, string> = {};
  for (const part of raw.split(",").slice(0, 60)) {
    if (!part.trim()) continue;
    const [key, fallback = ""] = part.split("|");
    if (key.trim()) entries[key.trim()] = fallback;
  }
  if (!Object.keys(entries).length) return ok({ strings: {} });
  return ok({ strings: await tMany(entries) });
}
