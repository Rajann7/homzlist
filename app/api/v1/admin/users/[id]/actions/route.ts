import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/users/[id]/actions — A11's action bar (Doc5 A11).
 *
 * A9 can already suspend and ban a user, but only in the context of a report it
 * is closing. An admin on A11 is acting on the ACCOUNT, with no report in hand,
 * so the same effects live here — writing the same tables, so a suspension from
 * either screen looks identical to the user and to A26.
 *
 * Capability per action, not per endpoint, and enforced here rather than by
 * hiding a button:
 *   suspend / lift / role  → users.edit   (Admin)
 *   message                → users.edit   (Admin)
 *   ban_device             → devicebans   (Super)
 *   delete                 → users.delete (Super)
 *
 * Every action carries a reason, every action writes the audit log, and the
 * heavy ones are marked sensitive so A26 can filter them.
 */
export const dynamic = "force-dynamic";

const ROLES = new Set(["owner", "broker", "builder"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { action?: unknown; reason?: unknown; days?: unknown; role?: unknown; subject?: unknown; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const db = createServiceClient();

  const { data: who } = await db.from("profiles").select("id, name, state, role").eq("id", params.id).maybeSingle();
  if (!who) return fail("NOT_FOUND");
  const target = who as { id: string; name: string | null; state: string; role: string | null };
  const label = target.name || target.id.slice(0, 8);

  switch (action) {
    // ------------------------------------------------------------- suspend
    case "suspend": {
      const gate = await requireCapability("users.edit");
      if (isDenial(gate)) return gate.response;
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });
      if (target.state === "suspended") return fail("LISTING_STATE_LOCKED", { alreadySuspended: true });

      // The duration must be one the config table offers ("0" = until review) —
      // the same list A9's dialog uses, so the two screens cannot drift.
      const durations = await actionOptions("suspend_duration");
      const chosen = durations.find((d) => d.value === (typeof body.days === "string" ? body.days : ""));
      if (!chosen) return fail("VALIDATION_ERROR", { field: "days" });
      const days = Number(chosen.value) || 0;

      await db.from("profiles").update({ state: "suspended" }).eq("id", target.id);
      await db.from("account_suspensions").insert({
        profile_id: target.id,
        reason,
        days: days || null,
        suspended_by: gate.staff.id,
      });
      await notify(target.id, "account_suspended", "Your account has been suspended", `${chosen.label} · ${reason.slice(0, 180)} Your listings are hidden and chats are frozen.`);

      await audit({
        actor: gate.staff,
        action: "suspend",
        entityType: "user",
        entityId: target.id,
        entityLabel: label,
        summary: `Suspended ${label} (${chosen.label}) — ${reason}`,
        reason,
        sensitive: true,
      });
      return ok({ state: "suspended" });
    }

    // ---------------------------------------------------------------- lift
    case "lift": {
      const gate = await requireCapability("users.edit");
      if (isDenial(gate)) return gate.response;
      if (target.state !== "suspended") return fail("LISTING_STATE_LOCKED", { notSuspended: true });

      await db.from("profiles").update({ state: "active" }).eq("id", target.id);
      await db
        .from("account_suspensions")
        .update({ lifted_at: new Date().toISOString(), lifted_by: gate.staff.id })
        .eq("profile_id", target.id)
        .is("lifted_at", null);
      await notify(target.id, "suspension_lifted", "Your account is active again", "The suspension has been lifted. Your listings are visible and chats are open.");

      await audit({
        actor: gate.staff,
        action: "lift_suspension",
        entityType: "user",
        entityId: target.id,
        entityLabel: label,
        summary: `Lifted the suspension on ${label}${reason ? ` — ${reason}` : ""}`,
        reason: reason || null,
        sensitive: true,
      });
      return ok({ state: "active" });
    }

    // ---------------------------------------------------------------- role
    case "role": {
      const gate = await requireCapability("users.edit");
      if (isDenial(gate)) return gate.response;
      const role = typeof body.role === "string" ? body.role : "";
      if (!ROLES.has(role)) return fail("VALIDATION_ERROR", { field: "role" });
      if (role === target.role) return fail("VALIDATION_ERROR", { field: "role" });
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

      await db.from("profiles").update({ role }).eq("id", target.id);
      await notify(target.id, "role_changed", "Your account type changed", `Your account is now a ${role} account. If this looks wrong, reply to this message.`);

      await audit({
        actor: gate.staff,
        action: "role_change",
        entityType: "user",
        entityId: target.id,
        entityLabel: label,
        summary: `Changed ${label} from ${target.role ?? "no role"} to ${role} — ${reason}`,
        diff: { role: { old: target.role, new: role } },
        reason,
        sensitive: true,
      });
      return ok({ role });
    }

    // ------------------------------------------------------------- message
    case "message": {
      const gate = await requireCapability("users.edit");
      if (isDenial(gate)) return gate.response;
      const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 120) : "";
      const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
      if (subject.length < 3) return fail("VALIDATION_ERROR", { field: "subject" });
      if (text.length < 5) return fail("VALIDATION_ERROR", { field: "body" });

      const { data, error } = await db
        .from("admin_messages")
        .insert({
          profile_id: target.id,
          channel: "in_app",
          subject,
          body: text,
          sent_by: gate.staff.id,
          sent_by_name: gate.staff.name,
          delivered_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) return fail("SERVER_ERROR");

      await notify(target.id, "admin_message", subject, text.slice(0, 300));

      await audit({
        actor: gate.staff,
        action: "send",
        entityType: "user",
        entityId: target.id,
        entityLabel: label,
        summary: `Sent ${label} a message — ${subject}`,
      });
      return ok({ id: data.id });
    }

    // ---------------------------------------------------------- ban device
    case "ban_device": {
      const gate = await requireCapability("devicebans");
      if (isDenial(gate)) return gate.response;
      if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

      // Exactly what A9's ban does, reading the same two sources: HomzList never
      // stores a raw address, so the ban is keyed on the salted `ip_hash` the
      // consent record already holds, with a device string as the fallback.
      const [{ data: consent }, { data: push }] = await Promise.all([
        db
          .from("auth_consents")
          .select("ip_hash, accepted_at")
          .eq("profile_id", target.id)
          .not("ip_hash", "is", null)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("push_tokens")
          .select("user_agent")
          .eq("profile_id", target.id)
          .not("user_agent", "is", null)
          .limit(1)
          .maybeSingle(),
      ]);

      const ipHash = ((consent ?? {}) as Record<string, unknown>).ip_hash as string | undefined;
      const device = ((push ?? {}) as Record<string, unknown>).user_agent as string | undefined;
      const kind = ipHash ? "ip_hash" : device ? "device" : null;
      if (!kind) return fail("VALIDATION_ERROR", { detail: "no_device_on_record" });

      const { error } = await db.from("device_bans").insert({
        kind,
        value: ipHash ?? device ?? "",
        profile_id: target.id,
        reason,
        banned_by: gate.staff.id,
      });
      if (error) return fail("SERVER_ERROR");

      await audit({
        actor: gate.staff,
        action: "device_ban",
        entityType: "user",
        entityId: target.id,
        entityLabel: label,
        summary: `Banned the device/address behind ${label} — ${reason}`,
        reason,
        sensitive: true,
      });
      return ok({ banned: true });
    }

    default:
      return fail("VALIDATION_ERROR", { field: "action" });
  }
}

async function notify(
  profileId: string,
  type: "account_suspended" | "suspension_lifted" | "admin_message" | "role_changed",
  title: string,
  body: string,
): Promise<void> {
  const { notify: send } = await import("@/lib/notifications/service");
  await send({ profileId, type, title, body });
}
