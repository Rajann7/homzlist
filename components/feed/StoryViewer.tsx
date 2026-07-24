"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { storiesApi, interactionsApi, type StoryCircle } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * P2 Story viewer (Doc2 §9.3) — fullscreen black, 5s segments auto-advancing
 * across a poster's segments then to the next poster. Gestures: tap-right next /
 * tap-left prev / press-hold pause / swipe-down close / swipe l-r jump posters.
 * Seen is marked per segment (no view-count ever exposed). Sold mid-24h → the
 * "no longer available" state.
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
    })();
  }, [posterId, close]);

  const circle = circles?.[pi];
  const segment = circle?.segments[si];

  // Mark seen when a segment shows.
  useEffect(() => { if (segment) void storiesApi.seen(segment.id); }, [segment]);

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

  // Swipe handling.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent, third: "left" | "mid" | "right") => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { close(); return; }               // swipe down
    if (Math.abs(dx) > 60) { setPi((p) => Math.max(0, Math.min((circles?.length ?? 1) - 1, p + (dx < 0 ? 1 : -1)))); setSi(0); setProgress(0); elapsed.current = 0; return; } // swipe l/r → posters
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) advance(third === "left" ? -1 : 1);  // tap
  };

  if (!circles || !circle || !segment) {
    return <div className="fixed inset-0 z-[100] bg-black" />;
  }

  return (
    <div className="fixed inset-0 z-[100] select-none bg-black text-white">
      {/* progress bars */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        {circle.segments.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full bg-white" style={{ width: i < si ? "100%" : i === si ? `${progress * 100}%` : "0%" }} />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+20px)]">
        <Avatar src={circle.posterAvatar} name={circle.posterName} size={32} className="ring-2 ring-white" />
        <span className="text-13 font-semibold">{circle.posterName}</span>
        {circle.verified && <Icon name="verified" size={14} className="text-white" />}
        {circle.boosted && <span className="rounded-4 bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Promoted</span>}
        <button aria-label="Close" onClick={close} className="ml-auto grid h-11 w-11 place-items-center"><Icon name="close" size={24} className="text-white" /></button>
      </div>

      {/* photo + tap zones */}
      <div className="absolute inset-0 flex">
        {segment.available ? (
          segment.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={segment.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="absolute inset-0 grid place-items-center bg-neutral-900"><Icon name="image" size={48} className="text-white/40" /></div>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-neutral-900">
            <div className="flex flex-col items-center gap-2 px-8 text-center">
              {segment.cover && <img src={segment.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 grayscale" />}
              <div className="relative text-15 font-semibold">This property is no longer available</div>
              <button className="relative text-13 font-semibold text-white underline" onClick={() => router.push("/")}>Browse similar</button>
            </div>
          </div>
        )}

        {/* tap/hold zones */}
        {(["left", "mid", "right"] as const).map((z) => (
          <div
            key={z}
            className="relative z-10 h-full flex-1"
            onPointerDown={(e) => { onDown(e); const id = setTimeout(() => setPaused(true), 220); (e.currentTarget as any)._t = id; }}
            onPointerUp={(e) => { clearTimeout((e.currentTarget as any)._t); if (paused) { setPaused(false); } else onUp(e, z); }}
            onPointerLeave={(e) => { clearTimeout((e.currentTarget as any)._t); if (paused) setPaused(false); }}
          />
        ))}
      </div>

      {/* bottom overlay */}
      {segment.available && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-16">
          <div className="text-20 font-bold">{segment.price}</div>
          {segment.meta && <div className="text-13 text-white/90">{segment.meta}</div>}
          <button
            onClick={async () => { const r = await interactionsApi.inquiry(segment.id, { message: `Hi, I'm interested in this ${segment.kind}. Is it available?` }); toast.show(r.ok ? "Inquiry sent" : r.error.code === "UNAUTHORIZED" ? "Sign in to inquire" : "Couldn't send"); }}
            className="mt-1 grid h-11 place-items-center rounded-8 bg-accent text-15 font-semibold text-white"
          >
            Send Inquiry
          </button>
        </div>
      )}
    </div>
  );
}
