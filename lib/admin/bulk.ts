import "server-only";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";
import { ROLE_RANK } from "./guard";
import type { AdminRole } from "./session";

/**
 * Bulk actions — the server half of the design's bulk bar (template 1008-1014),
 * whose own copy promises "Bulk actions are logged".
 *
 * The promise is kept per SUBJECT, not per click: approving twelve listings
 * writes twelve audit rows, because an audit trail that says "bulk approve ×12"
 * cannot answer "who approved listing #4521".
 *
 * Partial failure is the normal case, not the exception — one id in the batch is
 * already rejected, or locked by another reviewer. So each subject is applied
 * independently and the result reports done/failed per id rather than aborting
 * the batch and leaving the admin unsure which half happened.
 */

export type BulkHandler = {
  /** what the design labels the button */
  label: string;
  minRole: AdminRole;
  /** the design's own per-screen limit on a single bulk action */
  cap: number;
  /** applied to ONE subject; throwing marks just that subject failed */
  apply: (me: AdminIdentity, id: string) => Promise<{ label: string; summary: string }>;
  auditAction: string;
  entityType: string;
};

/** resource → action key → handler. Each part registers its own. */
const REGISTRY: Record<string, Record<string, BulkHandler>> = {};

export function registerBulkActions(resource: string, actions: Record<string, BulkHandler>): void {
  REGISTRY[resource] = { ...(REGISTRY[resource] ?? {}), ...actions };
}

export function bulkHandler(resource: string, action: string): BulkHandler | null {
  return REGISTRY[resource]?.[action] ?? null;
}

export function bulkActionsFor(resource: string, role: AdminRole) {
  return Object.entries(REGISTRY[resource] ?? {})
    .filter(([, h]) => ROLE_RANK[role] >= ROLE_RANK[h.minRole])
    .map(([key, h]) => ({ key, label: h.label, cap: h.cap }));
}

export type BulkResult = {
  done: string[];
  failed: { id: string; reason: string }[];
};

export async function runBulk(
  me: AdminIdentity,
  handler: BulkHandler,
  ids: string[],
): Promise<BulkResult> {
  const unique = [...new Set(ids)];
  if (unique.length > handler.cap) {
    throw new Error(`bulk cap exceeded: ${unique.length} > ${handler.cap}`);
  }

  const result: BulkResult = { done: [], failed: [] };
  for (const id of unique) {
    try {
      const { label, summary } = await handler.apply(me, id);
      // Audited immediately after the mutation, per subject. writeAudit throws
      // on failure, so an action can never land untraced.
      await writeAudit(me, {
        action: handler.auditAction,
        entityType: handler.entityType,
        entityId: id,
        entityLabel: label,
        summary,
        diff: { bulk: true, batchSize: unique.length },
      });
      result.done.push(id);
    } catch (e) {
      result.failed.push({ id, reason: e instanceof Error ? e.message : "failed" });
    }
  }
  return result;
}
