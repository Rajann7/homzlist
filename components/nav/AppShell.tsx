import { cn } from "@/lib/utils";
import { BottomNav, type NavItem } from "./BottomNav";

/**
 * AppShell — the global mobile shell (pulled from P2/P3): centred 470px column,
 * scrollable content padded above the fixed bottom nav (nothing hidden beneath
 * it — CLAUDE.md rule 6), optional header slot. Desktop/tablet native layouts
 * (Doc6 §5.4) are layered on in Module 14; this is the mobile-true base.
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      {header}
      <main className={cn("flex-1", showNav && "pb-nav-safe", className)}>{children}</main>
      {showNav && <BottomNav items={navItems} />}
    </div>
  );
}
