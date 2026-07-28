"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FactsStrip, MetaChip, OverlayChip } from "./cardChrome";
import type { FeedCard as Card } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * The PROPERTY card in the home feed (P2), redesigned 28 Jul 2026 (Rajan) to
 * the same language as the project card: one neutral glass chip family over the
 * photo, a 4px radius everywhere, price → chips → facts strip → location →
 * poster.
 *
 * Unchanged by that redesign: the 16/9 photo, the carousel with its dots and
 * counter, and double-tap-to-save. Projects no longer come through here at all
 * — they render in ProjectCard, because half of this card's controls
 * (`saves`, `inquiries`) are keyed to `listings` and never worked for one.
 *
 * Every number and label is server-computed; this renders, it never derives.
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
  const photos = card.photos.length ? card.photos : card.coverUrl ? [card.coverUrl] : [];
  const [idx, setIdx] = useState(0);
  const [heart, setHeart] = useState(false);
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledAt = useRef(0);

  /**
   * Photo tap does double duty, so single vs double has to be disambiguated:
   *   double-tap → heart pop + save
   *   single tap → open the detail
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
      // Double-tap-to-save must respect the same rule as the heart button, or
      // it becomes the one way left to save your own post (and would flash a
      // heart the server then refuses).
      if (!card.isOwn) {
        setHeart(true);
        setTimeout(() => setHeart(false), 600);
        if (!card.saved) onSave();
      }
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

        {card.promoted && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
            <OverlayChip caps>Promoted</OverlayChip>
          </div>
        )}

        {/* counter pill */}
        {photos.length > 1 && (
          <span className="pointer-events-none absolute right-3 top-3 rounded-4 bg-black/55 px-2 py-1 text-11 font-semibold leading-none text-white backdrop-blur-[2px]">{idx + 1}/{photos.length}</span>
        )}

        {/* Sale kind + property type, over the same gradient the project card
            uses. The sale label used to sit in the body as a coloured pill —
            up here it reads at a glance and the body stays about the property. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
          {card.saleLabel && (
            <OverlayChip caps tone={card.saleLabel === "For Rent" ? "warning" : "accent"} className="shrink-0">{card.saleLabel}</OverlayChip>
          )}
          {card.typeLabel && <OverlayChip>{card.typeLabel}</OverlayChip>}
          {/* dots ride in the same row, pushed right, so they can't collide
              with the chips the way a centred row would */}
          {photos.length > 1 && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {photos.map((_, i) => (
                <span key={i} className={cn("rounded-full transition-all", i === idx ? "h-1.5 w-1.5 bg-white" : "h-1 w-1 bg-white/50")} />
              ))}
            </span>
          )}
        </div>

        {/* double-tap heart pop */}
        {heart && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Icon name="heart" size={88} filled className="animate-[ping_0.5s_ease-out] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]" />
          </div>
        )}
      </div>

      {/* ---- Body ---- */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        {/* The whole info block opens the detail — not just the "View Property"
            button it used to be. One <button> wrapping the text keeps it
            keyboard-reachable instead of an onClick on a bare <div>. */}
        <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 text-left">
          {card.title && (
            <span className="w-full truncate text-17 font-semibold leading-[1.25] text-ink-primary">{card.title}</span>
          )}

          <span className="flex w-full items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-20 font-bold leading-none text-ink-primary">{card.price}</span>
            {card.negotiable && <MetaChip className="shrink-0">Negotiable</MetaChip>}
          </span>

          {(card.metaChips?.length ?? 0) > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {card.metaChips!.map((m) => <MetaChip key={m}>{m}</MetaChip>)}
            </span>
          )}

          <FactsStrip facts={card.facts ?? []} />

          <span className="flex items-center gap-1 text-13 text-ink-tertiary">
            <Icon name="pin" size={14} /> {card.areaLabel ?? "Rajkot"}
          </span>
        </button>

        {/* Poster row — opens the poster's public profile, NOT the listing.
            Its own button so the tap can't fall through to the info block. */}
        <div className="flex items-center gap-2">
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
        <div className="mt-1 flex items-center gap-2">
          {/* Your own post carries no wishlist heart — it is already yours, and
              the server refuses a self-save anyway. */}
          {card.isOwn ? (
            <Button variant="outline" className="h-10 flex-1 text-13" onClick={onOpen}>View Property</Button>
          ) : (
            <>
              <button
                aria-label={card.saved ? "Saved" : "Save"}
                onClick={onSave}
                className="grid h-10 w-11 shrink-0 place-items-center rounded-8 border border-border"
              >
                <Icon name="bookmark" size={18} filled={card.saved} className={card.saved ? "text-accent" : "text-ink-primary"} />
              </button>
              <Button variant="outline" className="h-10 flex-1 text-13" onClick={onOpen}>View</Button>
              <Button className="h-10 flex-1 text-13" onClick={onInquiry}>Inquiry</Button>
            </>
          )}
          <button aria-label="More" onClick={onMore} className="grid h-11 w-9 shrink-0 place-items-center">
            <Icon name="more" size={22} className="text-ink-secondary" />
          </button>
        </div>
      </div>
    </article>
  );
}
