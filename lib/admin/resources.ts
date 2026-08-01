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

/* ══════════════════════════════════════════════════ P3 — the six queues ══ */

/**
 * Each queue reads its VIEW (migration 0095), not its table: the screens draw
 * the poster's name, the city and a risk score, and a filter or a sort on any
 * of those has to be SQL on a real column. See that migration for why the
 * embedded-select alternative is a control that renders but controls nothing.
 *
 * Tabs are the design's own sub-tabs, and their counts come from the engine's
 * per-tab `count` over the whole view — so "12 pending" is a fact, not the
 * length of the page on screen.
 */

/** template 601 — Pending · Updated after edit · Changes requested · Payment pending · Rejected */
export const listingQueueResource: ListResource = {
  name: "listings",
  table: "admin_listing_queue",
  select:
    "id, title, type_code, status, created_at, submitted_at, area_label, city_name, reject_count, is_locked, edited_since_approval, flagged_reason, cover_url, poster_id, poster_name, poster_role, poster_is_new, risk_score, open_reports, locked_by, locked_by_name, lock_expires_at",
  searchColumns: ["title", "area_label", "poster_name"],
  sortColumns: ["risk_score", "created_at", "submitted_at", "title", "status"],
  // Doc3: "sorted high-first + red mark" — the queue opens on the riskiest.
  defaultSort: { column: "risk_score", ascending: false },
  filters: [
    { key: "type", column: "type_code", kind: "in" },
    { key: "city", column: "city_name", kind: "in" },
    { key: "status", column: "status", kind: "in" },
    { key: "role", column: "poster_role", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "pending", label: "Pending", apply: (q) => q.eq("status", "pending_review") },
    {
      key: "updated",
      label: "Updated after edit",
      apply: (q) => q.eq("status", "pending_review").eq("edited_since_approval", true),
    },
    {
      key: "changes",
      label: "Changes requested",
      apply: (q) => q.eq("status", "changes_requested"),
    },
    { key: "payment", label: "Payment pending", apply: (q) => q.eq("status", "payment_pending") },
    { key: "rejected", label: "Rejected", apply: (q) => q.eq("status", "rejected") },
  ],
  minRole: "staff",
  // template 654-656 — the design's own column set, in its order.
  columns: [
    { key: "listing", label: "Listing", field: "title" },
    { key: "type", label: "Type", field: "type_code" },
    { key: "location", label: "Location", field: "area_label" },
    { key: "poster", label: "Poster", field: "poster_name" },
    { key: "risk", label: "Risk", field: "risk_score" },
    { key: "queue", label: "In queue", field: "created_at" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** template 836-843 */
export const requirementQueueResource: ListResource = {
  name: "requirements",
  table: "admin_requirement_queue",
  select:
    "id, status, created_at, submitted_at, type_code, kind, bhk, budget_min_paise, budget_max_paise, area_label, urgency, notes, reject_count, poster_id, poster_name, poster_role, city_name, risk_score, locked_by, locked_by_name",
  searchColumns: ["area_label", "poster_name", "notes"],
  sortColumns: ["risk_score", "created_at", "budget_max_paise"],
  defaultSort: { column: "risk_score", ascending: false },
  filters: [
    { key: "type", column: "type_code", kind: "in" },
    { key: "city", column: "city_name", kind: "in" },
    { key: "status", column: "status", kind: "in" },
    { key: "role", column: "poster_role", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "pending", label: "Pending", apply: (q) => q.eq("status", "pending_review") },
    { key: "changes", label: "Changes requested", apply: (q) => q.eq("status", "changes_requested") },
    { key: "rejected", label: "Rejected", apply: (q) => q.eq("status", "rejected") },
  ],
  minRole: "staff",
  columns: [
    { key: "requirement", label: "Requirement", field: "area_label" },
    { key: "areas", label: "Areas", field: "area_label" },
    { key: "poster", label: "Poster", field: "poster_name" },
    { key: "risk", label: "Risk", field: "risk_score" },
    { key: "queue", label: "In queue", field: "created_at" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** template 854-862 */
export const boostQueueResource: ListResource = {
  name: "boosts",
  table: "admin_boost_queue",
  select:
    "id, status, created_at, subject_kind, subject_id, targeting, target_label, duration_days, price_paise, poster_id, poster_name, subject_title, subject_status, subject_cover_url, subject_price_paise, payment_ref, payment_status, payment_method",
  searchColumns: ["subject_title", "poster_name", "payment_ref", "target_label"],
  sortColumns: ["created_at", "price_paise", "duration_days"],
  defaultSort: { column: "created_at", ascending: true },
  filters: [
    { key: "targeting", column: "targeting", kind: "in" },
    { key: "kind", column: "subject_kind", kind: "in" },
    { key: "status", column: "status", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "pending", label: "Pending", apply: (q) => q.eq("status", "pending_approval") },
    { key: "payment", label: "Payment pending", apply: (q) => q.eq("status", "pending_payment") },
    { key: "rejected", label: "Rejected", apply: (q) => q.eq("status", "rejected") },
  ],
  minRole: "staff",
  columns: [
    { key: "boost", label: "Boost", field: "subject_title" },
    { key: "duration", label: "Duration", field: "duration_days" },
    { key: "targeting", label: "Targeting", field: "target_label" },
    { key: "amount", label: "Amount", field: "price_paise" },
    { key: "requested", label: "Requested", field: "created_at" },
    { key: "listing", label: "Listing", field: "subject_status" },
  ],
};

/** template 879-887 — Pending · Approved · Rejected · Revoked */
export const verificationQueueResource: ListResource = {
  name: "verifications",
  table: "admin_verification_queue",
  select:
    "id, status, level, doc_type, doc_key, rera_number, valid_till, reason, submitted_at, reviewed_at, created_at, profile_id, user_name, user_role, user_photo_url",
  searchColumns: ["user_name", "rera_number"],
  sortColumns: ["submitted_at", "created_at", "user_name"],
  defaultSort: { column: "submitted_at", ascending: true },
  filters: [
    { key: "level", column: "level", kind: "in" },
    { key: "role", column: "user_role", kind: "in" },
    { key: "from", column: "submitted_at", kind: "dateFrom" },
    { key: "to", column: "submitted_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "pending", label: "Pending", apply: (q) => q.eq("status", "pending") },
    { key: "approved", label: "Approved", apply: (q) => q.eq("status", "approved") },
    { key: "rejected", label: "Rejected", apply: (q) => q.eq("status", "rejected") },
    { key: "revoked", label: "Revoked", apply: (q) => q.eq("status", "revoked") },
  ],
  minRole: "staff",
  columns: [
    { key: "user", label: "User", field: "user_name" },
    { key: "level", label: "Level", field: "level" },
    { key: "submitted", label: "Submitted", field: "submitted_at" },
    { key: "docs", label: "Docs", field: "doc_type" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** template 896 — Auto-flag appeals · Reject-lock reopens */
export const appealQueueResource: ListResource = {
  name: "appeals",
  table: "admin_appeal_queue",
  select:
    "id, status, created_at, resolved_at, resolution, appeal_text, subject, subject_id, profile_id, user_name, user_role, user_bio, bio_flag_reason, kind, listing_title, listing_reject_count, listing_locked, listing_cover_url",
  searchColumns: ["user_name", "appeal_text", "listing_title"],
  sortColumns: ["created_at"],
  defaultSort: { column: "created_at", ascending: true },
  filters: [
    { key: "kind", column: "kind", kind: "in", options: ["flag", "reopen"] },
    { key: "status", column: "status", kind: "in" },
  ],
  tabs: [
    { key: "flag", label: "Auto-flag appeals", apply: (q) => q.eq("kind", "flag").eq("status", "open") },
    { key: "reopen", label: "Reject-lock reopens", apply: (q) => q.eq("kind", "reopen").eq("status", "open") },
    { key: "resolved", label: "Resolved", apply: (q) => q.in("status", ["upheld", "rejected"]) },
  ],
  minRole: "staff",
  columns: [
    { key: "user", label: "User", field: "user_name" },
    { key: "kind", label: "Kind", field: "kind" },
    { key: "appealed", label: "Appealed", field: "created_at" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** template 921 — All · Listings · Users · Messages · High priority */
export const reportQueueResource: ListResource = {
  name: "reports",
  table: "admin_report_queue",
  select:
    "id, subject_type, subject_id, report_count, first_reported_at, created_at, reason, note, status, high_priority, reporter_id",
  searchColumns: ["reason", "note"],
  sortColumns: ["created_at", "report_count", "first_reported_at"],
  defaultSort: { column: "report_count", ascending: false },
  filters: [
    { key: "kind", column: "subject_type", kind: "in" },
    { key: "reason", column: "reason", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "listings", label: "Listings", apply: (q) => q.eq("subject_type", "listing") },
    { key: "users", label: "Users", apply: (q) => q.eq("subject_type", "user") },
    { key: "messages", label: "Messages", apply: (q) => q.eq("subject_type", "message") },
    { key: "high", label: "High priority", apply: (q) => q.eq("high_priority", true) },
  ],
  minRole: "staff",
  columns: [
    { key: "reason", label: "Reason", field: "reason" },
    { key: "kind", label: "Type", field: "subject_type" },
    { key: "count", label: "Reports", field: "report_count" },
    { key: "reported", label: "Reported", field: "created_at" },
  ],
};

/* ══════════════════════════════════════ P4 — users and the listings master ══ */

/**
 * A10 — template 994-1046.
 *
 * The design's six filter pills are Role · Status · Plan · City · Verification
 * · Joined, and every one of them is an `.in()` on a real column of
 * `admin_user_list` (migration 0098) rather than a chip that narrows nothing.
 *
 * There are no sub-tabs on A10 — the design uses a saved-view button ("All
 * users") where the queues use tabs — so this resource declares none, and the
 * count next to the filter bar is the engine's filtered total.
 */
export const userResource: ListResource = {
  name: "users",
  table: "admin_user_list",
  select:
    "id, name, handle, phone, email, role, account_state, photo_url, joined_at, last_active_at, city_name, v_phone, v_id, v_rera, verification_key, plan_names, plan_key, trial_ends_at, listings_count, listings_live, listings_other, leads_count, views_count, reports_count, is_new, status_key",
  // The design's search box says "Name or phone" (template 1004); email and
  // handle are searched too because an admin arriving from a support ticket has
  // one of those and not the other.
  searchColumns: ["name", "phone", "email", "handle"],
  sortColumns: ["joined_at", "name", "listings_count", "leads_count", "last_active_at"],
  defaultSort: { column: "joined_at", ascending: false },
  filters: [
    { key: "role", column: "role", kind: "in", options: ["owner", "broker", "builder"] },
    {
      key: "status",
      column: "status_key",
      kind: "in",
      options: ["active", "suspended", "trial", "deleted"],
    },
    { key: "plan", column: "plan_key", kind: "in", options: ["paid", "trial", "none"] },
    { key: "city", column: "city_name", kind: "in" },
    {
      key: "verification",
      column: "verification_key",
      kind: "in",
      options: ["rera", "id", "phone", "none"],
    },
    { key: "from", column: "joined_at", kind: "dateFrom" },
    { key: "to", column: "joined_at", kind: "dateTo" },
  ],
  minRole: "admin",
  // template 1032 — the design's twelve header cells, in its order.
  columns: [
    { key: "user", label: "User", field: "name" },
    { key: "phone", label: "Phone", field: "phone" },
    { key: "role", label: "Role", field: "role" },
    { key: "verification", label: "Verification", field: "verification_key" },
    { key: "city", label: "City", field: "city_name" },
    { key: "plans", label: "Plans", field: "plan_names" },
    { key: "listings", label: "Listings", field: "listings_count" },
    { key: "leads", label: "Leads", field: "leads_count" },
    { key: "joined", label: "Joined", field: "joined_at" },
    { key: "status", label: "Status", field: "status_key" },
  ],
};

/**
 * A12 — template 1056-1105.
 *
 * The design's ten status chips are this resource's ten tabs, so each chip
 * carries a real count over the whole table under the same filters. ("Trash"
 * is the exception the design itself makes: its chip navigates to A29 rather
 * than filtering, template 1068 — so the tab exists for the count and the
 * screen routes away instead of selecting it.)
 */
export const listingMasterResource: ListResource = {
  name: "listings-master",
  table: "admin_listing_master",
  select:
    "id, kind, title, type_code, type_label, deal_kind, price_paise, price_on_request, area_label, city_name, poster_id, poster_name, poster_role, raw_status, availability, status_key, cover_url, created_at, live_at, views_count, leads_count, is_boosted, reports_count, expiry_prompted, has_story",
  // "Title or ID" (template 1070). The id is a uuid, so it is matched as text.
  searchColumns: ["title", "area_label", "poster_name"],
  sortColumns: ["created_at", "price_paise", "views_count", "leads_count", "title"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "type", column: "type_code", kind: "in" },
    { key: "city", column: "city_name", kind: "in" },
    { key: "role", column: "poster_role", kind: "in", options: ["owner", "broker", "builder"] },
    { key: "priceMin", column: "price_paise", kind: "numFrom" },
    { key: "priceMax", column: "price_paise", kind: "numTo" },
    { key: "boosted", column: "is_boosted", kind: "bool", options: ["true", "false"] },
    { key: "reported", column: "reports_count", kind: "numFrom" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "all", label: "All", apply: (q) => q.in("status_key", ALL_STATUS_KEYS) },
    { key: "live", label: "Live", apply: (q) => q.eq("status_key", "live") },
    { key: "pending", label: "Pending", apply: (q) => q.eq("status_key", "pending") },
    { key: "changes", label: "Changes requested", apply: (q) => q.eq("status_key", "changes") },
    { key: "rejected", label: "Rejected", apply: (q) => q.eq("status_key", "rejected") },
    { key: "hidden", label: "Hidden", apply: (q) => q.eq("status_key", "hidden") },
    { key: "sold", label: "Sold", apply: (q) => q.eq("status_key", "sold") },
    { key: "rented", label: "Rented", apply: (q) => q.eq("status_key", "rented") },
    { key: "archived", label: "Archived", apply: (q) => q.eq("status_key", "archived") },
    { key: "trash", label: "Trash", apply: (q) => q.eq("status_key", "trash") },
  ],
  minRole: "admin",
  // template 1085 — Listing · Type · Price · Location · Poster · Status ·
  // Stats · Posted · Flags
  columns: [
    { key: "listing", label: "Listing", field: "title" },
    { key: "type", label: "Type", field: "type_label" },
    { key: "price", label: "Price", field: "price_paise" },
    { key: "location", label: "Location", field: "area_label" },
    { key: "poster", label: "Poster", field: "poster_name" },
    { key: "status", label: "Status", field: "status_key" },
    { key: "stats", label: "Stats", field: "views_count" },
    { key: "posted", label: "Posted", field: "created_at" },
    { key: "flags", label: "Flags", field: "reports_count" },
  ],
};

/**
 * "All" on A12 means every LIVING status, not literally every row: the design
 * gives Trash its own chip, so a deleted listing appearing under All would make
 * the two chips' counts add up to more than the table has.
 */
const ALL_STATUS_KEYS = [
  "live",
  "pending",
  "changes",
  "rejected",
  "hidden",
  "sold",
  "rented",
  "archived",
];

export const ADMIN_RESOURCES: Record<string, ListResource> = {
  audit: auditResource,
  users: userResource,
  "listings-master": listingMasterResource,
  listings: listingQueueResource,
  requirements: requirementQueueResource,
  boosts: boostQueueResource,
  verifications: verificationQueueResource,
  appeals: appealQueueResource,
  reports: reportQueueResource,
};

export function resourceByName(name: string): ListResource | null {
  return ADMIN_RESOURCES[name] ?? null;
}
