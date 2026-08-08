import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Cross-host origins derived from the REQUEST, not from build-time env.
 *
 * `NEXT_PUBLIC_SELLER_URL` and friends default to `http://seller.localhost:3000`,
 * and Next inlines them at build time — so a deployment that does not set them
 * serves redirects and links pointing at the developer's own machine. That is
 * exactly how the public /notifications bridge ended up bouncing real users to
 * seller.localhost:3000. The request's own Host header is always right: on
 * localhost, on a LAN IP, on a preview URL and on the real domain. The env
 * values stay as the last-resort fallback for a context with no request.
 *
 * The client-side equivalent, which reads the address bar, is
 * `publicOrigin()` in lib/utils.
 */
async function requestHost(): Promise<{ host: string | null; proto: string }> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  return { host, proto };
}

/** `seller.<same-deployment>` — where every authenticated surface lives. */
export async function sellerOrigin(): Promise<string> {
  const { host, proto } = await requestHost();
  if (!host) return publicEnv.sellerUrl.replace(/\/$/, "");
  const bare = host.replace(/^(seller|account)\./i, "");
  return `${proto}://seller.${bare}`;
}

/** The public host of this same deployment — the guest/SEO surface. */
export async function publicOriginFromRequest(): Promise<string> {
  const { host, proto } = await requestHost();
  if (!host) return publicEnv.appUrl.replace(/\/$/, "");
  return `${proto}://${host.replace(/^(seller|account)\./i, "")}`;
}
