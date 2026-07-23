import { Suspense } from "react";
import { Photos } from "@/components/listings/Photos";

/** P5 S5 — photos. */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><Photos /></Suspense>;
}
