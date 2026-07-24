"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { FeedCard } from "./FeedCard";
import { CaughtUp } from "./primitives";
import { InquirySheet, MoreSheet, ReportSheet, ShareSheet, LoginSheet } from "./sheets";
import { feedApi, interactionsApi, type FeedCard as Card } from "@/lib/feed/client";

export interface PropertyFeedHandle { refresh: () => void; }

/**
 * Property-mode feed list (Doc7 §78). Renders the 3 card types, the Suggested
 * strip, caught-up marker, and the Save/Inquiry/Share/Report/Not-interested
 * flows — all wired to real endpoints. Guests get the login sheet on any action.
 */
export const PropertyFeed = forwardRef<PropertyFeedHandle, { filter: string; sort: string; guest: boolean }>(
  function PropertyFeed({ filter, sort, guest }, ref) {
    const router = useRouter();
    const toast = useToast();
    const [cards, setCards] = useState<Card[] | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [suggested, setSuggested] = useState<{ id: string; coverUrl: string | null; price: string; areaLabel: string | null }[]>([]);
    const [offline, setOffline] = useState(false);

    const [inquiryFor, setInquiryFor] = useState<Card | null>(null);
    const [shareFor, setShareFor] = useState<Card | null>(null);
    const [reportFor, setReportFor] = useState<Card | null>(null);
    const [moreFor, setMoreFor] = useState<Card | null>(null);
    const [loginSheet, setLoginSheet] = useState(false);

    const load = useCallback(async () => {
      setCards(null);
      const res = await feedApi.list({ filter, sort });
      if (res.ok) { setCards(res.data.items); setCursor(res.data.nextCursor); setOffline(false); }
      else { setOffline(res.error.code === "OFFLINE"); setCards([]); }
      const sug = await feedApi.suggested();
      if (sug.ok) setSuggested(sug.data.items);
    }, [filter, sort]);

    useEffect(() => { void load(); }, [load]);
    useImperativeHandle(ref, () => ({ refresh: () => void load() }), [load]);

    const loadMore = useCallback(async () => {
      if (!cursor || loadingMore) return;
      setLoadingMore(true);
      const res = await feedApi.list({ filter, sort, cursor });
      setLoadingMore(false);
      if (res.ok) { setCards((c) => [...(c ?? []), ...res.data.items]); setCursor(res.data.nextCursor); }
    }, [cursor, loadingMore, filter, sort]);

    const guard = (fn: () => void) => () => { if (guest) { setLoginSheet(true); return; } fn(); };

    const save = async (card: Card) => {
      const res = await interactionsApi.toggleSave(card.id);
      if (res.ok) {
        setCards((cs) => (cs ?? []).map((c) => (c.id === card.id ? { ...c, saved: res.data.saved } : c)));
        toast.show(res.data.saved ? "Saved to wishlist" : "Removed from wishlist");
      } else if (res.error.code === "UNAUTHORIZED") setLoginSheet(true);
    };

    const notInterested = async (card: Card) => {
      setMoreFor(null);
      if (card.typeCode) await feedApi.notInterested({ typeCode: card.typeCode });
      setCards((cs) => (cs ?? []).filter((c) => c.id !== card.id));
      toast.show("We'll show fewer like this");
    };

    if (!cards) return <div className="flex flex-col gap-4 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-[420px] w-full rounded-12" />)}</div>;

    if (offline) return <EmptyState title="You're offline" subtitle="Check your connection and try again." cta={{ label: "Retry", onClick: () => void load() }} />;

    if (cards.length === 0) {
      return (
        <EmptyState
          title="No listings in this area yet"
          subtitle="Post a requirement and we'll notify you when something matches."
          cta={{ label: "Post Requirement", onClick: () => router.push("/requirements/new") }}
        />
      );
    }

    return (
      <div>
        {cards.map((card, i) => (
          <div key={`${card.kind}-${card.id}`}>
            <FeedCard
              card={card}
              onOpen={() => router.push(`/${card.kind === "project" ? "project" : "property"}/${card.id}`)}
              // Public profile routes by username (/profile/:username). A poster
              // with no username can't be linked, so tell the user rather than
              // pushing a URL that would 404.
              onOpenPoster={() => {
                if (card.poster.username) router.push(`/profile/${card.poster.username}`);
                else toast.show("This poster has no public profile yet");
              }}
              onSave={guard(() => void save(card))}
              onInquiry={guard(() => setInquiryFor(card))}
              onMore={() => setMoreFor(card)}
            />
            {/* Suggested strip after the first card */}
            {i === 0 && suggested.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-divider px-4 py-3">
                <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Suggested for you</div>
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {suggested.map((s) => (
                    <button key={s.id} onClick={() => router.push(`/property/${s.id}`)} className="flex w-[104px] shrink-0 flex-col overflow-hidden rounded-8 border border-border bg-surface-1 text-left">
                      <div className="aspect-square w-full bg-surface-3">{s.coverUrl && <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                      <div className="p-1.5"><div className="text-13 font-semibold text-ink-primary">{s.price}</div><div className="truncate text-11 text-ink-tertiary">{s.areaLabel ?? ""}</div></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {cursor ? (
          <div className="flex justify-center p-4"><Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Load more</Button></div>
        ) : (
          <CaughtUp />
        )}

        <InquirySheet open={Boolean(inquiryFor)} onClose={() => setInquiryFor(null)} card={inquiryFor} />
        <ShareSheet open={Boolean(shareFor)} onClose={() => setShareFor(null)} card={shareFor} />
        <ReportSheet open={Boolean(reportFor)} onClose={() => setReportFor(null)} card={reportFor} />
        <MoreSheet
          open={Boolean(moreFor)}
          onClose={() => setMoreFor(null)}
          onShare={() => { const c = moreFor; setMoreFor(null); setShareFor(c); }}
          onReport={() => { const c = moreFor; setMoreFor(null); if (guest) { setLoginSheet(true); return; } setReportFor(c); }}
          onNotInterested={() => { if (moreFor) void notInterested(moreFor); }}
        />
        <LoginSheet open={loginSheet} onClose={() => setLoginSheet(false)} />
      </div>
    );
  },
);
