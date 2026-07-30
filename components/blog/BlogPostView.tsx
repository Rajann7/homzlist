"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LegalHeader } from "@/components/legal/LegalHeader";
import { Badge, SectionH, List, shortDate } from "@/components/help/primitives";
import { ShareSheet } from "@/components/help/ShareSheet";
import { Cover, type PostRow } from "./BlogList";
import { useToast } from "@/components/ui/Toast";

/**
 * P12 S4 — the blog post: reading-progress bar under the appbar, cover, badge,
 * H1, author row, long-form body, the area CTA block, the share row, related
 * posts and the legal footer.
 *
 * The body is server-rendered (children) so the article is indexable and
 * readable without JS; this shell owns the progress bar and the share targets.
 */
export function BlogPostView({
  post,
  related,
  areaBlock,
  guest,
  base = "",
  shareUrl,
  children,
}: {
  post: PostRow & { authorName: string };
  related: PostRow[];
  areaBlock?: React.ReactNode;
  guest: boolean;
  base?: string;
  shareUrl: string;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const [share, setShare] = useState(false);
  const [progress, setProgress] = useState(0);

  // The scroll container is AppShell's <main>, not the window.
  useEffect(() => {
    const el = document.querySelector("main");
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.show("Copied to clipboard");
    } catch {
      toast.show("Couldn't copy the link", { variant: "error" });
    }
  };

  const shareIcon = (
    <button
      type="button"
      onClick={() => setShare(true)}
      aria-label="Share post"
      className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
    >
      <Icon name="share" size={24} />
    </button>
  );

  return (
    <AppShell
      header={<LegalHeader title="" guest={guest} fallback={`${base}/blog`} right={shareIcon} />}
      showNav={!guest}
    >
      <div className="sticky top-0 z-sticky h-0.5 bg-divider">
        <i className="block h-full bg-accent" style={{ width: `${progress}%` }} />
      </div>

      <Cover slug={post.slug} url={post.coverUrl} className="aspect-[16/9] w-full" icon={48} />

      <div className="p-4 text-15 leading-[1.6] text-ink-primary">
        {post.badge && <Badge tone="accent">{post.badge}</Badge>}
        <h1 className="my-2.5 text-24 font-bold leading-[1.25]">{post.title}</h1>
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-11 font-semibold text-accent">
            H
          </span>
          <span className="text-13 font-semibold text-ink-primary">{post.authorName}</span>
          <span className="text-11 text-ink-tertiary">
            {shortDate(post.publishedAt, true)} · {post.readMinutes} min read
          </span>
        </div>
        {children}
      </div>

      <div className="px-4">
        {areaBlock}

        <div className="mt-5 flex items-center gap-3">
          <span className="flex-1 text-13 font-semibold text-ink-primary">Share this article</span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${post.title}\n${shareUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on WhatsApp"
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="whatsapp" size={20} />
          </a>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy link"
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="copy" size={20} />
          </button>
          <button
            type="button"
            onClick={() => setShare(true)}
            aria-label="More share options"
            className="chrome grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-primary"
          >
            <Icon name="more" size={20} />
          </button>
        </div>
      </div>

      {related.length > 0 && (
        <>
          <SectionH>Related posts</SectionH>
          <List>
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`${base}/blog/${r.slug}`}
                className="chrome flex min-h-[56px] w-full items-center gap-3 px-4 py-2 active:bg-surface-2"
              >
                <Cover slug={r.slug} url={r.coverUrl} className="h-14 w-14 rounded-8" icon={20} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-15 font-semibold text-ink-primary">{r.title}</span>
                  <span className="text-11 text-ink-tertiary">
                    {r.readMinutes} min read · {shortDate(r.publishedAt)}
                  </span>
                </span>
                <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
              </Link>
            ))}
          </List>
        </>
      )}

      <p className="px-4 pb-8 pt-6 text-11 text-ink-tertiary">
        <Link href={`${base}/legal/terms`} className="text-ink-tertiary">Terms</Link> ·{" "}
        <Link href={`${base}/legal/privacy`} className="text-ink-tertiary">Privacy</Link> ·{" "}
        <Link href={`${base}/legal/refund`} className="text-ink-tertiary">Refunds</Link> · ©{" "}
        {new Date().getFullYear()} HomzList, Rajkot
      </p>

      <ShareSheet open={share} onClose={() => setShare(false)} url={shareUrl} title={post.title} />
    </AppShell>
  );
}
