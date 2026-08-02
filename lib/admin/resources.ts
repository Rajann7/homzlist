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

/* ══════════════════════════════════ P5a — coupons and grants ══════════════ */

/**
 * A14 — template 1218-1240.
 *
 * The design's four chips are four DERIVED states (migration 0102): a coupon is
 * exhausted when its cap fills and expired when its date passes, so neither can
 * be a stored column that goes stale.
 */
export const couponResource: ListResource = {
  name: "coupons",
  table: "admin_coupon_list",
  select:
    "id, code, label, discount_type, discount_value, max_discount_paise, min_value_paise, applies_to, catalog_codes, per_user_limit, usage_cap, used_count, starts_at, expires_at, is_active, created_at, usage_pct, status_key",
  searchColumns: ["code", "label"],
  sortColumns: ["created_at", "code", "used_count", "expires_at"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "applies", column: "applies_to", kind: "in", options: ["plans", "boosts", "both"] },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "active", label: "Active", apply: (q) => q.eq("status_key", "active") },
    { key: "scheduled", label: "Scheduled", apply: (q) => q.eq("status_key", "scheduled") },
    { key: "expired", label: "Expired", apply: (q) => q.eq("status_key", "expired") },
    { key: "exhausted", label: "Exhausted", apply: (q) => q.eq("status_key", "exhausted") },
  ],
  minRole: "admin",
  // template 1231 — Code · Discount · Applies to · Scope · Usage · Per user ·
  // Validity · Status
  columns: [
    { key: "code", label: "Code", field: "code" },
    { key: "discount", label: "Discount", field: "discount_value" },
    { key: "applies", label: "Applies to", field: "applies_to" },
    { key: "scope", label: "Scope", field: "catalog_codes" },
    { key: "usage", label: "Usage", field: "used_count" },
    { key: "per_user", label: "Per user", field: "per_user_limit" },
    { key: "validity", label: "Validity", field: "expires_at" },
    { key: "status", label: "Status", field: "status_key" },
  ],
};

/** A15 — template 1252-1272. Active · Expired · All. */
export const grantResource: ListResource = {
  name: "grants",
  table: "admin_grant_list",
  select:
    "id, profile_id, user_name, user_role, user_photo, kind, catalog_code, contents, duration_days, reason, granted_by, granted_by_name, user_plan_id, revoked_at, created_at, expires_at, plan_status, listing_quota, listing_used, requirement_quota, requirement_used, proposal_quota, proposal_used, status_key, expiring_soon",
  searchColumns: ["user_name", "reason", "granted_by_name"],
  sortColumns: ["created_at", "expires_at", "user_name"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "role", column: "user_role", kind: "in", options: ["owner", "broker", "builder"] },
    { key: "by", column: "granted_by", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "active", label: "Active", apply: (q) => q.eq("status_key", "active") },
    { key: "expired", label: "Expired", apply: (q) => q.eq("status_key", "expired") },
    { key: "all", label: "All", apply: (q) => q },
  ],
  minRole: "admin",
  // template 1261 — User · Granted · Duration · Expires · Reason · Granted by · Date
  columns: [
    { key: "user", label: "User", field: "user_name" },
    { key: "granted", label: "Granted", field: "contents" },
    { key: "duration", label: "Duration", field: "duration_days" },
    { key: "expires", label: "Expires", field: "expires_at" },
    { key: "reason", label: "Reason", field: "reason" },
    { key: "by", label: "Granted by", field: "granted_by_name" },
    { key: "date", label: "Date", field: "created_at" },
  ],
};

/* ═══════════════════════════════════════ P5b — the payments list ══════════ */

/**
 * A17 — template 1114-1146.
 *
 * The design's seven chips are six payment states plus ABANDONED, and abandoned
 * is not a payment at all — it is an order that never produced one. So this
 * resource has six tabs and A17 renders the seventh from
 * `admin_abandoned_checkouts`; a tab here would have been a chip that could
 * only ever be empty.
 */
export const paymentResource: ListResource = {
  name: "payments",
  table: "admin_payment_list",
  select:
    "id, razorpay_payment_id, profile_id, user_name, order_id, catalog_code, item_name, order_kind, amount_paise, strike_paise, coupon_code, gst_paise, method, method_detail, method_label, status_key, failure_reason, refunded_at, captured_at, created_at, razorpay_order_id, has_chargeback, invoice_number",
  // template 1119 — "payment ID / order ID / phone"
  searchColumns: ["razorpay_payment_id", "razorpay_order_id", "user_name", "item_name"],
  sortColumns: ["created_at", "amount_paise", "user_name"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "method", column: "method", kind: "in" },
    { key: "item", column: "catalog_code", kind: "in" },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "success", label: "Success", apply: (q) => q.eq("status_key", "success") },
    { key: "pending", label: "Pending", apply: (q) => q.eq("status_key", "pending") },
    { key: "failed", label: "Failed", apply: (q) => q.eq("status_key", "failed") },
    { key: "refunded", label: "Refunded", apply: (q) => q.eq("status_key", "refunded") },
    { key: "chargeback", label: "Chargebacks", apply: (q) => q.eq("status_key", "chargeback") },
  ],
  minRole: "admin",
  // template 1136 — Payment ID · User · Item · Amount · Method · Status · Date
  columns: [
    { key: "payment", label: "Payment ID", field: "razorpay_payment_id" },
    { key: "user", label: "User", field: "user_name" },
    { key: "item", label: "Item", field: "item_name" },
    { key: "amount", label: "Amount", field: "amount_paise" },
    { key: "method", label: "Method", field: "method_label" },
    { key: "status", label: "Status", field: "status_key" },
    { key: "date", label: "Date", field: "created_at" },
  ],
};

/* ════════════════════════════════ A16's three finance exports ════════════ */

/**
 * The design lists three finance exports (template 1160). They are RESOURCES
 * rather than a bespoke download path, so they run through the same machinery
 * every other export uses: one `exports` table, one private bucket, one
 * personal-data flag, one audit rule. A second downloader here would be a
 * second place for that flag to be forgotten.
 *
 * They have no tabs and no filters an admin sets by hand — the screen passes
 * the date range it is already showing.
 */
export const financeInvoiceResource: ListResource = {
  name: "finance-invoices",
  table: "invoices",
  select: "id, number, order_id, payment_id, profile_id, gstin, totals, issued_at, emailed_at",
  searchColumns: ["number", "gstin"],
  sortColumns: ["issued_at", "number"],
  defaultSort: { column: "issued_at", ascending: false },
  filters: [
    { key: "from", column: "issued_at", kind: "dateFrom" },
    { key: "to", column: "issued_at", kind: "dateTo" },
  ],
  minRole: "admin",
  columns: [
    { key: "number", label: "Invoice", field: "number" },
    { key: "issued", label: "Issued", field: "issued_at" },
    { key: "gstin", label: "GSTIN", field: "gstin" },
    { key: "totals", label: "Totals", field: "totals" },
    { key: "emailed", label: "Emailed", field: "emailed_at" },
  ],
};

export const financeRevenueResource: ListResource = {
  name: "finance-revenue",
  table: "orders",
  select:
    "id, catalog_code, kind, base_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, coupon_code, place_of_supply, status, created_at",
  searchColumns: ["catalog_code", "coupon_code"],
  sortColumns: ["created_at", "total_paise"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
    { key: "status", column: "status", kind: "in" },
  ],
  minRole: "admin",
  columns: [
    { key: "date", label: "Date", field: "created_at" },
    { key: "product", label: "Product", field: "catalog_code" },
    { key: "base", label: "Base", field: "base_paise" },
    { key: "discount", label: "Discount", field: "discount_paise" },
    { key: "cgst", label: "CGST", field: "cgst_paise" },
    { key: "sgst", label: "SGST", field: "sgst_paise" },
    { key: "igst", label: "IGST", field: "igst_paise" },
    { key: "total", label: "Total", field: "total_paise" },
    { key: "status", label: "Status", field: "status" },
  ],
};

export const financeRefundResource: ListResource = {
  name: "finance-refunds",
  table: "admin_payment_list",
  select:
    "id, razorpay_payment_id, user_name, item_name, amount_paise, status_key, refunded_at, created_at, invoice_number",
  searchColumns: ["razorpay_payment_id", "user_name"],
  sortColumns: ["refunded_at", "amount_paise"],
  defaultSort: { column: "refunded_at", ascending: false },
  filters: [
    { key: "from", column: "refunded_at", kind: "dateFrom" },
    { key: "to", column: "refunded_at", kind: "dateTo" },
  ],
  tabs: [{ key: "refunded", label: "Refunded", apply: (q) => q.eq("status_key", "refunded") }],
  minRole: "admin",
  columns: [
    { key: "payment", label: "Payment", field: "razorpay_payment_id" },
    { key: "user", label: "User", field: "user_name" },
    { key: "item", label: "Item", field: "item_name" },
    { key: "amount", label: "Amount", field: "amount_paise" },
    { key: "refunded", label: "Refunded on", field: "refunded_at" },
    { key: "invoice", label: "Invoice", field: "invoice_number" },
  ],
};

/* ═════════════════════════ P6 — master data, content, templates ══════════ */

/**
 * Twelve more lists, and not one of them gets its own filter bar: they are the
 * same engine with different props, which is what P1 was built for.
 *
 * Note which of these have NO tabs. A19's amenity and pattern tables and A21's
 * channel tables are drawn by the design as a plain `dtable` with a "+ Add"
 * button (templates 2118, 2155, 2270) — no chips, no filter row. Adding chips
 * "for consistency" is the same class of mistake P5a's pixel diff caught on A14
 * and A15.
 */

/** A19 · Amenities — template 2118. */
export const amenityResource: ListResource = {
  name: "amenities",
  table: "admin_amenity_list",
  select: "id, code, label, category, categories, icon, sort_order, is_active, usage_count",
  searchColumns: ["label", "code"],
  sortColumns: ["sort_order", "label", "usage_count"],
  defaultSort: { column: "sort_order", ascending: true },
  filters: [{ key: "category", column: "category", kind: "in" }],
  minRole: "admin",
  columns: [
    { key: "name", label: "Name", field: "label" },
    { key: "applies", label: "Applies to", field: "categories" },
    { key: "usage", label: "Usage", field: "usage_count" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

/** A19 · Property types — template 2131. */
export const propertyTypeResource: ListResource = {
  name: "property-types",
  table: "admin_property_type_list",
  select:
    "id, code, label, category, roles, kinds, field_config, sort_order, is_active, field_count, listings_count",
  searchColumns: ["label", "code"],
  sortColumns: ["sort_order", "label", "listings_count"],
  defaultSort: { column: "sort_order", ascending: true },
  filters: [
    { key: "category", column: "category", kind: "in", options: ["residential", "commercial", "plot", "pg"] },
  ],
  minRole: "admin",
  columns: [
    { key: "type", label: "Type", field: "label" },
    { key: "category", label: "Category", field: "category" },
    { key: "roles", label: "Available to", field: "roles" },
    { key: "fields", label: "Fields config", field: "field_count" },
    { key: "listings", label: "Listings", field: "listings_count" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

/**
 * A19 · Blocklist — template 2144.
 *
 * The design's four language tabs (English · ગુજરાતી · हिन्दी · Transliterated)
 * are TABS on `script`, so each one re-queries and its rows are really that
 * script's — not one list relabelled four times.
 */
export const blocklistResource: ListResource = {
  name: "blocklist",
  table: "admin_blocklist",
  select: "id, word, script, severity, applies_to, is_active, note, created_at, hits_30d",
  searchColumns: ["word", "note"],
  sortColumns: ["created_at", "word", "hits_30d"],
  defaultSort: { column: "hits_30d", ascending: false },
  filters: [
    { key: "severity", column: "severity", kind: "in", options: ["block", "flag"] },
    { key: "active", column: "is_active", kind: "bool", options: ["true", "false"] },
  ],
  tabs: [
    { key: "en", label: "English", apply: (q) => q.eq("script", "latin") },
    { key: "gu", label: "ગુજરાતી", apply: (q) => q.eq("script", "gujarati") },
    { key: "hi", label: "हिन्दी", apply: (q) => q.eq("script", "devanagari") },
    { key: "tr", label: "Transliterated", apply: (q) => q.eq("script", "translit") },
  ],
  minRole: "admin",
  columns: [
    { key: "word", label: "Word / phrase", field: "word" },
    { key: "severity", label: "Severity", field: "severity" },
    { key: "where", label: "Where", field: "applies_to" },
    { key: "hits", label: "Hits (30d)", field: "hits_30d" },
  ],
};

/** A19 · Number patterns — template 2155. */
export const patternResource: ListResource = {
  name: "patterns",
  table: "admin_number_pattern_list",
  select: "id, label, pattern, pattern_posix, sample, action, applies_to, is_active, created_at, hits_30d",
  searchColumns: ["label", "pattern"],
  sortColumns: ["created_at", "label", "hits_30d"],
  defaultSort: { column: "hits_30d", ascending: false },
  filters: [{ key: "action", column: "action", kind: "in", options: ["block", "flag"] }],
  minRole: "admin",
  columns: [
    { key: "pattern", label: "Pattern", field: "pattern" },
    { key: "description", label: "Description", field: "label" },
    { key: "hits", label: "Hits", field: "hits_30d" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

/** A19 · Area requests — template 2170. */
export const areaRequestResource: ListResource = {
  name: "area-requests",
  table: "admin_area_request_list",
  select:
    "id, name, status, note, created_at, resolved_at, created_area_id, profile_id, requester_name, requester_photo, city_id, city_name, ask_count",
  searchColumns: ["name", "requester_name", "city_name"],
  sortColumns: ["created_at", "ask_count", "name"],
  // The one people asked for most, first — that is what makes the queue worth
  // opening.
  defaultSort: { column: "ask_count", ascending: false },
  filters: [{ key: "city", column: "city_name", kind: "in" }],
  // The schema's own vocabulary — `area_requests_status_check` allows exactly
  // pending / added / rejected.
  tabs: [
    { key: "pending", label: "Pending", apply: (q) => q.eq("status", "pending") },
    { key: "added", label: "Added", apply: (q) => q.eq("status", "added") },
    { key: "rejected", label: "Dismissed", apply: (q) => q.eq("status", "rejected") },
  ],
  minRole: "admin",
  columns: [
    { key: "area", label: "Requested area", field: "name" },
    { key: "city", label: "City", field: "city_name" },
    { key: "by", label: "Requested by", field: "requester_name" },
    { key: "date", label: "Date", field: "created_at" },
    { key: "count", label: "Count", field: "ask_count" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** A20 · Pages — template 2166. */
export const cmsPageResource: ListResource = {
  name: "cms-pages",
  table: "admin_cms_page_list",
  select:
    "id, slug, title, kind, version, version_label, status_key, effective_date, requires_reacceptance, updated_at, updated_by, updated_by_name, version_count",
  searchColumns: ["title", "slug"],
  sortColumns: ["updated_at", "title", "version"],
  defaultSort: { column: "updated_at", ascending: false },
  filters: [{ key: "status", column: "status_key", kind: "in", options: ["published", "draft"] }],
  minRole: "admin",
  columns: [
    { key: "page", label: "Page", field: "title" },
    { key: "version", label: "Version", field: "version_label" },
    { key: "status", label: "Status", field: "status_key" },
    { key: "effective", label: "Effective", field: "effective_date" },
    { key: "by", label: "Updated by", field: "updated_by_name" },
    { key: "updated", label: "Updated", field: "updated_at" },
  ],
};

/** A20 · Blog — template 2181. */
export const blogResource: ListResource = {
  name: "blog",
  table: "admin_blog_list",
  select:
    "id, slug, title, category, status_key, author_name, cover_url, view_count, scheduled_at, published_at, created_at, updated_at, is_featured",
  searchColumns: ["title", "slug", "author_name"],
  sortColumns: ["created_at", "published_at", "view_count", "title"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [{ key: "category", column: "category", kind: "in" }],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "published", label: "Published", apply: (q) => q.eq("status_key", "published") },
    { key: "scheduled", label: "Scheduled", apply: (q) => q.eq("status_key", "scheduled") },
    { key: "draft", label: "Draft", apply: (q) => q.eq("status_key", "draft") },
  ],
  minRole: "admin",
  columns: [
    { key: "post", label: "Post", field: "title" },
    { key: "category", label: "Category", field: "category" },
    { key: "status", label: "Status", field: "status_key" },
    { key: "author", label: "Author", field: "author_name" },
    { key: "views", label: "Views", field: "view_count" },
    { key: "date", label: "Date", field: "created_at" },
  ],
};

/** A20 · FAQs — template 2194. */
export const faqResource: ListResource = {
  name: "faqs",
  table: "admin_faq_list",
  select:
    "id, question, answer, category, sort_order, is_active, view_count, helpful_yes, helpful_no, votes, helpful_pct, updated_at",
  searchColumns: ["question", "answer"],
  sortColumns: ["sort_order", "view_count", "helpful_pct", "updated_at"],
  defaultSort: { column: "sort_order", ascending: true },
  filters: [{ key: "category", column: "category", kind: "in" }],
  minRole: "admin",
  columns: [
    { key: "question", label: "Question", field: "question" },
    { key: "category", label: "Category", field: "category" },
    { key: "views", label: "Views", field: "view_count" },
    { key: "helpful", label: "Helpful", field: "helpful_pct" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

/** A20 · Banners — template 2210. */
export const bannerResource: ListResource = {
  name: "banners",
  table: "admin_banner_list",
  select:
    "id, title, subtitle, placement, image_url, target_url, target_cities, target_roles, target_plan_status, starts_at, ends_at, is_active, impressions, clicks, sort_order, created_at, status_key",
  searchColumns: ["title", "subtitle"],
  sortColumns: ["created_at", "starts_at", "impressions"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [{ key: "placement", column: "placement", kind: "in" }],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "active", label: "Active", apply: (q) => q.eq("status_key", "active") },
    { key: "scheduled", label: "Scheduled", apply: (q) => q.eq("status_key", "scheduled") },
    { key: "expired", label: "Expired", apply: (q) => q.eq("status_key", "expired") },
  ],
  minRole: "admin",
  columns: [
    { key: "banner", label: "Banner", field: "title" },
    { key: "targeting", label: "Targeting", field: "target_roles" },
    { key: "window", label: "Window", field: "starts_at" },
    { key: "status", label: "Status", field: "status_key" },
    { key: "impressions", label: "Impressions", field: "impressions" },
  ],
};

/** A20 · Broadcasts — template 2223. */
export const broadcastResource: ListResource = {
  name: "broadcasts",
  table: "admin_broadcast_list",
  select:
    "id, title, body, channels, audience, recipient_count, status_key, scheduled_at, sent_at, sent_by, sent_by_name, created_at, delivered_count, attempted_count, delivered_pct",
  searchColumns: ["title", "body"],
  sortColumns: ["created_at", "sent_at", "recipient_count"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [{ key: "status", column: "status_key", kind: "in" }],
  minRole: "admin",
  columns: [
    { key: "message", label: "Message", field: "title" },
    { key: "channels", label: "Channels", field: "channels" },
    { key: "audience", label: "Audience", field: "recipient_count" },
    { key: "when", label: "Sent/Scheduled", field: "sent_at" },
    { key: "delivered", label: "Delivered", field: "delivered_count" },
    { key: "status", label: "Status", field: "status_key" },
  ],
};

/**
 * A21 · Templates — template 2270.
 *
 * The design's five tabs are four CHANNELS and the string table, so the channel
 * is a tab here and A21 renders UI strings from its own resource. A template
 * exists per (code, channel), so "Listing approved" legitimately appears under
 * both Email and Push — that is two rows, not one row shown twice.
 */
export const templateResource: ListResource = {
  name: "templates",
  table: "admin_template_list",
  select:
    "id, code, channel, name, subject, body, variables, provider_ref, is_active, last_test_at, updated_at, updated_by_name, has_en, has_gu, has_hi",
  searchColumns: ["name", "code", "subject"],
  sortColumns: ["updated_at", "name", "code"],
  defaultSort: { column: "name", ascending: true },
  filters: [{ key: "active", column: "is_active", kind: "bool", options: ["true", "false"] }],
  tabs: [
    { key: "email", label: "Email", apply: (q) => q.eq("channel", "email") },
    { key: "sms", label: "SMS", apply: (q) => q.eq("channel", "sms") },
    { key: "whatsapp", label: "WhatsApp", apply: (q) => q.eq("channel", "whatsapp") },
    { key: "push", label: "Push", apply: (q) => q.eq("channel", "push") },
  ],
  minRole: "admin",
  columns: [
    { key: "name", label: "Name", field: "name" },
    { key: "trigger", label: "Trigger", field: "code" },
    { key: "languages", label: "Languages", field: "has_gu" },
    { key: "status", label: "Status", field: "is_active" },
    { key: "edited", label: "Last edited", field: "updated_at" },
  ],
};

/**
 * A21 · UI strings — template 2300.
 *
 * The design's chips are "All · Missing GU 42 · Missing HI 18 · Recently
 * changed", and the two "missing" counts are the reason 0106 computes
 * `missing_gu` / `missing_hi` as columns: a chip whose count is a real count
 * over the whole table cannot promise rows the table then fails to show.
 */
export const uiStringResource: ListResource = {
  name: "ui-strings",
  table: "admin_ui_string_list",
  select: "id, key, area, en, gu, hi, updated_at, missing_gu, missing_hi",
  searchColumns: ["key", "en", "gu", "hi"],
  sortColumns: ["key", "updated_at", "area"],
  defaultSort: { column: "key", ascending: true },
  filters: [{ key: "area", column: "area", kind: "in" }],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "missgu", label: "Missing GU", apply: (q) => q.eq("missing_gu", true) },
    { key: "misshi", label: "Missing HI", apply: (q) => q.eq("missing_hi", true) },
    {
      key: "recent",
      label: "Recently changed",
      apply: (q) => q.gte("updated_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    },
  ],
  minRole: "admin",
  columns: [
    { key: "key", label: "Key", field: "key" },
    { key: "screen", label: "Screen", field: "area" },
    { key: "en", label: "English", field: "en" },
    { key: "gu", label: "ગુજરાતી", field: "gu" },
    { key: "hi", label: "हिन्दी", field: "hi" },
  ],
};

/* ═════════════════════════════════ P7 — A22–A30, the last nine screens ═══ */

/** A22 · Feature flags — template 2337. Super-only, like the whole screen. */
export const flagResource: ListResource = {
  name: "flags",
  table: "admin_flag_list",
  select: "id, key, label, description, enabled, scope, scope_value, updated_at, updated_by_name",
  searchColumns: ["label", "key", "description"],
  sortColumns: ["label", "updated_at"],
  defaultSort: { column: "label", ascending: true },
  filters: [{ key: "scope", column: "scope", kind: "in" }],
  minRole: "super",
  columns: [
    { key: "feature", label: "Feature", field: "label" },
    { key: "description", label: "Description", field: "description" },
    { key: "scope", label: "Scope", field: "scope" },
    { key: "status", label: "Status", field: "enabled" },
    { key: "changed", label: "Last changed", field: "updated_at" },
  ],
};

/** A22 · Rate limits — template 2367. */
export const rateLimitResource: ListResource = {
  name: "rate-limits",
  table: "admin_rate_limit_list",
  select: "id, key, label, scope, window_seconds, max_requests, block_seconds, is_active, hits_24h",
  searchColumns: ["label", "key"],
  sortColumns: ["label", "hits_24h"],
  defaultSort: { column: "label", ascending: true },
  filters: [{ key: "scope", column: "scope", kind: "in" }],
  minRole: "super",
  columns: [
    { key: "endpoint", label: "Endpoint", field: "label" },
    { key: "limit", label: "Limit", field: "max_requests" },
    { key: "scope", label: "Scope", field: "scope" },
    { key: "hits", label: "Hits (24h)", field: "hits_24h" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

export const velocityResource: ListResource = {
  name: "velocity",
  table: "admin_velocity_list",
  select: "id, key, label, threshold, window_hours, action, is_active, hits_24h",
  searchColumns: ["label", "key"],
  sortColumns: ["label"],
  defaultSort: { column: "label", ascending: true },
  filters: [{ key: "action", column: "action", kind: "in", options: ["flag", "throttle", "block"] }],
  minRole: "super",
  columns: [
    { key: "action_label", label: "Action", field: "label" },
    { key: "threshold", label: "Threshold", field: "threshold" },
    { key: "then", label: "Then", field: "action" },
    { key: "status", label: "Status", field: "is_active" },
  ],
};

/**
 * A23 · Tickets — template 2432.
 *
 * The design's five tabs, and "Assigned to me" is the one that cannot be a
 * static filter: it depends on WHO is asking. The engine resolves it per
 * request from the caller's identity (see the route), which is why it is
 * declared here as a tab with no `apply` of its own.
 */
export const ticketResource: ListResource = {
  name: "tickets",
  table: "admin_ticket_list",
  select:
    "id, number, subject, category, priority, status, is_grievance, sla_due_at, acked_at, closed_at, last_activity_at, created_at, reopen_count, profile_id, user_name, user_photo, user_role, user_phone, assignee_id, assignee_name, payment_id, listing_id, sla_state, sla_seconds_left",
  // template 2444 — "Ticket ID, phone, subject"
  searchColumns: ["number", "subject", "user_name", "user_phone"],
  sortColumns: ["created_at", "sla_due_at", "priority", "last_activity_at"],
  // The one closest to breaching its SLA, first.
  defaultSort: { column: "sla_due_at", ascending: true },
  filters: [
    { key: "category", column: "category", kind: "in" },
    { key: "priority", column: "priority", kind: "in", options: ["low", "normal", "high", "urgent"] },
    { key: "assignee", column: "assignee_id", kind: "in" },
    { key: "sla", column: "sla_state", kind: "in", options: ["over", "warn", "ok", "none"] },
    { key: "from", column: "created_at", kind: "dateFrom" },
    { key: "to", column: "created_at", kind: "dateTo" },
  ],
  tabs: [
    { key: "open", label: "Open", apply: (q) => q.in("status", ["open", "replied"]) },
    // `mine` is rewritten per request with the caller's id — see the route.
    { key: "mine", label: "Assigned to me", apply: (q) => q },
    { key: "unassigned", label: "Unassigned", apply: (q) => q.is("assignee_id", null).neq("status", "closed") },
    { key: "replied", label: "Replied", apply: (q) => q.eq("status", "replied") },
    { key: "closed", label: "Closed", apply: (q) => q.eq("status", "closed") },
  ],
  minRole: "admin",
  columns: [
    { key: "ticket", label: "Ticket", field: "number" },
    { key: "category", label: "Category", field: "category" },
    { key: "user", label: "User", field: "user_name" },
    { key: "priority", label: "Priority", field: "priority" },
    { key: "assignee", label: "Assignee", field: "assignee_name" },
    { key: "sla", label: "SLA", field: "sla_state" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** A24 · Disputes — template 2489. */
export const disputeResource: ListResource = {
  name: "disputes",
  table: "admin_dispute_list",
  select:
    "id, number, category, summary, amount_claimed_paise, status, outcome, resolution, evidence_preserved, created_at, resolved_at, listing_id, listing_title, listing_cover, thread_id, party_a, party_a_name, party_a_photo, party_b, party_b_name, party_b_photo",
  searchColumns: ["number", "summary", "party_a_name", "party_b_name"],
  sortColumns: ["created_at", "amount_claimed_paise"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [{ key: "category", column: "category", kind: "in" }],
  tabs: [
    { key: "open", label: "Open", apply: (q) => q.eq("status", "open") },
    { key: "review", label: "Under review", apply: (q) => q.eq("status", "investigating") },
    { key: "resolved", label: "Resolved", apply: (q) => q.in("status", ["resolved", "closed"]) },
  ],
  minRole: "admin",
  columns: [
    { key: "dispute", label: "Dispute", field: "number" },
    { key: "parties", label: "Parties", field: "party_a_name" },
    { key: "related", label: "Related", field: "listing_title" },
    { key: "amount", label: "Amount claimed", field: "amount_claimed_paise" },
    { key: "raised", label: "Raised", field: "created_at" },
    { key: "status", label: "Status", field: "status" },
  ],
};

/** A25 · Staff — template 2523. Super-only. */
export const staffResource: ListResource = {
  name: "staff",
  table: "admin_staff_list",
  select:
    "id, profile_id, email, display_name, level, is_active, state, created_at, invited_at, last_login_at, added_by, added_by_name, is_online, pending_first_login, action_count",
  searchColumns: ["display_name", "email"],
  sortColumns: ["display_name", "created_at", "last_login_at"],
  defaultSort: { column: "created_at", ascending: true },
  filters: [
    { key: "level", column: "level", kind: "in", options: ["staff", "admin", "super"] },
    { key: "active", column: "is_active", kind: "bool", options: ["true", "false"] },
  ],
  minRole: "super",
  columns: [
    { key: "staff", label: "Staff", field: "display_name" },
    { key: "role", label: "Role", field: "level" },
    { key: "by", label: "Added by", field: "added_by_name" },
    { key: "added", label: "Added", field: "created_at" },
    { key: "last", label: "Last login", field: "last_login_at" },
    { key: "online", label: "Online", field: "is_online" },
  ],
};

/** A27 · Cron jobs — template 2606. */
export const cronResource: ListResource = {
  name: "cron",
  table: "admin_cron_list",
  select:
    "id, code, name, schedule, description, enabled, last_run_at, last_status, last_duration_ms, next_run_at, failure_count, last_error",
  searchColumns: ["name", "code"],
  sortColumns: ["name", "last_run_at", "next_run_at"],
  defaultSort: { column: "name", ascending: true },
  filters: [{ key: "status", column: "last_status", kind: "in" }],
  minRole: "admin",
  columns: [
    { key: "job", label: "Job", field: "name" },
    { key: "schedule", label: "Schedule", field: "schedule" },
    { key: "last", label: "Last run", field: "last_run_at" },
    { key: "status", label: "Status", field: "last_status" },
    { key: "next", label: "Next run", field: "next_run_at" },
  ],
};

/** A29 · Trash — template 2694. The design's eight chips are these tabs. */
export const trashResource: ListResource = {
  name: "trash",
  table: "admin_trash_list",
  select:
    "id, entity_type, entity_id, label, deleted_by_kind, deleted_by, deleted_by_name, reason, deleted_at, purge_at, restored_at, purge_days_left, purge_state",
  searchColumns: ["label", "reason", "deleted_by_name"],
  sortColumns: ["deleted_at", "purge_at"],
  // Whatever is closest to being destroyed forever, first.
  defaultSort: { column: "purge_at", ascending: true },
  filters: [{ key: "by", column: "deleted_by_kind", kind: "in", options: ["user", "admin", "system"] }],
  tabs: [
    { key: "all", label: "All", apply: (q) => q.is("restored_at", null) },
    { key: "listings", label: "Listings", apply: (q) => q.eq("entity_type", "listing").is("restored_at", null) },
    { key: "requirements", label: "Requirements", apply: (q) => q.eq("entity_type", "requirement").is("restored_at", null) },
    { key: "users", label: "Users", apply: (q) => q.eq("entity_type", "user").is("restored_at", null) },
    { key: "chats", label: "Chats", apply: (q) => q.eq("entity_type", "chat").is("restored_at", null) },
    { key: "photos", label: "Photos", apply: (q) => q.eq("entity_type", "photo").is("restored_at", null) },
    { key: "projects", label: "Projects", apply: (q) => q.eq("entity_type", "project").is("restored_at", null) },
    { key: "coupons", label: "Coupons", apply: (q) => q.eq("entity_type", "coupon").is("restored_at", null) },
  ],
  minRole: "admin",
  columns: [
    { key: "item", label: "Item", field: "label" },
    { key: "type", label: "Type", field: "entity_type" },
    { key: "by", label: "Deleted by", field: "deleted_by_name" },
    { key: "deleted", label: "Deleted on", field: "deleted_at" },
    { key: "purge", label: "Purge in", field: "purge_at" },
    { key: "reason", label: "Reason", field: "reason" },
  ],
};

/** A30 · Exports — template 2721. */
export const exportResource: ListResource = {
  name: "exports",
  table: "admin_export_list",
  select:
    "id, name, entity, filters, format, row_count, status, reason, contains_personal_data, file_key, requested_by, requested_by_name, expires_at, created_at, state_key, expires_in_seconds",
  searchColumns: ["name", "entity", "requested_by_name"],
  sortColumns: ["created_at", "row_count"],
  defaultSort: { column: "created_at", ascending: false },
  filters: [
    { key: "entity", column: "entity", kind: "in" },
    { key: "format", column: "format", kind: "in", options: ["csv", "xlsx"] },
    { key: "personal", column: "contains_personal_data", kind: "bool", options: ["true", "false"] },
  ],
  tabs: [
    { key: "all", label: "All", apply: (q) => q },
    { key: "ready", label: "Ready", apply: (q) => q.eq("state_key", "ready") },
    { key: "processing", label: "Processing", apply: (q) => q.eq("state_key", "processing") },
    { key: "expired", label: "Expired", apply: (q) => q.eq("state_key", "expired") },
    { key: "failed", label: "Failed", apply: (q) => q.eq("state_key", "failed") },
  ],
  minRole: "admin",
  columns: [
    { key: "export", label: "Export", field: "name" },
    { key: "type", label: "Type", field: "entity" },
    { key: "rows", label: "Rows", field: "row_count" },
    { key: "format", label: "Format", field: "format" },
    { key: "by", label: "Requested by", field: "requested_by_name" },
    { key: "requested", label: "Requested", field: "created_at" },
    { key: "status", label: "Status", field: "state_key" },
    { key: "expires", label: "Expires", field: "expires_at" },
  ],
};

/**
 * A28's export (template 2637's download button).
 *
 * It exports the EVENT SUMMARY — one row per event with its 30-day count and
 * the previous window — through the same machinery every other export uses, so
 * it gets the same private bucket, expiry and audit rule. A bespoke download
 * here would be a second place the personal-data flag could be forgotten.
 */
export const analyticsEventResource: ListResource = {
  name: "analytics-events",
  table: "admin_event_summary",
  select: "id, name, count_30d, count_prev_30d, last_seen_at",
  searchColumns: ["name"],
  sortColumns: ["count_30d", "name", "last_seen_at"],
  defaultSort: { column: "count_30d", ascending: false },
  filters: [],
  minRole: "admin",
  columns: [
    { key: "event", label: "Event", field: "name" },
    { key: "count", label: "Count (30d)", field: "count_30d" },
    { key: "prev", label: "Previous 30d", field: "count_prev_30d" },
    { key: "last", label: "Last seen", field: "last_seen_at" },
  ],
};

export const ADMIN_RESOURCES: Record<string, ListResource> = {
  audit: auditResource,
  users: userResource,
  "listings-master": listingMasterResource,
  coupons: couponResource,
  payments: paymentResource,
  "finance-invoices": financeInvoiceResource,
  "finance-revenue": financeRevenueResource,
  "finance-refunds": financeRefundResource,
  grants: grantResource,
  listings: listingQueueResource,
  requirements: requirementQueueResource,
  boosts: boostQueueResource,
  verifications: verificationQueueResource,
  appeals: appealQueueResource,
  reports: reportQueueResource,
  amenities: amenityResource,
  "property-types": propertyTypeResource,
  blocklist: blocklistResource,
  patterns: patternResource,
  "area-requests": areaRequestResource,
  "cms-pages": cmsPageResource,
  blog: blogResource,
  faqs: faqResource,
  banners: bannerResource,
  broadcasts: broadcastResource,
  templates: templateResource,
  "ui-strings": uiStringResource,
  flags: flagResource,
  "rate-limits": rateLimitResource,
  velocity: velocityResource,
  tickets: ticketResource,
  disputes: disputeResource,
  staff: staffResource,
  cron: cronResource,
  trash: trashResource,
  exports: exportResource,
  "analytics-events": analyticsEventResource,
};

export function resourceByName(name: string): ListResource | null {
  return ADMIN_RESOURCES[name] ?? null;
}
