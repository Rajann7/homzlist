"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomNav, DEFAULT_NAV } from "@/components/nav/BottomNav";
import { useRole } from "@/components/nav/RoleContext";
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
/**
 * The shell owns the city sheet (the header chip opens it), but content INSIDE
 * the shell needs it too — an empty requirement feed has to be able to offer
 * "Change city" as a real action rather than as a sentence. One context instead
 * of threading a callback through every child.
 */
const CityPickerContext = createContext<(() => void) | null>(null);
export const useCityPicker = () => useContext(CityPickerContext);

export function FeedShell({
  cityName, selectedCityId, onCity, onRefresh, badges, children, scrollRef,
}: {
  cityName: string | null;
  selectedCityId: string | null;
  onCity: (c: CityRow) => void;
  /** Header bell/message counts, both real server queries (Module 10). */
  badges?: { messages: number; notifications: number | null };
  /** Pull-to-refresh handler (P2). Returns a promise so the spinner can wait on it. */
  onRefresh?: () => void | Promise<void>;
  children: React.ReactNode;
  /** Optional external ref to the scroll container (feed uses it for pull-to-refresh). */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  /**
   * FeedHome renders on BOTH hosts — app/(public)/page.tsx and
   * app/(seller)/seller/page.tsx — so this one shell serves the guest feed and
   * the seller feed. Only the seller layout mounts a RoleProvider, so a role
   * here means "this is the seller feed" and the header's second slot becomes
   * the Dashboard. The public feed keeps Saved, untouched.
   *
   * This is a UI-shape hint only, exactly like the bottom nav's use of it:
   * /dashboard and every route it opens still authorise themselves server-side,
   * so a forged role buys nothing.
   */
  const role = useRole();
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

  const openCityPicker = useMemo(() => () => setCitySheet(true), []);

  return (
    <CityPickerContext.Provider value={openCityPicker}>
    <div className="mx-auto flex h-[100dvh] w-full max-w-column flex-col bg-surface-1">
      <FeedHeader
        compact={compact}
        cityName={cityName}
        onCityTap={() => setCitySheet(true)}
        bellCount={badges?.notifications ?? 0}
        onBell={() => router.push("/notifications")}
        onSaved={() => router.push("/saved")}
        onDashboard={role ? () => router.push("/dashboard") : undefined}
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
      {/* Unread count rides the Messages icon (now in the bottom nav). */}
      <BottomNav items={DEFAULT_NAV.map((it) => (it.name === "nav-message" ? { ...it, badge: badges?.messages ?? 0 } : it))} />

      <CitySheet open={citySheet} onClose={() => setCitySheet(false)} selectedId={selectedCityId} onSelect={onCity} />
    </div>
    </CityPickerContext.Provider>
  );
}
