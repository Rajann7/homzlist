"use client";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

/**
 * Chip + FilterChip — Doc1 Components 10 & 11, states §5.
 * full-radius, surface-2 default / accent-soft + accent-text selected (13/600).
 * pressed darken 6% · selected ✓ optional · disabled 40% opacity.
 * FilterChip adds a count dot when active + optional leading icon.
 */

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  leadingIcon?: IconName;
  showCheck?: boolean;
  count?: number; // FilterChip active count
}

export function Chip({
  selected = false,
  leadingIcon,
  showCheck = false,
  count,
  className,
  children,
  disabled,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      role="button"
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "chrome inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3 text-13 font-semibold",
        "transition-[background-color,color,transform] duration-150 ease-out-quart active:scale-[0.98] active:brightness-95",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-primary",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
      {...props}
    >
      {leadingIcon && <Icon name={leadingIcon} size={16} strokeWidth={1.7} />}
      {children}
      {selected && showCheck && <Icon name="check" size={14} strokeWidth={2} />}
      {typeof count === "number" && count > 0 && (
        <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-11 font-semibold text-ink-inverse">
          {count}
        </span>
      )}
    </button>
  );
}
