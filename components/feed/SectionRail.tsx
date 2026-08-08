"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RailCardSkeleton, RailPersonSkeleton } from "./skeletons";
import { feedApi, type FeedCard as Card, type FeedPerson, type FeedSectionMeta, type FeedSectionPage } from "@/lib/feed/client";
import { TYPE_ICON } from "@/lib/listings/type-icon";
import { prefetchImages } from "@/lib/pwa/prefetch";

/**
 * One horizontal rail on the carousel home feed (P2, 5 Aug 2026 — Rajan).
 *
 * Owns four things and nothing else:
 *
 *  1. LAZY LOAD. A feed can have twenty rails; fetching all of them on mount
 *     would be twenty requests for cards nobody has scrolled to. The rail asks
 *     for its first page only once it is within 400px of the viewport.
 *
 *  2. ENDLESS HORIZONTAL SCROLL. Scrolling near the right edge fetches the next
 *     page with the same cursor the vertical feed used. No cap.
 *
 *  3. AUTO-HIDE. The server already omits a section with nothing live, so this
 *     is the second half of the same rule: if the first page comes back empty
 *     anyway (every card filtered out by a not-interested area, say), the rail
 *     renders NOTHING — not a heading over an empty strip.
 *
 *  4. STATES. Skeleton while loading, a retry row on failure. No dead ends.
 *
 * It renders no card markup of its own: `renderCard` / `renderPerson` come from
 * the feed, so every card in a rail is the same component, with the same
 * actions, as the card the feed has always shown.
 */
/** Append `next` onto `prev`, skipping anything already there. */
function dedupe<T>(prev: T[], next: T[], key: (x: T) => string): T[] {
  const seen = new Set(prev.map(key));
  return [...prev, ...next.filter((x) => !seen.has(key(x)))];
}

export function SectionRail({
  section, filter, sort, cityId = null, initial = null, renderCard, renderPerson, onViewAll,
}: {
  section: FeedSectionMeta;
  filter: string;
  sort: string;
  /** Guest's city, so a rail's pages stay in the same scope as its heading. */
  cityId?: string | null;
  /**
   * This rail's first page, already fetched ON THE SERVER and shipped with the
   * page (lib/feed/initial). When it is here the rail skips its own first
   * request entirely — that request was the second of two round trips the user
   * had to wait through before the first card existed. Paging, retry and every
   * later state are unchanged: `cursor` continues from where the server left
   * off.
   */
  initial?: FeedSectionPage | null;
  renderCard: (card: Card) => React.ReactNode;
  renderPerson: (person: FeedPerson) => React.ReactNode;
  onViewAll: (href: string) => void;
}) {
  const [items, setItems] = useState<Card[] | null>(initial?.items ?? null);
  const [people, setPeople] = useState<FeedPerson[]>(initial?.people ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // A primed rail has already "started" — its first page came with the HTML.
  const started = useRef(initial !== null);

  const isPeople = section.kind === "builders" || section.kind === "brokers";
  const icon = section.kind === "property_type" ? TYPE_ICON[section.key.slice(5)] : undefined;

  const loadFirst = useCallback(async () => {
    setFailed(false);
    const res = await feedApi.section(section.key, { filter, sort, cityId });
    if (res.ok) {
      setItems(res.data.items);
      setPeople(res.data.people);
      setCursor(res.data.nextCursor);
      // Warm the covers just past the first screenful so the rail doesn't fill
      // in grey-then-photo as it is swiped (Doc8 §173).
      prefetchImages(res.data.items.slice(2, 6).map((i) => i.coverUrl));
    } else {
      // Offline or a server error: keep the heading and offer a retry rather
      // than silently collapsing a rail the server said has rows.
      setItems([]);
      setFailed(true);
    }
    // `cityId` belongs here: it is in the query these build. The rail is keyed
    // by it too, so it has never actually gone stale — but a callback that
    // silently reads a prop it does not depend on is one refactor away from
    // fetching the previous city's cards.
  }, [section.key, filter, sort, cityId]);

  // Arm the lazy load. There is deliberately no state reset here: a Buy/Rent
  // chip tap or a city switch REMOUNTS this rail (the feed keys it by
  // key+filter+sort), which is React's own way of resetting state on a prop
  // change — resetting inside the effect would just cascade an extra render.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || started.current) return;

    // Already on screen at mount → fetch now, without waiting for the observer.
    // Two reasons this is not just an optimisation: the observer's first
    // callback costs a frame the top rails do not need to pay, and a document
    // that is HIDDEN (a background tab, a page restored behind another) does not
    // report intersections at all — the feed would sit on skeletons until it was
    // looked at. Everything below the fold still waits, exactly as before.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight + 400 && box.bottom > -400) {
      started.current = true;
      void loadFirst();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return;
        started.current = true;
        void loadFirst();
      },
      // Start fetching one screen early so the cards are there by the time the
      // rail is actually looked at.
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await feedApi.section(section.key, { filter, sort, cursor, cityId });
    setLoadingMore(false);
    if (!res.ok) return;
    // Append by id, never blindly. The server no longer repeats a boosted card
    // across pages, but a row whose `live_at` moves between two requests could
    // still arrive twice, and a duplicate React key silently drops a card.
    setItems((c) => dedupe(c ?? [], res.data.items, (x) => `${x.kind}-${x.id}`));
    setPeople((p) => dedupe(p, res.data.people, (x) => x.id));
    setCursor(res.data.nextCursor);
  }, [cursor, loadingMore, section.key, filter, sort, cityId]);

  const onRailScroll = () => {
    const el = railRef.current;
    if (!el || !cursor || loadingMore) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 280) void loadMore();
  };

  const count = isPeople ? people.length : (items?.length ?? 0);
  // Loaded, and there is genuinely nothing to show → the rail does not exist.
  if (items !== null && count === 0 && !failed) return null;

  return (
    <section ref={rootRef} className="border-b-8 border-surface-2 bg-surface-1 py-3.5">
      <header className="flex items-end gap-2 px-4 pb-2.5">
        {/* The type's own icon — the same decorative map the P5 type picker
            draws from, so a rail and the picker agree on what a Godown looks
            like. A code with no icon renders none. */}
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center self-center rounded-8 bg-surface-2 text-ink-secondary">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-17 font-semibold leading-[1.2] text-ink-primary">{section.title}</h2>
          <p className="mt-0.5 truncate text-11 text-ink-tertiary">{section.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => onViewAll(section.viewAll)}
          className="flex shrink-0 items-center gap-0.5 py-1 text-13 font-semibold text-accent"
        >
          View all <Icon name="chevron-right" size={14} />
        </button>
      </header>

      <div
        ref={railRef}
        onScroll={onRailScroll}
        className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items === null ? (
          // The card's own shape in grey — not a block the size of a card.
          isPeople
            ? [0, 1, 2].map((i) => <RailPersonSkeleton key={i} />)
            : [0, 1].map((i) => <RailCardSkeleton key={i} />)
        ) : failed ? (
          <button
            type="button"
            onClick={() => void loadFirst()}
            className="flex h-[120px] w-full items-center justify-center gap-2 rounded-8 border border-border text-13 font-semibold text-ink-secondary"
          >
            <Icon name="rotate-ccw" size={16} /> Couldn&apos;t load — tap to retry
          </button>
        ) : (
          <>
            {isPeople
              ? people.map((p) => <div key={p.id} className="shrink-0 snap-start">{renderPerson(p)}</div>)
              : (items ?? []).map((c) => (
                <div key={`${c.kind}-${c.id}`} className="w-[86vw] max-w-[320px] shrink-0 snap-start">
                  {renderCard(c)}
                </div>
              ))}

            {/* The end-of-rail tile: the same destination as the header button,
                where the thumb already is after scrolling to the end. */}
            <button
              type="button"
              onClick={() => onViewAll(section.viewAll)}
              className="flex w-[124px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-8 border border-dashed border-border text-13 font-semibold text-accent"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft">
                <Icon name="chevron-right" size={20} />
              </span>
              View all
              <span className="text-11 font-semibold text-ink-tertiary">{section.total} total</span>
            </button>

            {loadingMore && (isPeople ? <RailPersonSkeleton /> : <RailCardSkeleton />)}
          </>
        )}
      </div>
    </section>
  );
}
