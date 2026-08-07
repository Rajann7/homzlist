"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { feedApi, type FeedCard as Card, type FeedPerson, type FeedSectionMeta } from "@/lib/feed/client";
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
  section, filter, sort, cityId = null, renderCard, renderPerson, onViewAll,
}: {
  section: FeedSectionMeta;
  filter: string;
  sort: string;
  /** Guest's city, so a rail's pages stay in the same scope as its heading. */
  cityId?: string | null;
  renderCard: (card: Card) => React.ReactNode;
  renderPerson: (person: FeedPerson) => React.ReactNode;
  onViewAll: (href: string) => void;
}) {
  const [items, setItems] = useState<Card[] | null>(null);
  const [people, setPeople] = useState<FeedPerson[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

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
  }, [section.key, filter, sort]);

  // Arm the lazy load. There is deliberately no state reset here: a Buy/Rent
  // chip tap or a city switch REMOUNTS this rail (the feed keys it by
  // key+filter+sort), which is React's own way of resetting state on a prop
  // change — resetting inside the effect would just cascade an extra render.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
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
  }, [cursor, loadingMore, section.key, filter, sort]);

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
          [0, 1].map((i) => (
            <Skeleton key={i} className={isPeople ? "h-[196px] w-[156px] shrink-0 rounded-8" : "h-[380px] w-[86vw] max-w-[320px] shrink-0 rounded-8"} />
          ))
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

            {loadingMore && <Skeleton className={isPeople ? "h-[196px] w-[156px] shrink-0 rounded-8" : "h-[380px] w-[86vw] max-w-[320px] shrink-0 rounded-8"} />}
          </>
        )}
      </div>
    </section>
  );
}
