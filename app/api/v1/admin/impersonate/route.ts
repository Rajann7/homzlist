import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import {
  endImpersonation,
  liveImpersonation,
  startImpersonation,
} from "@/lib/admin/impersonation";
import { userViewUrl } from "@/lib/admin/environment";

/**
 * A31 — start / read / end an impersonation session (template 1759).
 *
 * The design's dialog says "This session is logged with your name", so both
 * ends are audited as sensitive, and the row carries how long it ran — which is
 * what the toast on exit prints ("logged 4 min"). The elapsed minutes come from
 * `started_at`, not from a timer the browser kept.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const me = await requireAdmin("admin");
    return ok({ session: await liveImpersonation(me) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    if (!UUID_RE.test(profileId)) return fail("NOT_FOUND");

    const started = await startImpersonation(
      profileId,
      me,
      typeof body.reason === "string" ? body.reason : null,
    );
    if (!started.ok) {
      if (started.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: started.message });
    }

    await writeAudit(me, {
      action: "impersonate_start",
      entityType: "user",
      entityId: profileId,
      entityLabel: started.session.profileName ?? profileId,
      summary: `Started a read-only impersonation session`,
      sensitive: true,
      diff: { sessionId: started.session.id, expiresAt: started.session.expiresAt },
    });

    return ok({
      session: started.session,
      // The one-shot handoff. It is returned once and never stored in a form a
      // second read could recover.
      userViewUrl: `${userViewUrl(req)}/api/v1/impersonate/enter?token=${encodeURIComponent(started.token)}`,
    });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function DELETE() {
  try {
    const me = await requireAdmin("admin");
    const live = await liveImpersonation(me);
    const ended = await endImpersonation(me);
    if (!ended.ok) return fail("VALIDATION_ERROR", { message: "No live session" });

    await writeAudit(me, {
      action: "impersonate_end",
      entityType: "user",
      entityId: live?.profileId ?? null,
      entityLabel: live?.profileName ?? "User",
      summary: `Impersonation session ended · logged ${ended.minutes} min`,
      sensitive: true,
    });

    return ok({ minutes: ended.minutes });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
