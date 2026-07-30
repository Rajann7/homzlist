import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Blog (Doc7 §12 #177) — designs/P12 S4. Public, SSR, indexable.
 *
 * Only `status = 'published'` with a published_at in the past is ever returned:
 * a scheduled post must not leak by guessing its slug.
 */

export interface BlogCategory { slug: string; title: string }

export interface BlogPostSummary {
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

export interface BlogPost extends BlogPostSummary {
  body: string;
  authorName: string;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: string[];
  viewCount: number;
  related: BlogPostSummary[];
}

export const BLOG_PAGE_SIZE = 5;

const summary = (r: Record<string, unknown>, titles: Map<string, string>): BlogPostSummary => ({
  slug: r.slug as string,
  title: r.title as string,
  excerpt: (r.excerpt as string) ?? null,
  category: r.category as string,
  categoryTitle: titles.get(r.category as string) ?? (r.category as string),
  badge: (r.badge as string) ?? null,
  coverUrl: (r.cover_url as string) ?? null,
  readMinutes: (r.read_minutes as number) ?? 4,
  publishedAt: r.published_at as string,
});

async function categoryTitles(db: ReturnType<typeof createServiceClient>) {
  const { data } = await db.from("blog_categories").select("slug, title").eq("is_active", true)
    .order("sort_order", { ascending: true });
  return {
    list: (data ?? []).map((c: Record<string, unknown>) => ({ slug: c.slug as string, title: c.title as string })),
    map: new Map<string, string>((data ?? []).map((c: Record<string, unknown>) => [c.slug as string, c.title as string])),
  };
}

/**
 * The list screen: one featured hero + a page of rows, filtered by category.
 * `offset` drives Load more; `hasMore` is what decides whether the button shows.
 */
export async function getBlogList(opts: { category?: string | null; offset?: number } = {}): Promise<{
  featured: BlogPostSummary | null;
  posts: BlogPostSummary[];
  categories: BlogCategory[];
  total: number;
  hasMore: boolean;
}> {
  const db = createServiceClient();
  const { list, map } = await categoryTitles(db);
  const offset = Math.max(0, opts.offset ?? 0);
  const category = opts.category && opts.category !== "all" ? opts.category : null;
  const now = new Date().toISOString();

  const { data: feat } = await db
    .from("blog_posts")
    .select("slug, title, excerpt, category, badge, cover_url, read_minutes, published_at")
    .eq("status", "published").eq("is_featured", true).lte("published_at", now)
    .order("published_at", { ascending: false }).limit(1).maybeSingle();
  const featured = feat && !category ? summary(feat, map) : null;

  let q = db
    .from("blog_posts")
    .select("slug, title, excerpt, category, badge, cover_url, read_minutes, published_at", { count: "exact" })
    .eq("status", "published").lte("published_at", now);
  if (category) q = q.eq("category", category);
  if (featured) q = q.neq("slug", featured.slug);

  const { data, count } = await q
    .order("published_at", { ascending: false })
    .range(offset, offset + BLOG_PAGE_SIZE - 1);

  const posts = (data ?? []).map((r: Record<string, unknown>) => summary(r, map));
  return {
    featured,
    posts,
    categories: list,
    total: count ?? posts.length,
    hasMore: offset + posts.length < (count ?? 0),
  };
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const db = createServiceClient();
  const { map } = await categoryTitles(db);
  const { data } = await db
    .from("blog_posts").select("*").eq("slug", slug).eq("status", "published")
    .lte("published_at", new Date().toISOString()).maybeSingle();
  if (!data) return null;

  const { data: rel } = await db
    .from("blog_posts")
    .select("slug, title, excerpt, category, badge, cover_url, read_minutes, published_at")
    .eq("status", "published").neq("slug", slug)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(6);

  // Same category first, then the most recent — always two, never a dead space.
  const pool = (rel ?? []).map((r: Record<string, unknown>) => summary(r, map));
  const related = [...pool.filter((p: BlogPostSummary) => p.category === data.category), ...pool.filter((p: BlogPostSummary) => p.category !== data.category)]
    .slice(0, 2);

  return {
    ...summary(data, map),
    body: data.body_md,
    authorName: data.author_name ?? "HomzList Team",
    seoTitle: data.seo_title ?? null,
    seoDescription: data.seo_description ?? null,
    tags: (data.tags as string[]) ?? [],
    viewCount: (data.view_count as number) ?? 0,
    related,
  };
}

/** Every published slug — for the sitemap. */
export async function getBlogSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
  const db = createServiceClient();
  const { data } = await db
    .from("blog_posts").select("slug, updated_at").eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    slug: r.slug as string,
    updatedAt: r.updated_at as string,
  }));
}

/** Fire-and-forget view counter; a failure must never break the article. */
export async function bumpBlogView(slug: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data } = await db.from("blog_posts").select("id, view_count").eq("slug", slug).maybeSingle();
    if (data) await db.from("blog_posts").update({ view_count: ((data.view_count as number) ?? 0) + 1 }).eq("id", data.id);
  } catch {
    /* counters are not worth a 500 */
  }
}
