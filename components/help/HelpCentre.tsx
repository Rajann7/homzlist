"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { helpApi, type HelpIndex, type HelpArticleRow } from "@/lib/content/client";

/**
 * P12 S1 — Help centre.
 *
 * Exactly the design: search field, chip row, a 2-column grid of category
 * tiles with their article counts, "Popular articles", the empty state, and the
 * "Still need help?" card.
 *
 * The one thing the prototype does client-side and this does not is SEARCH. The
 * prototype hides DOM nodes; here the query goes to the server, because "No
 * articles found for 'xyz'" has to be true of all 52 articles, not of the six
 * the popular list happens to be holding.
 */
export function HelpCentre({ base = "" }: { base?: string }) {
  const router = useRouter();
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [results, setResults] = useState<HelpArticleRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await helpApi.index();
    if (r.ok) { setIndex(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const r = await helpApi.search(q);
      setSearching(false);
      setResults(r.ok ? r.data.results : []);
    }, 220);
  }, []);

  const onQuery = (v: string) => {
    setQuery(v);
    setActiveChip(null);
    runSearch(v);
  };

  const onChip = (label: string, chipQuery: string) => {
    const next = activeChip === label ? null : label;
    setActiveChip(next);
    setQuery(next ? label : "");
    runSearch(next ? chipQuery : "");
  };

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Help centre" />;
  const go = (path: string) => router.push(`${base}${path}`);

  if (!index) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to load the help centre.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="p-4">
            <Skeleton className="h-10 w-full rounded-8" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[104px] rounded-12" />)}
            </div>
          </div>
        )}
      </AppShell>
    );
  }

  const showingResults = results !== null;

  return (
    <AppShell header={header}>
      {/* search — h40, surface-2, 8px radius, 8/16 margins */}
      <div className="mx-4 mt-2 flex h-10 items-center gap-2 rounded-8 bg-surface-2 px-3 text-ink-tertiary">
        <Icon name="search" size={20} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
        />
        {query && (
          <button aria-label="Clear search" onClick={() => onQuery("")} className="chrome text-ink-tertiary">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {/* chip row */}
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {index.chips.map((c) => (
          <button
            key={c.label}
            onClick={() => onChip(c.label, c.query)}
            className={`chrome inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-13 transition-transform active:scale-[0.98] ${
              activeChip === c.label
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-transparent bg-surface-2 text-ink-primary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {showingResults ? (
        results.length === 0 && !searching ? (
          /* empty state — the design's exact copy and CTA */
          <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
            <Icon name="search" size={96} strokeWidth={1} className="text-ink-tertiary" />
            <p className="text-17 font-semibold text-ink-primary">
              No articles found for &lsquo;{query}&rsquo;
            </p>
            <p className="text-13 text-ink-secondary">Try different words or contact support</p>
            <Button variant="outline" className="mt-2" onClick={() => go("/help/contact")}>
              Contact support
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <h2 className="mx-4 mb-2 mt-4 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
              {searching ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </h2>
            {results.map((a) => (
              <ArticleRow key={a.slug} article={a} onClick={() => go(`/help/article/${a.slug}`)} />
            ))}
          </div>
        )
      ) : (
        <>
          {/* category tiles — 2 columns, 12px gap, surface-2, 12 radius, 16 pad */}
          <div className="grid grid-cols-2 gap-3 px-4 pt-2">
            {index.categories.map((c) => (
              <button
                key={c.slug}
                onClick={() => go(`/help/${c.slug}`)}
                className="chrome flex flex-col items-start gap-2 rounded-12 bg-surface-2 p-4 text-left transition-transform active:scale-[0.98]"
              >
                <Icon name={c.icon as never} size={32} className="text-accent" />
                <span className="text-13 font-semibold text-ink-primary">{c.title}</span>
                <span className="-mt-1.5 text-11 text-ink-tertiary">
                  {c.articleCount} article{c.articleCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>

          <h2 className="mx-4 mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
            Popular articles
          </h2>
          <div className="flex flex-col">
            {index.popular.map((a) => (
              <ArticleRow key={a.slug} article={a} onClick={() => go(`/help/article/${a.slug}`)} />
            ))}
          </div>
        </>
      )}

      <StillNeedHelp onContact={() => go("/help/contact")} />
      <div className="h-4" />
    </AppShell>
  );
}

function ArticleRow({ article, onClick }: { article: HelpArticleRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="chrome flex min-h-14 w-full items-center gap-3 border-b border-divider px-4 py-2 text-left last:border-b-0 active:bg-surface-2"
    >
      <Icon name="file" size={20} className="shrink-0 text-ink-tertiary" />
      <span className="flex-1 text-15 text-ink-primary">{article.question}</span>
      <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
    </button>
  );
}

/** The accent-soft "Still need help?" card the design repeats on all three S1 screens. */
export function StillNeedHelp({ onContact }: { onContact: () => void }) {
  return (
    <div className="px-4 pt-6">
      <div className="flex items-center gap-3 rounded-12 bg-accent-soft p-4">
        <Icon name="headset" size={32} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-15 font-semibold text-ink-primary">Still need help?</p>
          <p className="text-11 text-ink-secondary">Our team replies within 24 hours</p>
        </div>
        <Button size="small" onClick={onContact}>Contact support</Button>
      </div>
    </div>
  );
}
