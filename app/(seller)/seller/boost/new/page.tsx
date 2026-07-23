import { Suspense } from "react";
import { BoostBuy, BoostBuySkeleton } from "@/components/billing/BoostBuy";

/** P11 S4 — Boost purchase (seller.homzlist.com/boost/new). */
export const dynamic = "force-dynamic";

export default function BoostBuyPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<BoostBuySkeleton />}>
      <BoostBuy />
    </Suspense>
  );
}
