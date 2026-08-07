import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { isProductionBand } from "@/lib/env";

/**
 * The STAGING ribbon (template 420 / 514) and the support address the login
 * screen links to — both server-decided, for the same reason.
 *
 * The design shows the ribbon off a state flag, and the panel must never guess
 * it from the hostname in the browser: a client that decides "this is
 * production" is a client that can be told otherwise. `APP_ENV` is the single
 * declaration; without it, anything that is not a production build is treated
 * as staging, which fails in the safe direction (a stray ribbon, never a
 * missing one).
 *
 * The band itself now lives in lib/env (`envBand`), because the same
 * declaration also decides whether the dev sign-in and the fixed OTP code may
 * run. One source: the ribbon is on for exactly the environments where those
 * are unlocked, so the screen cannot say "production" while the back door is
 * open.
 */
export function isStagingEnv(): boolean {
  return !isProductionBand();
}

/**
 * The SELLER host, derived from the host this admin request arrived on.
 *
 * A31's user view has to open on seller.<host>, because that is where the user
 * session cookie is host-only to and where the user app actually renders. It is
 * derived rather than configured so dev (seller.localhost:3000), staging and
 * production all work without a fourth env var to forget.
 */
export function userViewUrl(req: { headers: Headers; url: string }): string {
  const host = req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  // account.homzlist.com → seller.homzlist.com; account.localhost:3000 → seller.localhost:3000
  const sellerHost = host.replace(/^[^.]+\./, "seller.");
  return `${proto}://${sellerHost}`;
}

/** branding_settings.support_email — A20 owns the row; every screen reads it. */
export async function supportEmail(): Promise<string> {
  const db = createServiceClient();
  const { data } = await db
    .from("branding_settings")
    .select("value")
    .eq("key", "support_email")
    .maybeSingle();
  return data?.value ?? "";
}
