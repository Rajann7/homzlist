import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/appeals/:id — A8's four outcomes (Doc5 A8).
 *
 *   auto-flag appeal   → {action:"dismiss_flag"}  the bio is restored publicly
 *                      → {action:"uphold_flag"}   it stays withheld
 *   reject-lock reopen → {action:"unlock"}        `is_locked` cleared, one more try
 *                      → {action:"keep_locked"}   the lock stands
 *
 * `unlock` is the one that matters: three rejections locks an item (Doc2 §5.4) and
 * nothing else in the product can leave that state. Without this endpoint a
 * seller who hit the limit had a permanently dead listing and an appeal form that
 * went nowhere.
 *
 * Every outcome closes the appeal and tells the user, because an appeal that is
 * silently decided is the same as an appeal nobody read.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE: Record<string, string> = { listing: "listings", requirement: "requirements", project: "projects" };

const ACTIONS = ["dismiss_flag", "uphold_flag", "unlock", "keep_locked"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  let body: { action?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });

  const db = createServiceClient();
  const { data: before } = await db
    .from("moderation_appeals")
    .select("id, subject, subject_id, profile_id, status, reason")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return fail("NOT_FOUND");
  const appeal = before as Record<string, unknown>;
  if (appeal.status !== "open") return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });

  const isAutoFlag = appeal.subject === "auto_flag";
  // A flag action on a listing appeal (or an unlock on a bio) is a bug in the
  // caller, not something to guess at.
  const flagAction = action === "dismiss_flag" || action === "uphold_flag";
  if (flagAction !== isAutoFlag) return fail("VALIDATION_ERROR", { field: "action" });

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;
  const now = new Date().toISOString();
  const profileId = appeal.profile_id as string;

  // `upheld` on the appeal row means the APPEAL was upheld — i.e. the user won.
  // Dismissing the flag and unlocking are both wins; upholding the flag and
  // keeping the lock are both refusals.
  const appealWon = action === "dismiss_flag" || action === "unlock";
  const resolution =
    action === "dismiss_flag" ? "Flag dismissed — content restored"
    : action === "uphold_flag" ? "Flag upheld — content stays hidden"
    : action === "unlock" ? "Unlocked — one more re-submission allowed"
    : "Kept locked";

  let entityLabel = params.id.slice(0, 8);

  // ---------------------------------------------------------- the actual effect
  if (isAutoFlag) {
    const { error } = await db
      .from("profiles")
      .update({
        bio_flag_outcome: action === "dismiss_flag" ? "dismissed" : "upheld",
        bio_flag_resolved_at: now,
        bio_flag_resolved_by: gate.staff.id,
      })
      .eq("id", profileId);
    if (error) return fail("SERVER_ERROR");
    entityLabel = `Bio flag · ${profileId.slice(0, 8)}`;
  } else {
    const table = TABLE[appeal.subject as string];
    if (!table) return fail("VALIDATION_ERROR", { field: "subject" });

    if (action === "unlock") {
      /**
       * The unlock, and the whole reason this screen exists.
       *
       * `reject_count` is reset to MAX-1 rather than to 0: the design promises
       * "one more resubmission", not a clean slate, so the next rejection locks it
       * again. Status goes back to `changes_requested`, which is the state the
       * poster can edit and resubmit from — leaving it `rejected` would clear the
       * lock and still give them nowhere to go.
       */
      const { data: updated } = await db
        .from(table)
        .update({ is_locked: false, reject_count: 2, status: "changes_requested" })
        .eq("id", appeal.subject_id as string)
        .eq("is_locked", true)
        .select("id, title, status, is_locked, reject_count")
        .maybeSingle();
      if (!updated) {
        // Not locked any more — someone already unlocked it, or the row is gone.
        return fail("LISTING_STATE_LOCKED", { notLocked: true });
      }
      entityLabel = ((updated as Record<string, unknown>).title as string) ?? (appeal.subject_id as string).slice(0, 8);
    } else {
      const { data: item } = await db
        .from(table)
        .select(table === "listings" ? "title" : "area_label")
        .eq("id", appeal.subject_id as string)
        .maybeSingle();
      const it = (item ?? {}) as Record<string, unknown>;
      entityLabel = ((it.title as string) || (it.area_label as string) || (appeal.subject_id as string).slice(0, 8)) as string;
    }
  }

  // --------------------------------------------------------- close the appeal
  const { data: closed } = await db
    .from("moderation_appeals")
    .update({
      status: appealWon ? "upheld" : "rejected",
      resolution: note ? `${resolution} · ${note}` : resolution,
      resolved_at: now,
      resolved_by: gate.staff.id,
      ...(action === "unlock" ? { unlocked_at: now } : {}),
    })
    .eq("id", params.id)
    .eq("status", "open")
    .select("id, status")
    .maybeSingle();
  if (!closed) return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });

  // ------------------------------------------------------------ tell the user
  await notifyOutcome(db, profileId, action, resolution);

  await audit({
    actor: gate.staff,
    action: action === "unlock" ? "restore" : action === "dismiss_flag" ? "restore" : "reject",
    entityType: "appeal",
    entityId: params.id,
    entityLabel,
    summary: `Appeal ${appealWon ? "upheld" : "rejected"} — ${resolution}`,
    diff: { status: { old: "open", new: appealWon ? "upheld" : "rejected" } },
    reason: note,
  });

  return ok({ status: appealWon ? "upheld" : "rejected", resolution });
}

type Db = ReturnType<typeof createServiceClient>;

async function notifyOutcome(db: Db, profileId: string, action: Action, resolution: string): Promise<void> {
  const copy =
    action === "dismiss_flag"
      ? { title: "Your **bio is visible again**", body: "We reviewed your appeal — the flag was a false positive." }
      : action === "uphold_flag"
        ? { title: "Your **bio stays hidden**", body: "It still contains a number or link. Edit it to make it visible again." }
        : action === "unlock"
          ? { title: "You can **resubmit** this listing", body: "We reopened it after your appeal. One more submission is allowed." }
          : { title: "Your **appeal wasn't accepted**", body: "This listing stays locked. Contact support if you disagree." };

  // `report_outcome` is the catalogue's existing "we acted on something you told
  // us about" type (Doc2 §14) and carries the right icon and channels. Adding a
  // fourth near-identical type would be config noise.
  const { notify } = await import("@/lib/notifications/service");
  await notify({ profileId, type: "report_outcome", title: copy.title, body: copy.body });

  // Anything that leaves content withheld or locked belongs on the seller's own
  // Account-status screen (Doc2 §11); the two wins do not.
  if (action === "dismiss_flag" || action === "unlock") return;
  await db.from("moderation_events").insert({
    profile_id: profileId,
    kind: "warning",
    severity: "warning",
    title: action === "uphold_flag" ? "Bio stays hidden after review" : "Listing stays locked after appeal",
    detail: resolution,
  });
}

/**
 * POST-only, but Next.js answers an unmatched method with 405 — and a 405 on
 * account.homzlist.com confirms the route exists to anyone walking paths, which
 * Doc9 §API1 does not allow. An explicit GET that 404s keeps every probe
 * indistinguishable from a path that was never there.
 */
export async function GET() {
  return fail("NOT_FOUND");
}
