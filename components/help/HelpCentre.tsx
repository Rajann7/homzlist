"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon, type IconName } from "@/components/ui/Icon";
import { List, Row, SectionH, ChipRow, P12Chip, StillNeedHelp, EmptyBlock } from "./primitives";
import { helpApi } from "@/lib/support/client";

/**
 * P12 S1 — Help centre. Search field, quick chips, the 8 category cards with
 * their live article counts, and Popular articles.
 *
 * Search runs against the server (`GET /help?q=`) so it reaches every article's
 * body and synonyms, not just the titles that happen to be on screen; the local
 * list is filtered instantly while the request is in flight so typing never
 * stalls. The chips set the query — exactly what the design's chips do.
 */
export interface HelpCategoryCard {
  slug: string;
  title: string;
  icon: string;
  searchTerms: string;
  articleCount: number;
}
export interface HelpPopular {
  slug: string;
  title: string;
  answer: string;
  categoryTitle: string;
  searchTerms: string;
}

const CHIPS = ["Plans", "Listings", "Payments", "Chat & Numbers", "Verification", "Account"];
/** The chip label the design shows vs the term that actually matches content. */
const CHIP_QUERY: Record<string, string> = { "Chat & Numbers": "chat" };

export function HelpCentre({
  categories,
  popular,
  base = "",
  supportHref,
}: {
  categories: HelpCategoryCard[];
  popular: HelpPopular[];
  base?: string;
  supportHref: string;
}) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ slug: string; title: string; categoryTitle: string }> | null>(null);

  const term = q.trim().toLowerCase();

  // Instant local narrowing while the server answers — the design filters as
  // you type and never shows a spinner over the list.
  const localCats = useMemo(
    () => (!term ? categories : categories.filter((c) => `${c.title} ${c.searchTerms}`.toLowerCase().includes(term))),
    [categories, term],
  );
  const localPopular = useMemo(
    () => (!term ? popular : popular.filter((p) => `${p.title} ${p.searchTerms}`.toLowerCase().includes(term))),
    [popular, term],
  );

  useEffect(() => {
    if (!term) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await helpApi.search(term);
      if (!cancelled) setResults(r.ok ? r.data.results : []);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const matches = results ?? [];
  const nothing = Boolean(term) && matches.length === 0 && localCats.length === 0 && localPopular.length === 0;

  return (
    <AppShell header={<Header left={<BackButton fallback={base || "/"} />} title="Help centre" />}>
      <div className="mx-4 mt-2 flex h-10 items-center gap-2 rounded-8 bg-surface-2 px-3 text-ink-tertiary">
        <Icon name="search" size={20} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setChip(null);
          }}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setChip(null); }} aria-label="Clear search" className="chrome">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      <ChipRow>
        {CHIPS.map((c) => (
          <P12Chip
            key={c}
            on={chip === c}
            onClick={() => {
              const next = chip === c ? null : c;
              setChip(next);
              setQ(next ? (CHIP_QUERY[next] ?? next) : "");
            }}
          >
            {c}
          </P12Chip>
        ))}
      </ChipRow>

      {nothing ? (
        <EmptyBlock
          icon="search"
          title={`No articles found for '${q.trim()}'`}
          body="Try different words or contact support"
          action={
            <Link
              href={supportHref}
              className="chrome mt-2 inline-flex h-11 items-center justify-center rounded-8 border border-border px-4 text-15 font-semibold text-ink-primary active:bg-surface-2"
            >
              Contact support
            </Link>
          }
        />
      ) : (
        <>
          {localCats.length > 0 && (
            <div className="grid grid-cols-2 gap-3 px-4 pt-2">
              {localCats.map((c) => (
                <Link
                  key={c.slug}
                  href={`${base}/help/category/${c.slug}`}
                  className="chrome flex flex-col items-start gap-2 rounded-12 bg-surface-2 p-4 active:scale-[0.99]"
                >
                  <Icon name={c.icon as IconName} size={32} className="text-accent" />
                  <span className="text-13 font-semibold text-ink-primary">{c.title}</span>
                  <span className="-mt-1.5 text-11 text-ink-tertiary">
                    {c.articleCount} article{c.articleCount === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {term ? (
            matches.length > 0 && (
              <>
                <SectionH>
                  {matches.length} result{matches.length === 1 ? "" : "s"}
                </SectionH>
                <List>
                  {matches.map((m) => (
                    <Row key={m.slug} icon="file" label={m.title} href={`${base}/help/a/${m.slug}`} />
                  ))}
                </List>
              </>
            )
          ) : (
            <>
              <SectionH>Popular articles</SectionH>
              <List>
                {popular.map((p) => (
                  <Row key={p.slug} icon="file" label={p.title} href={`${base}/help/a/${p.slug}`} />
                ))}
              </List>
            </>
          )}
        </>
      )}

      <StillNeedHelp href={supportHref} />
      <div className="h-6" />
    </AppShell>
  );
}
