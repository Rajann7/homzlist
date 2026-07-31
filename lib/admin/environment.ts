import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

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
 */
export function isStagingEnv(): boolean {
  const declared = process.env.APP_ENV;
  if (declared) return declared !== "production";
  return process.env.NODE_ENV !== "production";
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
