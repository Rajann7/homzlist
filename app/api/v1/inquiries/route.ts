import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sendInquiry, sendProjectInquiry } from "@/lib/feed/interactions";

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
  // Min profile = name + CITY (Doc2 §10.1). The city half was never checked.
  if (!profile.name || !profile.city_id) return fail("PROFILE_INCOMPLETE", { field: profile.name ? "city" : "name" });

  const limited = await rateLimit(`inquiry:${claims.sub}`, 100, 86_400, "inquiry_send"); // Doc2 §15: 100/day
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  // One endpoint, two subjects (migration 0084): `listingId` inquires on a
  // property, `projectId` on a project. Exactly one of them, never both — the
  // thread's subject is single by DB constraint too.
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!!listingId === !!projectId) return fail("VALIDATION_ERROR", { field: "listingId" });
  if (listingId && !UUID_RE.test(listingId)) return fail("VALIDATION_ERROR", { field: "listingId" });
  if (projectId && !UUID_RE.test(projectId)) return fail("VALIDATION_ERROR", { field: "projectId" });

  // Which unit the buyer tapped Enquire on (0087). Optional — "Contact builder"
  // is about the whole project. Ownership of the id is checked server-side.
  const unitId = typeof body.unitId === "string" ? body.unitId : "";
  if (unitId && !UUID_RE.test(unitId)) return fail("VALIDATION_ERROR", { field: "unitId" });

  const res = projectId
    ? await sendProjectInquiry(claims.sub, projectId, {
        message: typeof body.message === "string" ? body.message : "",
        unitId: unitId || null,
      })
    : await sendInquiry(claims.sub, listingId, {
        message: typeof body.message === "string" ? body.message : "",
        intents: Array.isArray(body.intents) ? body.intents.filter((i): i is string => typeof i === "string") : [],
        shareNumber: body.shareNumber !== false,
      });
  if (!res.ok) {
    if (res.reason === "self") return fail("SELF_ACTION_BLOCKED");
    // The poster declined: tell the sender WHEN they may try again (the same
    // date their thread's DeclinedCard shows) rather than a bare failure.
    if (res.reason === "cooldown") return fail("INQUIRY_COOLDOWN", { until: res.until });
    if (res.reason === "blocked") return fail("FORBIDDEN");
    return fail("NOT_FOUND");
  }
  return ok({ sent: true, alreadySent: res.alreadySent, threadId: res.threadId ?? null });
}
