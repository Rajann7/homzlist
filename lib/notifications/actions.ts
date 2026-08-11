import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { answerStillAvailable } from "@/lib/listings/lifecycle";
import { revokeAllSessions } from "@/lib/auth/session";

/**
 * Inline notification actions (designs/P11 S7: Allow/Deny on a number request,
 * Yes/No on "still available?", Appeal, "Not you?").
 *
 * These are the buttons that DO something rather than navigate. Each one:
 *   * is authorised against the caller's own notification row (an id that isn't
 *     yours matches nothing — no enumeration, no IDOR),
 *   * delegates to the module that owns the truth (chat, listing lifecycle,
 *     auth sessions) instead of writing those tables from here,
 *   * is idempotent: `action_taken` is claimed with a conditional update, so a
 *     double-tap or a replayed request cannot allow a number twice,
 *   * rewrites the row's own text to the resolved state, which is what the
 *     design shows after Allow ("You shared your number with Meet Patel ✓").
 *
 * Navigation-only actions (Renew, Edit listing, View invoice…) are not here —
 * they are hrefs the row already carries, resolved from the type catalog.
 */

const db = () => createServiceClient();

export type ActionKey =
  | "number_allow" | "number_deny"
  | "still_yes" | "still_no"
  | "appeal" | "not_you";

const SERVER_ACTIONS: ActionKey[] = ["number_allow", "number_deny", "still_yes", "still_no", "appeal", "not_you"];

export interface ActionOutcome {
  ok: boolean;
  reason?: "not_found" | "already_taken" | "not_supported" | "failed";
  /** Replacement row text (with **bold** markers), when the row resolves in place. */
  text?: string;
  /** Toast copy — the design names an exact string per action. */
  toast?: string;
  /** True when the row should collapse away (the design's dismiss animation). */
  dismissed?: boolean;
}

export async function runAction(profileId: string, notificationId: string, key: string): Promise<ActionOutcome> {
  if (!SERVER_ACTIONS.includes(key as ActionKey)) return { ok: false, reason: "not_supported" };

  const { data } = await db()
    .from("notifications")
    .select("id,type,thread_id,entity_kind,entity_id,actions,action_taken,data,actor_id")
    .eq("id", notificationId)
    .eq("profile_id", profileId)          // ownership — the whole IDOR guard
    .maybeSingle();
  const n = data as any;
  if (!n) return { ok: false, reason: "not_found" };
  if (n.action_taken) return { ok: false, reason: "already_taken" };

  // The row must actually OFFER this action. A caller can't invoke "still_yes"
  // on a payment notification by guessing.
  const offered: string[] = (Array.isArray(n.actions) ? n.actions : []).map((a: any) => a.key);
  if (!offered.includes(key)) return { ok: false, reason: "not_supported" };

  // Claim the action before doing the work: whoever wins this conditional
  // update is the only one that runs it.
  const { data: claimed } = await db()
    .from("notifications")
    .update({ action_taken: key, action_taken_at: new Date().toISOString(), read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("profile_id", profileId)
    .is("action_taken", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "already_taken" };

  const outcome = await perform(profileId, key as ActionKey, n);

  if (!outcome.ok) {
    // Release the claim so a failed action can be retried rather than
    // dead-ending the row with buttons that are gone and nothing done.
    await db().from("notifications").update({ action_taken: null, action_taken_at: null }).eq("id", notificationId);
    return outcome;
  }

  if (outcome.dismissed) {
    await db().from("notifications").update({ dismissed_at: new Date().toISOString() }).eq("id", notificationId);
  } else if (outcome.text) {
    await db().from("notifications").update({ action_result: outcome.text }).eq("id", notificationId);
  }
  return outcome;
}

async function perform(profileId: string, key: ActionKey, n: any): Promise<ActionOutcome> {
  switch (key) {
    // Number request Allow/Deny lived here until chat was removed. Numbers are
    // no longer requested: the sender chooses what to share up front, so an old
    // notification row with these keys resolves to a no-op rather than a
    // button that calls into a module that no longer exists.
    case "number_allow":
    case "number_deny":
      return { ok: true, dismissed: true, toast: "This request is no longer available" };

    // ---- 2-month "Still available?" (Doc2 §5.4) ----------------------------
    case "still_yes":
    case "still_no": {
      const listingId = n.entity_id ?? n.data?.listingId;
      if (!listingId) return { ok: false, reason: "failed" };
      const done = await answerStillAvailable(listingId, profileId, key === "still_yes");
      if (!done) return { ok: false, reason: "failed" };
      return {
        ok: true,
        dismissed: true,
        toast: key === "still_yes" ? "Thanks — your listing stays live" : "Listing marked sold",
      };
    }

    // ---- appeal a rejection (Doc2 §5.4 "3 rejects = locked → appeal") ------
    case "appeal": {
      const subjectId = n.entity_id ?? n.data?.listingId;
      const subject = n.entity_kind ?? "listing";
      if (!subjectId) return { ok: false, reason: "failed" };
      const { error } = await db().from("moderation_appeals").insert({
        subject,
        subject_id: subjectId,
        profile_id: profileId,
        reason: typeof n.data?.rejectReason === "string" ? n.data.rejectReason.slice(0, 500) : null,
      });
      // A duplicate appeal is not an error — the user already asked.
      if (error && !String(error.code).startsWith("23")) return { ok: false, reason: "failed" };
      return { ok: true, toast: "Appeal submitted", text: "Your appeal is with our team — we'll get back to you." };
    }

    // ---- "Not you?" on a new-device login: secure the account ---------------
    case "not_you": {
      // The only genuinely useful thing a tap can do here: end every session.
      // The current device is included — being signed out is the point.
      await revokeAllSessions(profileId);
      return { ok: true, toast: "Signed out on all devices", text: "You signed out of all devices after a new-device login." };
    }
  }
}

async function nameOf(id: string | null): Promise<string> {
  if (!id) return "them";
  const { data } = await db().from("profiles").select("name").eq("id", id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "them";
}
