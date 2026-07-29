import { cn } from "@/lib/utils";
import { BottomNav, type NavItem } from "./BottomNav";
import { KeyboardInset } from "./KeyboardInset";

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
      className="mx-auto flex w-full max-w-column flex-col overflow-hidden bg-page"
      style={{ height: "calc(100dvh - var(--kbd, 0px))" }}
    >
      <KeyboardInset />
      {header}
      <main
        className={cn(
          scroll ? "flex-1 overflow-y-auto overscroll-contain" : "flex min-h-0 flex-1 flex-col overflow-hidden",
          className,
        )}
      >
        {children}
      </main>
      {showNav && <BottomNav items={navItems} />}
    </div>
  );
}
