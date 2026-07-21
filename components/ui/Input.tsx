"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * Input + top-label + InlineFieldError — Doc1 Components 17-family + 38, states §5.
 * Labels are ALWAYS visible (top-label pattern, no placeholder-only) — Doc1 §12.
 * default border → focus accent 1.5px → error border + inline error message.
 */

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode; // e.g. ₹ for price
  optional?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, prefix, optional, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={inputId} className="chrome text-13 font-semibold text-ink-secondary">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-tertiary">(optional)</span>}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-8 border bg-surface-2 px-3 transition-colors duration-150",
          // Doc1 §5 / P1: inputs have a 1px --border at rest, accent 1.5px on focus.
          "h-11",
          error
            ? "border-error"
            : "border-border focus-within:border-accent focus-within:border-[1.5px]",
          disabled && "opacity-60",
        )}
      >
        {prefix && <span className="text-15 text-ink-tertiary">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          className={cn(
            "w-full bg-transparent text-15 text-ink-primary outline-none",
            "placeholder:text-ink-tertiary disabled:text-ink-disabled",
            className,
          )}
          {...props}
        />
      </div>
      {/* Inline error (Doc1 Component 38): 11px error text + icon below field. */}
      {error ? (
        <p id={errId} className="flex items-center gap-1 text-11 text-error">
          <Icon name="alert" size={14} strokeWidth={1.7} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-11 text-ink-tertiary">{hint}</p>
      ) : null}
    </div>
  );
});
