import "server-only";
import type { ListResource } from "./list-query";

/**
 * The list-engine registry.
 *
 * Each admin list declares itself here — what it selects, what may be searched,
 * sorted and filtered, and which role may see it at all. Nothing else in the app
 * gets to decide those: a screen renders whatever the engine returns for its
 * resource, which is what stops each screen from growing its own half-working
 * filter bar.
 *
 * P1 registers ONE resource, A26's audit log, and proves the engine end-to-end
 * against its 716 real rows. Every later part registers its own resource here
 * rather than reimplementing the machinery — that is the whole point of building
 * the engine first.
 */

/** template 2582 — the audit screen's own filter chips: Admin · Action · Entity · Date · Severity */
export const auditResource: ListResource = {
  name: "audit",
  table: "admin_audit_log",
  // Explicit column list, never `*`: `device` and `case_ref` are deliberately
  // included (the design's expanded row shows IP/device) but nothing beyond what
  // the screen draws is selected.
  select:
    "id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, summary, diff, ip, device, is_sensitive, case_ref, preserved",
  // template 2581 — "Entity ID, user, IP". entity_label is where an id like
  // "Listing #4521" actually lives; entity_id is a uuid and not ilike-able.
  searchColumns: ["actor_name", "entity_label", "summary", "ip"],
  sortColumns: ["created_at", "actor_name", "action", "entity_type"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "admin", column: "actor_id", kind: "in" },
    { key: "action", column: "action", kind: "in" },
    { key: "entity", column: "entity_type", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
    { key: "severity", column: "is_sensitive", kind: "bool", options: ["true", "false"] },
  ],
  minRole: "super",
  // template 2584-2588 — the audit row's five cells, and the row property each
  // one actually reads.
  columns: [
    { key: "time", label: "Time", field: "created_at" },
    { key: "admin", label: "Admin", field: "actor_name" },
    { key: "action", label: "Action", field: "action" },
    { key: "entity", label: "Entity", field: "entity_label" },
    { key: "summary", label: "Summary", field: "summary" },
  ],
};

export const ADMIN_RESOURCES: Record<string, ListResource> = {
  audit: auditResource,
};

export function resourceByName(name: string): ListResource | null {
  return ADMIN_RESOURCES[name] ?? null;
}
