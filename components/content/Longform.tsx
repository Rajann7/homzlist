import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { parseContent, type Block, type Inline, type TocEntry } from "@/lib/content/markdown";

/**
 * P12's `.longform` — the one reader shared by legal pages, help articles and
 * blog posts, because the design gives all three the same body treatment:
 * 15/1.6 body, h2 at 17/600 with 24px above and 8 below, 12px paragraph gaps,
 * 22px list indent with 8px between items, and the two callout tints.
 *
 * Structure in, elements out. `parseContent` returns blocks; nothing here ever
 * touches dangerouslySetInnerHTML, so admin-authored CMS copy cannot inject
 * markup into a page a guest is reading.
 */

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "b") return <b key={i} className="font-semibold">{p.v}</b>;
        if (p.t === "a") {
          return p.href.startsWith("/") ? (
            <Link key={i} href={p.href} className="text-accent">{p.v}</Link>
          ) : (
            <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent">
              {p.v}
            </a>
          );
        }
        return <span key={i}>{p.v}</span>;
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h2":
      return (
        <h2 id={b.id} className="scroll-mt-28 pt-6 pb-2 text-17 font-semibold text-ink-primary">
          <Inlines parts={b.inline} />
        </h2>
      );
    case "h3":
      return (
        <h3 id={b.id} className="scroll-mt-28 pt-4 pb-1.5 text-15 font-semibold text-ink-primary">
          <Inlines parts={b.inline} />
        </h3>
      );
    case "p":
      return (
        <p className="mb-3 text-15 leading-[1.6] text-ink-primary">
          <Inlines parts={b.inline} />
        </p>
      );
    case "ul":
      return (
        <ul className="mb-3 flex list-disc flex-col gap-2 pl-[22px] text-15 leading-[1.6] text-ink-primary">
          {b.items.map((it, i) => <li key={i}><Inlines parts={it} /></li>)}
        </ul>
      );
    case "ol":
      return (
        <ol className="mb-3 flex list-decimal flex-col gap-2 pl-[22px] text-15 leading-[1.6] text-ink-primary">
          {b.items.map((it, i) => <li key={i}><Inlines parts={it} /></li>)}
        </ol>
      );
    case "callout":
      return (
        <div
          className={`mb-3 flex items-start gap-2.5 rounded-8 p-3 text-13 leading-[1.5] text-ink-primary ${
            b.tone === "accent" ? "bg-accent-soft" : "bg-warning-soft"
          }`}
        >
          <Icon
            name={b.tone === "accent" ? "info" : "alert"}
            size={18}
            className={`mt-px shrink-0 ${b.tone === "accent" ? "text-accent" : "text-warning"}`}
          />
          <span><Inlines parts={b.inline} /></span>
        </div>
      );
    case "quote":
      return (
        <blockquote className="my-4 border-l-[3px] border-accent py-1 pl-4 text-17 italic leading-[1.5] text-ink-secondary">
          <Inlines parts={b.inline} />
        </blockquote>
      );
  }
}

export function Longform({ md, className }: { md: string; className?: string }) {
  const { blocks } = parseContent(md);
  return (
    <div className={className ?? "px-4 pb-2 pt-1"}>
      {blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </div>
  );
}

/** The heading list a Table of contents accordion is built from. */
export function tocOf(md: string): TocEntry[] {
  return parseContent(md).toc;
}
