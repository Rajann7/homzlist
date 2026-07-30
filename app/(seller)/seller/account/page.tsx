import { CloseAccount } from "@/components/account/CloseAccount";

/** P12 S6 — Deactivate or delete account, with both confirms and OTP re-verify. */
export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerAccountPage() {
  return <CloseAccount />;
}
