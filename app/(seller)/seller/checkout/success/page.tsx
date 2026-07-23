import { Suspense } from "react";
import { Success } from "@/components/billing/Success";

/** P6 S3 — Success (seller.homzlist.com/checkout/success). */
export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <Success />
    </Suspense>
  );
}
