"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { FeedCard as Card } from "@/components/feed/FeedCard";
import { ProjectCard } from "@/components/feed/ProjectCard";
import { contactBuilder } from "@/components/feed/contactBuilder";
import { MoreSheet, ShareSheet, ReportSheet, InquirySheet, LoginSheet, SortSheet } from "@/components/feed/sheets";
import { FilterSheet } from "./FilterSheet";
import { OfflineBanner } from "./SearchHome";
import { interactionsApi, feedApi, type FeedCard as CardData } from "@/lib/feed/client";
import {
  searchApi, filtersToQuery, queryToFilters,
  type PropertySearchResponse, type SearchFilters,
} from "@/lib/search/client";
import type { AreaResult, BrokerResult, SearchSort, SearchTab } from "@/lib/search/types";
import { cn } from "@/lib/utils";

/**
 * P3 S2 — SEARCH RESULTS.
 *
 * Header: back + editable query (tap → back to the bar) + filter icon with the
 * active-filter badge. Tabs: All · Properties · Projects · Brokers & Builders ·
 * Areas. Under them: the count line and the sort pill. The All tab leads with
 * the landing-page suggestion strip, then cards, then the cascade sections.
 *
 * The count, the badge number, the cascade labels and the landing suggestion
 * are all server-computed — this component renders them and never derives one.
 * Cards are the SAME `FeedCard` the feed uses, so a property looks identical
 * wherever it appears.
 */

const TABS: { key: SearchTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "properties", label: "Properties" },
  { key: "projects", label: "Projects" },
  { key: "brokers", label: "Brokers & Builders" },
  { key: "areas", label: "Areas" },
];

const SORT_LABEL: Record<SearchSort, string> = {
  latest: "Latest", nearby: "Nearby", price_asc: "Price ↑", price_desc: "Price ↓",
};

export function SearchResults({ basePath = "", isGuest = false }: { basePath?: string; isGuest?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const path = (p: string) => `${basePath}${p}`;

  const filters: SearchFilters = useMemo(() => queryToFilters(new URLSearchParams(sp?.toString() ?? "")), [sp]);
  const qs = useMemo(() => filtersToQuery(filters), [filters]);

  // `?tab=` decides which tab opens. The feed's rails link here ("View all" on
  // Projects / Top Builders / Top Brokers), and without this every one of them
  // landed on the Properties tab — a link that promised projects and showed
  // flats. Still local state after mount: tapping a tab must not push history.
  const [tab, setTab] = useState<SearchTab>(() => {
    const t = sp?.get("tab");
    return TABS.some((x) => x.key === t) ? (t as SearchTab) : "all";
  });
  const [sort, setSort] = useState<SearchSort>("latest");

  const [props, setProps] = useState<PropertySearchResponse | null>(null);
  const [projects, setProjects] = useState<CardData[] | null>(null);
  /** The Projects tab paginates too — a feed rail's "View all 48" has to reach 48. */
  const [projectsCursor, setProjectsCursor] = useState<string | null>(null);
  /** How many projects MATCH — the header counts the set, not the page. */
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [brokers, setBrokers] = useState<BrokerResult[] | null>(null);
  const [areas, setAreas] = useState<AreaResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // sheets
  const [sheet, setSheet] = useState<null | "filter" | "sort" | "more" | "share" | "report" | "inquiry" | "login">(null);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);

  // ---- load ----------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    const withSort = `${qs}&sort=${sort}`;
    if (tab === "all" || tab === "properties") {
      const r = await searchApi.properties(withSort);
      if (r.ok) { setProps(r.data); setOffline(false); }
      else setOffline(r.error.code === "OFFLINE");
    } else if (tab === "projects") {
      const r = await searchApi.projects(qs);
      if (r.ok) { setProjects(r.data.items); setProjectsCursor(r.data.nextCursor ?? null); setProjectsTotal(r.data.total); setOffline(false); }
      else setOffline(r.error.code === "OFFLINE");
    } else if (tab === "brokers") {
      const r = await searchApi.brokers(qs);
      if (r.ok) { setBrokers(r.data.items); setOffline(false); } else setOffline(r.error.code === "OFFLINE");
    } else {
      const r = await searchApi.areas(qs);
      if (r.ok) { setAreas(r.data.items); setOffline(false); } else setOffline(r.error.code === "OFFLINE");
    }
    setLoading(false);
  }, [qs, sort, tab]);

  useEffect(() => { void load(); }, [load]);

  // An un-launched city typed into the bar → Coming-soon, decided server-side.
  useEffect(() => {
    if (props?.comingSoonCity) {
      router.replace(path(`/search/coming-soon?city=${encodeURIComponent(props.comingSoonCity)}`));
    }
  }, [props?.comingSoonCity]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMoreProjects = async () => {
    if (!projectsCursor || loadingMore) return;
    setLoadingMore(true);
    const r = await searchApi.projects(qs, projectsCursor);
    setLoadingMore(false);
    if (!r.ok) return;
    setProjects((prev) => [...(prev ?? []), ...r.data.items]);
    setProjectsCursor(r.data.nextCursor ?? null);
  };

  const loadMore = async () => {
    if (!props?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const r = await searchApi.properties(`${qs}&sort=${sort}&cursor=${encodeURIComponent(props.nextCursor)}`);
    if (r.ok) {
      setProps((prev) => prev && ({
        ...r.data,
        // Append into the exact-match section; cascade sections only come back
        // on page 1 by design (nearby results must never outrank unseen exact ones).
        sections: [
          { label: null, items: [...(prev.sections[0]?.items ?? []), ...(r.data.sections[0]?.items ?? [])] },
          ...prev.sections.slice(1),
        ],
      }));
    }
    setLoadingMore(false);
  };

  // ---- card actions --------------------------------------------------------
  const gate = (fn: () => void) => () => { if (isGuest) setSheet("login"); else fn(); };

  /** Project cards contact the builder directly — see components/feed/contactBuilder. */
  const contactBuilderGated = (c: CardData, via: "call" | "whatsapp") =>
    gate(() => contactBuilder(c, via, toast.show))();

  const onSave = (c: CardData) => gate(async () => {
    const r = await interactionsApi.toggleSave(c.id);
    if (r.ok) {
      toast.show(r.data.saved ? "Saved to your list" : "Removed from saved");
      setProps((p) => p && ({
        ...p,
        sections: p.sections.map((s) => ({ ...s, items: s.items.map((i) => i.id === c.id ? { ...i, saved: r.data.saved } : i) })),
      }));
    }
  })();

  const applyFilters = (next: SearchFilters) => {
    router.replace(`${path("/search/results")}?${filtersToQuery(next)}`);
    setSheet(null);
  };

  const clearFilters = () => {
    // Keep only the text query; every other constraint goes.
    router.replace(`${path("/search/results")}?${filtersToQuery({ q: filters.q })}`);
    setSheet(null);
    toast.show("Filters cleared");
  };

  const filterCount = props?.filterCount ?? 0;
  const zero = !loading && tab !== "brokers" && tab !== "areas"
    ? (tab === "projects" ? projects?.length === 0 : props?.sections.every((s) => s.items.length === 0))
    : (tab === "brokers" ? brokers?.length === 0 : areas?.length === 0);

  return (
    <AppShell
      header={
        <div className="chrome sticky top-0 z-header w-full border-b border-divider bg-surface-1 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2 py-2 pl-1 pr-2">
            <button onClick={() => router.back()} aria-label="Back" className="grid h-11 w-11 place-items-center">
              <Icon name="arrow-left" size={22} strokeWidth={1.8} className="text-ink-primary" />
            </button>
            <button
              onClick={() => router.push(path("/search"))}
              className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-8 border border-border bg-surface-2 px-3 text-left"
            >
              <Icon name="search" size={17} strokeWidth={1.8} className="text-ink-tertiary" />
              <span className="min-w-0 flex-1 truncate text-15 text-ink-primary">{filters.q || "Search"}</span>
            </button>
            <button onClick={() => setSheet("filter")} aria-label="Filters" className="relative grid h-11 w-11 place-items-center">
              <Icon name="filter" size={22} strokeWidth={1.8} className="text-ink-primary" />
              {filterCount > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                  {filterCount}
                </span>
              )}
            </button>
          </div>

          {/* tabs */}
          <div className="flex gap-0 overflow-x-auto border-t border-divider px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative h-11 shrink-0 whitespace-nowrap px-3.5 text-15 font-semibold transition-colors",
                  tab === t.key ? "text-ink-primary" : "text-ink-tertiary",
                )}
              >
                {t.label}
                {tab === t.key && <span className="absolute inset-x-3.5 bottom-0 h-[1.5px] rounded-sm bg-accent" />}
              </button>
            ))}
          </div>

          {offline && <OfflineBanner onRetry={() => { setOffline(false); void load(); }} />}
        </div>
      }
    >
      {/* count + sort */}
      <div className="flex items-center justify-between bg-page px-4 py-2.5">
        <span className="text-13 text-ink-tertiary">{countLine(tab, props, projects, brokers, areas, loading, projectsTotal)}</span>
        {(tab === "all" || tab === "properties") && (
          <button
            onClick={() => setSheet("sort")}
            className="flex h-8 items-center gap-1 rounded-full border border-border bg-surface-2 px-3 text-13 font-semibold text-ink-primary"
          >
            {SORT_LABEL[sort]}
            <Icon name="chevron-down" size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {loading ? (
        <ResultsSkeleton tab={tab} />
      ) : zero ? (
        <ZeroResults
          tab={tab}
          basePath={basePath}
          onClearFilters={clearFilters}
          hasFilters={filterCount > 0}
          onPickArea={(name) => router.push(`${path("/search/results")}?q=${encodeURIComponent(name)}`)}
        />
      ) : (
        <div className="pb-6">
          {(tab === "all" || tab === "properties") && props && (
            <>
              {/* landing-page suggestion strip — a REAL indexable page */}
              {tab === "all" && <LandingSuggestion scope={props.scope} total={props.total} />}

              {props.sections.map((section, si) => (
                <div key={si}>
                  {section.label && (
                    <div className="mx-4 mb-3.5 mt-1.5 flex items-center gap-1.5 border-t border-divider pt-3.5">
                      <Icon name="pin" size={15} strokeWidth={1.7} className="text-ink-tertiary" />
                      <span className="text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{section.label}</span>
                    </div>
                  )}
                  {section.items.map((c) => (c.kind === "project" ? (
                    <ProjectCard
                      key={c.id}
                      card={c}
                      onOpen={() => router.push(path(`/project/${c.id}`))}
                      onOpenPoster={() => router.push(path(`/profile/${c.poster.username ?? c.poster.id}`))}
                      onContact={(via) => contactBuilderGated(c, via)}
                      onMore={() => { setActiveCard(c); setSheet("more"); }}
                    />
                  ) : (
                    <Card
                      key={c.id}
                      card={c}
                      onOpen={() => router.push(path(`/property/${c.id}`))}
                      onOpenPoster={() => router.push(path(`/profile/${c.poster.username ?? c.poster.id}`))}
                      onSave={() => onSave(c)}
                      onInquiry={gate(() => { setActiveCard(c); setSheet("inquiry"); })}
                      onMore={() => { setActiveCard(c); setSheet("more"); }}
                    />
                  )))}
                </div>
              ))}

              {props.nextCursor && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mx-4 mt-4 grid h-11 w-[calc(100%-2rem)] place-items-center rounded-8 border border-border bg-surface-1 text-15 font-semibold text-ink-primary disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </button>
              )}
            </>
          )}

          {tab === "projects" && projects?.map((c) => (
            <ProjectCard
              key={c.id}
              card={c}
              onOpen={() => router.push(path(`/project/${c.id}`))}
              onOpenPoster={() => router.push(path(`/profile/${c.poster.username ?? c.poster.id}`))}
              onContact={(via) => contactBuilderGated(c, via)}
              onMore={() => { setActiveCard(c); setSheet("more"); }}
            />
          ))}

          {tab === "projects" && projectsCursor && (
            <button
              onClick={loadMoreProjects}
              disabled={loadingMore}
              className="mx-4 mt-4 grid h-11 w-[calc(100%-2rem)] place-items-center rounded-8 border border-border bg-surface-1 text-15 font-semibold text-ink-primary disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}

          {tab === "brokers" && brokers?.map((b) => (
            <Link
              key={b.id}
              href={path(`/profile/${b.username ?? b.id}`)}
              className="flex items-center gap-3 border-b border-divider px-4 py-3"
            >
              <Avatar src={b.avatarUrl} name={b.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-15 font-semibold text-ink-primary">{b.name}</span>
                  {b.verified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
                  {b.role && <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 capitalize text-ink-tertiary">{b.role}</span>}
                </div>
                <div className="mt-0.5 truncate text-13 text-ink-tertiary">{b.stats}</div>
              </div>
              <Icon name="chevron-right" size={18} strokeWidth={1.8} className="text-ink-tertiary" />
            </Link>
          ))}

          {tab === "areas" && areas?.map((a) => (
            <Link
              key={a.id}
              href={`/area/${a.slug}-${a.citySlug}`}
              className="flex items-center gap-3 border-b border-divider px-4 py-3.5"
            >
              <Icon name="pin" size={20} strokeWidth={1.6} className="text-ink-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-15 font-semibold text-ink-primary">{a.label}</div>
                <div className="mt-0.5 truncate text-13 text-ink-tertiary">{a.stats}</div>
              </div>
              <Icon name="chevron-right" size={18} strokeWidth={1.8} className="text-ink-tertiary" />
            </Link>
          ))}
        </div>
      )}

      {/* ---- sheets ---- */}
      <FilterSheet
        open={sheet === "filter"}
        onClose={() => setSheet(null)}
        filters={filters}
        onApply={applyFilters}
        onClearAll={clearFilters}
      />
      <SortSheet open={sheet === "sort"} onClose={() => setSheet(null)} value={sort} onChange={(v) => setSort(v as SearchSort)} />
      <MoreSheet
        open={sheet === "more"}
        onClose={() => setSheet(null)}
        onShare={() => setSheet("share")}
        onReport={() => setSheet("report")}
      />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} card={activeCard} />
      <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} card={activeCard} />
      <InquirySheet open={sheet === "inquiry"} onClose={() => setSheet(null)} card={activeCard} />
      <LoginSheet open={sheet === "login"} onClose={() => setSheet(null)} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

function countLine(
  tab: SearchTab,
  props: PropertySearchResponse | null,
  projects: CardData[] | null,
  brokers: BrokerResult[] | null,
  areas: AreaResult[] | null,
  loading: boolean,
  /** Matches, not the loaded page — the tab paginates now. */
  projectsTotal = 0,
): string {
  if (loading) return "Searching…";
  if (tab === "projects") {
    const n = projectsTotal || projects?.length || 0;
    return `${n} project${n === 1 ? "" : "s"}`;
  }
  if (tab === "brokers") return `${brokers?.length ?? 0} seller${brokers?.length === 1 ? "" : "s"}`;
  if (tab === "areas") return `${areas?.length ?? 0} area${areas?.length === 1 ? "" : "s"}`;
  const n = props?.total ?? 0;
  return `${n.toLocaleString("en-IN")} propert${n === 1 ? "y" : "ies"}`;
}

/**
 * "Browse all Flats for Sale in Mavdi (45)" — built from the RESOLVED scope the
 * server returned, so the link is a real landing URL and the number in it is
 * the real count. Shown only when the scope is specific enough to have a page.
 */
function LandingSuggestion({ scope, total }: { scope: PropertySearchResponse["scope"]; total: number }) {
  if (!scope.citySlug || total < 3) return null;
  const [areaName] = scope.areaNames;
  const place = areaName ? `${areaName}, ${scope.cityName}` : scope.cityName;
  if (!place) return null;

  // The href mirrors lib/seo/slugs.buildPath. Kept deliberately conservative:
  // when the scope has no single type we link the AREA page rather than
  // inventing a type slug that might not resolve.
  const areaSlugGuess = areaName ? slugify(areaName) : null;
  const href = areaSlugGuess
    ? `/area/${areaSlugGuess}-${scope.citySlug}`
    : `/${scope.citySlug}`;

  return (
    <Link href={href} className="mx-4 mb-3.5 flex items-center gap-2.5 rounded-8 bg-accent-soft px-3.5 py-3">
      <Icon name="grid" size={18} strokeWidth={1.6} className="text-accent" />
      <span className="min-w-0 flex-1 text-13 font-semibold text-accent">
        Browse all properties in {place} ({total})
      </span>
      <Icon name="chevron-right" size={18} strokeWidth={1.8} className="text-accent" />
    </Link>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * The design's zero state is written for the Properties tab. On the other tabs
 * the same copy lied — the Projects tab announced "No properties found" and
 * offered "Post a Requirement", which is not what a visitor looking for
 * projects, sellers or areas is missing. The art and layout are unchanged; only
 * the noun and the CTA follow the tab.
 */
const ZERO_COPY: Record<SearchTab, { title: string; hint: string; cta: boolean }> = {
  all:        { title: "No properties found", hint: "Try a different spelling or nearby area", cta: true },
  properties: { title: "No properties found", hint: "Try a different spelling or nearby area", cta: true },
  projects:   { title: "No projects found", hint: "No builder projects match this search yet", cta: false },
  brokers:    { title: "No sellers found", hint: "No brokers or builders match this search yet", cta: false },
  areas:      { title: "No areas found", hint: "Try a different spelling, or browse a popular area", cta: false },
};

function ZeroResults({
  tab, basePath, onClearFilters, hasFilters, onPickArea,
}: { tab: SearchTab; basePath: string; onClearFilters: () => void; hasFilters: boolean; onPickArea: (name: string) => void }) {
  const [popular, setPopular] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await searchApi.config();
      if (r.ok) setPopular(r.data.popularAreas);
    })();
  }, []);

  const copy = ZERO_COPY[tab];

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {/* magnifier-with-dots line art, 96px (design S2 zero state) */}
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-tertiary">
        <circle cx="42" cy="42" r="26" />
        <path d="m62 62 18 18" strokeLinecap="round" />
        <circle cx="42" cy="42" r="2" fill="currentColor" />
        <circle cx="34" cy="42" r="1.5" fill="currentColor" />
        <circle cx="50" cy="42" r="1.5" fill="currentColor" />
      </svg>
      <div className="mt-4 text-17 font-semibold text-ink-primary">{copy.title}</div>
      <div className="mt-1 max-w-[240px] text-13 text-ink-secondary">{copy.hint}</div>

      {popular.length > 0 && (
        <div className="mt-4 flex max-w-full gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {popular.map((a) => (
            <button
              key={a.id}
              onClick={() => onPickArea(a.name)}
              className="h-[34px] shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-2 px-3.5 text-13 font-semibold text-ink-primary"
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {copy.cta && (
        <Link href={`${basePath}/requirements/new`} className="mt-5 grid h-11 place-items-center rounded-8 bg-accent px-6 text-15 font-semibold text-white">
          Post a Requirement
        </Link>
      )}
      {hasFilters && (
        <button onClick={onClearFilters} className="mt-3 text-15 font-semibold text-accent">Clear filters</button>
      )}
    </div>
  );
}

function ResultsSkeleton({ tab }: { tab: SearchTab }) {
  if (tab === "brokers" || tab === "areas") {
    return (
      <div className="px-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-divider py-3.5">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex-1">
              <div className="mb-2 h-4 w-1/2 animate-pulse rounded-4 bg-surface-2" />
              <div className="h-3 w-3/4 animate-pulse rounded-4 bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="px-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-5">
          <div className="mb-2.5 aspect-[16/9] animate-pulse rounded-12 bg-surface-2" />
          <div className="mb-2 h-4 w-30 animate-pulse rounded-4 bg-surface-2" />
          <div className="mb-1.5 h-3 w-3/4 animate-pulse rounded-4 bg-surface-2" />
          <div className="h-3 w-2/5 animate-pulse rounded-4 bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
