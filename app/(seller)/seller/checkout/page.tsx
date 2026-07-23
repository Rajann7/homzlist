import { Suspense } from "react";
import { Checkout, CheckoutSkeleton } from "@/components/billing/Checkout";

/** P6 S2 — Checkout (seller.homzlist.com/checkout?plan=…). */
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <Checkout />
    </Suspense>
  );
}
