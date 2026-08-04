import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPayment } from "@/lib/billing/service";
import { paymentDetailDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/payments/:id (Doc7 §33) — detail sheet.
 * The lookup is `id = :id AND profile_id = session` → swapping the id returns
 * 404, never another user's payment (Doc9 §API1 IDOR).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 const claims = await getCurrentUser();
 if (!claims) return fail("UNAUTHORIZED");
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

 const payment = await getPayment(params.id, claims.sub);
 if (!payment) return fail("NOT_FOUND");

 return ok({ payment: paymentDetailDTO(payment) });
}
