"use client";

import { useEffect } from "react";
import { Icon } from "@/components";

/**
 * Render-crash boundary (designs/P4 S6 `isCrash`).
 *
 * There was no error.tsx at all, so any thrown render fell through to Next's
 * default error page — which is not a HomzList screen and offers no way back.
 *
 * The message is deliberately generic: an exception can carry a query, an id or
 * a stack frame, and none of that belongs on a user's screen (Doc9 §7).
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side logging picks this up; the user is never shown the detail.
    console.error("[render error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-column flex-col items-center justify-center bg-page px-6 text-center">
      <Icon name="alert" size={96} className="text-ink-tertiary" />

      <div className="mt-5 text-[20px] font-bold leading-[1.3] text-ink-primary">Something went wrong</div>
      <p className="mt-2 max-w-[280px] text-15 leading-[1.45] text-ink-secondary">
        Please try again. If it keeps happening, contact support.
      </p>

      <button
        onClick={reset}
        className="mt-5 flex h-11 items-center rounded-8 bg-accent px-7 text-15 font-semibold leading-none text-white"
      >
        Reload
      </button>
      <a
        href="/help"
        className="mt-3.5 text-15 font-semibold leading-none text-accent"
      >
        Contact Support
      </a>
    </div>
  );
}
