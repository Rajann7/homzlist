import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/auth/phone";

/**
 * PATCH /api/v1/admin/me — "Save changes" on the My-profile sheet
 * (template 1585-1596).
 *
 * Four editable things and three that only look editable:
 *   display name · phone · notify-on-escalations · daily digest   → written
 *   email · role · 2-step verification                            → not
 *
 * Email and role are the whitelist itself: an admin who could edit either could
 * promote themselves or take over another entry. Role changes belong to A25
 * Staff (super only) and email belongs to Google. The sheet renders them
 * read-only, and this endpoint ignores them even if they are sent — a UI that
 * merely omits a field is not a control.
 */
export const dynamic = "force-dynamic";

const MAX_NAME = 60;

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireAdmin("staff");
    const body = (await req.json().catch(() => null)) as {
      displayName?: string;
      phone?: string;
      notifyEscalations?: boolean;
      dailyDigest?: boolean;
    } | null;
    if (!body) return fail("VALIDATION_ERROR");

    const patch: Record<string, unknown> = {};

    if (body.displayName !== undefined) {
      const name = body.displayName.trim();
      if (!name || name.length > MAX_NAME) return fail("VALIDATION_ERROR");
      patch.display_name = name;
    }

    if (body.phone !== undefined) {
      const raw = body.phone.trim();
      if (raw === "") {
        patch.phone = null;
      } else {
        const e164 = toE164(raw);
        if (!e164) return fail("VALIDATION_ERROR");
        patch.phone = e164;
      }
    }

    if (typeof body.notifyEscalations === "boolean") {
      patch.notify_escalations = body.notifyEscalations;
    }
    if (typeof body.dailyDigest === "boolean") patch.daily_digest = body.dailyDigest;

    if (!Object.keys(patch).length) return fail("VALIDATION_ERROR");

    const db = createServiceClient();
    const { data: before } = await db
      .from("staff")
      .select("display_name, phone, notify_escalations, daily_digest")
      .eq("profile_id", me.id)
      .maybeSingle();

    const { error } = await db.from("staff").update(patch).eq("profile_id", me.id);
    if (error) throw new Error(error.message);

    await writeAudit(me, {
      action: "profile_update",
      entityType: "staff",
      entityId: me.id,
      entityLabel: me.email,
      summary: `Updated their own admin profile (${Object.keys(patch).join(", ")})`,
      diff: { before, after: patch },
    });

    return ok({ saved: true });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
