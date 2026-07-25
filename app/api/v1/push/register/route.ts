import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/push/register — register (or refresh) this device's FCM token
 * for the signed-in user, so chat notifications can reach it (Doc7 §16).
 *
 * The client obtains the token from the Firebase web SDK (needs the PUBLIC web
 * config + a VAPID key — see docs/PENDING-INTEGRATIONS.md) and posts it here.
 * Server-owned table (RLS deny-all, 0029); the browser never writes it directly.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`push-register:${claims.sub}`, 30, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform = ["web", "android", "ios"].includes(body.platform) ? body.platform : "web";
  if (!token || token.length > 4096) return fail("VALIDATION_ERROR", { field: "token" });

  const now = new Date().toISOString();
  await createServiceClient()
    .from("push_tokens")
    .upsert({ profile_id: claims.sub, token, platform, last_seen_at: now }, { onConflict: "profile_id,token" });

  return ok({ registered: true });
}
