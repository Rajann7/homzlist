import { Suspense } from "react";
import { Preview } from "@/components/listings/Preview";

/** P6 S1 — preview + submit for review. */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
