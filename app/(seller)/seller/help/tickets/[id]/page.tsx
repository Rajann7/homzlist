import { Suspense } from "react";
import { TicketThread } from "@/components/support/TicketThread";

/** P12 S2c/S2d — the thread (and the created-ticket success state). */
export const metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerTicketPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <TicketThread id={params.id} />
    </Suspense>
  );
}
