import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMyTickets, createTicket } from "@/lib/support/service";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit, clientIp, hashIp } from "@/lib/auth/rate-limit";

/**
 * GET  /api/v1/support/tickets      — my tickets + the three tab counts (P12 S2).
 * POST /api/v1/support/tickets      — raise a ticket (Doc7 §14, public half).
 *
 * Both are scoped to the session's own profile; there is no way to ask for
 * somebody else's queue.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await getMyTickets(claims.sub));
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  // A support desk is a spam target: 5 new tickets an hour is generous for a
  // real user and useless for a script.
  const gate = await rateLimit(`support:new:${claims.sub}`, 5, 3600);
  if (!gate.allowed) return fail("RATE_LIMITED");
  void (await hashIp(clientIp(req.headers)));

  const profile = await getProfileById(claims.sub);
  const result = await createTicket(claims.sub, profile?.name ?? "You", {
    category: String(body.category ?? ""),
    subject: String(body.subject ?? ""),
    description: String(body.description ?? ""),
    paymentRef: body.paymentRef == null ? null : String(body.paymentRef),
    altContact: body.altContact == null ? null : String(body.altContact),
    reportLink: body.reportLink == null ? null : String(body.reportLink),
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as Array<Record<string, unknown>>)
          .filter((a) => typeof a?.key === "string" && typeof a?.url === "string")
          .map((a) => ({ key: String(a.key), url: String(a.url), bytes: Number(a.bytes ?? 0) }))
      : [],
  });
  if (!result.ok) return fail("VALIDATION_ERROR");
  return ok(result);
}
