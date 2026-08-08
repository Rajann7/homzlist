import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getStories } from "@/lib/feed/stories";
import { flagEnabled } from "@/lib/system/flags";

/**
 * GET /api/v1/stories (Doc7 §84) — the auto-generated story row: approved
 * listings/projects live within the story window (admin-tunable, default 30
 * days; system_durations.story_window) in the viewer's city, cascade order,
 * boosted first, one poster/day = one multi-segment circle. NO add-story.
 * Guest-readable.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`stories:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  // A22 Feature flags → Stories. Off = no story row for anyone. Default-on.
  if (!(await flagEnabled("stories", { role: claims?.role ?? null, userId: claims?.sub ?? null })))
    return ok({ circles: [] });
  const city = new URL(req.url).searchParams.get("city");
  return ok({ circles: await getStories(claims?.sub ?? null, city) });
}
