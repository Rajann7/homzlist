"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { FeedCard as Card } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * P2 feed card — the locked hierarchy: Photo → Price → BHK/Area → Location →
 * Poster (Doc2 §9.1). Three types (For-Sale, For-Rent+Promoted, Project) off one
 * component. Carousel with dots + counter; double-tap the photo → heart pop +
 * save. Every number/label is server-computed (this renders, never derives).
 */
export function FeedCard({
  card, onOpen, onOpenPoster, onSave, onInquiry, onMore,
}: {
  card: Card;
  onOpen: () => void;
  /** Poster name/avatar tap → their public profile. */
  onOpenPoster: () => void;
  onSave: () => void;
  onInquiry: () => void;
  onMore: () => void;
}) {
  const isProject = card.kind === "project";
  const photos = card.photos.length ? card.photos : card.coverUrl ? [card.coverUrl] : [];
  const [idx, setIdx] = useState(0);
  const [heart, setHeart] = useState(false);
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledAt = useRef(0);

  /**
   * Photo tap does double duty, so single vs double has to be disambiguated:
   *   double-tap → heart pop + save (unchanged behaviour)
   *   single tap → open the detail (new — the card used to open ONLY from the
   *                "View Property" button)
   * A single tap therefore waits 300ms to see whether a second tap follows;
   * if it does, the pending open is cancelled and it becomes a save.
   *
   * `scrolledAt` guards the carousel: swiping between photos can fire a click
   * on touch, and without this a swipe would navigate away mid-browse.
   */
  const onPhotoTap = () => {
    const now = Date.now();
    if (now - scrolledAt.current < 400) return; // that was a swipe, not a tap
    if (now - lastTap.current < 300) {
      if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
      setHeart(true);
      setTimeout(() => setHeart(false), 600);
      if (!card.saved) onSave();
    } else {
      openTimer.current = setTimeout(() => { openTimer.current = null; onOpen(); }, 300);
    }
    lastTap.current = now;
  };

  return (
    <article className="border-b border-divider bg-surface-1 pb-3">
      {/* ---- Photo / carousel ---- */}
      <div className="relative">
        <div
          onScroll={(e) => {
            const el = e.target as HTMLDivElement;
            scrolledAt.current = Date.now();
            setIdx(Math.round(el.scrollLeft / el.clientWidth));
          }}
          onClick={onPhotoTap}
          // 16/9 — Rajan's call (24 Jul 2026), overriding designs/P2's 4/5. The
          // portrait crop read badly for real property photos; 16/9 matches the
          // ratio housing.com uses for its cards (measured 262×142 at 375px).
          // Ratio ONLY — carousel, snap, counter, dots and badges are untouched
          // because they all size off this same container.
          className="flex aspect-[16/9] w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.length ? (
            photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt="" className="h-full w-full shrink-0 snap-center object-cover" />
            ))
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface-3 text-ink-tertiary">
              <Icon name="image" size={40} />
            </div>
          )}
        </div>

        {/* Promoted / New-Project badge (top-left) */}
        {card.promoted && (
          <span className="absolute left-3 top-3 rounded-4 bg-black/60 px-2 py-1 text-11 font-semibold uppercase tracking-[0.3px] text-white">Promoted</span>
        )}
        {isProject && (
          <span className="absolute left-3 top-3 rounded-4 bg-info-soft px-2 py-1 text-11 font-semibold uppercase tracking-[0.3px] text-info">New Project</span>
        )}

        {/* counter pill */}
        {photos.length > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-11 font-semibold text-white">{idx + 1}/{photos.length}</span>
        )}
        {/* dots */}
        {photos.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
            {photos.map((_, i) => (
              <span key={i} className={cn("rounded-full transition-all", i === idx ? "h-1.5 w-1.5 bg-accent" : "h-1 w-1 bg-white/60")} />
            ))}
          </div>
        )}

        {/* double-tap heart pop */}
        {heart && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Icon name="heart" size={88} filled className="animate-[ping_0.5s_ease-out] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]" />
          </div>
        )}
      </div>

      {/* ---- Body ---- */}
      <div className="flex flex-col gap-1.5 px-4 pt-3">
        {/* The whole info block opens the detail — not just the "View Property"
            button it used to be. One <button> wrapping the text keeps it
            keyboard-reachable instead of an onClick on a bare <div>. */}
        <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1.5 text-left">
        {isProject ? (
          <>
            <span className="text-17 font-semibold text-ink-primary">{card.title}</span>
            <span className="text-15 font-bold text-ink-primary">{card.priceFrom}</span>
            <span className="text-13 text-ink-secondary">{[card.buildStatus, card.rera ? "RERA approved" : null].filter(Boolean).join(" · ")}</span>
          </>
        ) : (
          <>
            {/* Title left, price right (Rajan, 24 Jul 2026). `min-w-0` + `truncate`
                is what actually lets the title ellipsis inside a flex row — without
                min-w-0 a flex item refuses to shrink below its content and would
                push the price off the card instead of clipping. `shrink-0` keeps
                the price fully readable; the title gives up the space. */}
            <span className="flex w-full items-baseline gap-2">
              {card.title && (
                <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink-primary">{card.title}</span>
              )}
              <span className={cn("shrink-0 text-17 font-bold text-ink-primary", !card.title && "flex-1")}>{card.price}</span>
            </span>
            <span className="flex w-full items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-11 font-semibold", card.saleLabel === "For Rent" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent")}>
                {card.saleLabel}
              </span>
              {card.meta && <span className="truncate text-13 text-ink-secondary">{card.meta}</span>}
            </span>
          </>
        )}
        <span className="flex items-center gap-1 text-13 text-ink-tertiary">
          <Icon name="pin" size={14} /> {card.areaLabel ?? "Rajkot"}
        </span>
        </button>

        {/* Poster row — opens the poster's public profile, NOT the listing.
            Its own button so the tap can't fall through to the info block. */}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPoster}
            className="flex min-w-0 items-center gap-2 text-left"
            aria-label={`View ${card.poster.name}'s profile`}
          >
            <Avatar src={card.poster.avatarUrl} name={card.poster.name} size={24} />
            <span className="truncate text-13 font-semibold text-ink-primary">{card.poster.name}</span>
            {card.poster.verified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
            {card.poster.role && <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 capitalize text-ink-secondary">{card.poster.role}</span>}
          </button>
          <span className="ml-auto shrink-0 text-11 text-ink-tertiary">{card.postedAgo}</span>
        </div>

        {/* action bar */}
        <div className="mt-2 flex items-center gap-2">
          <button aria-label={card.saved ? "Saved" : "Save"} onClick={onSave} className="grid h-11 w-11 place-items-center">
            <Icon name="bookmark" size={24} filled={card.saved} className={card.saved ? "text-accent" : "text-ink-primary"} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" className="h-9 px-3 text-13" onClick={onOpen}>{isProject ? "View Project" : "View Property"}</Button>
            <Button className="h-9 px-4 text-13" onClick={onInquiry}>Inquiry</Button>
          </div>
          <button aria-label="More" onClick={onMore} className="grid h-11 w-9 place-items-center">
            <Icon name="more" size={22} className="text-ink-secondary" />
          </button>
        </div>
      </div>
    </article>
  );
}
