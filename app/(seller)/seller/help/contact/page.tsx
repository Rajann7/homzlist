import { NewTicket } from "@/components/support/NewTicket";

/**
 * P12 S2b — Contact support. `?topic=` preselects the category, which is how
 * Settings' "Report a problem" and the Grievance Officer page's "Raise a
 * grievance" both land here with the right one already chosen.
 */
export const metadata = { title: "Contact support" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerContactPage(props: { searchParams: Promise<{ topic?: string }> }) {
 const searchParams = await props.searchParams;
 return <NewTicket topic={searchParams.topic ?? null} />;
}
