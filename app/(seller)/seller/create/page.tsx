import { Suspense } from "react";
import { CreateEntry } from "@/components/listings/CreateEntry";

/**
 * Creation entry (seller.homzlist.com/create) — payment-first: the plan wall
 * shows when there's no listing slot, otherwise the post-type picker (Doc2 §4.1).
 */
export const dynamic = "force-dynamic";

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateEntry />
    </Suspense>
  );
}
