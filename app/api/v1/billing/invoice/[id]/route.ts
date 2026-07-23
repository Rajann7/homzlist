import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getInvoice } from "@/lib/billing/service";
import { invoiceDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/invoice/:id (Doc7 §34) — GST invoice for an own payment.
 * Ownership-scoped in the query; a swapped id is a 404 (Doc9 §API1).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const invoice = await getInvoice(params.id, claims.sub);
  if (!invoice) return fail("NOT_FOUND");

  const payment = Array.isArray(invoice.payments) ? invoice.payments[0] : invoice.payments;
  return ok({ invoice: invoiceDTO(invoice, payment ?? null) });
}
