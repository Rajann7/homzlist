"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { storiesApi, interactionsApi, type StoryCircle } from "@/lib/feed/client";
import { readGuestCity } from "@/lib/feed/guest-city";
import { readStoryHandoff } from "@/lib/feed/story-handoff";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P2 Story viewer (designs/P2A, Doc2 §9.3) — fullscreen black, 5s segments
 * auto-advancing across a poster's segments then to the next poster.
 *
 * Three things the first build got wrong, all fixed here:
 *   • THE PHOTO WAS CROPPED. A 4:3 or portrait cover was `object-cover`-ed into
 *     a 9:16 frame, so a listing's own photo lost its top and bottom. It is now
 *     `object-contain` over a blurred copy of itself — the whole photo, always,
 *     with no black bars.
 *   • NO TITLE AND NO WAY OUT. The overlay said a price and a meta string, so a
 *     viewer could not tell what the property was and could not open it. The
 *     card now leads with the server's title and carries an explicit
 *     View property / View project (plus title tap and swipe-up).
 *   • THE FACTS WERE A STRING. `meta` was assembled from bhk/sqft/area. The
 *     strip is now the TYPE's own `key_specs` (migration 0071), resolved
 *     server-side, so a Plot shows plot facts and nothing renders blank.
 *
 * Gestures: tap-right next / tap-left prev / press-hold pause (chrome fades) /
 * swipe-down close / swipe-up open detail / swipe l-r jump posters. Seen is
 * marked per segment (no view-count is ever exposed). Sold mid-24h → the "no
 * longer available" state.
 *
 * ---------------------------------------------------------------------------
 * And four things that made it feel like it was hanging (design untouched):
 *
 *   • IT OPENED ON A BLACK RECTANGLE. Mounting with no data, it painted an
 *     empty black screen and only then fetched the circle list the feed had
 *     just fetched — measured at 825ms, behind a route round-trip Next was not
 *     allowed to prefetch. The row now hands the list over in memory
 *     (lib/feed/story-handoff) and warms route + first photo on pointer-down,
 *     so the first frame has the story on it.
 *   • THE PROGRESS BAR RE-RENDERED THE WHOLE VIEWER 60×/SECOND. `setProgress`
 *     on every rAF tick re-rendered this entire tree — including a scaled,
 *     blur-3xl backdrop and a backdrop-blur card — so the main thread was busy
 *     when the finger arrived and every gesture felt late. The bar is now
 *     written straight to the DOM node; React re-renders only on a real change
 *     (segment, pause, save).
 *   • SWIPES WERE SWALLOWED. Any gesture slower than 220ms had already tripped
 *     press-hold, and release just un-paused — so a normal-speed swipe did
 *     nothing at all. Movement now cancels the hold, and the pointer is
 *     captured so a finger crossing out of its third still completes.
 *   • DEAD ENDS. An empty list, or a list request that failed after the first
 *     paint, left a black screen with no close button and no way back.
 */
const SEGMENT_MS = 5000;
/** Finger travel (px) past which a press is a swipe, not a press-hold. */
const MOVE_SLOP = 10;

export function StoryViewer({ posterId }: { posterId: string }) {
  const router = useRouter();
  const toast = useToast();
  /**
   * Primed from the row that opened us, so the first render is the story and
   * not a black rectangle. `readStoryHandoff` is non-consuming and only answers
   * for a list that actually contains this poster, so a deep link or a stale
   * slot falls through to the fetch below exactly as before.
   */
  const [circles, setCircles] = useState<StoryCircle[] | null>(() => readStoryHandoff(posterId));
  const [pi, setPi] = useState(() => {
    const primed = readStoryHandoff(posterId);
    return primed ? Math.max(0, primed.findIndex((c) => c.posterId === posterId)) : 0;
  });
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Optimistic bookmark state, keyed by listing id (server is still truth). */
  const [saved, setSaved] = useState<Record<string, boolean>>(() => {
    const primed = readStoryHandoff(posterId);
    return primed ? Object.fromEntries(primed.flatMap((c) => c.segments.map((s) => [s.id, s.saved]))) : {};
  });
  const [sending, setSending] = useState(false);
  const startTs = useRef<number>(0);
  const elapsed = useRef<number>(0);
  /** Was the list already in hand at mount? (decides whether we fetch at all) */
  const wasPrimed = useRef(circles !== null);

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    // Already handed the server's own list by the row — re-requesting it would
    // put a second identical round-trip in front of the same pixels. Each
    // segment is still re-confirmed against the server as it comes on screen
    // (the effect below), which is what decides `available`.
    if (wasPrimed.current) return;
    let alive = true;
    void (async () => {
      // Same scope the ROW that opened this used. Unscoped, a guest's circle
      // list would not contain the poster they just tapped and the viewer would
      // close itself the moment it opened.
      const res = await storiesApi.list(readGuestCity().cityId);
      if (!alive) return;
      // An empty list is as dead as a failed one: it used to leave a black
      // screen with nothing on it, close button included.
      if (!res.ok || res.data.circles.length === 0) { close(); return; }
      const list = res.data.circles;
      const start = Math.max(0, list.findIndex((c) => c.posterId === posterId));
      setCircles(list);
      setPi(start);
      setSaved(Object.fromEntries(list.flatMap((c) => c.segments.map((s) => [s.id, s.saved]))));
    })();
    return () => { alive = false; };
  }, [posterId, close]);

  const circle = circles?.[pi];
  const segment = circle?.segments[si];

  /** Read by callbacks that must not re-subscribe on every list change. */
  const circlesRef = useRef(circles);
  useEffect(() => { circlesRef.current = circles; }, [circles]);

  /**
   * Mark seen — and RE-READ the segment from the server.
   *
   * The "no longer available" state could not happen before this: `getStories`
   * only ever returns `availability = 'available'` rows, and the viewer read
   * that list once at mount, so a listing that sold while the story was open
   * kept showing its price until the row fell out of the 24h window. The
   * segment endpoint (which exists precisely to say `available:false`) had no
   * caller at all. Now every segment is confirmed as it comes on screen, and a
   * 404 — taken down entirely — is treated as unavailable too.
   */
  const segmentId = segment?.id;
  /** Segments already reported as seen — one POST each, not one per re-mount. */
  const seenSent = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!segmentId) return;
    let alive = true;
    if (!seenSent.current.has(segmentId)) {
      seenSent.current.add(segmentId);
      void storiesApi.seen(segmentId);
    }
    void (async () => {
      const r = await storiesApi.segment(segmentId);
      if (!alive) return;
      const fresh = r.ok ? r.data.segment : null;
      setCircles((cs) => cs?.map((c) => ({
        ...c,
        segments: c.segments.map((s) => (s.id === segmentId ? fresh ?? { ...s, available: false } : s)),
      })) ?? cs);
    })();
    return () => { alive = false; };
  }, [segmentId]);

  /**
   * The segment cursor. This used to move by calling `setPi`/`setSi` from
   * INSIDE a `setCircles` updater — a React updater must be pure, and under
   * StrictMode it runs twice, which advanced two segments per tap in dev. It
   * reads the list off a ref now and sets exactly the two cursors it owns.
   */
  const advance = useCallback((dir: 1 | -1) => {
    const cs = circlesRef.current;
    if (!cs) return;
    elapsed.current = 0;
    let np = pi, ns = si + dir;
    const segCount = cs[np]?.segments.length ?? 0;
    if (ns >= segCount) { np = pi + 1; ns = 0; }
    else if (ns < 0) { np = pi - 1; ns = (cs[np]?.segments.length ?? 1) - 1; }
    if (np < 0) { ns = 0; np = 0; }
    if (np >= cs.length) { close(); return; }
    setPi(np); setSi(ns < 0 ? 0 : ns);
  }, [pi, si, close]);
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; }, [advance]);

  /**
   * Progress bars, written to the DOM instead of to React state.
   *
   * `setProgress` on every animation frame re-rendered this whole component —
   * blurred backdrop, backdrop-blur card, facts strip, all of it — sixty times
   * a second, for a 2.5px white bar. That is what made taps and swipes land
   * late. The bar nodes are held by ref and their width is set directly; the
   * pixels are identical, the render is gone.
   */
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const paintBars = useCallback((p: number) => {
    for (let i = 0; i < bars.current.length; i++) {
      const el = bars.current[i];
      if (el) el.style.width = i < si ? "100%" : i === si ? `${p * 100}%` : "0%";
    }
  }, [si]);

  // Segment or poster changed → repaint every bar from scratch. Deliberately
  // NOT keyed on `circles`: the per-segment availability re-read replaces that
  // array mid-segment, and resetting the live bar to 0 there would drop it back
  // to zero half a second into every story.
  useEffect(() => { paintBars(0); }, [paintBars, pi]);

  // Auto-advance timer (rAF drives the bar directly — no state per frame).
  useEffect(() => {
    if (!segment || paused) return;
    startTs.current = performance.now() - elapsed.current;
    let id = 0;
    const tick = (now: number) => {
      elapsed.current = now - startTs.current;
      const p = Math.min(1, elapsed.current / SEGMENT_MS);
      paintBars(p);
      if (p >= 1) { advanceRef.current(1); return; }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [segment, paused, paintBars]);

  /**
   * Decode the NEXT frame while the current one is on screen. Without this,
   * every tap-to-next started a cold image fetch and the viewer sat on the
   * blurred backdrop — the "lazy swipe" that had nothing to do with the swipe.
   */
  useEffect(() => {
    const next = circle?.segments[si + 1]?.cover ?? circlesRef.current?.[pi + 1]?.segments[0]?.cover;
    if (!next) return;
    const img = new Image();
    img.decoding = "async";
    img.src = next;
  }, [circle, si, pi]);

  const openDetail = useCallback(() => { if (segment) router.push(segment.href); }, [router, segment]);

  const openProfile = useCallback(() => {
    // A profile with no username has no public page — leave it untappable
    // rather than routing to /profile/undefined.
    if (circle?.posterUsername) router.push(`/profile/${circle.posterUsername}`);
  }, [router, circle]);

  const toggleSave = useCallback(async () => {
    if (!segment || segment.kind !== "property") return;
    const next = !saved[segment.id];
    setSaved((s) => ({ ...s, [segment.id]: next }));           // optimistic
    const r = await interactionsApi.toggleSave(segment.id, !next);
    if (!r.ok) {
      setSaved((s) => ({ ...s, [segment.id]: !next }));        // server said no
      toast.show(r.error.code === "UNAUTHORIZED" ? "Sign in to save" : "Couldn't save");
      return;
    }
    setSaved((s) => ({ ...s, [segment.id]: r.data.saved }));   // server is truth
    toast.show(r.data.saved ? "Saved" : "Removed from saved");
  }, [segment, saved, toast]);

  const sendInquiry = useCallback(async () => {
    if (!segment || sending) return;
    setSending(true);
    const r = segment.kind === "project"
      ? await interactionsApi.projectInquiry(segment.id, { message: "Hi, I'm interested in this project. Could you share the details?" })
      : await interactionsApi.inquiry(segment.id, { message: `Hi, I'm interested in this ${segment.typeLabel ?? "property"}. Is it available?` });
    setSending(false);
    toast.show(r.ok ? "Inquiry sent" : r.error.code === "UNAUTHORIZED" ? "Sign in to inquire" : "Couldn't send");
  }, [segment, sending, toast]);

  /**
   * Gesture handling — same five gestures, same thresholds, but a press that
   * MOVES is no longer eaten by press-hold.
   *
   * Before: pointer-down armed a 220ms timer that paused unconditionally, and
   * pointer-up did nothing at all if it found the viewer paused. A swipe takes
   * far longer than 220ms, so every swipe of ordinary speed was consumed as a
   * hold-and-release and the story simply did not move. Moving past MOVE_SLOP
   * now cancels the hold, and the pointer is captured on down so a finger that
   * leaves its third still delivers pointerup (pointer-leave used to abort it).
   */
  const gesture = useRef<{ x: number; y: number; moved: boolean; held: boolean; hold: ReturnType<typeof setTimeout> | null } | null>(null);

  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.hold) clearTimeout(g.hold);
    setPaused(false);
    return g;
  };

  const onDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no capture — handlers still fire on this element */ }
    const g: NonNullable<typeof gesture.current> = { x: e.clientX, y: e.clientY, moved: false, held: false, hold: null };
    g.hold = setTimeout(() => { if (gesture.current === g && !g.moved) { g.held = true; setPaused(true); } }, 220);
    gesture.current = g;
  };

  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.moved) return;
    if (Math.abs(e.clientX - g.x) <= MOVE_SLOP && Math.abs(e.clientY - g.y) <= MOVE_SLOP) return;
    g.moved = true;
    if (g.hold) { clearTimeout(g.hold); g.hold = null; }
    if (g.held) { g.held = false; setPaused(false); }   // a hold that became a drag is a swipe
  };

  const onUp = (e: React.PointerEvent, third: "left" | "mid" | "right") => {
    const g = endGesture();
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { close(); return; }                 // swipe down → close
    if (dy < -80 && Math.abs(dy) > Math.abs(dx)) { openDetail(); return; }           // swipe up → detail
    if (Math.abs(dx) > 60) {                                                        // swipe l/r → posters
      setPi((p) => Math.max(0, Math.min((circlesRef.current?.length ?? 1) - 1, p + (dx < 0 ? 1 : -1))));
      setSi(0); elapsed.current = 0;
      return;
    }
    if (!g.moved && !g.held) advance(third === "left" ? -1 : 1);                     // tap
  };

  if (!circles || !circle || !segment) {
    // Still loading (or a deep link whose poster has since expired). It used to
    // be a bare black rectangle with no way out; the close control is the same
    // one the loaded screen draws, in the same place.
    return (
      <div className="fixed inset-0 z-[100] bg-surface-2">
        <div className="absolute inset-x-0 top-0 flex justify-end px-3 pt-[calc(env(safe-area-inset-top)+20px)]">
          <button aria-label="Close" onClick={close} className="grid h-11 w-11 shrink-0 place-items-center">
            <Icon name="close" size={24} className="text-ink-primary" />
          </button>
        </div>
      </div>
    );
  }

  const isProject = segment.kind === "project";
  const isSaved = Boolean(saved[segment.id]);

  return (
    <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-surface-2 text-ink-primary">
      {/* ---- tap / hold / swipe zones (below the chrome, above the page) ----
          The zones stay full-bleed. The card above them is pointer-transparent
          over the PHOTO and solid over the facts, so tapping the picture still
          advances and tapping the price still does nothing — same as before. */}
      <div className={cn("absolute inset-0 z-10 flex transition-opacity", paused && "opacity-0")}>
        {(["left", "mid", "right"] as const).map((z) => (
          <div
            key={z}
            className="h-full flex-1 touch-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, z)}
            onPointerCancel={endGesture}
          />
        ))}
      </div>

      {/* ---- chrome: fades out while pressed (immersive) -------------------- */}
      <div className={cn("transition-opacity duration-200", paused && "pointer-events-none opacity-0")}>
        {/* progress bars */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
          {circle.segments.map((_, i) => (
            <div key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-divider">
              <div
                ref={(el) => { bars.current[i] = el; }}
                className="h-full rounded-full bg-accent"
                style={{ width: i < si ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>

        {/* header — poster is a real link to their profile */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-3 pt-[calc(env(safe-area-inset-top)+20px)]">
          <button
            onClick={openProfile}
            disabled={!circle.posterUsername}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
          >
            <Avatar src={circle.posterAvatar} name={circle.posterName} size={40} ring={circle.ring} />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-13 font-semibold">{circle.posterName}</span>
                {circle.verified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
              </span>
              {(segment.postedLabel || segment.areaLabel) && (
                <span className="truncate text-11 text-ink-tertiary">
                  {[segment.postedLabel, segment.areaLabel].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </button>
          <button aria-label="Close" onClick={close} className="grid h-11 w-11 shrink-0 place-items-center">
            <Icon name="close" size={24} className="text-ink-primary" />
          </button>
        </div>

        {/* ---- stage: one white card, photo on top, facts underneath --------
            `pointer-events-none` on the card and `pointer-events-auto` on the
            facts half is what keeps the gestures identical to before: the photo
            half passes taps and swipes straight through to the zones below it,
            and the facts half swallows them so a tap on the price cannot
            advance the story. */}
        <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+76px)] bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 flex flex-col overflow-hidden rounded-16 bg-surface-1 shadow-[0_10px_34px_rgba(0,0,0,0.10)]">

          {/* ---- photo: never cropped ---------------------------------------
              White frame, a soft blurred copy of the same photo behind it, and
              the real photo on top with object-contain — so a landscape,
              portrait or square cover is shown WHOLE, no crop, no black bars. */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-1">
            {segment.cover ? (
              <>
                <div
                  className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-2xl"
                  style={{ backgroundImage: `url(${segment.cover})` }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Img
                    src={segment.cover}
                    alt=""
                    draggable={false}
                    // The one photo on a fullscreen screen must never lazy-load:
                    // the default deferred it behind the browser's own
                    // scheduling, which is a chunk of the wait on every segment.
                    priority
                    className={cn("max-h-full max-w-full object-contain", !segment.available && "opacity-40 grayscale")}
                  />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-surface-2">
                <Icon name="image" size={48} className="text-ink-tertiary" />
              </div>
            )}
          </div>

          {segment.available ? (
            <div className="pointer-events-auto border-t border-divider p-3.5">
              {/* title row — tapping it opens the same detail screen */}
              <button onClick={openDetail} className="flex w-full items-center gap-1.5 text-left">
                <span className="min-w-0 flex-1 truncate text-15 font-bold leading-tight">{segment.title}</span>
                <Icon name="chevron-right" size={16} className="shrink-0 text-ink-tertiary" />
              </button>

              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-11 text-ink-tertiary">
                {segment.typeLabel && (
                  // Capped, not just `shrink-0`: a long type label ("Agriculture
                  // Land") used to push the area label out of the row entirely.
                  <span className="max-w-[45%] shrink-0 truncate rounded-6 bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-pressed">
                    {segment.typeLabel}
                  </span>
                )}
                {segment.areaLabel && <span className="truncate">{segment.areaLabel}</span>}
              </div>

              <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 max-w-full truncate text-24 font-extrabold leading-tight tracking-tight">{segment.price}</span>
                {(segment.negotiable || segment.subtitle) && (
                  <span className="min-w-0 truncate text-11 font-semibold text-ink-tertiary">
                    {segment.subtitle ?? "Negotiable"}
                  </span>
                )}
              </div>

              {/* facts strip — as many columns as the server resolved (0071) */}
              {segment.specs.length > 0 && (
                <div className="mt-2.5 flex items-stretch rounded-12 bg-surface-2 py-2">
                  {segment.specs.map((s, i) => (
                    <div
                      key={s.label + i}
                      className={cn("min-w-0 flex-1 px-1 text-center", i > 0 && "border-l border-divider")}
                    >
                      <div className="flex min-w-0 items-center justify-center gap-1">
                        <Icon name={s.icon as IconName} size={13} className="shrink-0 text-ink-tertiary" />
                        <span className="truncate text-13 font-bold">{s.value}</span>
                      </div>
                      <div className="truncate text-[10px] text-ink-tertiary">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                {!isProject && (
                  <button
                    aria-label={isSaved ? "Remove from saved" : "Save"}
                    aria-pressed={isSaved}
                    onClick={toggleSave}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-12 border border-divider bg-surface-1 active:bg-surface-2"
                  >
                    <Icon name="bookmark" size={19} filled={isSaved} className="text-ink-primary" />
                  </button>
                )}
                <button
                  onClick={openDetail}
                  className="h-11 flex-1 truncate rounded-12 border border-divider bg-surface-1 px-2 text-13 font-semibold active:bg-surface-2"
                >
                  {/* On a 320px screen the full label truncates to "View prop…",
                      so the narrow width gets the short label instead of an
                      ellipsis. Same button, same action. */}
                  <span className="hidden min-[360px]:inline">{isProject ? "View project" : "View property"}</span>
                  <span className="min-[360px]:hidden">View</span>
                </button>
                <button
                  onClick={sendInquiry}
                  disabled={sending}
                  className="h-11 flex-[1.25] truncate rounded-12 bg-accent px-2 text-15 font-bold text-on-accent shadow-[0_8px_20px_rgba(15,157,88,0.28)] active:bg-accent-pressed disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send Inquiry"}
                </button>
              </div>
            </div>
          ) : (
            /* ---- sold / hidden mid-24h ------------------------------------- */
            <div className="pointer-events-auto border-t border-divider p-5 text-center">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2">
                <Icon name="close" size={22} className="text-ink-tertiary" />
              </div>
              <div className="text-15 font-bold">No longer available</div>
              <p className="mt-1 truncate text-13 text-ink-tertiary">This one was taken down by the poster.</p>
              <button
                onClick={() => router.push(segment.areaLabel ? `/search?q=${encodeURIComponent(segment.areaLabel)}` : "/search")}
                className="mt-4 inline-block max-w-full truncate rounded-full border border-divider bg-surface-1 px-5 py-2.5 text-13 font-semibold active:bg-surface-2"
              >
                {segment.areaLabel ? `Browse similar in ${segment.areaLabel}` : "Browse similar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
