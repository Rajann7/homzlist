/**
 * The tiny Markdown subset the CMS, Help and Blog readers accept.
 *
 * Not a general Markdown parser, and deliberately so. Legal pages, help
 * articles and blog posts are written by us and by admins in the CMS; the risk
 * is not that an author wants a footnote, it is that a `<script>` reaches the
 * reader. So this parses a fixed vocabulary and emits STRUCTURE — never HTML —
 * which the React reader renders as elements. Nothing is ever passed to
 * dangerouslySetInnerHTML, so there is no XSS surface to get wrong.
 *
 * The vocabulary is exactly what P12's .longform draws:
 *
 *   ## Heading            → h2, with a slug id so the "Table of contents"
 *                           accordion can jump to it
 *   ### Heading           → h3
 *   - item                → bulleted list
 *   1. item               → ordered list
 *   > info: text          → the accent callout  (design: .co.co-acc)
 *   > warn: text          → the warning callout (design: .co.co-wrn)
 *   > quote: text         → the accent-bar pull quote (blog)
 *   > text                → plain blockquote
 *   text                  → paragraph
 *
 * Inline: **bold**, [label](/href). Both are parsed to spans, not HTML.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; v: string }
  | { t: "a"; v: string; href: string };

export type Block =
  | { t: "h2"; id: string; text: string; inline: Inline[] }
  | { t: "h3"; id: string; text: string; inline: Inline[] }
  | { t: "p"; inline: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "callout"; tone: "accent" | "warning"; inline: Inline[] }
  | { t: "quote"; inline: Inline[] };

export interface TocEntry {
  id: string;
  text: string;
}

export interface ParsedContent {
  blocks: Block[];
  toc: TocEntry[];
}

/** "3. Check the paperwork" → "check-the-paperwork" (stable across edits of the number). */
export function headingId(text: string): string {
  return text
    .replace(/^\s*\d+[.)]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "section";
}

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function parseInline(raw: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of raw.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: raw.slice(last, at) });
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push({ t: "b", v: tok.slice(2, -2) });
    } else {
      const cut = tok.indexOf("](");
      const label = tok.slice(1, cut);
      const href = tok.slice(cut + 2, -1);
      // Only in-app paths and https links survive; `javascript:` and friends are
      // rendered as plain text rather than as an anchor.
      const safe = href.startsWith("/") || /^https?:\/\//i.test(href);
      out.push(safe ? { t: "a", v: label, href } : { t: "text", v: label });
    }
    last = at + tok.length;
  }
  if (last < raw.length) out.push({ t: "text", v: raw.slice(last) });
  return out.length ? out : [{ t: "text", v: raw }];
}

export function parseContent(md: string): ParsedContent {
  const blocks: Block[] = [];
  const toc: TocEntry[] = [];
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  const seen = new Map<string, number>();
  const uniqueId = (base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // headings
    const h = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      const text = h[2].trim();
      const id = uniqueId(headingId(text));
      const block = { t: h[1].length === 2 ? "h2" : "h3", id, text, inline: parseInline(text) } as Block;
      blocks.push(block);
      if (h[1].length === 2) toc.push({ id, text });
      i++;
      continue;
    }

    // blockquote family — callouts and pull quotes
    if (trimmed.startsWith(">")) {
      // consecutive `>` lines join into one block
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const body = buf.join(" ").trim();
      const tagged = /^(info|warn|warning|quote)\s*:\s*([\s\S]*)$/i.exec(body);
      if (tagged) {
        const kind = tagged[1].toLowerCase();
        const text = tagged[2].trim();
        if (kind === "quote") blocks.push({ t: "quote", inline: parseInline(text) });
        else blocks.push({ t: "callout", tone: kind === "info" ? "accent" : "warning", inline: parseInline(text) });
      } else {
        blocks.push({ t: "quote", inline: parseInline(body) });
      }
      continue;
    }

    // lists
    if (/^[-*]\s+/.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      blocks.push({ t: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^\d+[.)]\s+/, "")));
        i++;
      }
      blocks.push({ t: "ol", items });
      continue;
    }

    // paragraph — consecutive plain lines join, blank line ends it
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,3}\s|>|[-*]\s|\d+[.)]\s)/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ t: "p", inline: parseInline(buf.join(" ")) });
  }

  return { blocks, toc };
}

/** Plain text, for meta descriptions and search snippets. */
export function toPlainText(md: string, max = 300): string {
  const text = (md ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s*(info|warn|warning|quote)\s*:\s*/gim, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** ~200 wpm, floor of 1 — used only where an author has not set read_minutes. */
export function readMinutes(md: string): number {
  const words = toPlainText(md, Number.MAX_SAFE_INTEGER).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
