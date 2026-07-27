import { Privacy } from "@/components";

/** P10 S6b — Privacy. Reached from Settings → Preferences → Privacy. */
export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerPrivacyPage() {
  return <Privacy />;
}
