"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { storiesApi, interactionsApi, type StoryCircle } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

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
 */
const SEGMENT_MS = 5000;

export function StoryViewer({ posterId }: { posterId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [circles, setCircles] = useState<StoryCircle[] | null>(null);
  const [pi, setPi] = useState(0);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  /** Optimistic bookmark state, keyed by listing id (server is still truth). */
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const raf = useRef<number>(0);
  const startTs = useRef<number>(0);
  const elapsed = useRef<number>(0);

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    void (async () => {
      const res = await storiesApi.list();
      if (!res.ok) { close(); return; }
      const list = res.data.circles;
      const start = Math.max(0, list.findIndex((c) => c.posterId === posterId));
      setCircles(list);
      setPi(start);
      setSaved(Object.fromEntries(list.flatMap((c) => c.segments.map((s) => [s.id, s.saved]))));
    })();
  }, [posterId, close]);

  const circle = circles?.[pi];
  const segment = circle?.segments[si];

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
  useEffect(() => {
    if (!segmentId) return;
    let alive = true;
    void storiesApi.seen(segmentId);
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

  const advance = useCallback((dir: 1 | -1) => {
    setProgress(0); elapsed.current = 0;
    setCircles((cs) => {
      if (!cs) return cs;
      let np = pi, ns = si + dir;
      const segCount = cs[np]?.segments.length ?? 0;
      if (ns >= segCount) { np = pi + 1; ns = 0; }
      else if (ns < 0) { np = pi - 1; ns = (cs[np]?.segments.length ?? 1) - 1; }
      if (np < 0) { ns = 0; np = 0; }
      if (np >= cs.length) { close(); return cs; }
      setPi(np); setSi(ns < 0 ? 0 : ns);
      return cs;
    });
  }, [pi, si, close]);

  // Auto-advance timer (rAF for smooth progress bar).
  useEffect(() => {
    if (!segment || paused) return;
    startTs.current = performance.now() - elapsed.current;
    const tick = (now: number) => {
      elapsed.current = now - startTs.current;
      const p = Math.min(1, elapsed.current / SEGMENT_MS);
      setProgress(p);
      if (p >= 1) advance(1);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [segment, paused, advance, pi, si]);

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
    const r = await interactionsApi.toggleSave(segment.id);
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

  // Swipe handling.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent, third: "left" | "mid" | "right") => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { close(); return; }                 // swipe down → close
    if (dy < -80 && Math.abs(dy) > Math.abs(dx)) { openDetail(); return; }           // swipe up → detail
    if (Math.abs(dx) > 60) { setPi((p) => Math.max(0, Math.min((circles?.length ?? 1) - 1, p + (dx < 0 ? 1 : -1)))); setSi(0); setProgress(0); elapsed.current = 0; return; } // swipe l/r → posters
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) advance(third === "left" ? -1 : 1);  // tap
  };

  if (!circles || !circle || !segment) {
    return <div className="fixed inset-0 z-[100] bg-black" />;
  }

  const isProject = segment.kind === "project";
  const isSaved = Boolean(saved[segment.id]);

  return (
    <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-black text-white">
      {/* ---- photo: never cropped ------------------------------------------
          A blurred, scaled copy of the same cover fills the frame, and the real
          photo sits on top with object-contain — so a landscape or portrait
          cover is shown WHOLE, with no letterbox bars. */}
      {segment.cover ? (
        <>
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center blur-3xl brightness-50 saturate-150"
            style={{ backgroundImage: `url(${segment.cover})` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={segment.cover}
              alt=""
              draggable={false}
              className={cn("max-h-full max-w-full object-contain", !segment.available && "opacity-40 grayscale")}
            />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-neutral-900">
          <Icon name="image" size={48} className="text-white/40" />
        </div>
      )}

      {/* legibility scrims — above the photo, below the chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
      {segment.available && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      )}

      {/* ---- tap / hold / swipe zones (below the chrome, above the photo) --- */}
      <div className={cn("absolute inset-0 z-10 flex transition-opacity", paused && "opacity-0")}>
        {(["left", "mid", "right"] as const).map((z) => (
          <div
            key={z}
            className="h-full flex-1"
            onPointerDown={(e) => { onDown(e); const id = setTimeout(() => setPaused(true), 220); (e.currentTarget as any)._t = id; }}
            onPointerUp={(e) => { clearTimeout((e.currentTarget as any)._t); if (paused) { setPaused(false); } else onUp(e, z); }}
            onPointerLeave={(e) => { clearTimeout((e.currentTarget as any)._t); if (paused) setPaused(false); }}
          />
        ))}
      </div>

      {/* ---- chrome: fades out while pressed (immersive) -------------------- */}
      <div className={cn("transition-opacity duration-200", paused && "pointer-events-none opacity-0")}>
        {/* progress bars */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
          {circle.segments.map((_, i) => (
            <div key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                style={{ width: i < si ? "100%" : i === si ? `${progress * 100}%` : "0%" }}
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
                {circle.verified && <Icon name="verified" size={14} className="shrink-0 text-white" />}
              </span>
              {(segment.postedLabel || segment.areaLabel) && (
                <span className="truncate text-11 text-white/65">
                  {[segment.postedLabel, segment.areaLabel].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </button>
          <button aria-label="Close" onClick={close} className="grid h-11 w-11 shrink-0 place-items-center">
            <Icon name="close" size={24} className="text-white" />
          </button>
        </div>

        {/* ---- bottom card ------------------------------------------------- */}
        {segment.available ? (
          <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 rounded-16 border border-white/12 bg-black/55 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {/* title row — tapping it opens the same detail screen */}
            <button onClick={openDetail} className="flex w-full items-center gap-1.5 text-left">
              <span className="min-w-0 flex-1 truncate text-15 font-bold leading-tight">{segment.title}</span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-white/60" />
            </button>

            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-11 text-white/70">
              {segment.typeLabel && (
                <span className="shrink-0 rounded-6 bg-accent/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {segment.typeLabel}
                </span>
              )}
              {segment.areaLabel && <span className="truncate">{segment.areaLabel}</span>}
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-24 font-extrabold leading-tight tracking-tight">{segment.price}</span>
              {(segment.negotiable || segment.subtitle) && (
                <span className="text-11 font-semibold text-white/60">
                  {segment.subtitle ?? "Negotiable"}
                </span>
              )}
            </div>

            {/* facts strip — as many columns as the server resolved (0071) */}
            {segment.specs.length > 0 && (
              <div className="mt-2.5 flex items-stretch rounded-12 bg-white/8 py-2">
                {segment.specs.map((s, i) => (
                  <div
                    key={s.label + i}
                    className={cn("min-w-0 flex-1 px-1 text-center", i > 0 && "border-l border-white/15")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Icon name={s.icon as IconName} size={13} className="shrink-0 text-white/70" />
                      <span className="truncate text-13 font-bold">{s.value}</span>
                    </div>
                    <div className="truncate text-[10px] text-white/55">{s.label}</div>
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
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-12 border border-white/16 bg-white/10 active:bg-white/20"
                >
                  <Icon name="bookmark" size={19} filled={isSaved} className="text-white" />
                </button>
              )}
              <button
                onClick={openDetail}
                className="h-11 flex-1 truncate rounded-12 border border-white/22 bg-white/10 px-2 text-13 font-semibold active:bg-white/20"
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
                className="h-11 flex-[1.25] truncate rounded-12 bg-accent px-2 text-15 font-bold text-white shadow-[0_8px_20px_rgba(15,157,88,0.32)] active:bg-accent-pressed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send Inquiry"}
              </button>
            </div>
          </div>
        ) : (
          /* ---- sold / hidden mid-24h --------------------------------------- */
          <div className="absolute inset-0 z-20 grid place-items-center px-7">
            <div className="w-full rounded-16 border border-white/12 bg-black/65 p-5 text-center backdrop-blur-xl">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white/10">
                <Icon name="close" size={22} className="text-white" />
              </div>
              <div className="text-15 font-bold">No longer available</div>
              <p className="mt-1 text-13 text-white/60">This one was taken down by the poster.</p>
              <button
                onClick={() => router.push(segment.areaLabel ? `/search?q=${encodeURIComponent(segment.areaLabel)}` : "/search")}
                className="mt-4 inline-block max-w-full truncate rounded-full border border-white/28 bg-white/10 px-5 py-2.5 text-13 font-semibold active:bg-white/20"
              >
                {segment.areaLabel ? `Browse similar in ${segment.areaLabel}` : "Browse similar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
