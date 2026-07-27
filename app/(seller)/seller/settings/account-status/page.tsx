import { AccountStatusScreen } from "@/components";

/**
 * P9 account-status as a routed screen (Settings → Account status). The screen
 * itself is the same server-driven component the ⋯ menu opens inline.
 */
export const metadata = { title: "Account status" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerAccountStatusPage() {
  return <AccountStatusScreen />;
}
