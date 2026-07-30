"use client";

import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { List, Accordion, StillNeedHelp } from "./primitives";

/**
 * P12 S1 detail — a help category as an accordion of questions.
 *
 * Every row is also a real article, so the open answer ends with a link into the
 * reader instead of dead-ending at the short answer.
 */
export function HelpCategoryView({
  title,
  articles,
  base = "",
  supportHref,
}: {
  title: string;
  articles: Array<{ slug: string; title: string; answer: string }>;
  base?: string;
  supportHref: string;
}) {
  return (
    <AppShell header={<Header left={<BackButton fallback={`${base}/help`} />} title={title} />}>
      <List className="mt-1">
        {articles.map((a) => (
          <Accordion key={a.slug} title={a.title}>
            {a.answer}{" "}
            <Link href={`${base}/help/a/${a.slug}`} className="chrome inline-flex items-center gap-1 text-accent">
              Read more
              <Icon name="chevron-right" size={14} />
            </Link>
          </Accordion>
        ))}
      </List>
      <StillNeedHelp href={supportHref} />
      <div className="h-6" />
    </AppShell>
  );
}
