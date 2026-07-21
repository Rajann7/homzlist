import { cn } from "@/lib/utils";
import { BottomNav, type NavItem } from "./BottomNav";

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
}

export function AppShell({ children, header, showNav = true, navItems, className }: AppShellProps) {
  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-column flex-col overflow-hidden bg-page">
      {header}
      <main className={cn("flex-1 overflow-y-auto overscroll-contain", className)}>{children}</main>
      {showNav && <BottomNav items={navItems} />}
    </div>
  );
}
