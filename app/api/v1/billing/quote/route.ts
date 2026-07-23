import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { getCatalogItem, quote } from "@/lib/billing/service";
import { quoteDTO } from "@/lib/billing/dto";

/**
 * POST /api/v1/billing/quote — price the checkout screen, without creating an
 * order or touching money.
 *
 * This runs the SAME `quote()` the order is built from, so the breakdown the
 * user approves (subtotal, coupon, CGST/SGST or IGST, total) is exactly what
 * `/checkout` will charge. It exists so the Pay button can never show a figure
 * that differs from the amount actually captured.
 *
 * Being read-only doesn't make it unguarded: the role filter still applies, so
 * quoting a Builder plan as a Broker is refused here too.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const code = typeof body.planId === "string" ? body.planId : null;
  if (!code) return fail("VALIDATION_ERROR", { field: "planId" });

  const item = await getCatalogItem(code);
  if (!item) return fail("NOT_FOUND");
  if (profile.role && !item.roles.includes(profile.role)) return fail("FORBIDDEN");

  const q = await quote({
    profileId: claims.sub,
    item,
    couponCode: typeof body.couponCode === "string" ? body.couponCode : null,
    stateCode: null,
  });

  return ok({ quote: quoteDTO(q) });
}
