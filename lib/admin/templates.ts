import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "./audit";
import { sendAdminMessage } from "./users";
import { invalidateTemplates } from "@/lib/notifications/templates";
import { invalidateStrings } from "@/lib/system/strings";
import type { AdminIdentity } from "./guard";

/**
 * A21 — Templates & strings. Template 2237-2322.
 *
 * Five tabs: four channels and the UI string table. Two things shape this file:
 *
 *  · A TEMPLATE HAS THREE LANGUAGES. The design draws EN/GU/HI dots on every
 *    row and a per-language tab in the editor. `message_templates` had one
 *    body, so two of those dots could never light — migration 0106 gives each
 *    template a locale row per language, and this is what writes them.
 *
 *  · A VARIABLE THAT DOES NOT EXIST IS A BROKEN SEND. `{{user_nmae}}` renders
 *    literally in a real email. The save path checks every `{{…}}` against the
 *    template's declared variables and refuses the unknown ones, because the
 *    alternative is finding out from a customer.
 */

const db = () => createServiceClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** template 2306 — the variables the editor offers, and the only ones allowed. */
export const TEMPLATE_VARIABLES = [
  "user_name",
  "listing_title",
  "price",
  "area",
  "plan_name",
  "expiry_date",
  "amount",
  "ticket_id",
  "link",
  "otp",
] as const;

export async function templateDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("message_templates").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: locales } = await db()
    .from("message_template_locales")
    .select("lang, subject, body, updated_at")
    .eq("template_id", id);
  return { ...data, locales: locales ?? [] };
}

function unknownVariables(body: string, subject: string | null): string[] {
  const allowed = new Set<string>(TEMPLATE_VARIABLES);
  const found = new Set<string>();
  for (const text of [body, subject ?? ""]) {
    for (const m of text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) found.add(m[1].toLowerCase());
  }
  return [...found].filter((v) => !allowed.has(v));
}

export async function saveTemplate(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const id = isUuid(body.id) ? body.id : null;
  if (!id) return { ok: false, message: "Not found" };
  const { data: before } = await db().from("message_templates").select("*").eq("id", id).maybeSingle();
  const tpl = before as { id: string; name: string; code: string; channel: string } | null;
  if (!tpl) return { ok: false, message: "Not found" };

  const lang = ["en", "gu", "hi"].includes(String(body.lang)) ? String(body.lang) : "en";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : null;
  if (!text) return { ok: false, message: "The body cannot be empty" };
  if (tpl.channel === "email" && lang === "en" && !subject)
    return { ok: false, message: "An email template needs a subject" };

  const bad = unknownVariables(text, subject);
  if (bad.length)
    return {
      ok: false,
      message: `No such variable: ${bad.map((b) => `{{${b}}}`).join(", ")}`,
    };

  // An SMS body over 160 characters is silently billed and delivered as more
  // than one message. The design prints the count; this makes it a rule.
  if (tpl.channel === "sms" && text.length > 480)
    return { ok: false, message: `That is ${text.length} characters — SMS is capped at 3 parts (480)` };

  const { error } = await db().from("message_template_locales").upsert(
    {
      template_id: id,
      lang,
      subject,
      body: text,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template_id,lang" },
  );
  if (error) return { ok: false, message: error.message };

  const patch: Record<string, unknown> = {
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (typeof body.provider_ref === "string") patch.provider_ref = body.provider_ref.trim() || null;
  // English stays mirrored onto the parent row: everything that has not been
  // switched to the locale table still reads `message_templates.body`, and a
  // divergence there would send an old wording nobody can see on this screen.
  if (lang === "en") {
    patch.body = text;
    patch.subject = subject;
  }
  await db().from("message_templates").update(patch).eq("id", id);
  invalidateTemplates();

  await writeAudit(me, {
    action: "template_edit",
    entityType: "message_template",
    entityId: id,
    entityLabel: `${tpl.name} (${tpl.channel}/${lang})`,
    summary: `Template updated — ${tpl.name} · ${lang.toUpperCase()}`,
    diff: { lang, chars: text.length },
  });
  return { ok: true, label: tpl.name, summary: `${tpl.name} saved · ${lang.toUpperCase()}` };
}

/**
 * Templates nothing may switch off. `otp_login` is the sign-in path for every
 * user on the site; `invoice` is a statutory GST document we are required to
 * issue on a paid order.
 */
const UNDISABLEABLE = new Set(["otp_login", "invoice"]);

export async function toggleTemplate(
  id: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("message_templates")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();
  const tpl = data as { id: string; name: string; code: string } | null;
  if (!tpl) return { ok: false, message: "Not found" };
  // OTP is how anyone signs in. Disabling it locks every user out of the site,
  // and no toast makes that recoverable from inside the panel.
  //
  // Matched against the code the table actually holds. The first version of
  // this guard tested `code.startsWith("auth.")`, and no template code carries
  // that prefix — so the guard never fired and `otp_login` was one click from
  // being switched off.
  if (!active && UNDISABLEABLE.has(tpl.code))
    return { ok: false, message: "Authentication templates cannot be disabled" };

  await db().from("message_templates").update({ is_active: active }).eq("id", id);
  invalidateTemplates();
  await writeAudit(me, {
    action: "template_edit",
    entityType: "message_template",
    entityId: id,
    entityLabel: tpl.name,
    summary: `${tpl.name} ${active ? "enabled" : "disabled"}`,
    diff: { is_active: active },
  });
  return { ok: true, label: tpl.name, summary: `${tpl.name} ${active ? "enabled" : "disabled"}` };
}

/**
 * "Test send" (template 2312). It sends the REAL template, rendered, to the
 * admin's own account — not a fixture. A test that does not exercise the
 * rendering is a test of nothing.
 */
export async function testSendTemplate(
  id: string,
  lang: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const tpl = await templateDetail(id);
  if (!tpl) return { ok: false, message: "Not found" };

  const locales = (tpl.locales ?? []) as { lang: string; subject: string | null; body: string }[];
  const chosen = locales.find((l) => l.lang === lang) ?? locales.find((l) => l.lang === "en");
  if (!chosen) return { ok: false, message: "That template has no body to send" };

  // Sample values, clearly marked as samples so nobody mistakes a test email
  // for a real one.
  const sample: Record<string, string> = {
    user_name: me.name,
    listing_title: "3 BHK Flat, Shree Residency",
    price: "₹48,00,000",
    area: "Mavdi",
    plan_name: "₹999 Listing Plan",
    expiry_date: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-IN"),
    amount: "₹943",
    ticket_id: "TKT-0001",
    link: "https://homzlist.com",
    otp: "0000",
  };
  const render = (s: string) =>
    s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => sample[k.toLowerCase()] ?? `{{${k}}}`);

  const channel = String((tpl as { channel: string }).channel);
  // The channel names differ between the two systems by one word, and only
  // three of A21's four map onto something we can actually send.
  const sendChannel = channel === "email" ? "email" : channel === "whatsapp" ? "whatsapp" : "in_app";
  const res = await sendAdminMessage(
    [me.id],
    me,
    [sendChannel],
    `[TEST] ${render(chosen.subject ?? (tpl as { name: string }).name)}`,
    render(chosen.body),
  );
  if (!res.ok) return { ok: false, message: res.message ?? "Test send failed" };

  await db()
    .from("message_templates")
    .update({ last_test_at: new Date().toISOString() })
    .eq("id", id);
  await writeAudit(me, {
    action: "template_test",
    entityType: "message_template",
    entityId: id,
    entityLabel: (tpl as { name: string }).name,
    summary: `Test send — ${(tpl as { name: string }).name} (${lang.toUpperCase()}) — ${res.summary}`,
  });
  return { ok: true, label: (tpl as { name: string }).name, summary: `Test sent — ${res.summary}` };
}

/* ══════════════════════════════════════════════════ tab 5 · UI strings ═════ */

export async function saveString(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return { ok: false, message: "Not found" };
  const { data: before } = await db().from("ui_strings").select("*").eq("key", key).maybeSingle();
  if (!before) return { ok: false, message: "Not found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const lang of ["en", "gu", "hi"] as const) {
    if (typeof body[lang] === "string") patch[lang] = (body[lang] as string).slice(0, 500) || null;
  }
  // An empty English string leaves a screen with a blank label in every
  // language, because the other two fall back to it.
  if (patch.en === null || patch.en === "")
    return { ok: false, message: "English is the fallback — it cannot be empty" };

  const { error } = await db().from("ui_strings").update(patch).eq("key", key);
  if (error) return { ok: false, message: error.message };
  invalidateStrings();

  await writeAudit(me, {
    action: "string_edit",
    entityType: "ui_string",
    entityLabel: key,
    summary: `String updated — ${key}`,
    diff: { before, after: patch },
  });
  return { ok: true, label: key, summary: "Translation updated · logged" };
}

/**
 * "Import" (template 2318). CSV: key,en,gu,hi.
 *
 * Unknown keys are REPORTED, not created. A translator's spreadsheet with a
 * typo'd key would otherwise quietly add a string no screen ever reads, and
 * the missing-translation count would go down without anything being fixed.
 */
export async function importStrings(csv: string, me: AdminIdentity): Promise<ActionResult> {
  const lines = String(csv ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { ok: false, message: "Nothing to import" };

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = parseRow(lines[0]).map((h) => h.toLowerCase());
  const start = header[0] === "key" ? 1 : 0;
  const col = (name: string) => header.indexOf(name);

  const { data: known } = await db().from("ui_strings").select("key");
  const keys = new Set(((known ?? []) as { key: string }[]).map((k) => k.key));

  let updated = 0;
  const missing: string[] = [];
  for (const line of lines.slice(start, start + 2000)) {
    const cells = parseRow(line);
    const key = cells[start === 1 ? col("key") : 0] ?? "";
    if (!key) continue;
    if (!keys.has(key)) {
      missing.push(key);
      continue;
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const lang of ["en", "gu", "hi"] as const) {
      const idx = start === 1 ? col(lang) : ["key", "en", "gu", "hi"].indexOf(lang);
      if (idx >= 0 && cells[idx] !== undefined && cells[idx] !== "") patch[lang] = cells[idx];
    }
    if (Object.keys(patch).length > 1) {
      await db().from("ui_strings").update(patch).eq("key", key);
      updated++;
    }
  }
  invalidateStrings();

  await writeAudit(me, {
    action: "string_import",
    entityType: "ui_string",
    entityLabel: `${updated} strings`,
    summary: `CSV import — ${updated} updated, ${missing.length} unknown key(s) skipped`,
    diff: { updated, unknown: missing.slice(0, 20) },
  });
  return {
    ok: true,
    label: `${updated} strings`,
    summary: missing.length
      ? `${updated} updated · ${missing.length} unknown key(s) skipped`
      : `${updated} updated`,
    data: { unknown: missing.slice(0, 20) },
  };
}

/** "Export" (template 2319) — the same four columns the import reads. */
export async function exportStrings(): Promise<string> {
  const { data } = await db().from("ui_strings").select("key, en, gu, hi").order("key");
  const esc = (v: string | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = ((data ?? []) as { key: string; en: string; gu: string | null; hi: string | null }[])
    .map((r) => [esc(r.key), esc(r.en), esc(r.gu), esc(r.hi)].join(","));
  return ["key,en,gu,hi", ...rows].join("\n");
}
