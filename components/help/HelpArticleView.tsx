"use client";

import { useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { List, Row, SectionH, StillNeedHelp } from "./primitives";
import { ArticleFeedback } from "./ArticleFeedback";
import { ShareSheet } from "./ShareSheet";

/**
 * P12 S1 — the help article reader: title, updated + read-time meta, long-form
 * body, related articles, the helpful card, and the support CTA.
 *
 * The body is rendered on the server and passed as children so the article is
 * crawlable and readable without JS; this shell owns only the share sheet.
 */
export function HelpArticleView({
  slug,
  title,
  metaLine,
  related,
  base = "",
  supportHref,
  shareUrl,
  initialVerdict,
  children,
}: {
  slug: string;
  title: string;
  metaLine: string;
  related: Array<{ slug: string; title: string }>;
  base?: string;
  supportHref: string;
  shareUrl: string;
  initialVerdict: boolean | null;
  children: React.ReactNode;
}) {
  const [share, setShare] = useState(false);

  return (
    <AppShell
      header={
        <Header
          left={<BackButton fallback={`${base}/help`} />}
          title="Help centre"
          right={
            <button
              type="button"
              onClick={() => setShare(true)}
              aria-label="Share article"
              className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
            >
              <Icon name="share" size={24} />
            </button>
          }
        />
      }
    >
      <div className="p-4 text-15 leading-[1.6] text-ink-primary">
        <h1 className="text-20 font-bold leading-[1.3]">{title}</h1>
        <p className="mb-4 mt-1.5 text-11 text-ink-tertiary">{metaLine}</p>
        {children}
      </div>

      {related.length > 0 && (
        <>
          <SectionH>Related articles</SectionH>
          <List>
            {related.map((r) => (
              <Row key={r.slug} icon="file" label={r.title} href={`${base}/help/a/${r.slug}`} />
            ))}
          </List>
        </>
      )}

      <ArticleFeedback slug={slug} initialVerdict={initialVerdict} />
      <StillNeedHelp href={supportHref} />
      <div className="h-6" />

      <ShareSheet open={share} onClose={() => setShare(false)} url={shareUrl} title={title} />
    </AppShell>
  );
}
