"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * AuthPageShell — the entry flow as a POPUP on desktop and tablet
 * (designs/desktop-tablet/02-auth-entry.html).
 *
 * MOBILE IS UNTOUCHED. Every class here is `md:` prefixed, so below 768 this is
 * a transparent wrapper around the screen inside and the phone keeps the exact
 * full-bleed flow it has today — including the ✕, which is `hidden md:grid`.
 *
 * At 768+ the page dims and the flow becomes a centred card: 420 wide, 520 for
 * the role step, `--surface-1` on a hairline border with the dialog shadow.
 *
 * Why the popup is here and not over the page the visitor was reading: session
 * cookies are HOST-ONLY and the middleware SEALS the public host against them
 * (Doc9 §28 — it strips `hz_at`/`hz_rt` if they ever appear there, and `/login`
 * on the public host is always redirected to `seller.<host>`). Mounting this
 * flow inside a public page therefore mints the session on the wrong host: it
 * was tried, and it produced ERR_TOO_MANY_REDIRECTS as the session hint bounced
 * the device between the two hosts. So a gated action still hands off to
 * `seller.<host>/login?next=…` — one navigation — and what the visitor lands on
 * is this dialog.
 */
export function AuthPageShell({
  /** The role step's card is wider (520) — three role rows need the room. */
  wide,
  /** The card's ✕. Omitted = no close affordance. */
  onClose,
  children,
}: {
  wide?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="md:flex md:min-h-[100dvh] md:items-center md:justify-center md:bg-black/45 md:px-6 md:py-10">
      <div
        className={cn(
          "md:relative md:w-full md:rounded-16 md:border md:border-border md:bg-surface-1 md:p-8 md:shadow-l3",
          wide ? "md:max-w-[520px]" : "md:max-w-[420px]",
        )}
      >
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 hidden h-9 w-9 place-items-center rounded-full text-ink-tertiary md:grid"
          >
            <Icon name="close" size={22} strokeWidth={1.7} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
