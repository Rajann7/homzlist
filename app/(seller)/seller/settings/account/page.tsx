import { AccountLifecycle } from "@/components/account/AccountLifecycle";

/**
 * P12 S6 — Deactivate or delete, plus the deactivated and grace-period end
 * states. Which one renders is decided by /account/lifecycle, so logging in
 * during the 30-day grace lands on "Cancel deletion" rather than the cards.
 */
export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerAccountPage() {
  return <AccountLifecycle />;
}
