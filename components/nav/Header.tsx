import { cn } from "@/lib/utils";

/**
 * Header — Doc1 §3. 56px + safe-area-top; title/logo left or centre per screen;
 * icon buttons 44×44 right-aligned, 8px apart. Fixed + sticky variants. The
 * scroll-morph (56→48) is wired per-screen where needed (Doc1 §4).
 */

export interface HeaderProps {
  left?: React.ReactNode;
  title?: React.ReactNode;
  /** Centre the title (else left-aligned). */
  centerTitle?: boolean;
  right?: React.ReactNode;
  sticky?: boolean;
  border?: boolean;
  className?: string;
}

export function Header({ left, title, centerTitle, right, sticky = true, border = true, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "chrome z-header mx-auto w-full max-w-column bg-surface-1",
        sticky && "sticky top-0",
        border && "border-b border-border",
        "pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="relative flex h-header items-center gap-2 px-4">
        {left && <div className="flex items-center">{left}</div>}
        {title && (
          <div
            className={cn(
              "flex min-w-0 items-center",
              centerTitle
                ? "pointer-events-none absolute inset-x-0 justify-center"
                : "flex-1",
            )}
          >
            <div className="truncate text-17 font-semibold text-ink-primary">{title}</div>
          </div>
        )}
        {!title && <div className="flex-1" />}
        {right && <div className="z-10 ml-auto flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

/** HomzList wordmark (Doc1 §12): "Homz" ink-primary 700 + "List" accent 700. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("chrome select-none text-20 font-bold tracking-tight", className)}>
      <span className="text-ink-primary">Homz</span>
      <span className="text-accent">List</span>
    </span>
  );
}
