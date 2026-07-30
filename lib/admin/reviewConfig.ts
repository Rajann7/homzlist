import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The option lists A4–A9 render, read from the config tables migration 0099
 * created (CLAUDE.md rule 7 — no array of choices inside a component).
 *
 * Kept in one module so the same eight reject templates reach A4's Reject
 * dialog, A5's sheet and the bulk bar's confirm without three separate queries
 * that could drift.
 */

export interface SopItem {
  id: string;
  label: string;
}

export interface RejectTemplate {
  code: string;
  label: string;
  /** The body a moderator sends; falls back to the label when unset. */
  body: string;
}

export interface ChangeField {
  fieldKey: string;
  label: string;
  template: string;
}

export interface ActionOption {
  value: string;
  label: string;
  body: string | null;
}

/** `review_sop_items.scope` — listing | requirement | verification_id | verification_rera. */
export async function sopItems(scope: string): Promise<SopItem[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("review_sop_items")
    .select("id, label")
    .eq("scope", scope)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    label: r.label as string,
  }));
}

export async function rejectTemplates(subjectType: string): Promise<RejectTemplate[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("reject_templates")
    .select("code, label, body")
    .eq("subject_type", subjectType)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    code: r.code as string,
    label: r.label as string,
    body: ((r.body as string) ?? "").trim() || (r.label as string),
  }));
}

export async function changeFields(subjectType: string): Promise<ChangeField[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("change_request_fields")
    .select("field_key, label, template")
    .eq("subject_type", subjectType)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    fieldKey: r.field_key as string,
    label: r.label as string,
    template: r.template as string,
  }));
}

/** `moderation_action_options.kind` — boost_refund | warn_template | suspend_duration. */
export async function actionOptions(kind: string): Promise<ActionOption[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("moderation_action_options")
    .select("value, label, body")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    value: r.value as string,
    label: r.label as string,
    body: (r.body as string) ?? null,
  }));
}

/**
 * `flagged_reason` code → the sentence the risk block prints. A code the config
 * has no row for is humanised rather than dropped: the reviewer must still be
 * told something was flagged (migration 0102).
 */
export async function flagReasonLabels(): Promise<Map<string, string>> {
  const opts = await actionOptions("flag_reason");
  return new Map(opts.map((o) => [o.value, o.label]));
}

export function humaniseFlag(code: string, labels: Map<string, string>): string {
  return labels.get(code) ?? code.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export async function verificationRejectReasons(level: string): Promise<string[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("verification_reject_reasons")
    .select("label")
    .eq("level", level)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{ label: string }>).map((r) => r.label);
}

/**
 * A moderator's reason must be one the config offers — otherwise the reason
 * radio list is decoration and a crafted request could store anything in the
 * poster-visible `reject_reason`. `other` is the one free-text code, and the
 * caller supplies the typed text for it.
 */
export async function resolveRejectReason(
  subjectType: string,
  code: string,
  freeText: string | null,
): Promise<string | null> {
  const templates = await rejectTemplates(subjectType);
  const hit = templates.find((t) => t.code === code);
  if (!hit) return null;
  if (code === "other") {
    const text = (freeText ?? "").trim().slice(0, 300);
    return text.length >= 3 ? text : null;
  }
  return hit.body;
}
