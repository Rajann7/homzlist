import { TicketThread } from "@/components/help/TicketThread";

/** P12 S2 — one ticket thread. */
export const metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerTicketPage({ params }: { params: { id: string } }) {
  return <TicketThread id={params.id} />;
}
