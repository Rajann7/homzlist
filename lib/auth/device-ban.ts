import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Is this caller banned? Checked at the top of the OTP request, which is the
 * one door every account comes through.
 *
 * `device_bans` existed as a table with an admin screen planned and NOTHING
 * reading it — an admin could ban a device forever and that device could sign
 * in a second later. This is the reader. The value compared is the peppered IP
 * HASH, the same form `requestOtp` already receives, so enforcing a ban never
 * requires storing a raw IP (Doc9 §19).
 *
 * FAILS OPEN, on purpose. If this query errors, a legitimate user must still be
 * able to sign in: the cost of a missed ban is one more login by someone we
 * dislike, and the cost of failing closed on a Supabase blip is every user
 * locked out at once. The error is logged so the blip is visible.
 */
export async function isBanned(ipHash: string): Promise<boolean> {
  if (!ipHash) return false;
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("device_bans")
      .select("id")
      .eq("kind", "ip")
      .eq("value", ipHash)
      .is("lifted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(1);
    if (error) {
      console.error("[device-ban] lookup failed, allowing", error.message);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (e) {
    console.error("[device-ban] lookup threw, allowing", e);
    return false;
  }
}
