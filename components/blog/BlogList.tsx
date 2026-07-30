"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LegalHeader } from "@/components/legal/LegalHeader";
import { Badge, ChipRow, P12Chip, List, EmptyBlock, shortDate } from "@/components/help/primitives";
import { blogApi } from "@/lib/support/client";
import { cn } from "@/lib/utils";

/**
 * P12 S4 — the blog list: a featured hero card, the category chips, the row
 * list, and Load more.
 *
 * The first page is server-rendered (SSR, indexable); the chips and Load more
 * re-query the server rather than filtering a preloaded array, so the list is
 * correct however many posts exist. The chips themselves come from
 * blog_categories.
 */
export interface PostRow {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string;
  categoryTitle: string;
  badge: string | null;
  coverUrl: string | null;
  readMinutes: number;
  publishedAt: string;
}

/** The gradient placeholders the design uses where a post has no cover image. */
const PH = [
  "from-[#B9CCC1] to-[#7E9C8B]",
  "from-[#C9C2B4] to-[#948A74]",
  "from-[#B7C3CE] to-[#71838F]",
  "from-[#D0BFB4] to-[#9A8271]",
  "from-[#BFC7B4] to-[#87926F]",
  "from-[#C4B9CC] to-[#83758F]",
];
const phFor = (slug: string) => PH[[...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % PH.length];

export function BlogList({
  featured,
  initialPosts,
  initialHasMore,
  categories,
  guest,
  base = "",
}: {
  featured: PostRow | null;
  initialPosts: PostRow[];
  initialHasMore: boolean;
  categories: Array<{ slug: string; title: string }>;
  guest: boolean;
  base?: string;
}) {
  const [cat, setCat] = useState<string>("all");
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [busy, setBusy] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

  useEffect(() => {
    if (firstLoad) {
      setFirstLoad(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void (async () => {
      const r = await blogApi.list(cat, 0);
      if (cancelled) return;
      setBusy(false);
      if (r.ok) {
        setPosts(r.data.posts as PostRow[]);
        setHasMore(r.data.hasMore);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const loadMore = async () => {
    setBusy(true);
    const r = await blogApi.list(cat, posts.length);
    setBusy(false);
    if (r.ok) {
      setPosts((p) => [...p, ...(r.data.posts as PostRow[])]);
      setHasMore(r.data.hasMore);
    }
  };

  return (
    <AppShell header={<LegalHeader title="Blog" guest={guest} fallback={base || "/"} />} showNav={!guest}>
      {featured && cat === "all" && (
        <div className="px-4 pt-3">
          <Link
            href={`${base}/blog/${featured.slug}`}
            className="chrome block overflow-hidden rounded-12 border border-border bg-surface-1 active:scale-[0.995]"
          >
            <Cover slug={featured.slug} url={featured.coverUrl} className="aspect-[16/9] w-full" icon={48} />
            <span className="flex flex-col items-start gap-2 p-4">
              {featured.badge && <Badge tone="accent">{featured.badge}</Badge>}
              <span className="text-left text-20 font-bold leading-[1.3] text-ink-primary">{featured.title}</span>
              <span className="text-11 text-ink-tertiary">
                {featured.readMinutes} min read · {shortDate(featured.publishedAt)}
              </span>
            </span>
          </Link>
        </div>
      )}

      <ChipRow>
        <P12Chip on={cat === "all"} onClick={() => setCat("all")}>
          All
        </P12Chip>
        {categories.map((c) => (
          <P12Chip key={c.slug} on={cat === c.slug} onClick={() => setCat(c.slug)}>
            {c.title}
          </P12Chip>
        ))}
      </ChipRow>

      {posts.length === 0 ? (
        <EmptyBlock
          icon="book"
          title="Nothing here yet"
          body={
            cat === "all"
              ? "New guides are published every few weeks."
              : `No posts in ${categories.find((c) => c.slug === cat)?.title ?? "this category"} yet.`
          }
          action={
            cat !== "all" ? (
              <button
                type="button"
                onClick={() => setCat("all")}
                className="chrome mt-3 inline-flex h-11 items-center justify-center rounded-8 border border-border px-4 text-15 font-semibold text-ink-primary active:bg-surface-2"
              >
                Show all posts
              </button>
            ) : undefined
          }
        />
      ) : (
        <List>
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`${base}/blog/${p.slug}`}
              className="chrome flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
            >
              <Cover slug={p.slug} url={p.coverUrl} className="h-[72px] w-[72px] rounded-8" icon={20} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-15 font-semibold leading-[1.35] text-ink-primary">{p.title}</span>
                <span className="text-11 text-ink-tertiary">
                  {p.readMinutes} min read · {shortDate(p.publishedAt)}
                </span>
              </span>
              <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
            </Link>
          ))}
        </List>
      )}

      {hasMore && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={busy}
            className="chrome inline-flex h-11 w-full items-center justify-center rounded-8 border border-border text-15 font-semibold text-ink-primary disabled:text-ink-disabled active:bg-surface-2"
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      <div className="h-6" />
    </AppShell>
  );
}

export function Cover({
  slug,
  url,
  className,
  icon = 20,
}: {
  slug: string;
  url: string | null;
  className?: string;
  icon?: number;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn("object-cover", className)} />;
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br text-white/75",
        phFor(slug),
        className,
      )}
    >
      <Icon name="building" size={icon} />
    </span>
  );
}
