import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The content rules, read from the tables A19 edits.
 *
 * Before P6 there were three detectors and none of them was a table:
 *   · four regexes in lib/listings/validate.ts (listings and requirements),
 *   · one regex plus a four-word array in lib/chat/service.ts,
 *   · `hz_has_number_pattern` in SQL, for the queue's risk score.
 * `number_patterns` and `blocklist_words` held rows that nothing read, so an
 * admin disabling a rule on A19 changed nothing — the exact failure mode
 * migration 0096 wrote down and §3 of the addendum forbids.
 *
 * Now there is ONE source. The rules are cached for a minute because they are
 * read on every listing submit and every chat send, and an edit on A19 busts
 * the cache immediately (`invalidateRules`) so an admin never has to wait to
 * see their own change take effect.
 */

export type RuleScope = "listing" | "requirement" | "bio" | "chat";

export interface CompiledRule {
  id: string;
  kind: "word" | "pattern";
  label: string;
  /** 'block' refuses the content · 'flag' lets it through and queues a review. */
  action: "block" | "flag";
  scopes: RuleScope[];
  re: RegExp;
}

interface Cache {
  at: number;
  rules: CompiledRule[];
}

const TTL_MS = 60_000;
let cache: Cache | null = null;

/** Called by every A19 save so an admin's edit is live on the next request. */
export function invalidateRules(): void {
  cache = null;
}

async function load(): Promise<CompiledRule[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rules;

  const db = createServiceClient();
  const [{ data: words }, { data: patterns }] = await Promise.all([
    db
      .from("blocklist_words")
      .select("id, word, severity, applies_to, is_active")
      .eq("is_active", true),
    db
      .from("number_patterns")
      .select("id, label, pattern, action, applies_to, is_active")
      .eq("is_active", true),
  ]);

  const rules: CompiledRule[] = [];

  for (const w of (words ?? []) as {
    id: string;
    word: string;
    severity: string;
    applies_to: string[] | null;
  }[]) {
    // A word is matched whole, case-insensitively, and its own regex characters
    // are escaped — a blocklist entry is a WORD, not a pattern, and an admin
    // typing "c++" must not create a regex that fails to compile.
    const safe = w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re: RegExp;
    try {
      re = new RegExp(`(^|[^\\p{L}\\p{N}])${safe}([^\\p{L}\\p{N}]|$)`, "iu");
    } catch {
      continue;
    }
    rules.push({
      id: w.id,
      kind: "word",
      label: w.word,
      action: w.severity === "block" ? "block" : "flag",
      scopes: normaliseScopes(w.applies_to),
      re,
    });
  }

  for (const p of (patterns ?? []) as {
    id: string;
    label: string;
    pattern: string;
    action: string;
    applies_to: string[] | null;
  }[]) {
    let source = p.pattern;
    let flags = "";
    if (source.startsWith("(?i)")) {
      source = source.slice(4);
      flags = "i";
    }
    let re: RegExp;
    try {
      re = new RegExp(source, flags);
    } catch {
      // A pattern that will not compile is skipped rather than throwing: one
      // bad row must not take down every listing submit on the site. The A19
      // save path refuses to store one, so this is a backstop for rows written
      // before that path existed.
      continue;
    }
    rules.push({
      id: p.id,
      kind: "pattern",
      label: p.label,
      action: p.action === "block" ? "block" : "flag",
      scopes: normaliseScopes(p.applies_to),
      re,
    });
  }

  cache = { at: Date.now(), rules };
  return rules;
}

function normaliseScopes(raw: string[] | null): RuleScope[] {
  const all: RuleScope[] = ["listing", "requirement", "bio", "chat"];
  if (!raw || raw.length === 0) return all;
  const out = raw.filter((s): s is RuleScope => all.includes(s as RuleScope));
  return out.length ? out : all;
}

export interface RuleMatch {
  ruleId: string;
  kind: "word" | "pattern";
  label: string;
  action: "block" | "flag";
}

/**
 * Run the rules for one scope over one piece of text.
 *
 * Returns EVERY match, not the first: A19's "Hits (30d)" is per rule, so a
 * message that trips two words has to count for both.
 */
export async function checkText(text: string, scope: RuleScope): Promise<RuleMatch[]> {
  const t = String(text ?? "");
  if (!t.trim()) return [];
  const rules = await load();
  const hits: RuleMatch[] = [];
  for (const r of rules) {
    if (!r.scopes.includes(scope)) continue;
    // A global regex carries lastIndex between calls; these are compiled
    // without /g, so `.test` is safe to reuse across texts.
    if (r.re.test(t)) {
      hits.push({ ruleId: r.id, kind: r.kind, label: r.label, action: r.action });
    }
  }
  return hits;
}

/**
 * Record what matched, so A19's hit counts are a query rather than a guess.
 *
 * The user's text is deliberately NOT stored: an admin counting hits does not
 * need the sentence, and keeping it would put listing bodies and chat lines in
 * a second table with a second set of retention rules.
 *
 * Failures here are swallowed. A moderation counter must never be the reason a
 * listing fails to save.
 */
export async function recordHits(
  matches: RuleMatch[],
  where: { entityType: RuleScope; entityId?: string | null; field?: string; profileId?: string | null },
): Promise<void> {
  if (!matches.length) return;
  try {
    await createServiceClient()
      .from("content_flag_hits")
      .insert(
        matches.map((m) => ({
          rule_kind: m.kind,
          rule_id: m.ruleId,
          entity_type: where.entityType,
          entity_id: where.entityId ?? null,
          field: where.field ?? null,
          profile_id: where.profileId ?? null,
        })),
      );
  } catch {
    /* counting is not worth failing a save over */
  }
}

/** Convenience for the two callers that only need "is any of this a problem?". */
export async function scanAndRecord(
  text: string,
  where: { entityType: RuleScope; entityId?: string | null; field?: string; profileId?: string | null },
): Promise<{ blocked: RuleMatch | null; flagged: RuleMatch[] }> {
  const matches = await checkText(text, where.entityType);
  await recordHits(matches, where);
  return {
    blocked: matches.find((m) => m.action === "block") ?? null,
    flagged: matches.filter((m) => m.action === "flag"),
  };
}
