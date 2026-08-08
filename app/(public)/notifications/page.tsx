import { redirect } from "next/navigation";
import { sellerOrigin } from "@/lib/hosts";

/**
 * The public host is the GUEST surface (middleware.ts). Notifications are an
 * authenticated surface, so this only exists to send anyone who lands here —
 * an old link, a shared URL — to the same screen on seller.<host>, exactly
 * where /messages goes. A guest never reaches this file: middleware redirects
 * them to the seller login first.
 *
 * The target comes from the REQUEST host (lib/hosts), not NEXT_PUBLIC_SELLER_URL:
 * that variable is inlined at build time and defaults to seller.localhost:3000,
 * so on a deployment that does not set it this redirect sent real users to
 * localhost.
 */
export const dynamic = "force-dynamic";

export default async function PublicNotificationsRedirect() {
  redirect(`${await sellerOrigin()}/notifications`);
}
