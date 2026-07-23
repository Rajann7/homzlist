import { Suspense } from "react";
import { PropertyTypeClient } from "@/components/listings/PropertyTypeClient";

/** P5 S3 — property type picker. */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><PropertyTypeClient /></Suspense>;
}
