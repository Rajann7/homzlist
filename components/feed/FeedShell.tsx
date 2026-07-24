"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/nav/BottomNav";
import { FeedHeader } from "./FeedHeader";
import { PullSpinner } from "./primitives";
import { CitySheet, type CityRow } from "./CitySheet";

/**
 * The feed shell — feed header (scroll-morph) + a scroll container + THE canonical
 * bottom nav. Owns the scroll state so the header can shrink 56→48. The bottom
 * nav is the SAME `DEFAULT_NAV` used on every other screen (profile, listings,
 * etc.) — CLAUDE.md rule 6: one nav, fixed everywhere. The city chip opens the
 * City sheet; selecting swaps the feed in place via `onCity`.
 */
export function FeedShell({
  cityName, selectedCityId, onCity, onRefresh, badges, children, scrollRef,
}: {
  cityName: string | null;
  selectedCityId: string | null;
  onCity: (c: CityRow) => void;
  /** Header bell/message counts. `notifications: null` = no source yet → no badge. */
  badges?: { messages: number; notifications: number | null };
  /** Pull-to-refresh handler (P2). Returns a promise so the spinner can wait on it. */
  onRefresh?: () => void | Promise<void>;
  children: React.ReactNode;
  /** Optional external ref to the scroll container (feed uses it for pull-to-refresh). */
  scrollRef?: React.RefObject<HTMLDivElement>;
}) {
  const router = useRouter();
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? innerRef;
  const [compact, setCompact] = useState(false);
  const [citySheet, setCitySheet] = useState(false);

  // Pull-to-refresh (P2 "pull to refresh indicator"). Only arms at scrollTop 0;
  // distance is damped so it feels like iOS rubber-banding, and a pull past the
  // threshold fires onRefresh and spins until it resolves.
  const THRESHOLD = 64;
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!onRefresh || refreshing) return;
    startY.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPull(0); return; }
    setPull(Math.min(dy * 0.5, THRESHOLD + 24)); // damped
  };
  const onTouchEnd = async () => {
    if (startY.current == null) return;
    const past = pull >= THRESHOLD;
    startY.current = null;
    if (past && onRefresh) {
      setRefreshing(true); setPull(THRESHOLD);
      try { await onRefresh(); } finally { setRefreshing(false); setPull(0); }
    } else setPull(0);
  };

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-column flex-col bg-surface-1">
      <FeedHeader
        compact={compact}
        cityName={cityName}
        onCityTap={() => setCitySheet(true)}
        bellCount={badges?.notifications ?? 0}
        messageCount={badges?.messages ?? 0}
        onBell={() => router.push("/notifications")}
        onMessage={() => router.push("/messages")}
      />
      <div
        ref={ref}
        // Design P2 threshold: scrollTop > 60 (was 80 — the header morphed late).
        onScroll={(e) => setCompact((e.target as HTMLDivElement).scrollTop > 60)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn("flex-1 overflow-y-auto overscroll-contain")}
      >
        <PullSpinner active={refreshing} distance={pull} />
        {children}
      </div>
      <BottomNav />

      <CitySheet open={citySheet} onClose={() => setCitySheet(false)} selectedId={selectedCityId} onSelect={onCity} />
    </div>
  );
}
