"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RailSkeleton } from "./skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { FeedCard } from "./FeedCard";
import { ProjectCard } from "./ProjectCard";
import { PersonCard } from "./PersonCard";
import { SectionRail } from "./SectionRail";
import { CaughtUp } from "./primitives";
import { InquirySheet, MoreSheet, ReportSheet, ShareSheet, LoginSheet } from "./sheets";
import { feedApi, interactionsApi, type FeedCard as Card, type FeedPerson, type FeedSectionMeta, type FeedInitial } from "@/lib/feed/client";
import { contactBuilder } from "./contactBuilder";
import { Img } from "@/components/ui/Img";

export interface PropertyFeedHandle { refresh: () => void; }

/**
 * Property-mode feed (Doc7 §78) — CAROUSELS since 5 Aug 2026 (Rajan).
 *
 * It used to be one endless vertical column of mixed cards. It is now a
 * vertical stack of horizontal rails: New Projects first, then per-type rails
 * with Top Builders / Top Brokers in the middle. What did NOT change is
 * everything else — the same FeedCard and ProjectCard, the same Save / Inquiry
 * / Share / Report / Call / WhatsApp flows, the same login gate for guests, the
 * same server-decided ranking and boosts inside every rail.
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
    const skipFirstLoad = useRef(primeUsable);
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
    const [view, setView] = useState<{ filter: string; cityId: string | null; list: FeedSectionMeta[] } | null>(
      primeUsable ? { filter, cityId, list: initial!.sections } : null,
    );
    const sections = view && view.filter === filter && view.cityId === cityId ? view.list : null;    const [offline, setOffline] = useState(false);
    /**
     * Save state lives here, not in a rail: the same listing can appear in two
     * rails at once (its type's rail and a boosted slot), and a heart that only
     * updated the rail you tapped would leave the other one lying.
     */
    const [savedOverride, setSavedOverride] = useState<Record<string, boolean>>({});
    const [suggested, setSuggested] = useState<{ id: string; coverUrl: string | null; price: string; areaLabel: string | null }[]>(
      primeUsable ? initial!.suggested : [],
    );

    const [inquiryFor, setInquiryFor] = useState<Card | null>(null);
    const [shareFor, setShareFor] = useState<Card | null>(null);
    const [reportFor, setReportFor] = useState<Card | null>(null);
    const [moreFor, setMoreFor] = useState<Card | null>(null);
    const [loginSheet, setLoginSheet] = useState(false);

    const load = useCallback(async () => {
      setPrime(null);
      setView(null);
      setSavedOverride({});
      // Both at once. "Suggested for you" (Doc7 §81) has nothing to do with the
      // rails, and awaiting it AFTER them added a whole round trip to a strip
      // that could have been fetched alongside.
      const [res, sug] = await Promise.all([feedApi.sections(filter, cityId), feedApi.suggested(cityId)]);
      if (res.ok) { setView({ filter, cityId, list: res.data.sections }); setOffline(false); }
      else { setOffline(res.error.code === "OFFLINE"); setView({ filter, cityId, list: [] }); }
      if (sug.ok) setSuggested(sug.data.items);
    }, [filter, cityId]);

    useEffect(() => {
      // The server already rendered this exact view into the page; re-fetching
      // it on mount would throw away the prime and put the skeletons back.
      if (skipFirstLoad.current) { skipFirstLoad.current = false; return; }
      void load();
    }, [load]);
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
        {sections.map((s, i) => (
          <div key={s.key}>
            <SectionRail
              // key includes the filter/sort so a Buy/Rent tap remounts the
              // rail with fresh state instead of showing the old page.
              key={`${s.key}:${filter}:${sort}:${cityId ?? ""}`}
              section={s}
              filter={filter}
              sort={sort}
              cityId={cityId}
              // Only the rail the server primed, and only while its cards are
              // still the right cards for the current chips.
              initial={prime?.primed?.key === s.key ? prime.primed.page : null}
              renderCard={renderCard}
              renderPerson={(p) => <PersonCard person={p} onOpen={() => openPerson(p)} />}
              onViewAll={(href) => router.push(href)}
            />

            {/* Suggested strip after the first rail (Doc7 §81) — same mini
                cards, same endpoint, same destination as before. */}
            {i === 0 && suggested.length > 0 && (
              <div className="flex flex-col gap-2 border-b-8 border-surface-2 bg-surface-1 px-4 py-3">
                <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Suggested for you</div>
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {suggested.map((s2) => (
                    <button key={s2.id} onClick={() => router.push(`/property/${s2.id}`)} className="flex w-[104px] shrink-0 flex-col overflow-hidden rounded-8 border border-border bg-surface-1 text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <div className="aspect-square w-full bg-surface-3">{s2.coverUrl && <Img src={s2.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                      <div className="p-1.5"><div className="text-13 font-semibold text-ink-primary">{s2.price}</div><div className="truncate text-11 text-ink-tertiary">{s2.areaLabel ?? ""}</div></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <CaughtUp />

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
