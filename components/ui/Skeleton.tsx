import { cn } from "@/lib/utils";

/**
 * Skeleton — Doc1 Component 14. surface-3 base + shimmer sweep 1.2s.
 * Reduced-motion turns the shimmer static (handled globally in globals.css).
 * Shape presets per component keep the loading layout matching the final one
 * (no layout shift — Doc8 §8).
 */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn("relative block overflow-hidden rounded-8 bg-surface-3", className)}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/5 to-transparent dark:via-white/5" />
    </span>
  );
}

/** PropertyCard skeleton twin (4:5 photo + price + meta rows) — Doc1 §11 choreography. */
export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-[4/5] w-full rounded-12" />
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-32" />
        <div className="mt-1 flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

/** List-row skeleton (avatar + two lines). */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
