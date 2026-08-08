"use client";

import { Cover, shortDate } from "@/components/blog/BlogList";
import type { FeedPost } from "@/lib/feed/client";

/**
 * One card on the home feed's "News and Articles" rail (Rajan, 8 Aug 2026).
 *
 * It renders the blog's OWN cover component, so a post with no uploaded image
 * gets the same deterministic tinted placeholder here as it does on /blog —
 * rather than a second placeholder that drifts from it. Everything on it comes
 * from the post row: title, category label, read minutes, published date.
 */
export function NewsCard({ post, onOpen }: { post: FeedPost; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="chrome flex h-full w-full flex-col overflow-hidden rounded-8 border border-border bg-surface-1 text-left active:bg-surface-2"
    >
      <Cover post={post} className="aspect-[16/9] w-full shrink-0" iconSize={28} />
      <span className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <span className="w-fit rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 font-semibold text-ink-secondary">
          {post.categoryLabel}
        </span>
        <span className="line-clamp-2 text-13 font-semibold leading-[1.3] text-ink-primary">{post.title}</span>
        <span className="mt-auto pt-0.5 text-11 text-ink-tertiary">
          {post.readMinutes} min read · {shortDate(post.publishedAt)}
        </span>
      </span>
    </button>
  );
}
