import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { verificationDetail } from "@/lib/admin/verifications";
import { verificationRejectReasons } from "@/lib/admin/reviewConfig";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A7's three decisions (Doc5 A7 / Doc3 §1.5).
 *
 *   GET                        → the detail the sheet renders
 *   POST {action:"approve"}    → grants the badge
 *   POST {action:"reject"}     → refuses it; the user may re-submit
 *   POST {action:"revoke"}     → takes an existing badge back
 *
 * `verifications.status = 'approved'` is not a record OF the badge, it IS the
 * badge — the feed, chat, leads, proposals and profile all read it. So there is no
 * second write to keep in sync, and a revoke takes effect on the next request
 * everywhere at once. That is also why revoke needs a reason: it removes
 * something a user has been showing.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which status a decision may be applied from — the state machine, spelled out. */
const ALLOWED_FROM: Record<string, string[]> = {
  approve: ["pending", "rejected", "revoked"],
  reject: ["pending"],
  revoke: ["approved"],
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("queues.view");
  if (isDenial(gate)) return gate.response;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const detail = await verificationDetail(params.id);
  if (!detail) return fail("NOT_FOUND");
  return ok({ detail });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "revoke") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }

  const db = createServiceClient();
  const { data: before } = await db
    .from("verifications")
    .select("id, profile_id, level, status, doc_type, reason")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return fail("NOT_FOUND");
  const row = before as Record<string, unknown>;
  const level = row.level as string;
  if (level !== "id" && level !== "rera") return fail("NOT_FOUND");

  // A phone row, or a decision that does not apply from the current status, is a
  // conflict rather than a silent no-op: the panel must not report success for a
  // badge it did not move.
  if (!ALLOWED_FROM[action].includes(row.status as string)) {
    return fail("LISTING_STATE_LOCKED", { alreadyDecided: true, status: row.status });
  }

  // ---- the reason, validated against config -------------------------------
  let reason: string | null = null;
  if (action === "reject") {
    const allowed = await verificationRejectReasons(level);
    const given = typeof body.reason === "string" ? body.reason.trim() : "";
    // The user is told this, so it may only be a reason the config offers.
    if (!allowed.includes(given)) return fail("VALIDATION_ERROR", { field: "reason" });
    reason = given;
  }
  if (action === "revoke") {
    // Revoke is free text (the design's editable field) but never empty: taking a
    // badge away with no stated cause is not auditable.
    const given = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (given.length < 3) return fail("VALIDATION_ERROR", { field: "reason" });
    reason = given;
  }

  const nextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
  const now = new Date().toISOString();

  const { data: updated } = await db
    .from("verifications")
    .update({
      status: nextStatus,
      reason,
      reviewed_at: now,
      reviewed_by: gate.staff.id,
      updated_at: now,
    })
    .eq("id", params.id)
    // Concurrency guard: two admins deciding at once produce one winner.
    .eq("status", row.status as string)
    .select("id, status")
    .maybeSingle();
  if (!updated) return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });

  const levelWord = level === "rera" ? "RERA" : "ID";

  // The user has to find out — a badge that appears or vanishes with no notice is
  // the kind of change people report as a bug.
  await notifyUser(db, row.profile_id as string, levelWord, action, reason);

  await audit({
    actor: gate.staff,
    action: action === "approve" ? "grant" : action === "reject" ? "reject" : "revoke",
    entityType: "verification",
    entityId: params.id,
    entityLabel: `${levelWord} verification · ${params.id.slice(0, 8)}`,
    summary:
      action === "approve"
        ? `${levelWord} Verified badge granted`
        : action === "reject"
          ? `${levelWord} verification rejected — ${reason}`
          : `${levelWord} Verified badge revoked — ${reason}`,
    diff: { status: { old: row.status, new: nextStatus } },
    reason,
    // Revoking removes something the user was displaying; A26 shows it with the
    // shield alongside refunds and deletions.
    sensitive: action === "revoke",
  });

  return ok({ status: nextStatus });
}

type Db = ReturnType<typeof createServiceClient>;

async function notifyUser(
  db: Db,
  profileId: string,
  levelWord: string,
  action: "approve" | "reject" | "revoke",
  reason: string | null,
): Promise<void> {
  const copy =
    action === "approve"
      ? {
          title: `Your **${levelWord} verification** is approved`,
          body: "The verified badge now shows on your profile and your listings.",
        }
      : action === "reject"
        ? {
            title: `Your **${levelWord} verification** wasn't approved`,
            body: `${reason} · You can submit corrected documents any time.`,
          }
        : {
            title: `Your **${levelWord} verified badge** was removed`,
            body: `${reason} · Submit current documents to get it back.`,
          };

  // Through the shared emitter, not a raw insert: `notify()` resolves the type's
  // icon, tone, deep link and channels from `notification_types` and honours the
  // user's preferences (Doc2 §14). A hand-written row would render in the P11
  // inbox with none of that.
  const { notify } = await import("@/lib/notifications/service");
  await notify({
    profileId,
    type:
      action === "approve" ? "verification_approved"
      : action === "reject" ? "verification_rejected"
      : "verification_revoked",
    title: copy.title,
    body: copy.body,
  });

  // The seller's own Account-status screen lists what went wrong (Doc2 §11); an
  // approval is not a problem, so only the two negative outcomes land there.
  if (action === "approve") return;
  await db.from("moderation_events").insert({
    profile_id: profileId,
    kind: action === "reject" ? "warning" : "rejection",
    severity: action === "reject" ? "warning" : "error",
    title: action === "reject" ? `${levelWord} verification not approved` : `${levelWord} verified badge removed`,
    detail: (reason ?? "").slice(0, 300) || null,
  });
}
