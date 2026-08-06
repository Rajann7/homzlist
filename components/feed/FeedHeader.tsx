"use client";

import { Wordmark } from "@/components/nav/Header";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * P2 feed header — wordmark (fades on scroll) + city chip (→ City sheet) +
 * bell + saved icons. Scroll-morph 56→48 driven by `compact` from the feed's
 * scroll container. (Messages moved to the bottom nav; Saved lives here now.)
 *
 * Badge counts: the bell (Notifications) shows a badge only when a real count is
 * passed (DB-lock: never a fabricated count). The unread chat count rides the
 * Messages icon in the bottom nav.
 */
export function FeedHeader({
  compact, cityName, onCityTap, bellCount = 0, onBell, onSaved, onDashboard,
}: {
  compact: boolean;
  cityName: string | null;
  onCityTap: () => void;
  bellCount?: number;
  onBell?: () => void;
  onSaved?: () => void;
  /**
   * Seller feed only. When present, the second header slot becomes the
   * Dashboard hub instead of Saved (Rajan, 6 Aug 2026). Saved was a DUPLICATE
   * entry point — it still has its row in the profile sheet — so the slot was
   * free; the public feed passes nothing and keeps its heart exactly as before.
   */
  onDashboard?: () => void;
}) {
  return (
    <header className="chrome z-header sticky top-0 mx-auto w-full max-w-column border-b border-border bg-surface-1 pt-[env(safe-area-inset-top)]">
      <div className={cn("relative flex items-center gap-2 px-4 transition-[height] duration-150", compact ? "h-12" : "h-14")}>
        {/* Design P2: the wordmark COLLAPSES on scroll (opacity 0 + max-width 0 +
            -8px margin), it does not just fade — otherwise it keeps its 80px of
            width and leaves a hole the city chip can't close. */}
        <Wordmark
          className={cn(
            "shrink-0 overflow-hidden transition-[opacity,max-width,margin] duration-200",
            // Expanded cap is generous on purpose: the design's 80px matches its
            // 17px prototype wordmark, ours renders wider and 80px CLIPPED it
            // ("HomzLis"). The collapsed end-state is what the morph is about.
            compact ? "-mr-2 max-w-0 opacity-0" : "max-w-[200px] opacity-100",
          )}
        />

        <button
          onClick={onCityTap}
          className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5"
        >
          <Icon name="pin" size={16} className="text-accent" />
          <span className="max-w-[120px] truncate text-13 font-semibold text-ink-primary">{cityName ?? "Select city"}</span>
          <Icon name="chevron-down" size={14} className="text-ink-tertiary" />
        </button>

        <div className="ml-auto flex items-center">
          <IconBtn name="bell" count={bellCount} onClick={onBell} label="Notifications" />
          {/* Seller: the Dashboard hub. Public/guest: Saved, unchanged. */}
          {onDashboard ? (
            <IconBtn name="grid" count={0} onClick={onDashboard} label="Dashboard" />
          ) : (
            <IconBtn name="heart" count={0} onClick={onSaved} label="Saved" />
          )}
        </div>
      </div>
    </header>
  );
}

function IconBtn({ name, count, onClick, label }: { name: "bell" | "message" | "heart" | "grid"; count: number; onClick?: () => void; label: string }) {
  return (
    <button aria-label={label} onClick={onClick} className="relative grid h-11 w-11 place-items-center">
      <Icon name={name} size={24} className="text-ink-primary" />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-semibold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
