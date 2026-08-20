import { cn } from "@/lib/utils";
import { BottomNav, type NavItem } from "./BottomNav";
import { KeyboardInset } from "./KeyboardInset";
import { NetworkStatus } from "@/components/pwa/NetworkStatus";
import { ScrollRestore } from "./ScrollRestore";
import { SideNav } from "./SideNav";

/**
 * AppShell — the global mobile shell (pulled from P2/P3): centred 470px column.
 *
 * Fixed-height shell (h-100dvh, overflow-hidden) with an INTERNAL scroll area
 * and the bottom nav in normal flow below it. The nav therefore never scrolls
 * and stays pinned on every device — the mobile-address-bar-proof way to satisfy
 * "bottom nav fixed, nothing overflowing beneath" (CLAUDE.md rule 6). The header
 * slot sits above the scroll area, so it stays pinned at the top too.
 */

export interface AppShellProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  /** Set false on screens without a bottom nav (e.g. full-screen viewers, auth). */
  showNav?: boolean;
  navItems?: NavItem[];
  className?: string;
  /**
   * Default (true): `main` is the scroll region — the normal screen.
   * false: `main` is a non-scrolling flex column and the CHILD owns scrolling —
   * used by the chat thread so its messages scroll while the composer stays
   * pinned at the bottom (Doc2 §10.2), instead of the composer riding the page.
   */
  scroll?: boolean;
}

export function AppShell({ children, header, showNav = true, navItems, className, scroll = true }: AppShellProps) {
  return (
    // Height subtracts the on-screen keyboard (--kbd, published by KeyboardInset).
    // `100dvh` alone does not shrink when the keyboard opens on iOS/Android, so a
    // bottom-pinned composer ended up underneath it.
    <div
      className="mx-auto flex w-full max-w-column flex-col overflow-hidden bg-page md:max-w-none md:flex-row md:bg-page-desktop"
      style={{ height: "calc(100dvh - var(--kbd, 0px))" }}
    >
      <KeyboardInset />
      {/* Console chrome (00-SPEC.md §2 B): 240px sidebar at 1200+, 72px icon rail
          at 768–1199, and NOTHING below 768 — it renders `hidden md:flex`, and
          returns null outright on browse routes. It is NOT tied to `showNav`:
          a console sub-screen (My plan, Checkout) hides the bottom NAV because
          it is a sub-screen, and on desktop there is no bottom nav to hide —
          losing the sidebar there would strand the seller with a back button. */}
      <SideNav />
      {/* The header/main/nav column. On mobile this wrapper is a plain flex
          column filling the shell — the same three children, in the same order,
          at the same sizes. At `md:` it is what sits beside the sidebar. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        {/* P12 offline strip — sits under the header, above the scroll area, so it
            is visible on every screen the shell owns (Doc3 §98). */}
        <NetworkStatus />
        <main
          className={cn(
            scroll ? "flex-1 overflow-y-auto overscroll-contain" : "flex min-h-0 flex-1 flex-col overflow-hidden",
            className,
          )}
        >
          {/* Restores this screen's scroll offset on Back (Doc8 §193). Only on
              shells that own the scroll — when `scroll` is false the child is the
              scroller and manages its own position (the chat thread does). */}
          {scroll && <ScrollRestore />}
          {children}
        </main>
        {showNav && <BottomNav items={navItems} />}
      </div>
    </div>
  );
}
