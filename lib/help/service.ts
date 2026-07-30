import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Help centre (Doc7 §12 #178) — designs/P12 S1.
 *
 * One `faqs` row is both the accordion answer inside its category and the
 * long-form article behind the reader, so the "N articles" on each card is a
 * real count of the same rows the category screen lists. 0088's older FAQ rows
 * have no `category_id`; scoping every query to rows that belong to a help
 * category is what keeps the counts honest.
 */

export interface HelpCategory {
  slug: string;
  title: string;
  icon: string;
  searchTerms: string;
  articleCount: number;
}

export interface HelpArticleSummary {
  slug: string;
  title: string;
  answer: string;
  category: string;
  categoryTitle: string;
  searchTerms: string;
  readMinutes: number;
}

export interface HelpArticle extends HelpArticleSummary {
  body: string;
  updatedAt: string;
  related: HelpArticleSummary[];
  myVerdict: boolean | null;
}

const ACTIVE = { is_active: true };

export async function getHelpHome(): Promise<{ categories: HelpCategory[]; popular: HelpArticleSummary[] }> {
  const db = createServiceClient();
  const [{ data: cats }, { data: rows }] = await Promise.all([
    db.from("help_categories").select("id, slug, title, icon, search_terms").match(ACTIVE)
      .order("sort_order", { ascending: true }),
    db.from("faqs").select("slug, question, answer, category, search_terms, read_minutes, is_popular, sort_order, category_id")
      .match(ACTIVE).not("category_id", "is", null),
  ]);

  const byCat = new Map<string, number>();
  for (const r of rows ?? []) byCat.set(r.category_id as string, (byCat.get(r.category_id as string) ?? 0) + 1);

  const titleBySlug = new Map<string, string>((cats ?? []).map((c: Record<string, unknown>) => [c.slug as string, c.title as string]));

  const categories = (cats ?? []).map((c: Record<string, unknown>) => ({
    slug: c.slug as string,
    title: c.title as string,
    icon: (c.icon as string) ?? "file",
    searchTerms: (c.search_terms as string) ?? "",
    articleCount: byCat.get(c.id as string) ?? 0,
  }));

  const popular = (rows ?? [])
    .filter((r: Record<string, unknown>) => r.is_popular)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.sort_order as number) - (b.sort_order as number))
    .map((r: Record<string, unknown>) => toSummary(r, titleBySlug));

  return { categories, popular };
}

function toSummary(r: Record<string, unknown>, titles: Map<string, string>): HelpArticleSummary {
  return {
    slug: r.slug as string,
    title: r.question as string,
    answer: r.answer as string,
    category: r.category as string,
    categoryTitle: titles.get(r.category as string) ?? (r.category as string),
    searchTerms: (r.search_terms as string) ?? "",
    readMinutes: (r.read_minutes as number) ?? 2,
  };
}

/** One category's accordion — every article in it, in admin order. */
export async function getHelpCategory(
  slug: string,
): Promise<{ slug: string; title: string; articles: HelpArticleSummary[] } | null> {
  const db = createServiceClient();
  const { data: cat } = await db
    .from("help_categories").select("id, slug, title").eq("slug", slug).match(ACTIVE).maybeSingle();
  if (!cat) return null;
  const { data } = await db
    .from("faqs")
    .select("slug, question, answer, category, search_terms, read_minutes")
    .eq("category_id", cat.id).match(ACTIVE)
    .order("sort_order", { ascending: true });
  const titles = new Map<string, string>([[cat.slug as string, cat.title as string]]);
  return {
    slug: cat.slug,
    title: cat.title,
    articles: (data ?? []).map((r: Record<string, unknown>) => toSummary(r, titles)),
  };
}

export async function getHelpArticle(slug: string, profileId?: string | null): Promise<HelpArticle | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("faqs")
    .select("id, slug, question, answer, body_md, category, search_terms, read_minutes, related_slugs, updated_at")
    .eq("slug", slug).match(ACTIVE).maybeSingle();
  if (!data) return null;

  const { data: cats } = await db.from("help_categories").select("slug, title");
  const titles = new Map<string, string>((cats ?? []).map((c: Record<string, unknown>) => [c.slug as string, c.title as string]));

  const relatedSlugs = (data.related_slugs as string[]) ?? [];
  let related: HelpArticleSummary[] = [];
  if (relatedSlugs.length) {
    const { data: rel } = await db
      .from("faqs")
      .select("slug, question, answer, category, search_terms, read_minutes")
      .in("slug", relatedSlugs).match(ACTIVE);
    // keep the editorial order
    related = relatedSlugs
      .map((s) => (rel ?? []).find((r: Record<string, unknown>) => r.slug === s))
      .filter(Boolean)
      .map((r) => toSummary(r as Record<string, unknown>, titles));
  }

  let myVerdict: boolean | null = null;
  if (profileId) {
    const { data: fb } = await db
      .from("help_feedback").select("helpful").eq("faq_id", data.id).eq("profile_id", profileId).maybeSingle();
    if (fb) myVerdict = fb.helpful as boolean;
  }

  return {
    ...toSummary(data, titles),
    body: (data.body_md as string) ?? (data.answer as string),
    updatedAt: data.updated_at,
    related,
    myVerdict,
  };
}

/**
 * Search across titles, answers and the per-article synonyms. Done in Postgres
 * (not by filtering a client-side array) so it works for a guest with no bundle
 * and stays correct as the article set grows.
 */
export async function searchHelp(q: string): Promise<HelpArticleSummary[]> {
  const term = q.trim();
  if (!term) return [];
  const db = createServiceClient();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const { data: cats } = await db.from("help_categories").select("slug, title");
  const titles = new Map<string, string>((cats ?? []).map((c: Record<string, unknown>) => [c.slug as string, c.title as string]));
  const { data } = await db
    .from("faqs")
    .select("slug, question, answer, category, search_terms, read_minutes, sort_order")
    .match(ACTIVE).not("category_id", "is", null)
    .or(`question.ilike.${like},answer.ilike.${like},search_terms.ilike.${like}`)
    .order("is_popular", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(30);
  return (data ?? []).map((r: Record<string, unknown>) => toSummary(r, titles));
}

/** "Was this helpful?" — one verdict per user, counters kept on the article. */
export async function recordHelpFeedback(
  slug: string,
  profileId: string | null,
  helpful: boolean,
  note: string | null,
): Promise<boolean> {
  const db = createServiceClient();
  const { data: art } = await db.from("faqs").select("id, helpful_yes, helpful_no").eq("slug", slug).maybeSingle();
  if (!art) return false;

  let previous: boolean | null = null;
  if (profileId) {
    const { data: existing } = await db
      .from("help_feedback").select("id, helpful").eq("faq_id", art.id).eq("profile_id", profileId).maybeSingle();
    previous = existing ? (existing.helpful as boolean) : null;
    if (existing) {
      await db.from("help_feedback").update({ helpful, note }).eq("id", existing.id);
    } else {
      await db.from("help_feedback").insert({ faq_id: art.id, profile_id: profileId, helpful, note });
    }
  } else {
    await db.from("help_feedback").insert({ faq_id: art.id, profile_id: null, helpful, note });
  }

  // Counters follow the delta, so changing a vote doesn't double-count.
  let yes = (art.helpful_yes as number) ?? 0;
  let no = (art.helpful_no as number) ?? 0;
  if (previous === null) helpful ? (yes += 1) : (no += 1);
  else if (previous !== helpful) {
    if (helpful) { yes += 1; no = Math.max(0, no - 1); }
    else { no += 1; yes = Math.max(0, yes - 1); }
  }
  await db.from("faqs").update({ helpful_yes: yes, helpful_no: no }).eq("id", art.id);
  return true;
}
