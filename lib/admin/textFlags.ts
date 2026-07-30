import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Number / contact detection for the review screens (Doc5 A4: "number-detection
 * highlight", A8: the auto-flag appeal showing "the highlighted content").
 *
 * The patterns come from `number_patterns`, which is the table A22's Settings
 * screen edits — so retiring a false-positive pattern is a config change, not a
 * deploy (CLAUDE.md rule 7). A4 needs the SPANS, not a boolean: the design
 * highlights the offending digits inside the description, which means knowing
 * where each match starts and ends.
 *
 * NOTE (found while building A4, tracked in docs/PENDING-INTEGRATIONS.md):
 * `lib/listings/validate.ts` still carries its own hardcoded four-pattern array
 * and never reads this table, so a listing can pass submit-time detection using
 * a pattern an admin configured here (Gujarati digits, leetspeak, wa.me links).
 * This module deliberately reads the table so the ADMIN sees everything the
 * config claims to catch; unifying the submit path is a Module 4 change.
 */

export interface FlagSpan {
  start: number;
  end: number;
  text: string;
  /** `number_patterns.label` — what the reviewer is told it matched. */
  label: string;
  action: "block" | "flag";
}

export interface FlaggedText {
  /** The original string, unmodified — the reviewer must read what was written. */
  text: string;
  /** Alternating plain/flagged pieces, in order, ready to render. */
  parts: Array<{ text: string; flag: FlagSpan | null }>;
  spans: FlagSpan[];
}

interface PatternRow {
  label: string;
  pattern: string;
  action: string;
}

let cache: { at: number; rows: PatternRow[] } | null = null;
const TTL_MS = 60_000;

async function patterns(): Promise<PatternRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const db = createServiceClient();
  const { data } = await db
    .from("number_patterns")
    .select("label, pattern, action")
    .eq("is_active", true);
  const rows = ((data ?? []) as PatternRow[]).filter((r) => r.pattern);
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * The stored patterns are written in a portable syntax that allows a leading
 * `(?i)` inline flag; JavaScript's RegExp does not support inline flags and
 * throws on them, which would have taken the whole review screen down rather
 * than skipping one pattern. Translated, not dropped.
 */
function compile(pattern: string): RegExp | null {
  let src = pattern;
  let flags = "g";
  const inline = /^\(\?([imsu]+)\)/.exec(src);
  if (inline) {
    src = src.slice(inline[0].length);
    flags += inline[1];
  }
  try {
    return new RegExp(src, flags);
  } catch {
    // A pattern an admin typed wrong must not break review. A22 is where it
    // gets fixed; here it simply doesn't match anything.
    return null;
  }
}

/** Non-overlapping spans, earliest and longest first. */
export async function flagText(text: string | null | undefined): Promise<FlaggedText> {
  const src = text ?? "";
  if (!src.trim()) return { text: src, parts: src ? [{ text: src, flag: null }] : [], spans: [] };

  const found: FlagSpan[] = [];
  for (const p of await patterns()) {
    const re = compile(p.pattern);
    if (!re) continue;
    for (const m of src.matchAll(re)) {
      if (m.index === undefined || !m[0]) continue;
      found.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        label: p.label,
        action: p.action === "block" ? "block" : "flag",
      });
    }
  }

  // Two patterns matching the same digits must highlight once. The longer match
  // wins so "+91 98250 12345" is highlighted whole rather than losing its prefix.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const spans: FlagSpan[] = [];
  for (const s of found) {
    if (spans.length && s.start < spans[spans.length - 1].end) continue;
    spans.push(s);
  }

  const parts: FlaggedText["parts"] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) parts.push({ text: src.slice(cursor, s.start), flag: null });
    parts.push({ text: src.slice(s.start, s.end), flag: s });
    cursor = s.end;
  }
  if (cursor < src.length) parts.push({ text: src.slice(cursor), flag: null });

  return { text: src, parts, spans };
}
