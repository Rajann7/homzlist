import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sendInquiry } from "@/lib/feed/interactions";

/**
 * POST /api/v1/inquiries — the Inquiry sheet (Doc2 §10.1). Self-inquiry blocked,
 * one per (buyer, listing) with revival on re-send. Persists to `inquiries`;
 * Module 7 (Chat) grows a thread from it. Min profile (name) required (Doc2 §10.1).
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  if (!profile.name) return fail("VALIDATION_ERROR", { field: "profile" }); // min profile

  const limited = await rateLimit(`inquiry:${claims.sub}`, 100, 86_400); // Doc2 §15: 100/day
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  if (!UUID_RE.test(listingId)) return fail("VALIDATION_ERROR", { field: "listingId" });

  const res = await sendInquiry(claims.sub, listingId, {
    message: typeof body.message === "string" ? body.message : "",
    intents: Array.isArray(body.intents) ? body.intents.filter((i): i is string => typeof i === "string") : [],
    shareNumber: body.shareNumber !== false,
  });
  if (!res.ok) return fail(res.reason === "self" ? "SELF_ACTION_BLOCKED" : "NOT_FOUND");
  return ok({ sent: true, alreadySent: res.alreadySent });
}
