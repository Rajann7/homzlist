import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listSentLeads } from "@/lib/leads/service";

/**
 * GET /api/v1/leads/sent — the Sent tab. The receiver's pipeline stage is never
 * exposed here; the sender sees a derived state (Sent / Seen / Owner contacted
 * you / Closed) plus the offer they attached, if any.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ sent: await listSentLeads(claims.sub) });
}
