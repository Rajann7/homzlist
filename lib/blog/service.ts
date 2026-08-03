import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { toPlainText } from "@/lib/content/markdown";

/**
 * P12 S4 — the blog (Doc4 §72, Doc7 §177).
 *
 * Public, SSR and indexable — it is the site's main organic surface, so every
 * read here is a guest read and nothing on it depends on a session.
 *
 * Two things worth pointing at:
 *
 *  · A post is visible only when `status = 'published'` AND `published_at` is
 *    in the past. Scheduling is a real state, not a label: a post scheduled for
 *    next Tuesday must not be readable by anyone who guesses the slug, or the
 *    embargo is decorative.
 *
 *  · The view counter increments ONCE PER READER per post (`blog_post_reads`),
 *    not once per render. The admin blog list prints that number, and a count
 *    that goes up when you refresh is a number nobody can plan with.
 */

const db = () => createServiceClient();

export interface BlogCategory {
  slug: string;
  label: string;
}

export interface BlogCard {
  slug: string;
  title: string;
  excerpt: string | null;
  badge: string | null;
  category: string;
  categoryLabel: string;
  coverUrl: string | null;
  readMinutes: number;
  publishedAt: string;
  isFeatured: boolean;
}

export interface BlogPost extends BlogCard {
  bodyMd: string;
  authorName: string;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  viewCount: number;
  related: BlogCard[];
}

export interface BlogListView {
  featured: BlogCard | null;
  posts: BlogCard[];
  categories: BlogCategory[];
  nextCursor: string | null;
}

const PAGE = 10;

type Raw = {
  slug: string; title: string; excerpt: string | null; badge: string | null;
  category: string; cover_url: string | null; read_minutes: number;
  published_at: string; is_featured: boolean;
};

const card = (r: Raw, labels: Map<string, string>): BlogCard => ({
  slug: r.slug,
  title: r.title,
  excerpt: r.excerpt,
  badge: r.badge,
  category: r.category,
  categoryLabel: labels.get(r.category) ?? r.category,
  coverUrl: r.cover_url,
  readMinutes: r.read_minutes,
  publishedAt: r.published_at,
  isFeatured: r.is_featured,
});

const SELECT = "slug, title, excerpt, badge, category, cover_url, read_minutes, published_at, is_featured";

async function categoryLabels(): Promise<Map<string, string>> {
  const { data } = await db().from("blog_categories").select("slug, label").eq("is_active", true).order("sort_order");
  return new Map(((data ?? []) as BlogCategory[]).map((c) => [c.slug, c.label]));
}

export async function listBlog(opts: { category?: string | null; cursor?: string | null } = {}): Promise<BlogListView> {
  const labels = await categoryLabels();
  const now = new Date().toISOString();

  let q = db()
    .from("blog_posts")
    .select(SELECT)
    .eq("status", "published")
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .limit(PAGE + 1);

  if (opts.category && opts.category !== "all") q = q.eq("category", opts.category);
  // Cursor is the published_at of the last row shown — stable and index-backed.
  if (opts.cursor) q = q.lt("published_at", opts.cursor);

  const { data } = await q;
  const rows = (data ?? []) as Raw[];
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;

  // The hero card is the featured post, and only on the unfiltered first page —
  // the design draws it above the category chips, so a filtered view that kept
  // it would be showing a post the filter excludes.
  let featured: BlogCard | null = null;
  let posts = page;
  if (!opts.cursor && (!opts.category || opts.category === "all")) {
    const idx = page.findIndex((p) => p.is_featured);
    if (idx >= 0) {
      featured = card(page[idx], labels);
      posts = page.filter((_, i) => i !== idx);
    }
  }

  return {
    featured,
    posts: posts.map((r) => card(r, labels)),
    categories: [...labels.entries()].map(([slug, label]) => ({ slug, label })),
    nextCursor: hasMore ? page[page.length - 1].published_at : null,
  };
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const { data } = await db()
    .from("blog_posts")
    .select(`id, ${SELECT}, body_md, author_name, tags, seo_title, seo_description, view_count`)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  const r = data as Raw & {
    id: string; body_md: string; author_name: string; tags: string[];
    seo_title: string | null; seo_description: string | null; view_count: number;
  };
  const labels = await categoryLabels();

  // Related = same category first, newest, excluding this post.
  const { data: rel } = await db()
    .from("blog_posts")
    .select(SELECT)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .eq("category", r.category)
    .neq("slug", slug)
    .order("published_at", { ascending: false })
    .limit(2);

  let related = ((rel ?? []) as Raw[]).map((x) => card(x, labels));
  if (related.length < 2) {
    const { data: more } = await db()
      .from("blog_posts")
      .select(SELECT)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .neq("slug", slug)
      .order("published_at", { ascending: false })
      .limit(4);
    for (const m of ((more ?? []) as Raw[]).map((x) => card(x, labels))) {
      if (related.length >= 2) break;
      if (!related.some((p) => p.slug === m.slug)) related.push(m);
    }
  }

  return {
    ...card(r, labels),
    bodyMd: r.body_md,
    authorName: r.author_name,
    tags: r.tags ?? [],
    seoTitle: r.seo_title,
    seoDescription: r.seo_description ?? toPlainText(r.excerpt ?? r.body_md, 155),
    viewCount: r.view_count,
    related,
  };
}

/** Once per reader per post. Silent — a counter must never break a page render. */
export async function recordBlogRead(
  slug: string,
  reader: { profileId: string | null; visitorKey: string | null },
): Promise<void> {
  try {
    const { data } = await db().from("blog_posts").select("id").eq("slug", slug).maybeSingle();
    if (!data) return;
    const id = (data as { id: string }).id;

    const probe = db().from("blog_post_reads").select("id").eq("post_id", id).limit(1);
    const { data: seen } = reader.profileId
      ? await probe.eq("profile_id", reader.profileId)
      : reader.visitorKey
        ? await probe.eq("visitor_key", reader.visitorKey)
        : { data: [{ id: "skip" }] };
    if ((seen as unknown[])?.length) return;

    await db().from("blog_post_reads").insert({
      post_id: id,
      profile_id: reader.profileId,
      visitor_key: reader.profileId ? null : reader.visitorKey,
    });
    await db().rpc("hz_bump_blog_view", { p_id: id });
  } catch {
    /* a view counter is never worth a 500 */
  }
}

/** Every published slug, for the sitemap. */
export async function allBlogSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const { data } = await db()
    .from("blog_posts")
    .select("slug, updated_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  return ((data ?? []) as { slug: string; updated_at: string }[]).map((r) => ({
    slug: r.slug,
    updatedAt: r.updated_at,
  }));
}
