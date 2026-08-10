import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import type { LandingPage } from "@/lib/seo/landing";
import { breadcrumbSchema, faqSchema, itemListSchema, jsonLd } from "@/lib/seo/schema";
import { FaqAccordion } from "./FaqAccordion";
import { ShareAreaButton } from "./ShareAreaButton";
import { Img } from "@/components/ui/Img";
import { loginHref } from "@/lib/auth/next-url";

/**
 * P3 S4 — AREA PAGE, which doubles as the SEO landing page (Doc3 §4, Doc4 §14).
 *
 * SERVER-rendered on purpose: this is the crawlable surface, so the H1, the
 * listings, the unique-content block, the internal links and the FAQ all have
 * to be in the initial HTML — not fetched after hydration. Only the two genuinely
 * interactive bits (share button, FAQ accordions) are client components.
 *
 * Guest-viewable with no login wall, per Doc4 §14 ("guest full (SEO)").
 *
 * Page anatomy follows Doc3 §4 exactly:
 *   breadcrumbs → H1 → stats strip → highlights → chips → listings →
 *   nearby areas → cross-links → FAQ → footer legal.
 */

export function LandingView({ page, basePath = "" }: { page: LandingPage; basePath?: string }) {
  const path = (p: string) => `${basePath}${p}`;
  // "Nothing listed here" is only true when there are NO listings AND NO
  // projects. A city like Surat (0 listings, 1 live project) was showing the
  // empty-state CTA with the project rendered right below it — the page
  // contradicting itself. Projects are content, so they lift the page out of
  // the empty state.
  const thin = page.cards.length === 0 && page.projects.length === 0;
  // A guest signs in and lands on the requirement form, not on the feed.
  // Static destination, so no hook and nothing host-dependent — this renders
  // identically on the server and after hydration.
  const guestCta = loginHref("/requirements/new");

  return (
    <AppShell
      header={
        <header className="chrome sticky top-0 z-header flex w-full items-center gap-1 border-b border-divider bg-surface-1 px-2 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))]">
          <Link href={path("/search")} aria-label="Back to search" className="grid h-11 w-11 place-items-center">
            <Icon name="arrow-left" size={22} strokeWidth={1.8} className="text-ink-primary" />
          </Link>
          <span className="flex-1 truncate text-center text-17 font-semibold text-ink-primary">
            {page.spec.area ? `${page.spec.area.name}, ${page.spec.city.name}` : page.spec.city.name}
          </span>
          <ShareAreaButton title={page.h1} />
        </header>
      }
    >
      {/* Structured data — describes exactly what is rendered below (Doc3 §4). */}
      <script
        type="application/ld+json"
        // Server-generated from the same objects the page renders; no user input
        // reaches it unescaped (JSON.stringify handles the encoding).
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbSchema(page.breadcrumbs),
            itemListSchema(page.h1, page.cards),
            faqSchema(page.faqs),
          ),
        }}
      />

      <div className="px-4 pb-6 pt-3.5">
        {/* breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-2.5 text-11 text-ink-tertiary">
          {page.breadcrumbs.map((b, i) => (
            <span key={b.href}>
              {i > 0 && <span className="mx-1">›</span>}
              {i === page.breadcrumbs.length - 1 ? (
                <span className="text-accent" aria-current="page">{b.label}</span>
              ) : (
                <Link href={b.href} className="text-accent">{b.label}</Link>
              )}
            </span>
          ))}
        </nav>

        {/* H1 = the exact query phrase */}
        <h1 className="mb-4 text-24 font-bold text-ink-primary">{page.h1}</h1>

        {/* stats strip — every figure measured */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {page.statsStrip.map((s) => (
            <div key={s.label} className="rounded-12 bg-surface-2 px-2.5 py-3.5 text-center">
              <div className="text-17 font-bold text-ink-primary">{s.value}</div>
              <div className="mt-[3px] text-11 text-ink-tertiary">{s.label}</div>
            </div>
          ))}
        </div>

        {/* highlights (admin-editable master data) */}
        {page.highlights && (
          <section className="mb-4 rounded-12 bg-surface-2 p-4">
            <h2 className="mb-1.5 text-15 font-semibold text-ink-primary">
              About {page.spec.area?.name ?? page.spec.city.name}
            </h2>
            <p className="text-13 leading-[1.5] text-ink-secondary">{page.highlights}</p>
          </section>
        )}

        {/* the rotating unique-content block */}
        {page.intro && <p className="mb-4 text-13 leading-[1.5] text-ink-secondary">{page.intro}</p>}

        {/* filter chips — each a real landing URL */}
        {page.chips.length > 0 && (
          <div className="mb-4.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {page.chips.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-13 font-semibold leading-9 ${
                  c.active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-ink-primary"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}

        {/* ---- listings ---- */}
        {thin ? (
          /* Zero-listing landing: noindex (set in generateMetadata) + a
             requirement CTA instead of an empty grid (Doc3 §4). */
          <section className="mb-6 rounded-12 border border-border bg-surface-1 p-5 text-center">
            <Icon name="search-list" size={40} className="mx-auto text-ink-tertiary" />
            <div className="mt-3 text-15 font-semibold text-ink-primary">
              Nothing listed here right now
            </div>
            <p className="mx-auto mt-1 max-w-[280px] text-13 text-ink-secondary">
              Post what you&apos;re looking for and verified owners and brokers in{" "}
              {page.spec.area?.name ?? page.spec.city.name} will reach out with matches.
            </p>
            {/* The requirement FORM is seller-host only — `/requirements/new`
                does not exist on the public host, so this CTA 404'd for every
                guest who reached an empty area page. `/login` is 307'd to the
                seller host by the middleware; a plain <a> because <Link> would
                prefetch that redirect and hand off anyway (same reason as the
                feed's guest strip). */}
            <a
              href={basePath ? path("/requirements/new") : guestCta}
              className="mx-auto mt-4 grid h-11 w-full max-w-[260px] place-items-center rounded-8 bg-accent text-15 font-semibold text-white"
            >
              Post a Requirement
            </a>
          </section>
        ) : (
          <div className="mb-4">
            {page.cards.map((c) => (
              <article key={c.id} className="chrome mb-4 overflow-hidden rounded-12 border border-border bg-surface-1 shadow-l1">
                <Link href={`/property/${c.id}`} className="block">
                  <div className="relative aspect-[16/9] bg-surface-2">
                    {c.coverUrl && (
                      <Img src={c.coverUrl} alt={c.title ?? page.h1} className="h-full w-full object-cover" loading="lazy" />
                    )}
                    {c.photos.length > 1 && (
                      <span className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-1 text-11 font-semibold text-white">
                        1/{c.photos.length}
                      </span>
                    )}
                  </div>
                  <div className="px-3.5 pb-3.5 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-17 font-bold text-ink-primary">{c.price}</span>
                      <span className="rounded-4 bg-accent-soft px-[7px] py-1 text-11 font-semibold uppercase tracking-[0.3px] text-accent">
                        {c.saleLabel}
                      </span>
                    </div>
                    {c.meta && <div className="mt-1.5 text-13 text-ink-secondary">{c.meta}</div>}
                    <div className="mt-1 flex items-center gap-1 text-13 text-ink-tertiary">
                      <Icon name="pin" size={14} strokeWidth={1.6} /> {c.areaLabel}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 border-t border-divider pt-2.5">
                      <Avatar src={c.poster.avatarUrl} name={c.poster.name} size={24} />
                      <span className="truncate text-13 font-semibold text-ink-primary">{c.poster.name}</span>
                      {c.poster.verified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
                      {c.poster.role && (
                        <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 capitalize text-ink-tertiary">{c.poster.role}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
            {page.stats.count > page.cards.length && (
              <Link
                href={path(page.seeAllHref)}
                className="grid h-11 w-full place-items-center rounded-8 border border-border bg-surface-1 text-15 font-semibold text-ink-primary"
              >
                See all {page.stats.count} listings
              </Link>
            )}
          </div>
        )}

        {/* ---- projects (when the page family includes them) ---- */}
        {page.projects.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">New projects</h2>
            {page.projects.map((p) => (
              <Link key={p.id} href={`/project/${p.id}`} className="mb-2 flex items-center gap-3 rounded-12 border border-border bg-surface-1 p-3">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-8 bg-surface-2">
                  {p.coverUrl && (
                    <Img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15 font-semibold text-ink-primary">{p.title}</span>
                  <span className="block truncate text-13 text-ink-secondary">{p.priceFrom}</span>
                  <span className="block truncate text-11 text-ink-tertiary">{p.buildStatus}{p.rera ? " · RERA approved" : ""}</span>
                </span>
                <Icon name="chevron-right" size={18} strokeWidth={1.8} className="text-ink-tertiary" />
              </Link>
            ))}
          </section>
        )}

        {/* ---- nearby areas (adjacency-driven internal links) ---- */}
        {page.nearby.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Nearby areas</h2>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {page.nearby.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="h-9 shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-2 px-3.5 text-13 font-semibold leading-9 text-ink-primary"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---- cross-links ---- */}
        {page.crossLinks.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Also explore</h2>
            <div className="flex flex-col">
              {page.crossLinks.map((l) => (
                <Link key={l.href} href={l.href} className="border-b border-divider py-2.5 text-15 text-accent">
                  {l.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---- FAQ ---- */}
        {page.faqs.length > 0 && (
          <section className="mb-4 overflow-hidden rounded-12 border border-border">
            <h2 className="sr-only">Frequently asked questions</h2>
            <FaqAccordion faqs={page.faqs} />
          </section>
        )}

        {/* ---- footer strip ---- */}
        <footer className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-11 text-ink-tertiary">{page.updatedLabel}</span>
          <span className="text-11">
            <Link href="/legal/terms" className="text-accent">Terms</Link>
            {" · "}
            <Link href="/legal/privacy" className="text-accent">Privacy</Link>
            {" · "}
            <Link href="/legal/grievance" className="text-accent">Grievance Officer</Link>
          </span>
        </footer>
      </div>
    </AppShell>
  );
}
