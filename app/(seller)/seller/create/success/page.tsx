import { Suspense } from "react";
import { SubmissionSuccess } from "@/components/listings/SubmissionSuccess";

/** P6 S3 — submission success (seller.homzlist.com/create/success?kind=…). */
export const dynamic = "force-dynamic";

export default function SubmissionSuccessPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SubmissionSuccess />
    </Suspense>
  );
}
