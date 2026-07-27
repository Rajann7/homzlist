import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";

/**
 * The public host is the GUEST surface (middleware.ts). Notifications are an
 * authenticated surface, so this only exists to send anyone who lands here —
 * an old link, a shared URL — to the same screen on seller.<host>, exactly
 * where /messages goes. A guest never reaches this file: middleware redirects
 * them to the seller login first.
 */
export const dynamic = "force-dynamic";

export default function PublicNotificationsRedirect() {
  redirect(`${publicEnv.sellerUrl.replace(/\/$/, "")}/notifications`);
}
