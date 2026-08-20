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
        // `md:max-w-none` releases the 470px lock at 768+ (00-SPEC.md §1). The
        // unprefixed classes are the mobile app and are untouched.
        "chrome z-header mx-auto w-full max-w-column bg-surface-1 md:max-w-none",
        sticky && "sticky top-0",
        border && "border-b border-border",
        "pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      {/* At md+ this row takes the console top bar's proportions from
          01-shell.html — 64px / 68px at 1200 / 40px gutter at 1600, and a 20px
          bold title. Same element, same slots: every screen keeps the actions
          it renders into `left` and `right`, so nothing loses a control. */}
      <div className="relative flex h-header items-center gap-2 px-4 md:h-16 md:px-5 lg:h-[68px] lg:px-7 xl:px-10">
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
            <div className="truncate text-17 font-semibold text-ink-primary md:text-20 md:font-bold md:tracking-[-0.01em]">{title}</div>
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
