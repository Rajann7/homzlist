import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";

/**
 * homzlist.com/create — the nav's centre (+) tab. Creation itself is a SELLER
 * surface (seller.homzlist.com/create, Module 4): the plan wall, slots and
 * moderation all live there. On the public host the tab used to 404.
 *
 * So this is a routing bridge, not a screen: bounce to the same deployment's
 * seller host. The origin is derived from the REQUEST host (not a fixed env
 * URL) so it is correct on localhost, a LAN IP and the real domain alike;
 * NEXT_PUBLIC_SELLER_URL is only the fallback.
 */
export const dynamic = "force-dynamic";

export default function PublicCreateRedirect() {
  const host = headers().get("host");
  const proto = headers().get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const target = host ? `${proto}://${host.startsWith("seller.") ? host : `seller.${host}`}/create` : `${publicEnv.sellerUrl}/create`;
  redirect(target);
}
