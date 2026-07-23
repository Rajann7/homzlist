import Link from "next/link";
import { Icon } from "@/components";

/**
 * Global 404 (designs/P4 S6 `is404`). Also the server response for guessing a
 * draft/hidden/private listing URL (Doc9 §10: 404 for non-authorized, so
 * existence never leaks).
 *
 * The design gives this screen two ways out — Home and Search — so a wrong
 * link is never a dead-end (CLAUDE.md rule 10).
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-column flex-col items-center justify-center bg-page px-6 text-center">
      <Icon name="search" size={96} className="text-ink-tertiary" />

      <div className="mt-5 text-[20px] font-bold leading-[1.3] text-ink-primary">Page not found</div>
      <p className="mt-2 max-w-[280px] text-15 leading-[1.45] text-ink-secondary">
        The link may be broken or the page may have been removed.
      </p>

      <Link
        href="/"
        className="mt-5 flex h-11 items-center rounded-8 bg-accent px-7 text-15 font-semibold leading-none text-white"
      >
        Go to Home
      </Link>
      <Link
        href="/search"
        className="mt-3 flex h-11 items-center rounded-8 border border-border bg-surface-1 px-7 text-15 font-semibold leading-none text-ink-primary"
      >
        Search properties
      </Link>
    </div>
  );
}
