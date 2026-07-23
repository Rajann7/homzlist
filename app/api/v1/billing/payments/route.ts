import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPayments } from "@/lib/billing/service";
import { paymentRowDTO } from "@/lib/billing/dto";
import { formatPaise } from "@/lib/billing/money";

/**
 * GET /api/v1/billing/payments (Doc7 §32) — own history only.
 * Scoped by `profile_id = session user` in the query itself, so there is no
 * parameter an attacker could swap to read someone else's payments (Doc9 §API1).
 */
export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "30d": 30, "6m": 182, fy: 365, all: 0 };
const STATUSES = ["success", "pending", "failed", "refunded", "chargeback"];

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const rangeParam = url.searchParams.get("range") ?? "all";

  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : undefined;
  const days = RANGE_DAYS[rangeParam] ?? 0;
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;

  const rows = await listPayments(claims.sub, { status, since });
  const items = rows.map(paymentRowDTO);

  // Summary counts only successful spend — pending/failed money isn't "spent".
  const spent = rows.filter((r) => r.status === "success").reduce((n, r) => n + r.amount_paise, 0);

  return ok({
    items,
    summary: { totalSpent: formatPaise(spent), transactions: rows.length },
  });
}
