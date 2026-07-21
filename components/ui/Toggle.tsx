"use client";

import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

/**
 * Toggle — Doc1 §5. off surface-3 thumb-white · on accent · disabled 40% ·
 * loading = mini spinner in thumb. transform-only slide (60fps).
 */

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, loading, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cn(
        "chrome relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out-quart",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        checked ? "bg-accent" : "bg-surface-3",
        (disabled || loading) && "opacity-40",
        className,
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full bg-white shadow-l1 transition-transform duration-200 ease-out-quart",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      >
        {loading && <Spinner size={12} className="text-ink-tertiary" />}
      </span>
    </button>
  );
}
