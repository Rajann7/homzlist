import { Suspense } from "react";
import { ListingForm } from "@/components/listings/ListingForm";

/** P5 S4 — dynamic listing form. */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><ListingForm /></Suspense>;
}
