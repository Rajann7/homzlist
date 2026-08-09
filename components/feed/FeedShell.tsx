"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomNav, DEFAULT_NAV } from "@/components/nav/BottomNav";
import { useRole } from "@/components/nav/RoleContext";
import { NetworkStatus } from "@/components/pwa/NetworkStatus";
import { ScrollRestore } from "@/components/nav/ScrollRestore";
import { FeedHeader } from "./FeedHeader";
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
  /**
   * Refresh the feed in place. No longer a pull gesture (removed 9 Aug 2026) —
   * it is what the "N new listings" pill and a city switch call.
   */
  onRefresh?: () => void | Promise<void>;
  children: React.ReactNode;
  /** Optional external ref to the scroll container (the feed scrolls it to top). */
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

  /**
   * Pull-to-refresh was removed on 9 Aug 2026 (Rajan: "upper thi niche swipe
   * kari aetle insta jevu reload thay che ae remove karo").
   *
   * `onRefresh` is NOT gone with it — the "N new listings" pill still calls it,
   * and so does a city switch, which is where a refresh is a deliberate act
   * rather than a side effect of scrolling back to the top. What is gone is the
   * gesture and its spinner.
   */
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
      {/* The feed does NOT go through AppShell — it has its own header, scroller
          and nav — so the shell-level pieces have to be mounted here too, or the
          app's most-used screen is the one screen with no offline banner and no
          scroll restore (Doc3 §98 / Doc8 §193). */}
      <NetworkStatus />
      <div
        ref={ref}
        // Design P2 threshold: scrollTop > 60 (was 80 — the header morphed late).
        onScroll={(e) => setCompact((e.target as HTMLDivElement).scrollTop > 60)}
        className={cn("flex-1 overflow-y-auto overscroll-contain")}
      >
        <ScrollRestore />
        {children}
      </div>
      {/* Unread count rides the Messages icon (now in the bottom nav). */}
      <BottomNav items={DEFAULT_NAV.map((it) => (it.name === "nav-message" ? { ...it, badge: badges?.messages ?? 0 } : it))} />

      <CitySheet open={citySheet} onClose={() => setCitySheet(false)} selectedId={selectedCityId} onSelect={onCity} />
    </div>
    </CityPickerContext.Provider>
  );
}
