"use client";

import { cn } from "@/lib/utils";

/**
 * The pieces both feed cards are built from, so a property card and a project
 * card cannot drift into two different visual languages.
 *
 * Rajan's call (28 Jul 2026) after seeing the first project card: the chips over
 * the photo were three different colour families at once — a light-blue "NEW
 * PROJECT", a solid amber status and a grey glass type chip — and the radius was
 * too round. So every chip on a photo is now the SAME neutral glass, at a 4px
 * radius, and the only colour left up there is a 6px dot that carries the
 * status. Colour stays meaningful instead of decorative.
 */

/** A chip over the photo: one neutral treatment, everywhere. */
export function OverlayChip({
  children, tone, caps = false, className,
}: {
  children: React.ReactNode;
  /** Semantic dot — the ONLY colour over a photo. */
  tone?: "accent" | "warning" | "info" | null;
  caps?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-4 bg-black/55 px-2 py-1 text-11 font-semibold leading-none text-white backdrop-blur-[2px]",
        caps && "uppercase tracking-[0.3px]",
        className,
      )}
    >
      {tone && (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            tone === "accent" ? "bg-accent" : tone === "warning" ? "bg-warning" : "bg-info",
          )}
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A chip in the card BODY (unit types, BHK, sqft, Negotiable…). */
export function MetaChip({ children, tone, className }: { children: React.ReactNode; tone?: "accent" | "muted"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-4 px-2 py-1 text-11 font-semibold leading-none",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The facts strip. Server-built: it only ever receives values the row actually
 * stored, so an empty strip means an empty listing, never a missing query.
 */
export function FactsStrip({ facts }: { facts: { label: string; value: string }[] }) {
  if (!facts.length) return null;
  return (
    <span className="flex w-full items-stretch gap-0.5 rounded-8 bg-surface-2 px-1 py-2.5">
      {facts.map((f) => (
        <span key={f.label} className="min-w-0 flex-1 text-center">
          {/* A long value drops a size instead of being clipped — a 4-column
              strip at 375px cut "Unfurnished" to "Unfurnish…". Never truncated:
              a half-shown fact is worse than a slightly smaller one. */}
          <span className={cn("block break-words font-semibold leading-[1.15] text-ink-primary", f.value.length > 9 ? "text-13" : "text-15")}>{f.value}</span>
          <span className="mt-[3px] block break-words text-11 leading-[1.2] text-ink-tertiary">{f.label}</span>
        </span>
      ))}
    </span>
  );
}
