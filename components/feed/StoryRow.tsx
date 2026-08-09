"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { StoryCircle } from "@/lib/feed/client";
import { setStoryHandoff } from "@/lib/feed/story-handoff";
import { cn } from "@/lib/utils";

/**
 * P2 story row (Doc2 §9.3) — auto-generated circles ONLY. Ring types come from
 * the server (unseen / seen / project / boosted); there is NO "add story" / "your
 * story" circle and no create path anywhere. 24px edge-fade both sides.
 *
 * Opening is warmed on POINTER-DOWN, ~100ms before the tap completes, because
 * the tap itself used to start three cold things at once — the route's RSC
 * payload, the circle list, and the first photo — and the viewer sat black
 * until all three landed. Nothing here changes what the row looks like or where
 * it goes; it only starts the same work earlier and hands the viewer the list
 * it already has (lib/feed/story-handoff).
 */
export function StoryRow({ circles, loading, basePath = "/story" }: { circles: StoryCircle[]; loading?: boolean; basePath?: string }) {
  const router = useRouter();
  /** Warm once per circle per row — pointerdown can fire repeatedly on a drag. */
  const warmed = useRef<Set<string>>(new Set());

  const warm = useCallback((c: StoryCircle) => {
    if (warmed.current.has(c.posterId)) return;
    warmed.current.add(c.posterId);
    router.prefetch(`${basePath}/${c.posterId}`);
    // Decode the first frame while the finger is still down.
    const cover = c.segments[0]?.cover;
    if (cover) { const img = new Image(); img.decoding = "async"; img.src = cover; }
  }, [router, basePath]);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden px-4 py-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-12 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!circles.length) return null;

  return (
    <div className="relative border-b border-divider">
      {/* edge-fade gradients */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-6 bg-gradient-to-r from-surface-1 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-6 bg-gradient-to-l from-surface-1 to-transparent" />
      <div className="flex gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {circles.map((c) => (
          <button
            key={c.posterId}
            onPointerDown={() => warm(c)}
            onClick={() => { setStoryHandoff(circles); router.push(`${basePath}/${c.posterId}`); }}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="relative">
              <Avatar src={c.posterAvatar} name={c.posterName} size={64} ring={c.ring} />
              {c.boosted && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-warning text-white ring-2 ring-surface-1">
                  <Icon name="rocket" size={11} />
                </span>
              )}
            </span>
            <span className="max-w-[72px] truncate text-11 text-ink-primary">{c.posterName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
