"use client";

import { Wordmark } from "@/components/nav/Header";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * P2 feed header — wordmark (fades on scroll) + city chip (→ City sheet) +
 * bell + message icons. Scroll-morph 56→48 driven by `compact` from the feed's
 * scroll container.
 *
 * Badge counts: the bell (Notifications, P11) and message (Chat, P7) modules
 * aren't built, so no fabricated "3"/"5" badge is shown (DB-lock: never a
 * hardcoded count). A badge appears only when a real count is passed (tracked in
 * PENDING-INTEGRATIONS.md — wire when those modules land).
 */
export function FeedHeader({
  compact, cityName, onCityTap, bellCount = 0, messageCount = 0, onBell, onMessage,
}: {
  compact: boolean;
  cityName: string | null;
  onCityTap: () => void;
  bellCount?: number;
  messageCount?: number;
  onBell?: () => void;
  onMessage?: () => void;
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
          <IconBtn name="message" count={messageCount} onClick={onMessage} label="Messages" />
        </div>
      </div>
    </header>
  );
}

function IconBtn({ name, count, onClick, label }: { name: "bell" | "message"; count: number; onClick?: () => void; label: string }) {
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
