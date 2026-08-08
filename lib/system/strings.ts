/**
 * Admin-editable UI copy (A20 → UI strings). `ui_strings` was written by the
 * panel and read by NOTHING, so editing a label changed nothing on the site.
 * This is the reader.
 *
 * SAFETY CONTRACT — a string edit can never blank or corrupt the UI:
 *   • unknown key            → the caller's own hardcoded default is used,
 *   • empty/whitespace value → the default is used,
 *   • DB error               → the default is used.
 * Call it as `t("common.save", "Save")` — the second argument is what ships
 * today, so adopting this is a no-op until an admin actually edits the row.
 *
 * LANGUAGE: English only for now. `multi_language` (A22) is OFF and the gu/hi
 * columns are not trustworthy yet (see docs/issues/admin-crud-live-findings.md —
 * most seeded rows are auto-generated with translations that do not match their
 * English). `lang` is accepted so the call sites do not have to change when
 * multi-language is switched on, but anything other than "en" falls back to en.
 */
import { createServiceClient } from "@/lib/supabase/server";

export type Lang = "en" | "gu" | "hi";

interface StringRow {
  en: string | null;
  gu: string | null;
  hi: string | null;
}

let cache: { at: number; map: Map<string, StringRow> } | null = null;
const TTL_MS = 60_000;

/** Called by A20's string save/import so an edit is live on the next render. */
export function invalidateStrings(): void {
  cache = null;
}

async function loadStrings(): Promise<Map<string, StringRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const { data } = await createServiceClient().from("ui_strings").select("key, en, gu, hi");
    const map = new Map<string, StringRow>();
    for (const r of (data ?? []) as (StringRow & { key: string })[])
      map.set(r.key, { en: r.en, gu: r.gu, hi: r.hi });
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache?.map ?? new Map();
  }
}

/**
 * The admin's copy for `key`, or `fallback` when there is nothing usable.
 * `fallback` is REQUIRED so a missing row can never render an empty label.
 */
export async function t(key: string, fallback: string, lang: Lang = "en"): Promise<string> {
  const row = (await loadStrings()).get(key);
  if (!row) return fallback;
  // Multi-language is not live yet: always prefer `en`, and only consider a
  // translation once the flag is on AND the column is actually filled.
  const value = lang === "en" ? row.en : (row[lang] ?? row.en);
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

/** Batch form for a screen that needs several strings in one render. */
export async function tMany(
  entries: Record<string, string>,
  lang: Lang = "en",
): Promise<Record<string, string>> {
  const map = await loadStrings();
  const out: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(entries)) {
    const row = map.get(key);
    const value = row ? (lang === "en" ? row.en : (row[lang] ?? row.en)) : null;
    out[key] = (value ?? "").trim() || fallback;
  }
  return out;
}
