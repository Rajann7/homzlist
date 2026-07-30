import { SupportList } from "@/components/help/SupportList";

/** P12 S2 — Support tickets. Settings → Support → Contact support lands here. */
export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerSupportPage() {
  return <SupportList />;
}
