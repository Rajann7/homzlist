"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

/**
 * Button — Doc1 Component 17 + states matrix (Doc1 §5).
 * Variants: primary · secondary · outline · destructive · text · icon.
 * Sizes: default 44px · small 36px.
 * States: default / pressed (scale-0.98 + accent-pressed) / loading (spinner
 * replaces label, width locked) / disabled (accent-disabled, no events) /
 * focus (2px accent ring, offset 2). All via tokens → dark mode is automatic.
 */

type Variant = "primary" | "secondary" | "outline" | "destructive" | "text" | "icon";
type Size = "default" | "small";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const base =
  "chrome relative inline-flex items-center justify-center gap-2 font-sans text-15 font-semibold " +
  "rounded-8 transition-[transform,background-color,color] duration-150 ease-out-quart " +
  "select-none active:scale-[0.98] disabled:pointer-events-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-ink-inverse active:bg-accent-pressed disabled:bg-accent-disabled disabled:text-ink-inverse",
  secondary:
    "bg-surface-2 text-ink-primary active:brightness-95 disabled:text-ink-disabled",
  outline:
    "bg-transparent text-ink-primary border border-border active:bg-surface-2 disabled:text-ink-disabled",
  destructive:
    "bg-error text-ink-inverse active:brightness-95 disabled:opacity-50",
  text: "bg-transparent text-accent px-0 active:opacity-70 disabled:text-ink-disabled",
  icon: "bg-transparent text-ink-primary active:bg-surface-2 disabled:text-ink-disabled",
};

const sizes: Record<Size, string> = {
  default: "h-11 px-4", // 44px
  small: "h-9 px-3", // 36px
};

// Icon buttons are square 44×44 (Doc1 §3 touch-target) regardless of size prop.
const iconSizes: Record<Size, string> = {
  default: "h-11 w-11 px-0",
  small: "h-9 w-9 px-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", loading = false, fullWidth, className, children, disabled, ...props },
  ref,
) {
  const isIcon = variant === "icon";
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        variants[variant],
        isIcon ? iconSizes[size] : sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {/* Loading: spinner replaces label but width stays locked (label hidden, not removed). */}
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === "small" ? 16 : 18} />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
    </button>
  );
});
