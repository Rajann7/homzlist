import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { IMP_COOKIE, impersonationContext } from "@/lib/admin/impersonation";

/**
 * POST /api/v1/impersonate/exit — the seller-side "Exit session" button.
 *
 * It ends the session on the SERVER and clears both cookies, so the same click
 * that closes the tab also closes the row the audit log reads. Exempt from the
 * read-only wall by construction: the wall refuses non-GET calls carrying an
 * `imp` claim, and this route is the one thing that claim must still be able to
 * do — so middleware allows it by path.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await impersonationContext();
  if (ctx) {
    await createServiceClient()
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "exited_from_user_view" })
      .eq("id", ctx.sessionId)
      .is("ended_at", null);
  }
  const jar = cookies();
  jar.delete(IMP_COOKIE);
  jar.delete(COOKIE.ACCESS);
  return NextResponse.json({ ok: true, data: { ended: Boolean(ctx) } });
}
