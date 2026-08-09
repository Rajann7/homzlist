"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeedShell } from "./FeedShell";
import { StoryRow } from "./StoryRow";
import { PropertyFeed, type PropertyFeedHandle } from "./PropertyFeed";
import { RequirementFeed } from "./RequirementFeed";
import { BuilderDashboard } from "./BuilderDashboard";
import { NewListingsPill, AdminBanner, type FeedBanner } from "./primitives";
import { SortSheet } from "./sheets";
import { Icon } from "@/components/ui/Icon";
import { storiesApi, feedApi, type StoryCircle, type FeedInitial } from "@/lib/feed/client";
import { apiFetch } from "@/lib/auth/api-fetch";
import type { CityRow } from "./CitySheet";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/hooks/useNow";
// Guest city choice is a UI-only preference (no identity, no server profile to
// hold it) — shared with the story viewer so the two agree on scope.
import { readGuestCity, writeGuestCity } from "@/lib/feed/guest-city";

/** Admin-banner frequency cap (0 every visit · 1 once/day · 2 once/session). */
function bannerAlreadyShown(id: string, cap: number): boolean {
  try {
    if (cap === 1) return localStorage.getItem(`hz_banner_day_${id}`) === new Date().toISOString().slice(0, 10);
    if (cap === 2) return sessionStorage.getItem(`hz_banner_session_${id}`) === "1";
    return false;
  } catch {
    return false;
  }
}
function recordBannerShown(id: string, cap: number): void {
  try {
    if (cap === 1) localStorage.setItem(`hz_banner_day_${id}`, new Date().toISOString().slice(0, 10));
    else if (cap === 2) sessionStorage.setItem(`hz_banner_session_${id}`, "1");
  } catch {
    /* storage disabled — fall back to showing it */
  }
}

/**
 * The P2 feed home — the app's main screen. Orchestrates the shell (header +
 * story row + mode toggle + bottom nav), the city switch (persists to the
 * profile → feed re-scopes), the new-listings pill (polls `new-count`, shown
 * only after ≥30s on feed) and the Property/Requirement mode split. A BUILDER
 * gets the dashboard variant instead (no foreign listings, no story row).
 */
export function FeedHome({ initial: primed = null }: { initial?: FeedInitial | null }) {
  /**
   * The server's first paint, and it is spent the moment it has been painted.
   *
   * It has to be dropped after that first commit, not merely on the feed's own
   * first load: switching to Requirement mode and back unmounts and remounts the
   * property feed, and a prime that was still on the prop would have handed that
   * remount the cards as they were when the page was OPENED — a refresh that
   * silently showed old rows. After the first paint every mount fetches, exactly
   * as it always did.
   */
  const [initial, setInitial] = useState<FeedInitial | null>(primed);
  useEffect(() => { setInitial(null); }, []);
  /** Whether that prime was built for a signed-in viewer — see the effect below. */
  const primedViewer = useRef<boolean | null>(primed ? primed.viewer : null);

  const [me, setMe] = useState<{ guest: boolean; role: string | null; cityId: string | null; cityName: string | null } | null>(null);
  /**
   * The city the FEED QUERIES run under, as opposed to the one the chip shows.
   *
   * It is the guest's pick and nothing else — a signed-in viewer's city lives on
   * their profile and the server reads it from the session, so sending it is a
   * no-op (lib/location/viewer-city: the profile always wins). That distinction
   * is the whole point: this used to be `me.cityId`, which is null until
   * `/profile/me` answers and then flips to the profile's city — a prop change
   * that re-ran /feed/sections AND remounted every rail, so the feed fetched
   * itself twice on every single load for a result that could not differ.
   *
   * The server's own answer comes first, and only then the browser's copy. Both
   * read the same guest-city cookie, but `readGuestCity` needs a `window` and so
   * returns null while the page is being rendered on the server — taking it
   * first would have made the server render the skeleton for a guest whose
   * primed cards the browser then rendered, which is a hydration mismatch as
   * well as a wasted first paint.
   */
  const [scopeCityId, setScopeCityId] = useState<string | null>(() => primed?.cityId ?? readGuestCity().cityId);
  /**
   * The story row. Primed with the page since 9 Aug 2026 (nothing on home lazy
   * loads any more), and re-fetched only when the city changes or the
   * new-listings pill is tapped — the two things that can actually change it.
   */
  const [stories, setStories] = useState<StoryCircle[] | null>(primed?.stories ?? null);
  /** One-shot: the primed row is already on screen, so skip the mount fetch. */
  const primedStories = useRef(Boolean(primed?.stories));
  const [mode, setMode] = useState<"property" | "requirement">("property");
  const [filter, setFilter] = useState<"buy" | "rent" | "all">("all");
  const [reqKind, setReqKind] = useState<"all" | "sell" | "rent">("all");
  const [sort, setSort] = useState("latest");
  const [sortSheet, setSortSheet] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [banner, setBanner] = useState<FeedBanner | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [badges, setBadges] = useState<{ messages: number; notifications: number | null }>({ messages: 0, notifications: null });

  const scrollRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<PropertyFeedHandle>(null);
  const loadedAt = useRef<number>(useNow());
  /**
   * The current city, as a ref.
   *
   * `loadStories` and the new-count interval are created ONCE (deps `[]`), so
   * they cannot close over `me` — reading it directly would pin them to
   * whatever the city was on first render, and a guest switching city would
   * keep polling the old one. `onCity` writes this before it refreshes, so the
   * very next call already carries the new city.
   *
   * It STARTS at the guest's stored city rather than at null. The story row is
   * loaded from the same effect that loads the profile, so on first paint this
   * was still null and a guest who had picked Ahmedabad got an unscoped story
   * row over an Ahmedabad feed until something re-read it.
   */
  const cityRef = useRef<string | null>(scopeCityId);

  const loadMe = useCallback(async () => {
    try {
      // `apiFetch`, not the plain one. This single call decides `guest` for the
      // WHOLE feed, and the plain fetch cannot refresh an expired access token
      // (they live 15 minutes): open the app after a break and every card's
      // Save, Inquiry and Call opened the login sheet at a signed-in user,
      // because this 401'd once and nothing retried it. `no-store` for the
      // other half — a cached copy of this answer re-guests the same session.
      const res = await apiFetch("/api/v1/profile/me", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        const p = j.data?.profile;
        cityRef.current = p?.cityId ?? null;
        setMe({ guest: false, role: p?.role ?? null, cityId: p?.cityId ?? null, cityName: p?.cityName ?? null });
      } else {
        const g = readGuestCity();
        cityRef.current = g.cityId;
        setMe({ guest: true, role: null, ...g });
      }
    } catch {
      const g = readGuestCity();
      cityRef.current = g.cityId;
      setMe({ guest: true, role: null, ...g });
    }
  }, []);

  const loadStories = useCallback(async () => {
    const res = await storiesApi.list(cityRef.current);
    setStories(res.ok ? res.data.circles : []);
  }, []);

  // The profile still has to be asked for (identity is never in the prime), but
  // the story row already came with the HTML — fetching it again on mount would
  // be a request for rows the screen is already showing.
  useEffect(() => {
    void loadMe();
    // Read, never consumed: a one-shot flag would be spent by StrictMode's first
    // pass and the second pass would fetch the row anyway. A city switch calls
    // `loadStories` directly (see `onCity`), so nothing else needs this effect.
    if (!primedStories.current) void loadStories();
  }, [loadMe, loadStories]);

  /**
   * The server rendered this page's rails before the session was settled. That
   * is almost always the same answer the client gets — but an access token that
   * had expired makes the server render the GUEST feed for someone who is signed
   * in (the client only becomes them after /auth/refresh). Those two feeds
   * differ: your own listings are never in your own feed. So on a mismatch, and
   * only on a mismatch, the feed re-loads under the right identity.
   */
  useEffect(() => {
    if (primedViewer.current === null || !me) return;
    const renderedForViewer = primedViewer.current;
    primedViewer.current = null; // one answer is all this question has
    if (renderedForViewer !== !me.guest) feedRef.current?.refresh();
  }, [me]);

  // Admin banner (P2 slot) — DB-driven; renders only when a row is active AND
  // this viewer hasn't already met its frequency cap (0 = every visit, 1 = once
  // per day, 2 = once per session). The cap is a display preference, so it lives
  // in local/session storage (CLAUDE.md rule 3), never on the server.
  useEffect(() => {
    feedApi.banner().then((r) => {
      if (!r.ok || !r.data.banner) return;
      const b = r.data.banner;
      if (bannerAlreadyShown(b.id, b.frequencyCap)) return;
      recordBannerShown(b.id, b.frequencyCap);
      setBanner(b);
    });
  }, []);

  // Header badge counts — both are real server counts now (Module 10 owns the
  // notifications one). Re-read on focus so the bell clears after the user has
  // been through the notifications screen in another tab.
  useEffect(() => {
    const read = () => feedApi.badges().then((r) => { if (r.ok) setBadges(r.data); });
    void read();
    const onVis = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // New-listings pill: poll new-count; only reveal after ≥30s on feed (Doc7 §83).
  useEffect(() => {
    const since = new Date().toISOString();
    const t = setInterval(async () => {
      if (Date.now() - loadedAt.current < 30_000) return;
      const res = await feedApi.newCount(since, cityRef.current);
      if (res.ok) setNewCount(res.data.count);
    }, 20_000);
    return () => clearInterval(t);
  }, []);

  const onCity = async (c: CityRow) => {
    /**
     * Who re-runs the feed after this switch.
     *
     * A GUEST's pick moves `scopeCityId`, and the feed re-loads on that prop by
     * itself — telling it to refresh as well would fetch the same rails twice.
     * A signed-in pick changes nothing the feed can see (their city lives on the
     * profile the server reads), so that one still has to be told.
     */
    const scopeMoves = !(me && !me.guest) && c.id !== scopeCityId;
    cityRef.current = c.id;
    setMe((m) => (m ? { ...m, cityId: c.id, cityName: c.name } : m));
    if (me && !me.guest) {
      await apiFetch("/api/v1/profile/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ cityId: c.id }) });
    } else {
      writeGuestCity(c.id, c.name);
      setScopeCityId(c.id);
    }
    loadedAt.current = Date.now(); setNewCount(0);
    if (!scopeMoves) feedRef.current?.refresh();
    void loadStories();
  };

  const refresh = async () => {
    loadedAt.current = Date.now();
    setNewCount(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    feedRef.current?.refresh();
    // Await something real so the pull-to-refresh spinner reflects actual work.
    await Promise.all([loadStories(), feedApi.banner().then((r) => { if (r.ok) setBanner(r.data.banner); })]);
  };

  const isBuilder = me?.role === "builder";

  return (
    <FeedShell cityName={me?.cityName ?? null} selectedCityId={me?.cityId ?? null} onCity={onCity} onRefresh={refresh} badges={badges} scrollRef={scrollRef}>
      <div className="relative">
        <NewListingsPill count={newCount} onClick={refresh} />

        {/* Guest strip */}
        {me?.guest && (
          <div className="flex items-center gap-2 bg-accent-soft px-4 py-2 text-13">
            <span className="flex-1 text-ink-secondary">Sign in to save, inquire and chat</span>
            {/* /login lives on the seller host — the middleware 307s this off
                the public origin — so <Link> would prefetch a redirect and then
                hand off anyway. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
            <a href="/login" className="font-semibold text-accent">Sign In</a>
          </div>
        )}

        {isBuilder ? (
          <BuilderDashboard cityName={me?.cityName ?? null} cityId={me?.cityId ?? null} />
        ) : (
          <>
            <StoryRow circles={stories ?? []} loading={stories === null} />

            {/* Admin banner (P2) — DB-driven; between story row and mode toggle. */}
            {banner && !bannerDismissed && (
              <AdminBanner
                banner={banner}
                onDismiss={() => setBannerDismissed(true)}
                onTap={() => { if (banner.targetUrl) window.location.href = banner.targetUrl; }}
              />
            )}

            {/* Mode toggle */}
            <div className="flex items-center justify-center px-4 py-3">
              <div className="relative flex w-full max-w-[280px] rounded-full bg-surface-2 p-1">
                <span className={cn("absolute inset-y-1 w-1/2 rounded-full bg-surface-1 shadow-sm transition-transform duration-200", mode === "requirement" && "translate-x-full")} />
                <button onClick={() => setMode("property")} className={cn("relative z-[1] flex-1 rounded-full py-1.5 text-13 font-semibold", mode === "property" ? "text-ink-primary" : "text-ink-tertiary")}>Property</button>
                <button onClick={() => setMode("requirement")} className={cn("relative z-[1] flex-1 rounded-full py-1.5 text-13 font-semibold", mode === "requirement" ? "text-ink-primary" : "text-ink-tertiary")}>Requirement</button>
              </div>
            </div>

            {/* Filter chips + sort */}
            <div className="flex items-center gap-2 px-4 pb-2">
              {mode === "property" ? (
                <>
                  <Chip active={filter === "buy"} onClick={() => setFilter(filter === "buy" ? "all" : "buy")}>Buy</Chip>
                  <Chip active={filter === "rent"} onClick={() => setFilter(filter === "rent" ? "all" : "rent")}>Rent</Chip>
                  <button onClick={() => setSortSheet(true)} className="ml-auto flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-13 font-semibold text-ink-primary">
                    {SORT_LABEL[sort]} <Icon name="chevron-down" size={14} className="text-ink-tertiary" />
                  </button>
                </>
              ) : (
                <>
                  <Chip active={reqKind === "sell"} onClick={() => setReqKind(reqKind === "sell" ? "all" : "sell")}>Buy</Chip>
                  <Chip active={reqKind === "rent"} onClick={() => setReqKind(reqKind === "rent" ? "all" : "rent")}>Rent</Chip>
                </>
              )}
            </div>

            {mode === "property"
              ? <PropertyFeed ref={feedRef} filter={filter} sort={sort} guest={me?.guest ?? true} cityId={scopeCityId} initial={initial} />
              : <RequirementFeed kind={reqKind} guest={me?.guest ?? true} cityId={scopeCityId} />}
          </>
        )}
      </div>

      <SortSheet open={sortSheet} onClose={() => setSortSheet(false)} value={sort} onChange={setSort} />
    </FeedShell>
  );
}

const SORT_LABEL: Record<string, string> = { latest: "Latest", nearby: "Nearby", price_asc: "Price ↑", price_desc: "Price ↓" };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-13 font-semibold", active ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-primary")}>{children}</button>
  );
}
