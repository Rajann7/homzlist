"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Button, StatusBadge, useToast } from "@/components";
import { Header, Wordmark } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Longform } from "@/components/content/Longform";
import { ShareSheet } from "@/components/content/ShareSheet";
import { Cover, shortDate } from "./BlogList";
import type { BlogCard } from "@/lib/content/client";
import { publicHref } from "@/lib/utils";

/**
 * P12 S4b — the blog post.
 *
 * The scroll-progress hairline under the header is the design's `.prog` bar; it
 * is driven by real scroll position, throttled onto rAF so a long post still
 * scrolls at 60fps (CLAUDE.md rule 9 — transform/opacity only, no layout in the
 * scroll handler).
 */
export interface PostView extends BlogCard {
  bodyMd: string;
  authorName: string;
  tags: string[];
  related: BlogCard[];
}

export function BlogPost({ post, guest = false, base = "" }: { post: PostView; guest?: boolean; base?: string }) {
  const toast = useToast();
  const [share, setShare] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = document.documentElement;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  const href = (slug: string) => `${guest ? "" : base}/blog/${slug}`;
  const shareUrl = `/blog/${post.slug}`;

  const shareBtn = (
    <button
      aria-label="Share"
      onClick={() => setShare(true)}
      className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
    >
      <Icon name="share" size={22} />
    </button>
  );

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      {guest ? (
        <Header left={<BackButton fallback="/blog" />} title={<Wordmark className="text-17" />} right={shareBtn} />
      ) : (
        <Header left={<BackButton fallback={`${base}/blog`} />} right={shareBtn} />
      )}

      {/* 2px progress hairline, sticky directly under the 56px header */}
      <div className="sticky top-header z-sticky h-0.5 bg-divider">
        <i className="block h-full bg-accent transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <Cover post={post} className="aspect-[16/9] w-full" iconSize={48} />

      <article className="px-4 pt-4">
        {post.badge && <StatusBadge kind="for-sale" label={post.badge} />}
        <h1 className="mb-3 mt-2.5 text-24 font-bold leading-[1.25] text-ink-primary">{post.title}</h1>
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-11 font-semibold text-accent">H</span>
          <span className="text-13 font-semibold text-ink-primary">{post.authorName}</span>
          <span className="text-11 text-ink-tertiary">
            {new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
            {post.readMinutes} min read
          </span>
        </div>
      </article>

      <Longform md={post.bodyMd} className="px-4" />

      {/* share row */}
      <div className="px-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-13 font-semibold text-ink-primary">Share this article</span>
          <button
            aria-label="Share on WhatsApp"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(`${post.title}\n${publicHref(shareUrl)}`)}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="whatsapp" size={20} />
          </button>
          <button
            aria-label="Copy link"
            onClick={async () => {
              try { await navigator.clipboard.writeText(publicHref(shareUrl)); toast.show("Copied to clipboard"); }
              catch { toast.show("Couldn't copy"); }
            }}
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="copy" size={20} />
          </button>
          <button
            aria-label="More share options"
            onClick={() => setShare(true)}
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="more" size={20} />
          </button>
        </div>
      </div>

      {post.related.length > 0 && (
        <>
          <h2 className="mx-4 mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
            Related posts
          </h2>
          <div className="flex flex-col">
            {post.related.map((r) => (
              <Link
                key={r.slug}
                href={href(r.slug)}
                className="flex min-h-14 items-center gap-3 border-b border-divider px-4 py-2 last:border-b-0 active:bg-surface-2"
              >
                <Cover post={r} className="h-14 w-14 shrink-0 rounded-8" iconSize={20} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-left text-15 font-semibold leading-[1.35] text-ink-primary">{r.title}</span>
                  <span className="text-11 text-ink-tertiary">{r.readMinutes} min read · {shortDate(r.publishedAt)}</span>
                </span>
                <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="px-4 pb-10 pt-6">
        {/* Cross-subdomain when signed in — `base` is another host, which the
            App Router cannot navigate to. */}
        <Button
          variant="outline"
          fullWidth
          onClick={() => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
            window.location.href = `${guest ? "" : base}/blog`;
          }}
        >
          More from the HomzList blog
        </Button>
        <p className="mt-6 text-11 text-ink-tertiary">
          <Link href={`${guest ? "" : base}/legal/terms`} className="text-ink-tertiary">Terms</Link> ·{" "}
          <Link href={`${guest ? "" : base}/legal/privacy`} className="text-ink-tertiary">Privacy</Link> ·{" "}
          <Link href={`${guest ? "" : base}/legal/refund`} className="text-ink-tertiary">Refunds</Link> · ©{" "}
          {new Date().getFullYear()} HomzList, Rajkot
        </p>
      </div>

      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        url={shareUrl}
        title={post.title}
        text={post.excerpt ?? undefined}
      />
    </div>
  );
}
