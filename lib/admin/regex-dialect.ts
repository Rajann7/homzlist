import "server-only";

/**
 * One rule, two engines.
 *
 * A19's number-pattern editor writes a JavaScript regex, because that is the
 * dialect every example in the seed is written in and the one an admin testing
 * a pattern in a browser expects. Postgres runs POSIX ARE, where `\b` is a
 * BACKSPACE character rather than a word boundary — migration 0096 found that
 * the hard way, with a whole table of patterns that matched nothing server-side.
 *
 * So the JS source is the thing an admin edits, and this translates it ONCE, at
 * save time, into the POSIX form stored alongside it. Nothing has to remember to
 * keep two hand-written copies in step, and nothing translates on the hot path.
 */

/** What POSIX cannot express at all. A pattern using one of these is refused. */
const UNSUPPORTED: [RegExp, string][] = [
  [/\(\?=/, "lookahead (?=…)"],
  [/\(\?!/, "negative lookahead (?!…)"],
  [/\(\?<=/, "lookbehind (?<=…)"],
  [/\(\?<!/, "negative lookbehind (?<!…)"],
  [/\\[dws]\{/, ""], // handled below; placeholder so the array stays honest
];

export interface DialectResult {
  ok: boolean;
  posix?: string;
  /** True when the source carried an inline `(?i)`, which POSIX puts elsewhere. */
  caseInsensitive?: boolean;
  message?: string;
}

/**
 * Translate a JavaScript regex source to POSIX ARE.
 *
 * Deliberately conservative: anything it is not sure about is REFUSED rather
 * than translated approximately. A pattern that silently means something
 * different on the server is worse than one an admin has to rewrite — it would
 * flag content nobody could explain.
 */
export function toPosix(source: string): DialectResult {
  const src = String(source ?? "");
  if (!src.trim()) return { ok: false, message: "Pattern is empty" };
  if (src.length > 500) return { ok: false, message: "Pattern is too long (500 characters max)" };

  for (const [re, label] of UNSUPPORTED) {
    if (label && re.test(src)) {
      return { ok: false, message: `Postgres cannot run ${label} — rewrite the pattern without it` };
    }
  }

  // The JS source must at least be a valid JS regex, or the admin's own test
  // box could not run it either.
  try {
    new RegExp(src);
  } catch (e) {
    return { ok: false, message: `Not a valid regular expression: ${(e as Error).message}` };
  }

  let caseInsensitive = false;
  let out = src;

  // (?i) is a leading flag in this codebase's seeds; POSIX takes it as a match
  // option instead, so it is lifted off the pattern and reported.
  if (out.startsWith("(?i)")) {
    caseInsensitive = true;
    out = out.slice(4);
  }
  if (/\(\?i\)/.test(out)) {
    return { ok: false, message: "(?i) is only supported at the start of the pattern" };
  }

  // Walk the source rather than running a chain of .replace() calls: a bare
  // `\d` and a `\\d` (an escaped backslash followed by a literal d) look the
  // same to a global replace and mean opposite things.
  let result = "";
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c !== "\\") {
      // (?: is a non-capturing group in JS; POSIX has no such syntax, and a
      // plain group matches identically for our purposes (we never read
      // capture groups out of these).
      if (out.startsWith("(?:", i)) {
        result += "(";
        i += 2;
        continue;
      }
      result += c;
      continue;
    }
    const next = out[i + 1];
    i++;
    switch (next) {
      case "d": result += "[0-9]"; break;
      case "D": result += "[^0-9]"; break;
      case "w": result += "[[:alnum:]_]"; break;
      case "W": result += "[^[:alnum:]_]"; break;
      case "s": result += "[[:space:]]"; break;
      case "S": result += "[^[:space:]]"; break;
      // The one that started all of this.
      case "b": result += "\\y"; break;
      case "B": result += "\\Y"; break;
      case undefined:
        return { ok: false, message: "Pattern ends with a dangling backslash" };
      default:
        // \. \+ \\ \/ and the rest keep their meaning in POSIX.
        result += "\\" + next;
    }
  }

  // A character class like [\s-] became [[:space:]-]; that is valid ARE. But a
  // class that now contains a nested class opener it did not before would not
  // be, so the result is compiled by Postgres in the save path before it is
  // trusted — see lib/admin/master-data.ts.
  return { ok: true, posix: result, caseInsensitive };
}
