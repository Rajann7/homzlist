import { redirect } from "next/navigation";
import { CloseAccount } from "@/components/account/CloseAccount";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountStatus } from "@/lib/account/service";

/**
 * P12 S6 — the grace screen a returning user lands on when a deletion is still
 * pending. Verified server-side: with nothing scheduled this URL is not a screen
 * you can simply visit, it sends you back to the account settings.
 */
export const metadata = { title: "Account scheduled for deletion" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerGracePage() {
  const claims = await getCurrentUser();
  if (!claims) redirect("/login");
  const status = await getAccountStatus(claims.sub);
  if (status.scheduled?.kind !== "delete") redirect("/account");
  return <CloseAccount />;
}
