import { cn } from "@/lib/utils";

/** Accent spinner used in buttons/sheets (Doc1 §11 — never full-screen on main screens). */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("animate-spin", className)}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
