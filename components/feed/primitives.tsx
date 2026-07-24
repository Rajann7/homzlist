"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

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

/** P2 caught-up marker at the feed end. */
export function CaughtUp({ onNearby }: { onNearby?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <Icon name="check-circle" size={32} className="text-accent" />
      <div className="text-15 font-semibold text-ink-primary">You're all caught up</div>
      {onNearby && (
        <button onClick={onNearby} className="text-13 font-semibold text-accent">See listings in nearby areas</button>
      )}
    </div>
  );
}

/**
 * P2 admin banner slot — 16:5 strip with dismiss. Content is DB-driven
 * (`feed_banners`, migration 0027), never hardcoded. When the row carries an
 * image it fills the strip; otherwise the strip paints the design's accent
 * gradient with the title (15px/700) + subtitle (11px/85%), exactly as the P2
 * mock shows ("Home loans @ 8.4% / Pre-approved in 24 hours").
 */
export interface FeedBanner { id: string; title: string; subtitle: string | null; imageUrl: string | null; targetUrl: string | null }

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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.imageUrl} alt={banner.title} className="absolute inset-0 h-full w-full object-cover" />
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

/** Pull-to-refresh spinner shown above the feed while dragging/refreshing. */
export function PullSpinner({ active, distance }: { active: boolean; distance: number }) {
  const shown = distance > 4 || active;
  if (!shown) return null;
  return (
    <div className="flex justify-center overflow-hidden" style={{ height: Math.min(distance, 64) }}>
      <Icon
        name="refund"
        size={22}
        className={cn("mt-2 text-accent", active && "animate-spin")}
        style={!active ? { transform: `rotate(${distance * 4}deg)` } : undefined}
      />
    </div>
  );
}
