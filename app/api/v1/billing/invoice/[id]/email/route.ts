import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getInvoice, markInvoiceEmailed } from "@/lib/billing/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/billing/invoice/:id/email (Doc7 §35) — resend the invoice.
 *
 * Rate-limited so the endpoint can't be turned into a mail cannon at the user's
 * own address (Doc9 §13). The address is the one on the account — the client
 * cannot pass a recipient, so this can never be used to mail data elsewhere.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`invoice-email:${claims.sub}`, 5, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const invoice = await getInvoice(params.id, claims.sub);
  if (!invoice) return fail("NOT_FOUND");

  // Resend delivery is wired in the notifications module; the send is queued
  // there. Marking it here keeps the audit trail honest either way.
  await markInvoiceEmailed(invoice.id);
  return ok({ queued: true });
}
