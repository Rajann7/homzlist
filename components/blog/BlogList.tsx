"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, Button, StatusBadge, Skeleton, useToast } from "@/components";
import { Header, Wordmark } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { blogApi, type BlogCard } from "@/lib/content/client";
import { Img } from "@/components/ui/Img";

/**
 * P12 S4a — the blog list: a full-bleed hero card for the featured post, the
 * category chip row, the 72px-thumbnail rows, and Load more.
 *
 * SSR-first: the first page is rendered on the server (SEO), and only the chip
 * filter and Load more come back to the client. That keeps the crawler's view
 * and the human's view identical, which is the whole point of the surface.
 */
export function BlogList({
  initial,
  categories,
  featured,
  initialCursor,
  guest = false,
  base = "",
}: {
  initial: BlogCard[];
  categories: { slug: string; label: string }[];
  featured: BlogCard | null;
  initialCursor: string | null;
  guest?: boolean;
  base?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState<string>("all");
  const [posts, setPosts] = useState<BlogCard[]>(initial);
  const [hero, setHero] = useState<BlogCard | null>(featured);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [busy, setBusy] = useState(false);
  const [filtering, setFiltering] = useState(false);

  const href = (slug: string) => `${guest ? "" : base}/blog/${slug}`;

  async function pickCategory(slug: string) {
    if (slug === category) return;
    setCategory(slug);
    setFiltering(true);
    const r = await blogApi.list(slug === "all" ? null : slug, null);
    setFiltering(false);
    if (!r.ok) { toast.show(r.error.code === "OFFLINE" ? "You're offline" : "Couldn't load that"); return; }
    setPosts(r.data.posts);
    setHero(r.data.featured);
    setCursor(r.data.nextCursor);
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    const r = await blogApi.list(category === "all" ? null : category, cursor);
    setBusy(false);
    if (!r.ok) { toast.show("Couldn't load more"); return; }
    setPosts((p) => [...p, ...r.data.posts]);
    setCursor(r.data.nextCursor);
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      {guest ? (
        <Header left={<BackButton fallback="/" />} title={<Wordmark className="text-17" />} right={<span className="pr-2 text-13 font-semibold text-ink-primary">Blog</span>} />
      ) : (
        <Header
          left={<BackButton fallback={`${base}/settings`} />}
          title="Blog"
          right={
            <button
              aria-label="Search the blog"
              onClick={() => router.push(`${guest ? "" : base}/search?tab=blog`)}
              className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
            >
              <Icon name="search" size={22} />
            </button>
          }
        />
      )}

      {hero && (
        <div className="px-4 pt-3">
          <Link
            href={href(hero.slug)}
            className="flex flex-col overflow-hidden rounded-12 border border-border bg-surface-1 active:bg-surface-2"
          >
            <Cover post={hero} className="aspect-[16/9] w-full" iconSize={48} />
            <span className="flex flex-col items-start gap-2 p-4">
              {hero.badge && <StatusBadge kind="for-sale" label={hero.badge} />}
              <span className="text-left text-20 font-bold leading-[1.3] text-ink-primary">{hero.title}</span>
              <span className="text-11 text-ink-tertiary">
                {hero.readMinutes} min read · {shortDate(hero.publishedAt)}
              </span>
            </span>
          </Link>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ slug: "all", label: "All" }, ...categories].map((c) => (
          <button
            key={c.slug}
            onClick={() => void pickCategory(c.slug)}
            className={`chrome inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-13 transition-transform active:scale-[0.98] ${
              category === c.slug
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-transparent bg-surface-2 text-ink-primary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtering ? (
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-[72px] w-[72px] rounded-8" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-4/5 rounded-8" />
                <Skeleton className="h-2.5 w-2/5 rounded-8" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <Icon name="book" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="text-17 font-semibold text-ink-primary">Nothing here yet</p>
          <p className="text-13 text-ink-secondary">No posts in this category. Try another one.</p>
          <Button variant="outline" className="mt-2" onClick={() => void pickCategory("all")}>Show all posts</Button>
        </div>
      ) : (
        <div className="flex flex-col">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={href(p.slug)}
              className="flex min-h-14 items-center gap-3 border-b border-divider px-4 py-2 last:border-b-0 active:bg-surface-2"
            >
              <Cover post={p} className="h-[72px] w-[72px] shrink-0 rounded-8" iconSize={20} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-left text-15 font-semibold leading-[1.35] text-ink-primary">{p.title}</span>
                <span className="text-11 text-ink-tertiary">
                  {p.readMinutes} min read · {shortDate(p.publishedAt)}
                </span>
              </span>
              <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
            </Link>
          ))}
        </div>
      )}

      <div className="px-4 pb-10 pt-4">
        {cursor ? (
          <Button variant="outline" fullWidth loading={busy} onClick={() => void loadMore()}>Load more</Button>
        ) : posts.length > 0 ? (
          <p className="text-center text-13 text-ink-tertiary">You&apos;re all caught up</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The cover. Posts carry `cover_url` when an admin has uploaded one; until then
 * the design's tinted placeholder stands in — chosen deterministically from the
 * slug so a given post always looks the same, rather than flickering per render.
 */
export function Cover({ post, className, iconSize }: { post: BlogCard; className?: string; iconSize: number }) {
  if (post.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <Img src={post.coverUrl} alt="" className={`object-cover ${className ?? ""}`} loading="lazy" />;
  }
  const tints = [
    "from-[#B9CCC1] to-[#7E9C8B]", "from-[#C9C2B4] to-[#948A74]", "from-[#B7C3CE] to-[#71838F]",
    "from-[#D0BFB4] to-[#9A8271]", "from-[#BFC7B4] to-[#87926F]", "from-[#C4B9CC] to-[#83758F]",
  ];
  let h = 0;
  for (const ch of post.slug) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span
      className={`grid place-items-center bg-gradient-to-br text-white/75 ${tints[h % tints.length]} ${className ?? ""}`}
    >
      <Icon name="building" size={iconSize} />
    </span>
  );
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
