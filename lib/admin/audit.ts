import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { requestContext, type AdminIdentity } from "./guard";

/**
 * One audit row per admin mutation — Doc9's hard requirement, and the thing A26
 * (Audit log) reads back.
 *
 * Deliberately NOT best-effort: `writeAudit` throws if the row cannot be
 * written. An action that succeeded but left no trace is worse than an action
 * that failed, so callers write the audit row and let a failure surface rather
 * than swallowing it. Read-only list endpoints do not audit — only mutations do,
 * plus the explicitly sensitive reads (exports, impersonation, document views),
 * which pass `sensitive: true`.
 */

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel: string;
  summary: string;
  diff?: Record<string, unknown> | null;
  sensitive?: boolean;
  caseRef?: string | null;
};

export async function writeAudit(me: AdminIdentity, entry: AuditEntry): Promise<void> {
  const { ip, device } = requestContext();
  const db = createServiceClient();
  const { error } = await db.from("admin_audit_log").insert({
    actor_id: me.id,
    actor_name: me.name,
    actor_role: me.role,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    entity_label: entry.entityLabel,
    summary: entry.summary,
    diff: entry.diff ?? null,
    ip,
    device,
    is_sensitive: entry.sensitive ?? false,
    case_ref: entry.caseRef ?? null,
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
