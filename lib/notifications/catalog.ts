import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The notification event catalog (Doc2 §14) as it actually exists: rows in
 * `notification_types` / `notification_categories`, not a switch statement.
 *
 * Everything the P11 row renders (icon, tone, avatar-vs-icon lead, thumbnail,
 * inline actions, deep link) and everything the delivery engine decides
 * (category, urgency, marketing, default channels, grouping window) is read
 * from the config table. Adding an event type is a migration, never a component
 * edit — which is the whole point of CLAUDE.md §7.
 *
 * Cached in-process for 60s: the catalog changes with a migration, not with a
 * request, and a per-notification round-trip would be pure waste.
 */

export type NotificationType =
  // chat / inquiry
  | "inquiry_received" | "new_message" | "chat_accepted" | "chat_declined" | "number_requested" | "number_shared"
  // listing lifecycle & moderation
  | "listing_approved" | "listing_changes_requested" | "listing_rejected" | "still_available"
  | "saved_listing_status" | "price_drop" | "report_outcome" | "suspension_lifted"
  | "performance_nudge" | "area_added" | "weekly_digest" | "city_launched"
  // boost
  | "boost_approved" | "boost_rejected" | "boost_expiring" | "boost_expired" | "boost_stopped"
  // requirements / proposals / matching
  | "proposal_received" | "proposal_accepted" | "proposal_declined" | "proposal_expired"
  | "saved_search_match" | "requirement_match" | "requirement_expiring"
  // plans, payments, security
  | "plan_expiring" | "plan_expired" | "trial_ending"
  | "payment_success" | "payment_failed" | "refund_processed" | "new_device_login"
  // admin decisions (A7/A9). These have existed in the `notification_type` enum
  // and in `notification_types` since 0088; the union simply had not caught up,
  // so the only way to send one was a cast — which compiles, runs, and hides
  // the next genuinely-missing type behind the same cast.
  | "verification_approved" | "verification_rejected" | "verification_revoked"
  | "account_suspended" | "admin_message" | "role_changed";

export type NotificationCategory = "inquiry" | "listing" | "requirement" | "payment";

export interface NotificationAction {
  key: string;
  label: string;
  style: "primary" | "outline" | "link" | "link-error";
}

export interface TypeConfig {
  code: NotificationType;
  category: NotificationCategory;
  label: string;
  leadKind: "avatar" | "icon";
  leadIcon: string | null;
  leadTone: "accent" | "warn" | "err" | "info" | "neutral";
  hrefTemplate: string | null;
  actions: NotificationAction[];
  isUrgent: boolean;
  isMarketing: boolean;
  defaultPush: boolean;
  defaultEmail: boolean;
  groupWindowMinutes: number;
  showThumb: boolean;
  /** The P10 S7 toggle that governs it; null = critical, no switch exists. */
  prefGroup: string | null;
}

export interface CategoryConfig {
  code: NotificationCategory;
  label: string;
  sortOrder: number;
}

const TTL_MS = 60_000;
let typesCache: { at: number; byCode: Map<string, TypeConfig> } | null = null;
let catsCache: { at: number; rows: CategoryConfig[] } | null = null;

function rowToConfig(r: any): TypeConfig {
  return {
    code: r.code,
    category: r.category,
    label: r.label,
    leadKind: r.lead_kind,
    leadIcon: r.lead_icon,
    leadTone: r.lead_tone,
    hrefTemplate: r.href_template,
    actions: Array.isArray(r.actions) ? r.actions : [],
    isUrgent: !!r.is_urgent,
    isMarketing: !!r.is_marketing,
    defaultPush: !!r.default_push,
    defaultEmail: !!r.default_email,
    groupWindowMinutes: r.group_window_minutes ?? 0,
    showThumb: !!r.show_thumb,
    prefGroup: r.pref_group ?? null,
  };
}

export async function loadTypes(): Promise<Map<string, TypeConfig>> {
  if (typesCache && Date.now() - typesCache.at < TTL_MS) return typesCache.byCode;
  const { data } = await createServiceClient().from("notification_types").select("*");
  const byCode = new Map<string, TypeConfig>();
  for (const r of (data ?? []) as any[]) byCode.set(r.code, rowToConfig(r));
  typesCache = { at: Date.now(), byCode };
  return byCode;
}

export async function typeConfig(code: NotificationType): Promise<TypeConfig | null> {
  return (await loadTypes()).get(code) ?? null;
}

export async function loadCategories(): Promise<CategoryConfig[]> {
  if (catsCache && Date.now() - catsCache.at < TTL_MS) return catsCache.rows;
  const { data } = await createServiceClient()
    .from("notification_categories")
    .select("code,label,sort_order")
    .eq("is_active", true)
    .order("sort_order");
  const rows = ((data ?? []) as any[]).map((r) => ({ code: r.code, label: r.label, sortOrder: r.sort_order }));
  catsCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Fill a deep-link template from the notification's `data` bag.
 * A template whose placeholder has no value falls back to the path prefix
 * before that segment, so a tap can never land on `/property/undefined`.
 */
export function resolveHref(template: string | null, data: Record<string, unknown>): string | null {
  if (!template) return null;
  let missing = false;
  const filled = template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = data?.[key];
    if (v == null || v === "") { missing = true; return ""; }
    return encodeURIComponent(String(v));
  });
  if (!missing) return filled;
  // Trim back to the last complete segment (drops "/{id}" and any trailing "?x=").
  const noQuery = filled.split("?")[0].replace(/\/+$/, "");
  return noQuery || "/";
}
