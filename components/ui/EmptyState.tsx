import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * EmptyState — Doc1 Component 15 / §10. 96px line-art illustration (single-colour
 * ink-tertiary + one accent detail) + title 15/600 + subtitle 13 + CTA.
 * Each context supplies its own illustration node; a neutral default is provided.
 */

export interface EmptyStateProps {
  title: string;
  subtitle?: string;
  illustration?: React.ReactNode;
  cta?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}

function DefaultIllustration() {
  // Single-stroke line art, ink-tertiary + one accent element (Doc1 §12).
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="20" y="28" width="56" height="44" rx="6" stroke="var(--ink-tertiary)" strokeWidth="2" />
      <path d="M20 44h56" stroke="var(--ink-tertiary)" strokeWidth="2" />
      <circle cx="30" cy="36" r="2.5" fill="var(--accent)" />
      <path d="M32 62l10-10 8 7 6-5 8 8" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ title, subtitle, illustration, cta, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="mb-1">{illustration ?? <DefaultIllustration />}</div>
      <h3 className="text-15 font-semibold text-ink-primary">{title}</h3>
      {subtitle && <p className="max-w-xs text-13 text-ink-secondary">{subtitle}</p>}
      {cta &&
        (cta.href ? (
          <a href={cta.href}>
            <Button className="mt-2">{cta.label}</Button>
          </a>
        ) : (
          <Button className="mt-2" onClick={cta.onClick}>
            {cta.label}
          </Button>
        ))}
    </div>
  );
}
