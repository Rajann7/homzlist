"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RailSkeleton } from "./skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { FeedCard } from "./FeedCard";
import { ProjectCard } from "./ProjectCard";
import { PersonCard } from "./PersonCard";
import { NewsCard } from "./NewsCard";
import { SellCta } from "./SellCta";
import { SectionRail } from "./SectionRail";
import { CityEmptyNotice } from "./CityEmptyNotice";
import { FeedFooter } from "./FeedFooter";
import { InquirySheet, MoreSheet, ReportSheet, ShareSheet, LoginSheet } from "./sheets";
import { feedApi, interactionsApi, type FeedCard as Card, type FeedPerson, type FeedSectionMeta, type FeedInitial } from "@/lib/feed/client";
import { contactBuilder } from "./contactBuilder";

export interface PropertyFeedHandle { refresh: () => void; }

/**
 * Property-mode feed (Doc7 §78) — CAROUSELS since 5 Aug 2026 (Rajan).
 *
 * It used to be one endless vertical column of mixed cards. It is now a
 * vertical stack of horizontal rails: HomzList top picks → Newly-added
 * properties → Featured Developers → Featured Brokers → Featured properties →
 * Have a property to sell? → News and Articles (reordered 8 Aug 2026). What did
 * NOT change is everything else — the same FeedCard and ProjectCard, the same
 * Save / Inquiry / Share / Report / Call / WhatsApp flows, the same login gate
 * for guests, the same server-decided ranking and boosts inside every rail.
 *
 * The order, the titles, the counts and which rails exist at all are decided by
 * the server (lib/feed/sections.ts). This component asks "what rails?" and
 * renders them; a rail then loads its own cards as it scrolls into view.
 */
export const PropertyFeed = forwardRef<
  PropertyFeedHandle,
  {
    filter: string; sort: string; guest: boolean;
    /**
     * The GUEST's city-chip choice. A signed-in viewer's city comes from their
     * profile server-side, so this is null for them. Without it the chip
     * re-labelled itself and the rails stayed all-India.
     */
    cityId?: string | null;
    /**
     * The rails, and the first one's cards, rendered ON THE SERVER with the page
     * (lib/feed/initial). Used only for the first paint of the default view —
     * any chip, sort or city change goes back to the API exactly as before.
     */
    initial?: FeedInitial | null;
  }
>(
  function PropertyFeed({ filter, sort, guest, cityId = null, initial = null }, ref) {
    const router = useRouter();
    const toast = useToast();
    /**
     * Server-primed only while the view still matches what the server rendered.
     * `filter`/`cityId` are the two things the prime was built for; the moment
     * either differs, the primed rails are the wrong rails and the normal fetch
     * has to run.
     */
    const primeUsable = initial !== null && initial.filter === filter && (initial.cityId ?? null) === cityId;
    /**
     * The prime is ONE-SHOT: `load()` drops it. Without that, a pull-to-refresh
     * (which empties `sections` and so remounts every rail) would hand the first
     * rail the server's original cards again and quietly undo the refresh.
     */
    const [prime, setPrime] = useState(primeUsable ? initial : null);
    /**
     * The view the SERVER already rendered, or null once we have left it.
     *
     * This used to be a one-shot `skipFirstLoad` boolean, and it was wrong in a
     * way that only showed up in the network panel: React StrictMode invokes an
     * effect twice, so the first pass spent the flag and the second pass fetched
     * anyway — /feed/sections plus every rail, on every load, over a screen the
     * server had already filled. Comparing the view instead is idempotent, so
     * running the effect twice does nothing twice.
     *
     * It is cleared the moment a chip or a city takes us off the primed view, so
     * coming BACK to it fetches properly rather than trusting a prime that no
     * longer matches what is on screen.
     */
    const primedView = useRef(primeUsable ? { filter, cityId } : null);
    /** This rail's server-rendered page, or null if it has to fetch its own. */
    const primedFor = (key: string) => prime?.primed.find((p) => p.key === key)?.page ?? null;
    /**
     * The footer's links, captured on the FIRST render and kept.
     *
     * It cannot read the `initial` prop on later renders: FeedHome deliberately
     * nulls that prop once the first paint is committed (so a remount refetches
     * rather than replaying stale cards), which would have taken the footer off
     * the screen a tick after it appeared. Unlike the rails, these links do not
     * depend on the filter, the sort or the city — there is nothing for a
     * refetch to correct — so holding the first answer is right, not stale.
     */
    const [footer] = useState(initial?.footer ?? null);
    /**
     * The rails, together with WHAT THEY ARE THE RAILS FOR.
     *
     * The pair is stored as one value on purpose. A rail is keyed by
     * `key:filter:sort:city`, so the render right after a Buy/Rent tap remounts
     * every rail under the new filter while `sections` is still the old list —
     * they would each fire a request for a rail that is about to be replaced by
     * the answer to `/feed/sections` a moment later. Comparing the stored view
     * against the current props makes that render draw the skeleton instead, so
     * the tap costs exactly one round trip.
     */
    const [view, setView] = useState<{ filter: string; cityId: string | null; list: FeedSectionMeta[]; emptyCity: { cityName: string } | null } | null>(
      primeUsable ? { filter, cityId, list: initial!.sections, emptyCity: initial!.emptyCity } : null,
    );
    const current = view && view.filter === filter && view.cityId === cityId ? view : null;
    const sections = current?.list ?? null;
    /**
     * The viewer picked a city we have nothing live in, so every rail above is
     * all-India. Server-decided (lib/feed/scope), never inferred here from an
     * empty list.
     */
    const emptyCity = current?.emptyCity ?? null;
    const [offline, setOffline] = useState(false);
    /**
     * Save state lives here, not in a rail: the same listing can appear in two
     * rails at once (Newly-added and Featured), and a heart that only updated
     * the rail you tapped would leave the other one lying.
     */
    const [savedOverride, setSavedOverride] = useState<Record<string, boolean>>({});

    const [inquiryFor, setInquiryFor] = useState<Card | null>(null);
    const [shareFor, setShareFor] = useState<Card | null>(null);
    const [reportFor, setReportFor] = useState<Card | null>(null);
    const [moreFor, setMoreFor] = useState<Card | null>(null);
    const [loginSheet, setLoginSheet] = useState(false);

    const load = useCallback(async () => {
      setPrime(null);
      setView(null);
      setSavedOverride({});
      const res = await feedApi.sections(filter, cityId);
      if (res.ok) { setView({ filter, cityId, list: res.data.sections, emptyCity: res.data.emptyCity }); setOffline(false); }
      else { setOffline(res.error.code === "OFFLINE"); setView({ filter, cityId, list: [], emptyCity: null }); }
    }, [filter, cityId]);

    useEffect(() => {
      // The server already rendered this exact view into the page; re-fetching
      // it would throw away the prime and put the skeletons back.
      const p = primedView.current;
      if (p && p.filter === filter && p.cityId === cityId) return;
      primedView.current = null;
      void load();
    }, [load, filter, cityId]);
    useImperativeHandle(ref, () => ({ refresh: () => void load() }), [load]);

    const guard = (fn: () => void) => () => { if (guest) { setLoginSheet(true); return; } fn(); };
    /** Same login gate, for a handler that takes an argument (Call/WhatsApp). */
    const guard2 = <A,>(card: Card, fn: (card: Card, arg: A) => void) => (arg: A) => {
      if (guest) { setLoginSheet(true); return; }
      fn(card, arg);
    };

    const openPoster = (card: Card) => {
      if (card.poster.username) router.push(`/profile/${card.poster.username}`);
      else toast.show("This poster has no public profile yet");
    };

    const openPerson = (p: FeedPerson) => {
      if (p.username) router.push(`/profile/${p.username}`);
      else toast.show("This poster has no public profile yet");
    };

    const save = async (card: Card) => {
      const res = await interactionsApi.toggleSave(card.id, card.saved);
      if (res.ok) {
        setSavedOverride((s) => ({ ...s, [card.id]: res.data.saved }));
        toast.show(res.data.saved ? "Saved to wishlist" : "Removed from wishlist");
      } else if (res.error.code === "UNAUTHORIZED") setLoginSheet(true);
    };

    const contact = (card: Card, via: "call" | "whatsapp") => contactBuilder(card, via, toast.show);

    /** One card, wherever it is mounted — so every rail's cards behave alike. */
    const renderCard = (raw: Card) => {
      const card = raw.id in savedOverride ? { ...raw, saved: savedOverride[raw.id] } : raw;
      return card.kind === "project" ? (
        <ProjectCard
          chrome="rail"
          card={card}
          onOpen={() => router.push(`/project/${card.id}`)}
          onOpenPoster={() => openPoster(card)}
          onContact={guard2(card, contact)}
          onMore={() => setMoreFor(card)}
        />
      ) : (
        <FeedCard
          chrome="rail"
          card={card}
          onOpen={() => router.push(`/property/${card.id}`)}
          // Public profile routes by username (/profile/:username). A poster
          // with no username can't be linked, so tell the user rather than
          // pushing a URL that would 404.
          onOpenPoster={() => openPoster(card)}
          onSave={guard(() => void save(card))}
          onInquiry={guard(() => setInquiryFor(card))}
          onMore={() => setMoreFor(card)}
        />
      );
    };

    if (!sections) {
      // Two whole rails in grey — heading, subtitle, View all and the cards —
      // so the screen fills in place instead of replacing two blocks with a
      // completely different layout.
      return (
        <div>
          <RailSkeleton />
          <RailSkeleton />
        </div>
      );
    }

    if (offline) return <EmptyState title="You're offline" subtitle="Check your connection and try again." cta={{ label: "Retry", onClick: () => void load() }} />;

    if (sections.length === 0) {
      return (
        <EmptyState
          title="No listings in this area yet"
          subtitle="Post a requirement and we'll notify you when something matches."
          cta={{ label: "Post Requirement", onClick: guard(() => router.push("/requirements/new")) }}
        />
      );
    }

    return (
      <div>
        {/* Above the rails, because it explains what the rails are showing. */}
        {emptyCity && (
          <CityEmptyNotice cityName={emptyCity.cityName} onList={() => router.push("/create")} />
        )}

        {sections.map((s) =>
          // The CTA is a block, not a carousel: no cards, no cursor, nothing to
          // fetch, so it does not go through SectionRail at all.
          s.kind === "sell_cta" ? (
            <SellCta key={s.key} section={s} onStart={() => router.push(s.viewAll)} />
          ) : (
            <SectionRail
              // key includes the filter/sort so a Buy/Rent tap remounts the
              // rail with fresh state instead of showing the old page.
              key={`${s.key}:${filter}:${sort}:${cityId ?? ""}`}
              section={s}
              filter={filter}
              sort={sort}
              cityId={cityId}
              // The page the server rendered for THIS rail, while its cards are
              // still the right cards for the current chips. Every rail is
              // primed now, so in the default view none of them fetches.
              initial={primedFor(s.key)}
              renderCard={renderCard}
              renderPerson={(p) => <PersonCard person={p} onOpen={() => openPerson(p)} />}
              renderPost={(p) => <NewsCard post={p} onOpen={() => router.push(`/blog/${p.slug}`)} />}
              onViewAll={(href) => router.push(href)}
            />
          ),
        )}

        {/* Home only — see FeedFooter. Nothing follows it but the fixed nav. */}
        {footer && <FeedFooter legal={footer.legal} />}

        <InquirySheet open={Boolean(inquiryFor)} onClose={() => setInquiryFor(null)} card={inquiryFor} />
        <ShareSheet open={Boolean(shareFor)} onClose={() => setShareFor(null)} card={shareFor} />
        <ReportSheet open={Boolean(reportFor)} onClose={() => setReportFor(null)} card={reportFor} />
        <MoreSheet
          open={Boolean(moreFor)}
          onClose={() => setMoreFor(null)}
          onShare={() => { const c = moreFor; setMoreFor(null); setShareFor(c); }}
          onReport={() => { const c = moreFor; setMoreFor(null); if (guest) { setLoginSheet(true); return; } setReportFor(c); }}
        />
        <LoginSheet open={loginSheet} onClose={() => setLoginSheet(false)} />
      </div>
    );
  },
);
