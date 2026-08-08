/**
 * Admin-editable message copy (A20 Templates). `message_templates` was written by
 * the panel and read by NOTHING — every outbound send hardcoded its own copy, so
 * editing a template changed nothing. This is the single reader the send sites
 * use to pull admin copy.
 *
 * SAFETY CONTRACT — a template can never make a send worse:
 *   • unknown code/channel → returns null (caller keeps its hardcoded copy),
 *   • a `{{var}}` the caller didn't supply → returns null (we never ship literal
 *     `{{name}}` in a real message — the caller's own copy wins instead),
 *   • a DB error → null.
 * So a send site adopts this with `render(...) ?? itsOwnCopy` and is strictly no
 * worse than before; the admin's edits take effect only when fully satisfiable.
 */
import { createServiceClient } from "@/lib/supabase/server";

export type TemplateChannel = "email" | "sms" | "whatsapp" | "push" | "in_app";

export interface RenderedTemplate {
  subject: string | null;
  body: string;
}

interface TemplateRow {
  subject: string | null;
  body: string;
  is_active: boolean;
}

let cache: { at: number; map: Map<string, TemplateRow> } | null = null;
const TTL_MS = 60_000;
const keyOf = (code: string, channel: string) => `${code}::${channel}`;

/**
 * The app's `NotificationType` and A20's template codes are two different
 * vocabularies — `refund_processed` vs `refund`, `saved_search_match` vs
 * `saved_match`, and `listing_approved` means DIFFERENT templates on email
 * (`listing_approved_email`) and push (`listing_live`). Without this map a send
 * looks up a code that does not exist, silently keeps its hardcoded copy, and
 * the admin's edit appears to do nothing — which is the bug being fixed.
 *
 * Keyed `type::channel`; anything not listed falls through to the type itself
 * (the many cases where the two names already agree).
 */
const CODE_ALIASES: Record<string, string> = {
  // email
  "refund_processed::email": "refund",
  "account_suspended::email": "suspension",
  "listing_approved::email": "listing_approved_email",
  "listing_changes_requested::email": "listing_changes",
  "plan_expired::email": "plan_expired_email",
  // push
  "inquiry_received::push": "inquiry_push",
  "listing_approved::push": "listing_live",
  "number_shared::push": "number_allowed",
  "saved_search_match::push": "saved_match",
};

/** Called by A20's template save path so an edit is live on the next send. */
export function invalidateTemplates(): void {
  cache = null;
}

async function loadTemplates(): Promise<Map<string, TemplateRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const { data } = await createServiceClient()
      .from("message_templates")
      .select("code, channel, subject, body, is_active");
    const map = new Map<string, TemplateRow>();
    for (const r of (data ?? []) as (TemplateRow & { code: string; channel: string })[])
      map.set(keyOf(r.code, r.channel), { subject: r.subject, body: r.body, is_active: r.is_active });
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache?.map ?? new Map();
  }
}

/** Interpolate `{{var}}` from `vars`; report any placeholder left unfilled. */
function interpolate(text: string, vars: Record<string, string | number>): { out: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = vars[k.toLowerCase()];
    if (v === undefined || v === null) {
      missing.push(k);
      return "";
    }
    return String(v);
  });
  return { out, missing };
}

/**
 * The admin copy for (code, channel), interpolated with `vars`, or null when the
 * caller should keep its own copy (see the safety contract). `vars` keys are
 * matched case-insensitively against the template's `{{placeholders}}`.
 */
export async function renderTemplate(
  code: string,
  channel: TemplateChannel,
  vars: Record<string, string | number> = {},
): Promise<RenderedTemplate | null> {
  const resolved = CODE_ALIASES[keyOf(code, channel)] ?? code;
  const row = (await loadTemplates()).get(keyOf(resolved, channel));
  if (!row || !row.is_active) return null;

  const body = interpolate(row.body, vars);
  if (body.missing.length) return null; // don't ship a half-filled message
  let subject: string | null = null;
  if (row.subject) {
    const s = interpolate(row.subject, vars);
    if (s.missing.length) return null;
    subject = s.out;
  }
  return { subject, body: body.out };
}
