import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalogItem, validateCoupon } from "@/lib/billing/service";
import { computeTax, formatPaise } from "@/lib/billing/money";
import { getSettings } from "@/lib/billing/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/billing/coupon/validate (Doc7 §36).
 *
 * Server validates per-user limit, expiry, usage cap, min-value and scope — the
 * client is only told the resulting discount, never the coupon's rules
 * (Doc9 §11 coupon abuse). Rate-limited so codes can't be brute-forced, and
 * every failure returns the same generic shape so it can't be used as an oracle
 * for "this code exists but isn't yours".
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const limited = await rateLimit(`coupon:${claims.sub}`, 15, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const code = typeof body.code === "string" ? body.code : "";
  const planId = typeof body.planId === "string" ? body.planId : "";
  const item = await getCatalogItem(planId);
  if (!item) return fail("NOT_FOUND");

  const scope = item.kind === "boost" ? "boosts" : "plans";
  const res = await validateCoupon(claims.sub, code, item.price_paise, scope, item.code);

  if (!res.ok) {
    // One message for every failure mode — no enumeration signal (Doc9 §7).
    return ok({ valid: false, message: "Invalid or expired code" });
  }

  const settings = await getSettings();
  const tax = computeTax(item.price_paise, res.discountPaise!, {
    gstRateBps: Number(settings.gst_rate_bps ?? 1800),
    intraState: true,
  });

  return ok({
    valid: true,
    code: res.code,
    discount: formatPaise(res.discountPaise!),
    label: `${res.code} applied — ${formatPaise(res.discountPaise!)} off`,
    total: formatPaise(tax.totalPaise),
  });
}
