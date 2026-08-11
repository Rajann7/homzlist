import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sendInquiry, listInquiryOptions, mayInquire, existingInquiry } from "@/lib/inquiry/service";

/**
 * POST /api/v1/inquiries — the connection sheet's Send.
 *
 * There is no message. The body carries the three answers (wants / contact
 * preference / when), the consent flag, and optionally a custom number that
 * must already hold a live OTP verification.
 *
 * GET returns the option chips for a subject, straight from `inquiry_options`,
 * so the sheet never ships a hardcoded list.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam === "project" ? "project" : kindParam === "requirement" ? "requirement" : "listing";
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  // The sheet must know whether this person has ALREADY connected on this
  // subject — otherwise it offers the same three steps again and quietly
  // overwrites the inquiry they already sent, which reads as a double send.
  const subjectId = req.nextUrl.searchParams.get("subjectId") ?? "";
  const existing = subjectId && UUID_RE.test(subjectId)
    ? await existingInquiry(claims.sub, kind === "project" ? "project" : "listing", subjectId)
    : null;

  const options = await listInquiryOptions(kind);
  return ok({
    ...options,
    allowed: mayInquire(profile.role, kind),
    myNumber: profile.phone ?? null,
    existing,
  });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  // Min profile = name + city (Doc2 §10.1) — unchanged by this module.
  if (!profile.name || !profile.city_id) return fail("PROFILE_INCOMPLETE", { field: profile.name ? "city" : "name" });

  // Inquiries are free, so the cap is what stops one broker carpet-bombing a
  // city. Proposals stay quota'd separately.
  const limited = await rateLimit(`inquiry:${claims.sub}`, 50, 86_400, "inquiry_send");
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!!listingId === !!projectId) return fail("VALIDATION_ERROR", { field: "listingId" });
  const subjectId = listingId || projectId;
  if (!UUID_RE.test(subjectId)) return fail("VALIDATION_ERROR", { field: listingId ? "listingId" : "projectId" });

  const res = await sendInquiry(claims.sub, {
    kind: listingId ? "listing" : "project",
    subjectId,
    wants: Array.isArray(body.wants) ? body.wants.filter((w): w is string => typeof w === "string") : [],
    contactPref: body.contactPref === "whatsapp" ? "whatsapp" : "call",
    contactNumber: typeof body.contactNumber === "string" ? body.contactNumber : null,
    whenToken: typeof body.whenToken === "string" ? body.whenToken : "anytime",
    preferredDate: typeof body.preferredDate === "string" ? body.preferredDate : null,
    consent: body.consent === true,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 64) : null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!res.ok) {
    if (res.reason === "self") return fail("SELF_ACTION_BLOCKED");
    if (res.reason === "role") return fail("FORBIDDEN");
    if (res.reason === "number_unverified") return fail("NUMBER_NOT_ALLOWED");
    if (res.reason === "consent" || res.reason === "invalid") return fail("VALIDATION_ERROR");
    // Already sent, too recently to send again — the sheet shows the
    // already-sent card rather than pretending the send failed.
    if (res.reason === "cooldown") return fail("INQUIRY_COOLDOWN");
    // A block must not be distinguishable from a subject that isn't there —
    // otherwise the endpoint tells you who blocked you.
    return fail("NOT_FOUND");
  }
  return ok({ sent: true, leadId: res.leadId, alreadySent: res.alreadySent });
}
