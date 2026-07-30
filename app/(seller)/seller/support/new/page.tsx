import { NewTicket } from "@/components/help/NewTicket";

/**
 * P12 S2 — Contact support. `?category=grievance` is how the Grievance Officer
 * page's "Raise a grievance" button arrives with the category pre-set.
 */
export const metadata = { title: "Contact support" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerNewTicketPage({ searchParams }: { searchParams: { category?: string } }) {
  return <NewTicket initialCategory={searchParams.category} />;
}
