import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * P12 S1 — the Help centre (Doc4 §67, Doc7 §178).
 *
 * Everything the three help screens print is a query:
 *   · the 8 category tiles and the "N articles" under each — a live count, so
 *     deactivating an article moves the number;
 *   · the 6 chips above them — rows in `help_chips`, each a canned search;
 *   · "Popular articles" — `faqs.is_popular`, ordered by the stored rank;
 *   · the category accordion — that category's articles, `answer` expanded;
 *   · the article reader — `body_md`, plus its related articles.
 *
 * Search runs on the SERVER over question + answer + search_terms, because the
 * design's "No articles found for 'xyz'" must be the truth about the whole
 * library, not about the page-worth of rows a client happens to be holding.
 */

const db = () => createServiceClient();

export interface HelpCategory {
  slug: string;
  title: string;
  icon: string;
  articleCount: number;
}

export interface HelpChip {
  label: string;
  query: string;
}

export interface HelpArticleRow {
  slug: string;
  question: string;
  categorySlug: string | null;
  categoryTitle: string | null;
  readMinutes: number;
}

export interface HelpArticleFull extends HelpArticleRow {
  answer: string;
  bodyMd: string;
  updatedAt: string;
  related: HelpArticleRow[];
  /** null until this reader has voted — then their own vote, so the UI can't double-count. */
  myVote: boolean | null;
}

export interface HelpIndex {
  categories: HelpCategory[];
  chips: HelpChip[];
  popular: HelpArticleRow[];
}

export interface HelpCategoryView {
  slug: string;
  title: string;
  articles: { slug: string; question: string; answer: string }[];
}

/** A stable per-reader key for signed-out feedback, without storing the IP itself. */
export function visitorKey(ip: string, ua: string): string {
  return createHash("sha256").update(`hz-help:${ip}:${ua}`).digest("hex").slice(0, 32);
}

export async function getHelpIndex(): Promise<HelpIndex> {
  const [cats, chips, popular] = await Promise.all([
    db().from("help_categories").select("id, slug, title, icon").eq("is_active", true).order("sort_order"),
    db().from("help_chips").select("label, query").eq("is_active", true).order("sort_order"),
    db()
      .from("faqs")
      .select("slug, question, read_minutes, sort_order, help_categories(slug, title)")
      .eq("is_active", true)
      .eq("is_popular", true)
      .order("sort_order"),
  ]);

  // One grouped count rather than one query per tile.
  const counts = new Map<string, number>();
  const { data: rows } = await db().from("faqs").select("category_id").eq("is_active", true);
  for (const r of (rows ?? []) as { category_id: string | null }[]) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }

  return {
    categories: ((cats.data ?? []) as { id: string; slug: string; title: string; icon: string }[]).map((c) => ({
      slug: c.slug,
      title: c.title,
      icon: c.icon,
      articleCount: counts.get(c.id) ?? 0,
    })),
    chips: (chips.data ?? []) as HelpChip[],
    popular: ((popular.data ?? []) as RawArticle[]).map(toRow),
  };
}

type RawArticle = {
  slug: string;
  question: string;
  read_minutes: number;
  help_categories: { slug: string; title: string } | { slug: string; title: string }[] | null;
};

function toRow(r: RawArticle): HelpArticleRow {
  const cat = Array.isArray(r.help_categories) ? r.help_categories[0] : r.help_categories;
  return {
    slug: r.slug,
    question: r.question,
    categorySlug: cat?.slug ?? null,
    categoryTitle: cat?.title ?? null,
    readMinutes: r.read_minutes,
  };
}

export async function getHelpCategory(slug: string): Promise<HelpCategoryView | null> {
  const { data: cat } = await db()
    .from("help_categories")
    .select("id, slug, title")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!cat) return null;

  const { data } = await db()
    .from("faqs")
    .select("slug, question, answer")
    .eq("category_id", (cat as { id: string }).id)
    .eq("is_active", true)
    .order("sort_order");

  const c = cat as { slug: string; title: string };
  return {
    slug: c.slug,
    title: c.title,
    articles: (data ?? []) as { slug: string; question: string; answer: string }[],
  };
}

export async function getHelpArticle(
  slug: string,
  reader: { profileId: string | null; visitorKey: string | null },
): Promise<HelpArticleFull | null> {
  const { data } = await db()
    .from("faqs")
    .select("id, slug, question, answer, body_md, read_minutes, related_slugs, updated_at, help_categories(slug, title)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;

  const row = data as RawArticle & {
    id: string;
    answer: string;
    body_md: string | null;
    related_slugs: string[];
    updated_at: string;
  };

  const related = row.related_slugs?.length
    ? await db()
        .from("faqs")
        .select("slug, question, read_minutes, help_categories(slug, title)")
        .in("slug", row.related_slugs)
        .eq("is_active", true)
    : { data: [] };

  // "Views" on the admin FAQ screen is only honest if something counts them.
  await db().rpc("hz_bump_faq_view", { p_id: row.id });

  const voteQuery = db().from("help_feedback").select("helpful").eq("faq_id", row.id).limit(1);
  const { data: vote } = reader.profileId
    ? await voteQuery.eq("profile_id", reader.profileId)
    : reader.visitorKey
      ? await voteQuery.eq("visitor_key", reader.visitorKey)
      : { data: [] };

  return {
    ...toRow(row),
    answer: row.answer,
    bodyMd: row.body_md || row.answer,
    updatedAt: row.updated_at,
    related: ((related.data ?? []) as RawArticle[]).map(toRow),
    myVote: (vote as { helpful: boolean }[] | null)?.[0]?.helpful ?? null,
  };
}

export async function searchHelp(query: string): Promise<HelpArticleRow[]> {
  const q = query.trim();
  if (!q) return [];
  // Escape the LIKE wildcards a user can type, then match across all three
  // fields. `search_terms` is what makes "cost" find the ₹999 article.
  const safe = q.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;
  const { data } = await db()
    .from("faqs")
    .select("slug, question, read_minutes, help_categories(slug, title)")
    .eq("is_active", true)
    .or(`question.ilike.${pattern},answer.ilike.${pattern},search_terms.ilike.${pattern}`)
    .order("is_popular", { ascending: false })
    .order("sort_order")
    .limit(40);
  return ((data ?? []) as RawArticle[]).map(toRow);
}

export interface FeedbackOutcome {
  ok: boolean;
  reason?: "NOT_FOUND";
}

export async function submitHelpFeedback(
  slug: string,
  helpful: boolean,
  comment: string | null,
  reader: { profileId: string | null; visitorKey: string | null },
): Promise<FeedbackOutcome> {
  const { data: art } = await db().from("faqs").select("id, helpful_yes, helpful_no").eq("slug", slug).maybeSingle();
  if (!art) return { ok: false, reason: "NOT_FOUND" };
  const a = art as { id: string; helpful_yes: number; helpful_no: number };

  // One vote per reader. A second submit UPDATES rather than inserting, and the
  // aggregate is recomputed from the rows so it can never drift from them.
  const key = reader.profileId
    ? { profile_id: reader.profileId, visitor_key: null }
    : { profile_id: null, visitor_key: reader.visitorKey };

  const existing = await db()
    .from("help_feedback")
    .select("id")
    .eq("faq_id", a.id)
    .eq(reader.profileId ? "profile_id" : "visitor_key", reader.profileId ?? reader.visitorKey ?? "")
    .maybeSingle();

  if (existing.data) {
    await db()
      .from("help_feedback")
      .update({ helpful, comment: comment?.slice(0, 1000) ?? null })
      .eq("id", (existing.data as { id: string }).id);
  } else {
    await db().from("help_feedback").insert({
      faq_id: a.id,
      ...key,
      helpful,
      comment: comment?.slice(0, 1000) ?? null,
    });
  }

  const [{ count: yes }, { count: no }] = await Promise.all([
    db().from("help_feedback").select("id", { count: "exact", head: true }).eq("faq_id", a.id).eq("helpful", true),
    db().from("help_feedback").select("id", { count: "exact", head: true }).eq("faq_id", a.id).eq("helpful", false),
  ]);
  await db().from("faqs").update({ helpful_yes: yes ?? 0, helpful_no: no ?? 0 }).eq("id", a.id);

  return { ok: true };
}
