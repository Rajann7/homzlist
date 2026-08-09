"use client";

import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/nav/Header";
import { Icon } from "@/components/ui/Icon";

/**
 * The home feed's footer, under News and Articles (Rajan, 9 Aug 2026 — "feed ma
 * blog ni niche footer ready karo, footer home page maj show thase only").
 *
 * HOME ONLY, deliberately. Every other screen ends in the fixed bottom nav; a
 * footer repeated under each of them would push that nav's job onto a second
 * set of links. It is rendered by PropertyFeed after the last rail and nowhere
 * else.
 *
 * LAYOUT (rebuilt 9 Aug 2026 — the first version put Explore and Legal side by
 * side as two columns, and with three links against eight the left column was
 * five rows of dead space next to a ragged right one). The two lists have very
 * different lengths, so they are no longer forced into the same shape:
 *
 *   · Explore is a WRAPPING PILL ROW — three short destinations read as
 *     buttons, fill the width, and cannot leave a gap.
 *   · Legal is a BALANCED TWO-COLUMN GRID — eight items become four even rows.
 *
 * Both the wordmark and the tagline come from one source each: the header's own
 * `Wordmark` (so the brand is drawn once in the app, not twice) and
 * `branding_settings.tagline` via the server prime (so the admin's Branding tab
 * actually moves it).
 */
export function FeedFooter({
  legal, tagline,
}: {
  legal: { slug: string; title: string }[];
  /** `branding_settings.tagline` — admin-owned, never a literal in here. */
  tagline: string;
}) {
  const router = useRouter();
  const year = new Date().getFullYear();

  // Every one of these resolves on BOTH hosts this feed renders on. `/help` is
  // deliberately absent: it exists only under the seller host, so a shared
  // footer linking it would 404 for a guest.
  const explore = [
    { label: "Search", href: "/search", icon: "search" as const },
    { label: "Post a property", href: "/create", icon: "plus" as const },
    { label: "Blog", href: "/blog", icon: "book" as const },
  ];

  return (
    <footer className="bg-surface-2 px-4 pb-9 pt-7">
      <Wordmark />
      {/* Doc1 has no 12px step — 13px is the caption size, held to a narrow
          measure so a long tagline breaks to two tidy lines instead of one
          edge-to-edge run. */}
      <p className="mt-1.5 max-w-[290px] text-13 leading-[1.45] text-ink-secondary">
        {tagline}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {explore.map((e) => (
          <button
            key={e.href}
            type="button"
            onClick={() => router.push(e.href)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-2 text-13 font-semibold text-ink-primary active:bg-surface-3"
          >
            <Icon name={e.icon} size={14} className="text-ink-tertiary" />
            {e.label}
          </button>
        ))}
      </div>

      {/* Only rendered when the CMS has published pages — a heading over an
          empty grid is the same dead space the rails already avoid. */}
      {legal.length > 0 && (
        <>
          <div className="mt-7 text-11 font-semibold uppercase tracking-[0.5px] text-ink-tertiary">
            Legal
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
            {legal.map((p) => (
              <li key={p.slug} className="min-w-0">
                <button
                  type="button"
                  onClick={() => router.push(`/legal/${p.slug}`)}
                  className="block w-full truncate text-left text-13 leading-[1.3] text-ink-secondary active:text-accent"
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-7 flex items-center gap-1.5 border-t border-border pt-4 text-11 text-ink-tertiary">
        <span>© {year} HomzList</span>
        <span aria-hidden="true">·</span>
        <span>Made in India</span>
      </div>
    </footer>
  );
}
