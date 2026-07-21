"use client";

import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * ErrorState — Doc1 Component 16 / §10. Same shell as EmptyState + error
 * illustration + Retry. NEVER shows technical detail to the user (PART D / Doc9
 * §20) — friendly copy only; the real error goes to logs/Sentry server-side.
 */

export interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

function ErrorIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="30" stroke="var(--ink-tertiary)" strokeWidth="2" />
      <path d="M48 34v18" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="60" r="1.8" fill="var(--accent)" />
    </svg>
  );
}

export function ErrorState({
  title = "Something went wrong",
  subtitle = "Please try again in a moment.",
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <ErrorIllustration />
      <h3 className="text-15 font-semibold text-ink-primary">{title}</h3>
      <p className="max-w-xs text-13 text-ink-secondary">{subtitle}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
