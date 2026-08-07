import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMyTickets, createTicket } from "@/lib/support/service";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * GET  /api/v1/support/tickets — my tickets + the three tab counts.
 * POST /api/v1/support/tickets — raise one (Doc7 §192).
 *
 * Both are scoped to the caller. There is no ?profileId, and the list query
 * filters on the session's own id, so there is nothing to tamper with.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok(await listMyTickets(claims.sub));
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Governed by the admin `support_ticket` rule (A22 Limits & velocity), so the
  // panel's value actually caps how many tickets one account opens; the numbers
  // here are the fallback if the rule is unreachable.
  const limited = await rateLimit(`support-ticket:${claims.sub}`, 5, 86_400, "support_ticket");
  if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });

  let body: Record<string, string | string[] | undefined>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const { data } = await createServiceClient()
    .from("profiles").select("name").eq("id", claims.sub).maybeSingle();
  const name = (data as { name: string | null } | null)?.name ?? "You";

  const res = await createTicket(claims.sub, name, {
    category: String(body.category ?? ""),
    subject: String(body.subject ?? ""),
    description: String(body.description ?? ""),
    paymentRef: body.paymentRef ? String(body.paymentRef) : null,
    altContact: body.altContact ? String(body.altContact) : null,
    reportLink: body.reportLink ? String(body.reportLink) : null,
    attachments: Array.isArray(body.attachments) ? (body.attachments as string[]) : [],
  });
  if (!res.ok) {
    if (res.reason === "SERVER_ERROR") return fail("SERVER_ERROR");
    return fail("VALIDATION_ERROR", res.field ? { field: res.field } : undefined);
  }
  return ok({ id: res.id, number: res.number });
}
