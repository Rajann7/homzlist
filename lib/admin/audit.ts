import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { requestMeta } from "./session";
import type { CurrentStaff } from "./auth";

/**
 * The audit trail (Doc3 §1.8, rendered by A26).
 *
 * "EVERY admin action; old→new diffs; 180-day+ retention" — so this is not a
 * logger you call when you remember. Every mutating admin endpoint calls it in
 * the same transaction-shaped step as the write itself, and A26 is nothing more
 * than a view over what lands here.
 *
 * `is_sensitive` is not decoration: A26 highlights those rows with a shield and
 * a warning border, and Doc5 A26 defines the set — refunds, deletions,
 * impersonation, evidence preservation, flag changes, exports.
 */

export type AuditAction =
  | "approve"
  | "reject"
  | "request_changes"
  | "edit"
  | "suspend"
  | "lift_suspension"
  | "delete"
  | "restore"
  | "purge"
  | "refund"
  | "grant"
  | "revoke"
  | "adjust_balance"
  | "role_change"
  | "impersonate_start"
  | "impersonate_end"
  | "login"
  | "logout"
  | "flag_change"
  | "publish"
  | "export"
  | "merge"
  | "evidence_preserve"
  | "device_ban"
  | "run_job"
  | "send"
  | "settings_change";

export type AuditEntity =
  | "listing"
  | "requirement"
  | "project"
  | "boost"
  | "user"
  | "payment"
  | "plan"
  | "coupon"
  | "grant"
  | "cms"
  | "template"
  | "settings"
  | "flag"
  | "masterdata"
  | "ticket"
  | "dispute"
  | "staff"
  | "export"
  | "cron"
  | "session"
  | "verification"
  | "report"
  | "appeal"
  | "trash";

/** Doc5 A26: the actions whose rows get the shield + warning border. */
const SENSITIVE: ReadonlySet<AuditAction> = new Set<AuditAction>([
  "refund",
  "delete",
  "purge",
  "impersonate_start",
  "impersonate_end",
  "evidence_preserve",
  "flag_change",
  "export",
  "device_ban",
  "role_change",
  "merge",
]);

export interface AuditInput {
  actor: CurrentStaff;
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  /** What a human calls the thing — A26 renders this as the row's link text. */
  entityLabel: string;
  summary: string;
  /** {field: {old, new}} — A26's expandable inline diff reads this shape. */
  diff?: Record<string, { old: unknown; new: unknown }> | null;
  reason?: string | null;
  /** Override only to mark something sensitive that the action alone doesn't imply. */
  sensitive?: boolean;
}

export async function audit(input: AuditInput): Promise<string | null> {
  const db = createServiceClient();
  const { ip, device } = requestMeta();

  const { data, error } = await db
    .from("admin_audit_log")
    .insert({
      actor_id: input.actor.id,
      actor_name: input.actor.name,
      actor_role: input.actor.level,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel,
      summary: input.summary,
      diff: input.diff ?? null,
      reason: input.reason ?? null,
      session_jti: input.actor.jti,
      ip,
      device,
      is_sensitive: input.sensitive ?? SENSITIVE.has(input.action),
    })
    .select("id")
    .single();

  if (error) {
    // An unauditable mutation is a compliance failure, not a warning to swallow:
    // Doc3 §2.2 rests on a 180-day trail. Callers await this before answering OK
    // so a failed insert surfaces instead of silently losing the record.
    throw new Error(`audit write failed (${input.action} ${input.entityType}): ${error.message}`);
  }
  return data?.id ?? null;
}

/**
 * Build a diff from a before/after pair, keeping only what actually moved.
 * Used by every edit screen (A12 field edits, A13 plan edits, A19 nodes…) so
 * "3 unsaved changes" and the audit row can never disagree about the count.
 */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields?: readonly (keyof T)[],
): Record<string, { old: unknown; new: unknown }> {
  const keys = (fields ?? (Object.keys(after) as (keyof T)[])) as (keyof T)[];
  const out: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out[String(k)] = { old: a ?? null, new: b ?? null };
  }
  return out;
}
