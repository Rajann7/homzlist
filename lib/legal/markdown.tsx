import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The tiny markup dialect the CMS bodies are written in, rendered to exactly the
 * long-form typography designs/P12 draws (`.longform`: 15/1.6 body, 17/600 H2,
 * 12px paragraph gaps, 22px list indent with 8px between items) plus the `.co`
 * callouts, the blog blockquote, and the figure-with-caption.
 *
 *   ## Heading                     → H2 (also feeds the Table of contents)
 *   plain paragraph                → <p>
 *   - item / 1. item               → <ul> / <ol>
 *   **bold**                       → <strong>
 *   [label](/href)                 → in-app Link (or <a> for absolute URLs)
 *   > info: text                   → accent callout
 *   > warn: text                   → warning callout
 *   > quote: text                  → pull-quote (blog)
 *   > figure: caption              → 16:9 placeholder + caption (blog)
 *
 * Deliberately NOT a general markdown/HTML renderer: the bodies are admin-edited,
 * so anything that could carry markup into the page is a stored-XSS vector. Only
 * these constructs are recognised and everything else is emitted as text
 * (Doc9 §9). No `dangerouslySetInnerHTML` anywhere in this file.
 */

export interface Section {
  id: string;
  title: string;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** The H2s of a body, in order — the source of the Table of contents. */
export function tableOfContents(body: string): Section[] {
  const out: Section[] = [];
  const seen = new Set<string>();
  for (const line of body.split("\n")) {
    const m = /^##\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const title = stripMarks(m[1].trim());
    let id = `s-${slugify(title)}`;
    let n = 2;
    while (seen.has(id)) id = `s-${slugify(title)}-${n++}`;
    seen.add(id);
    out.push({ id, title });
  }
  return out;
}

const stripMarks = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((.+?)\)/g, "$1");

/** Substitute {{token}} placeholders from legal_settings. Unknown tokens survive
 *  as-is so a missing value is visible rather than silently blank. */
export function fillPlaceholders(body: string, values: Record<string, string | number>) {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = values[key];
    return v === undefined || v === null || v === "" ? whole : String(v);
  });
}

// ---------------------------------------------------------------- inline pass

/** **bold** and [label](href), as React nodes. Text is never injected as HTML. */
function inline(text: string, keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}i${i++}`;
    if (m[1] !== undefined) {
      nodes.push(<strong key={key} className="font-semibold">{m[1]}</strong>);
    } else {
      const href = m[3];
      const label = m[2];
      nodes.push(
        href.startsWith("http") ? (
          <a key={key} href={href} rel="nofollow noopener noreferrer" target="_blank" className="text-accent">
            {label}
          </a>
        ) : (
          <Link key={key} href={href} className="text-accent">{label}</Link>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ---------------------------------------------------------------- block pass

const CALLOUT = {
  info: { box: "bg-accent-soft", icon: "info", tint: "text-accent" },
  warn: { box: "bg-warning-soft", icon: "alert", tint: "text-warning" },
} as const;

function Callout({ kind, children }: { kind: "info" | "warn"; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    <div className={`mb-3 flex items-start gap-[10px] rounded-8 p-3 text-13 leading-[1.5] text-ink-primary ${c.box}`}>
      <Icon name={c.icon} size={18} className={`mt-px shrink-0 ${c.tint}`} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Render a CMS/blog/help body. `headings` lets the caller pass the same TOC ids
 * back in so the anchor targets and the contents list can never disagree.
 */
export function renderBody(body: string, headings?: Section[]): ReactNode {
  const toc = headings ?? tableOfContents(body);
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let h = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i += 1; continue; }

    // ## heading
    const head = /^##\s+(.+)$/.exec(t);
    if (head) {
      const sec = toc[h];
      h += 1;
      out.push(
        <h2
          key={`h${i}`}
          id={sec?.id}
          className="mb-2 mt-6 scroll-mt-[108px] text-17 font-semibold text-ink-primary first:mt-3"
        >
          {inline(head[1], `h${i}`)}
        </h2>,
      );
      i += 1;
      continue;
    }

    // > kind: text
    const block = /^>\s*(info|warn|quote|figure):\s*(.+)$/.exec(t);
    if (block) {
      const [, kind, text] = block;
      if (kind === "info" || kind === "warn") {
        out.push(<Callout key={`c${i}`} kind={kind}>{inline(text, `c${i}`)}</Callout>);
      } else if (kind === "quote") {
        out.push(
          <blockquote
            key={`q${i}`}
            className="my-4 border-l-[3px] border-accent py-1 pl-4 text-17 italic text-ink-secondary"
          >
            {`“${text}”`}
          </blockquote>,
        );
      } else {
        out.push(
          <figure key={`f${i}`} className="my-4">
            <div className="flex aspect-[16/9] items-center justify-center rounded-12 bg-surface-2 text-ink-tertiary">
              <Icon name="camera" size={48} />
            </div>
            <figcaption className="mt-1.5 mb-4 text-11 text-ink-tertiary">{text}</figcaption>
          </figure>,
        );
      }
      i += 1;
      continue;
    }

    // - bullets / 1. ordered
    const bullet = /^[-*]\s+(.+)$/.exec(t);
    const number = /^\d+\.\s+(.+)$/.exec(t);
    if (bullet || number) {
      const ordered = Boolean(number);
      const items: string[] = [];
      while (i < lines.length) {
        const s = lines[i].trim();
        const b = /^[-*]\s+(.+)$/.exec(s);
        const n = /^\d+\.\s+(.+)$/.exec(s);
        if (ordered ? !n : !b) break;
        items.push((ordered ? n! : b!)[1]);
        i += 1;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={`l${i}`} className="mb-3 flex list-outside flex-col gap-2 pl-[22px] [list-style:revert]">
          {items.map((it, k) => <li key={k}>{inline(it, `l${i}-${k}`)}</li>)}
        </List>,
      );
      continue;
    }

    // paragraph (consecutive non-blank, non-special lines)
    const para: string[] = [];
    while (i < lines.length) {
      const s = lines[i].trim();
      if (!s || /^##\s/.test(s) || /^>\s*(info|warn|quote|figure):/.test(s) ||
          /^[-*]\s/.test(s) || /^\d+\.\s/.test(s)) break;
      para.push(s);
      i += 1;
    }
    out.push(<p key={`p${i}`} className="mb-3">{inline(para.join(" "), `p${i}`)}</p>);
  }

  return <Fragment>{out}</Fragment>;
}

/** Plain text of a body — used for the PDF writer and meta descriptions. */
export function bodyToText(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => {
      const t = l.trim();
      const b = /^>\s*(info|warn|quote|figure):\s*(.+)$/.exec(t);
      if (b) return b[1] === "figure" ? "" : stripMarks(b[2]);
      return stripMarks(t);
    })
    .join("\n");
}
