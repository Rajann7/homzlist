import { Wordmark } from "@/components";

/**
 * Offline fallback (Doc1 §10 / Doc6 §8). Served by the service worker when a
 * navigation fails with no cached page. Branded, notes the cached feed. Fully
 * static so it works with zero network.
 */
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-column flex-col items-center justify-center gap-4 bg-page px-6 text-center">
      <Wordmark className="text-24" />
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M12 24l72 72" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M30 50a26 26 0 0 1 30-4M20 40a40 40 0 0 1 18-9M76 40a40 40 0 0 0-16-9"
          stroke="var(--ink-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="48" cy="66" r="3" fill="var(--accent)" />
      </svg>
      <h1 className="text-17 font-semibold text-ink-primary">You&apos;re offline</h1>
      <p className="max-w-xs text-13 text-ink-secondary">
        Check your connection. Recently viewed listings are still available from your cached feed.
      </p>
    </div>
  );
}
