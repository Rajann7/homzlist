import { Support } from "@/components/support/Support";

/** P12 S2 — the ticket list. */
export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerTicketsPage() {
  return <Support />;
}
