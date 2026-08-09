"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/** P2 "New listings" pill — floating, drops in; tap → scroll top + refresh. */
export function NewListingsPill({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
      <button
        onClick={onClick}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface-1 px-4 py-2 text-13 font-semibold text-accent shadow-[0_4px_12px_rgba(0,0,0,0.10)] ring-1 ring-border"
      >
        <Icon name="chevron-down" size={16} className="rotate-180" />
        {count} new listing{count === 1 ? "" : "s"}
      </button>
    </div>
  );
}

/**
 * "You are all caught up" used to close the feed here. Removed 9 Aug 2026
 * (Rajan) — the home screen now ends in its footer, and a "that is everything"
 * marker above a footer read as the page having failed to load the rest.
 */

/**
 * P2 admin banner slot — 16:5 strip with dismiss. Content is DB-driven
 * (`feed_banners`, migration 0027), never hardcoded. When the row carries an
 * image it fills the strip; otherwise the strip paints the design's accent
 * gradient with the title (15px/700) + subtitle (11px/85%), exactly as the P2
 * mock shows ("Home loans @ 8.4% / Pre-approved in 24 hours").
 */
export interface FeedBanner { id: string; title: string; subtitle: string | null; imageUrl: string | null; targetUrl: string | null; frequencyCap: number }

export function AdminBanner({ banner, onDismiss, onTap }: { banner: FeedBanner; onDismiss: () => void; onTap?: () => void }) {
  const tappable = Boolean(banner.targetUrl);
  return (
    <div className="relative mx-4 mt-3 overflow-hidden rounded-12">
      <button
        type="button"
        onClick={tappable ? onTap : undefined}
        className={cn(
          "flex aspect-[16/5] w-full items-center px-5 text-left",
          !banner.imageUrl && "bg-gradient-to-br from-accent to-accent-pressed",
          !tappable && "cursor-default",
        )}
      >
        {banner.imageUrl ? (
          <Img src={banner.imageUrl} alt={banner.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div>
            <div className="text-15 font-bold text-white">{banner.title}</div>
            {banner.subtitle && <div className="text-11 text-white/85">{banner.subtitle}</div>}
          </div>
        )}
      </button>
      <button
        aria-label="Dismiss"
        onClick={onDismiss}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/**
 * `PullSpinner` lived here until 9 Aug 2026. It went with the pull-to-refresh
 * gesture itself (Rajan: "insta jevu reload thay che ae remove karo") — see
 * FeedShell, which still exposes `onRefresh` for the new-listings pill.
 */
