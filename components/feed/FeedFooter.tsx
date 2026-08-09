"use client";

import { useRouter } from "next/navigation";

/**
 * The home feed's footer, under News and Articles (Rajan, 9 Aug 2026 — "feed ma
 * blog ni niche footer ready karo, footer home page maj show thase only").
 *
 * HOME ONLY, deliberately. Every other screen ends in the fixed bottom nav; a
 * footer repeated under each of them would push that nav's job onto a second
 * set of links. It is rendered by PropertyFeed after the last rail and nowhere
 * else.
 *
 * The legal column is `cms_pages` (lib/legal/service.getLegalIndex), primed with
 * the page — so publishing or retiring a policy in the admin moves this footer,
 * and nothing here is a list of titles typed into a component. The Explore
 * column is app ROUTES, which are structure rather than content.
 */
export function FeedFooter({ legal }: { legal: { slug: string; title: string }[] }) {
  const router = useRouter();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surface-2 px-4 pb-8 pt-7">
      <div className="text-17 font-bold tracking-[-0.2px] text-ink-primary">
        Homz<span className="text-accent">List</span>
      </div>
      <p className="mt-1 text-11 leading-[1.4] text-ink-tertiary">
        Properties without spam calls.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
        <FooterColumn
          title="Explore"
          links={[
            // Every one of these resolves on BOTH hosts this feed renders on.
            // `/help` is deliberately absent: it exists only under the seller
            // host, so a shared footer linking it would 404 for a guest.
            { label: "Search", href: "/search" },
            { label: "Post a property", href: "/create" },
            { label: "Blog", href: "/blog" },
          ]}
          onGo={(href) => router.push(href)}
        />
        {/* Only rendered when the CMS has published pages — an empty column with
            a heading over it is the same dead space the rails already avoid. */}
        {legal.length > 0 && (
          <FooterColumn
            title="Legal"
            links={legal.map((p) => ({ label: p.title, href: `/legal/${p.slug}` }))}
            onGo={(href) => router.push(href)}
          />
        )}
      </div>

      <div className="mt-6 border-t border-border pt-4 text-11 text-ink-tertiary">
        © {year} HomzList. All rights reserved.
      </div>
    </footer>
  );
}

function FooterColumn({
  title, links, onGo,
}: {
  title: string;
  links: { label: string; href: string }[];
  onGo: (href: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="text-11 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">{title}</div>
      <ul className="mt-2 flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <button
              type="button"
              onClick={() => onGo(l.href)}
              className="block w-full truncate text-left text-13 text-ink-secondary active:text-accent"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
