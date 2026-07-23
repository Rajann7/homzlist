import { Payments } from "@/components/billing/Payments";

/** P11 S3 — Payment history & invoices (seller.homzlist.com/payments). */
export const dynamic = "force-dynamic";

export default function PaymentsPage() {
  return <Payments />;
}
