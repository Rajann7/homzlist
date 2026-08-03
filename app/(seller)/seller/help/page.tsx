import { HelpCentre } from "@/components/help/HelpCentre";

/** P12 S1 — Help centre. Reached from Settings → Support → Help centre. */
export const metadata = { title: "Help centre" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerHelpPage() {
  return <HelpCentre />;
}
