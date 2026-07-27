import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";
import { describeUserAgent } from "@/lib/notifications/user-agent";

/**
 * POST   /api/v1/push/register — register (or refresh) this device's push token
 * DELETE /api/v1/push/register — drop it (permission revoked / signed out)
 *
 * Device-aware (Doc2 §14 "iOS requires installed PWA"): the browser, OS and
 * whether the page is running as an INSTALLED PWA are stored alongside the
 * token, so a silent iPhone can be explained rather than guessed at.
 *
 * Server-owned table (RLS deny-all, 0029); the browser never writes it
 * directly, and the row is always keyed to the caller's own profile.
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

  // The UA comes from the REQUEST, not from the body — a client-supplied device
  // label would be unverifiable and therefore pointless.
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 500);
  const d = describeUserAgent(ua);

  const now = new Date().toISOString();
  await createServiceClient().from("push_tokens").upsert(
    {
      profile_id: claims.sub,
      token,
      platform,
      browser: d.browser,
      os: d.os,
      device_label: d.label,
      standalone: body.standalone === true,
      user_agent: ua,
      last_seen_at: now,
    },
    { onConflict: "profile_id,token" },
  );

  return ok({ registered: true, device: d.label });
}

export async function DELETE(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return fail("VALIDATION_ERROR", { field: "token" });

  // Scoped to the caller — a token string alone can't delete someone else's row.
  await createServiceClient().from("push_tokens").delete().eq("profile_id", claims.sub).eq("token", token);
  return ok({ removed: true });
}
