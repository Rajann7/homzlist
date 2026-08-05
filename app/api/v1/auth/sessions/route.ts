import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COOKIE, listSessions } from "@/lib/auth/session";

/** GET /api/v1/auth/sessions (Doc7 §1.7) — login-activity list; current device flagged; no raw IPs. */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const currentSid = (await cookies()).get(COOKIE.REFRESH)?.value?.split(".")[1];
  const sessions = (await listSessions(claims.sub)).map((s) => ({
    id: s.sid,
    userAgent: s.ua,
    createdAt: new Date(s.createdAt).toISOString(),
    lastUsedAt: new Date(s.lastUsedAt).toISOString(),
    current: s.sid === currentSid,
  }));

  return ok({ sessions });
}
