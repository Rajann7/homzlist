"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { searchApi, type ExploreTile, type RecentRow } from "@/lib/search/client";
import type { AutocompleteResult } from "@/lib/search/types";
import { interactionsApi } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * P3 S1 — SEARCH HOME (Explore).
 *
 * Header: full-width search bar + Property|Requirement segmented toggle.
 * Body: RECENT SEARCHES (rows, × each, Clear all) → POPULAR AREAS chips →
 * EXPLORE grid (3-col, 2px gaps, 1:1 tiles, boosted tile spans 2×2, photo-count
 * badge) with long-press peek. Autocomplete panel overlays on focus.
 *
 * Everything on this screen is a server answer: recents are rows in
 * `search_recents`, popular areas are ranked by live inventory, the grid is
 * live listings, and the "Promoted" chip only appears on a genuinely boosted
 * listing. There is no sample data anywhere in this file.
 */

export interface SearchHomeProps {
  /** Seller subdomain prefixes every in-app route. */
  basePath?: string;
  /** Guests have no recents and gated actions bounce to login. */
  isGuest?: boolean;
}

const EMPTY_AC: AutocompleteResult = { suggestions: [], pages: [], recents: [], comingSoonCity: null };

export function SearchHome({ basePath = "", isGuest = false }: SearchHomeProps) {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<"property" | "requirement">("property");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const [recents, setRecents] = useState<RecentRow[] | null>(null);
  const [popular, setPopular] = useState<{ id: string; name: string; slug: string; count: number }[]>([]);
  const [tiles, setTiles] = useState<ExploreTile[] | null>(null);
  const [ac, setAc] = useState<AutocompleteResult>(EMPTY_AC);
  const [offline, setOffline] = useState(false);
  const [peek, setPeek] = useState<ExploreTile | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedTile = useRef<string | null>(null);

  const path = (p: string) => `${basePath}${p}`;

  // ---- initial load --------------------------------------------------------
  const load = useCallback(async () => {
    const [cfg, exp, rec] = await Promise.all([
      searchApi.config(),
      searchApi.explore(),
      isGuest ? Promise.resolve({ ok: true as const, data: { items: [] as RecentRow[] } }) : searchApi.recents(mode),
    ]);
    const anyOffline = [cfg, exp, rec].some((r) => !r.ok && (r as { error: { code: string } }).error.code === "OFFLINE");
    setOffline(anyOffline);
    if (cfg.ok) setPopular(cfg.data.popularAreas);
    if (exp.ok) setTiles(exp.data.tiles);
    else if (anyOffline) setTiles([]);
    if (rec.ok) setRecents(rec.data.items);
    else setRecents([]);
  }, [isGuest, mode]);

  useEffect(() => { void load(); }, [load]);

  // ---- autocomplete (debounced) -------------------------------------------
  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(async () => {
      const r = await searchApi.autocomplete(query, mode);
      if (r.ok) setAc(r.data);
    }, 180);
    return () => clearTimeout(t);
  }, [query, focused, mode]);

  // ---- navigation ----------------------------------------------------------
  const runSearch = useCallback((text: string, target?: { kind: string; slug: string | null }) => {
    const q = text.trim();
    if (!q) return;
    setFocused(false);
    setQuery("");
    if (!isGuest) void searchApi.recordRecent(q, { mode, targetKind: target?.kind, targetSlug: target?.slug ?? null });
    // `basePath` rather than the `path()` helper: `path` is re-created every
    // render, so depending on it would defeat the memo. basePath is a prop.
    router.push(`${basePath}/search/results?q=${encodeURIComponent(q)}`);
  }, [isGuest, mode, router, basePath]);

  const openComingSoon = (city: string) => router.push(path(`/search/coming-soon?city=${encodeURIComponent(city)}`));

  // ---- recents actions -----------------------------------------------------
  const removeRecent = async (id: string) => {
    setRecents((r) => (r ?? []).filter((x) => x.id !== id));   // optimistic fade
    const res = await searchApi.removeRecent(id, mode);
    if (res.ok) setRecents(res.data.items);
  };
  const clearAll = async () => {
    setRecents([]);
    const res = await searchApi.clearRecents(mode);
    if (res.ok) setRecents(res.data.items);
    toast.show("Recent searches cleared");
  };

  // ---- long-press peek -----------------------------------------------------
  const startPress = (t: ExploreTile) => {
    pressedTile.current = t.id;
    longPress.current = setTimeout(() => setPeek(t), 380);
  };
  const endPress = () => {
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
    pressedTile.current = null;
  };

  const savePeek = async (t: ExploreTile) => {
    setPeek(null);
    if (isGuest) { router.push(path("/login")); return; }
    const r = await interactionsApi.toggleSave(t.id);
    toast.show(r.ok && r.data.saved ? "Saved to your list" : "Removed from saved");
  };

  const loading = tiles === null || recents === null;

  return (
    <AppShell
      header={
        <div className="chrome sticky top-0 z-header w-full border-b border-divider bg-surface-1 pt-[env(safe-area-inset-top)]">
          {/* search bar (h40, surface-2, r8, leading icon) */}
          <div className="px-4 pb-2.5 pt-2">
            <div
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-8 border bg-surface-2 px-3 transition-colors",
                focused ? "border-accent" : "border-border",
              )}
            >
              <Icon name="search" size={19} strokeWidth={1.8} className="text-ink-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                // Unicode input: no pattern, no ASCII coercion — a Gujarati or
                // Hindi query reaches the server exactly as typed (Doc7 §108).
                inputMode="search"
                enterKeyHint="search"
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); }}
                placeholder="Search area, city or society…"
                aria-label="Search area, city or society"
                className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="grid h-[22px] w-[22px] place-items-center rounded-full bg-surface-3"
                >
                  <Icon name="close" size={12} strokeWidth={2} className="text-ink-secondary" />
                </button>
              )}
            </div>

            {/* Property | Requirement segmented pill */}
            <div className="mt-2.5 flex rounded-full bg-surface-2 p-[3px]">
              {(["property", "requirement"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-8 flex-1 rounded-full text-13 font-semibold capitalize transition-colors",
                    mode === m ? "bg-surface-1 text-ink-primary shadow-l1" : "text-ink-tertiary",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {offline && <OfflineBanner onRetry={() => { setOffline(false); void load(); }} />}
        </div>
      }
      className="relative"
    >
      {/* ---- autocomplete overlay ---- */}
      {focused && (
        <AutocompletePanel
          data={ac}
          isGuest={isGuest}
          onDismiss={() => setFocused(false)}
          onPickSuggestion={(s) => runSearch(s.name.split(",")[0], { kind: s.kind, slug: s.slug })}
          onPickPage={(href) => { setFocused(false); router.push(href); }}
          onPickRecent={(r) => runSearch(r.query, { kind: r.targetKind ?? "text", slug: r.targetSlug })}
          onComingSoon={openComingSoon}
        />
      )}

      {loading ? (
        <HomeSkeleton />
      ) : mode === "property" ? (
        <div className="pb-5 pt-4">
          {/* ---- RECENT SEARCHES ---- */}
          {recents.length > 0 ? (
            <>
              <div className="mb-1 flex items-center justify-between px-4">
                <span className="text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Recent searches</span>
                <button onClick={clearAll} className="py-1.5 text-13 font-semibold text-accent">Clear all</button>
              </div>
              {recents.map((r) => (
                <div key={r.id} className="flex h-11 items-center gap-3 px-4">
                  <Icon name="clock" size={18} strokeWidth={1.6} className="text-ink-tertiary" />
                  <button
                    onClick={() => runSearch(r.query, { kind: r.targetKind ?? "text", slug: r.targetSlug })}
                    className="min-w-0 flex-1 truncate text-left text-15 text-ink-primary"
                  >
                    {r.query}
                  </button>
                  <button
                    onClick={() => removeRecent(r.id)}
                    aria-label={`Remove ${r.query}`}
                    className="-mr-3 grid h-11 w-11 place-items-center"
                  >
                    <Icon name="close" size={16} strokeWidth={1.8} className="text-ink-tertiary" />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <div className="px-4 py-6 text-center text-13 text-ink-tertiary">
              {isGuest ? "Sign in to keep your recent searches" : "No recent searches yet"}
            </div>
          )}

          {/* ---- POPULAR AREAS ---- */}
          {popular.length > 0 && (
            <>
              <div className="mb-2.5 mt-5 px-4 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
                Popular areas
              </div>
              <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {popular.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => runSearch(a.name, { kind: "area", slug: a.slug })}
                    className="h-9 shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-2 px-4 text-13 font-semibold text-ink-primary"
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---- EXPLORE grid ---- */}
          <div className="mb-2.5 mt-6 px-4 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Explore</div>
          {tiles.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Icon name="search-list" size={40} className="mx-auto text-ink-tertiary" />
              <div className="mt-3 text-15 font-semibold text-ink-primary">Nothing to explore yet</div>
              <div className="mt-1 text-13 text-ink-secondary">New listings will show up here as sellers post them.</div>
            </div>
          ) : (
            <div className="grid auto-rows-fr grid-cols-3 gap-[2px]">
              {tiles.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { if (!peek) router.push(path(`/property/${t.id}`)); }}
                  onMouseDown={() => startPress(t)}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onTouchStart={() => startPress(t)}
                  onTouchEnd={endPress}
                  onContextMenu={(e) => e.preventDefault()}
                  className={cn(
                    "relative aspect-square overflow-hidden bg-surface-2",
                    // The 2×2 hero cell is the boosted listing (hoisted to index
                    // 0 server-side). No boost → no hero, and no fake badge.
                    i === 0 && t.promoted && "col-span-2 row-span-2",
                  )}
                >
                  {t.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  {t.promoted && (
                    <span className="absolute left-2 top-2 rounded-4 bg-black/60 px-[7px] py-1 text-11 font-semibold uppercase tracking-[0.3px] text-white">
                      Promoted
                    </span>
                  )}
                  {t.photoCount > 1 && (
                    <span className="absolute bottom-2 right-2 flex items-center gap-[3px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                      <Icon name="layers" size={15} strokeWidth={1.8} />
                      <span className="text-11 font-semibold">{t.photoCount}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <RequirementMode basePath={basePath} isGuest={isGuest} />
      )}

      {/* ---- long-press peek popup ---- */}
      {peek && (
        <div
          onClick={() => setPeek(null)}
          className="fixed inset-0 z-dialog grid animate-[fadeIn_.2s_ease-out] place-items-center bg-[color:var(--scrim-sheet)] p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[260px] overflow-hidden rounded-12 border border-border bg-surface-1 shadow-l3"
          >
            {/* 16:9 — the same photo ratio the feed card uses (Rajan, 26 Jul
                2026: "jo feed me img size hai wahi size rakhna hai"), so one
                property never appears in two different crops. */}
            <div className="aspect-[16/9] bg-surface-2">
              {peek.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={peek.coverUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-3.5">
              <div className="text-17 font-bold text-ink-primary">{peek.price}</div>
              <div className="mt-[3px] text-13 text-ink-secondary">{peek.sub}</div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { setPeek(null); router.push(path(`/property/${peek.id}`)); }}
                  className="h-10 flex-1 rounded-8 border border-border bg-surface-2 text-15 font-semibold text-ink-primary"
                >
                  View
                </button>
                <button
                  onClick={() => savePeek(peek)}
                  className="h-10 flex-1 rounded-8 bg-accent text-15 font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Autocomplete panel
// ---------------------------------------------------------------------------

function AutocompletePanel({
  data, isGuest, onDismiss, onPickSuggestion, onPickPage, onPickRecent, onComingSoon,
}: {
  data: AutocompleteResult;
  isGuest: boolean;
  onDismiss: () => void;
  onPickSuggestion: (s: AutocompleteResult["suggestions"][number]) => void;
  onPickPage: (href: string) => void;
  onPickRecent: (r: AutocompleteResult["recents"][number]) => void;
  onComingSoon: (city: string) => void;
}) {
  const empty = !data.suggestions.length && !data.pages.length && !data.recents.length;

  return (
    <>
      {/* dismiss layer sits UNDER the panel */}
      <button aria-label="Close suggestions" onClick={onDismiss} className="fixed inset-0 z-dropdown cursor-default" tabIndex={-1} />
      <div className="absolute inset-x-4 top-2 z-[31] max-h-[62%] overflow-y-auto rounded-8 border border-border bg-surface-1 shadow-l3">
        {data.suggestions.length > 0 && (
          <>
            <SectionLabel>Suggestions</SectionLabel>
            {data.suggestions.map((s) => (
              <button key={`${s.kind}-${s.id}`} onClick={() => onPickSuggestion(s)} className="flex min-h-12 w-full items-center gap-3 px-3.5 py-1.5 text-left">
                <Icon name="pin" size={18} strokeWidth={1.6} className="text-ink-tertiary" />
                <span className="min-w-0">
                  <span className="block truncate text-15 text-ink-primary">{s.name}</span>
                  <span className="block text-13 text-ink-tertiary">{s.meta}</span>
                </span>
              </button>
            ))}
          </>
        )}

        {data.pages.length > 0 && (
          <>
            <SectionLabel bordered>Pages</SectionLabel>
            {data.pages.map((p) => (
              <button key={p.href} onClick={() => onPickPage(p.href)} className="flex min-h-12 w-full items-center gap-3 px-3.5 py-1.5 text-left">
                <Icon name="grid" size={18} strokeWidth={1.6} className="text-accent" />
                <span className="min-w-0 truncate text-15 text-accent">{p.name}</span>
              </button>
            ))}
          </>
        )}

        {data.recents.length > 0 && (
          <>
            <SectionLabel bordered>Recent</SectionLabel>
            {data.recents.map((r) => (
              <button key={r.id} onClick={() => onPickRecent(r)} className="flex min-h-11 w-full items-center gap-3 px-3.5 py-1 text-left">
                <Icon name="clock" size={18} strokeWidth={1.6} className="text-ink-tertiary" />
                <span className="min-w-0 truncate text-15 text-ink-primary">{r.query}</span>
              </button>
            ))}
          </>
        )}

        {/* An un-launched or unknown city routes to Coming-soon rather than
            dropping the user into a guaranteed-empty result set. */}
        {data.comingSoonCity && (
          <>
            <SectionLabel bordered>Not here yet</SectionLabel>
            <button
              onClick={() => onComingSoon(data.comingSoonCity!.name)}
              className="flex min-h-12 w-full items-center gap-3 px-3.5 py-1.5 text-left"
            >
              <Icon name="pin" size={18} strokeWidth={1.6} className="text-ink-tertiary" />
              <span className="min-w-0">
                <span className="block truncate text-15 text-ink-primary">{data.comingSoonCity.name}</span>
                <span className="block text-13 text-ink-tertiary">Coming soon — get notified</span>
              </span>
            </button>
          </>
        )}

        {empty && !data.comingSoonCity && (
          <div className="px-3.5 py-6 text-center text-13 text-ink-tertiary">
            {isGuest ? "Start typing an area, city or society" : "No matches yet — try an area or society name"}
          </div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children, bordered }: { children: React.ReactNode; bordered?: boolean }) {
  return (
    <div className={cn("px-3.5 pb-1 pt-2.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary", bordered && "border-t border-divider")}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirement mode (the second half of the segmented toggle)
// ---------------------------------------------------------------------------

function RequirementMode({ basePath, isGuest }: { basePath: string; isGuest: boolean }) {
  const [mine, setMine] = useState<{ id: string; title: string; status: string; meta: string; responses: number }[] | null>(null);

  useEffect(() => {
    if (isGuest) { setMine([]); return; }
    void (async () => {
      try {
        const res = await fetch("/api/v1/requirements/mine", { credentials: "same-origin" });
        const json = await res.json();
        if (json?.ok) {
          const items = (json.data.items ?? json.data.requirements ?? []) as any[];
          setMine(items.map((r) => ({
            id: r.id,
            title: r.title ?? `${r.bhk ? `${r.bhk} BHK ` : ""}${r.typeLabel ?? "Property"} in ${r.areaLabel ?? "your city"}`,
            status: r.status === "live" ? "Active" : r.status,
            meta: r.budgetLabel ?? r.meta ?? "",
            responses: r.proposalCount ?? r.responses ?? 0,
          })));
        } else setMine([]);
      } catch { setMine([]); }
    })();
  }, [isGuest]);

  const steps = [
    { n: "1", t: "Tell us what you need", d: "Location, budget, property type & BHK" },
    { n: "2", t: "Verified sellers respond", d: "Brokers & owners send matching options" },
    { n: "3", t: "Compare & connect", d: "Chat and shortlist the best matches" },
  ];

  return (
    <div className="pb-6 pt-4">
      <div className="mx-4 mb-4 rounded-12 bg-accent-soft p-4">
        <div className="text-15 font-semibold text-ink-primary">Can&apos;t find what you&apos;re looking for?</div>
        <div className="mt-1 text-13 text-ink-secondary">
          Post your requirement and let verified brokers &amp; owners reach out to you with matching properties.
        </div>
        <Link
          href={`${basePath}${isGuest ? "/login" : "/requirements/new"}`}
          className="mt-3 grid h-11 w-full place-items-center rounded-8 bg-accent text-15 font-semibold text-white"
        >
          Post a Requirement
        </Link>
      </div>

      <div className="mb-2.5 px-4 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">How it works</div>
      <div className="px-4">
        {steps.map((s) => (
          <div key={s.n} className="mb-3.5 flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-13 font-bold text-accent">{s.n}</span>
            <div>
              <div className="text-15 font-semibold text-ink-primary">{s.t}</div>
              <div className="mt-0.5 text-13 text-ink-tertiary">{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2.5 mt-4 px-4 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Your requirements</div>
      {mine === null ? (
        <div className="mx-4 h-24 animate-pulse rounded-12 bg-surface-2" />
      ) : mine.length === 0 ? (
        <div className="px-4 py-6 text-center text-13 text-ink-tertiary">
          {isGuest ? "Sign in to post and track requirements" : "You haven't posted any requirements yet"}
        </div>
      ) : (
        mine.map((r) => (
          <Link
            key={r.id}
            href={`${basePath}/requirements/${r.id}`}
            className="mx-4 mb-3 block rounded-12 border border-border bg-surface-1 p-3.5 shadow-l1"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink-primary">{r.title}</span>
              <span className="rounded-full bg-accent-soft px-2 py-1 text-11 font-semibold capitalize text-accent">{r.status}</span>
            </div>
            {r.meta && <div className="mt-1 text-13 text-ink-secondary">{r.meta}</div>}
            <div className="mt-2 flex items-center gap-1.5 border-t border-divider pt-2">
              <Icon name="message" size={14} strokeWidth={1.7} className="text-accent" />
              <span className="text-13 font-semibold text-accent">
                {r.responses} response{r.responses === 1 ? "" : "s"}
              </span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared states
// ---------------------------------------------------------------------------

export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-2">
      <Icon name="wifi-off" size={16} strokeWidth={1.8} className="text-warning" />
      <span className="flex-1 text-13 text-ink-primary">You&apos;re offline. Showing saved results.</span>
      <button onClick={onRetry} className="text-13 font-semibold text-accent">Retry</button>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="p-4">
      <div className="mb-3.5 h-3 w-30 animate-pulse rounded-4 bg-surface-2" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="mb-3 h-4 animate-pulse rounded-4 bg-surface-2" />)}
      <div className="mb-3.5 mt-5 h-3 w-40 animate-pulse rounded-4 bg-surface-2" />
      <div className="grid grid-cols-3 gap-[2px]">
        {Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-square animate-pulse bg-surface-2" />)}
      </div>
    </div>
  );
}
