import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { enumerateLandings, browsableCities } from "./slugs";
import { siteUrl } from "./schema";

/**
 * Sitemaps (Doc3 §4): separate files per type + an index. Sold/rented listings
 * are auto-removed because every query here filters on
 * `status='live' AND availability='available'` — the same predicate the pages
 * use, so a sitemap entry can never point at a 404 or a "no longer available".
 */

const db = () => createServiceClient();

export type SitemapType = "listings" | "landing" | "areas" | "static" | "projects";

export interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
}

export function renderUrlset(entries: UrlEntry[]): string {
  const base = siteUrl();
  const body = entries
    .map((e) => {
      const loc = e.loc.startsWith("http") ? e.loc : `${base}${e.loc}`;
      return [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : "",
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
        e.priority != null ? `    <priority>${e.priority.toFixed(1)}</priority>` : "",
        "  </url>",
      ].filter(Boolean).join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderIndex(types: { type: SitemapType; lastmod: string }[]): string {
  const base = siteUrl();
  const body = types
    .map((t) => `  <sitemap>\n    <loc>${base}/sitemap-${t.type}.xml</loc>\n    <lastmod>${t.lastmod.slice(0, 10)}</lastmod>\n  </sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export async function sitemapFor(type: SitemapType): Promise<UrlEntry[]> {
  if (type === "listings") {
    // Only live + available. A sold listing drops out of the sitemap on its
    // next generation, which is what Doc3's "sold auto-removed" requires.
    const { data } = await db()
      .from("listings")
      .select("id,updated_at,live_at")
      .eq("status", "live").eq("availability", "available")
      .order("live_at", { ascending: false })
      .limit(45_000);
    return ((data ?? []) as any[]).map((l) => ({
      loc: `/property/${l.id}`,
      lastmod: l.updated_at ?? l.live_at ?? undefined,
      changefreq: "weekly" as const,
      priority: 0.8,
    }));
  }

  if (type === "projects") {
    const { data } = await db()
      .from("projects").select("id,updated_at,live_at")
      .eq("status", "live").order("live_at", { ascending: false }).limit(10_000);
    return ((data ?? []) as any[]).map((p) => ({
      loc: `/project/${p.id}`,
      lastmod: p.updated_at ?? p.live_at ?? undefined,
      changefreq: "weekly" as const,
      priority: 0.7,
    }));
  }

  if (type === "areas") {
    // Cities that have a browse page — launched, or opened on their own
    // inventory (≥3 live listings). Same gate as resolvePlace, so the sitemap
    // never advertises a hub that 404s and never hides one that resolves.
    const cityRows = (await browsableCities()).map((c) => ({ id: c.id, slug: c.slug }));
    const citySlug = new Map(cityRows.map((c) => [c.id, c.slug]));

    // Areas of browsable cities only. Unscoped this reads all 50,950 area rows
    // (migration 0054) to then discard every one whose city isn't browsable.
    const { data: areas } = cityRows.length
      ? await db().from("locations")
          .select("id,slug,parent_id").eq("level", "area").eq("is_active", true)
          .in("parent_id", cityRows.map((c) => c.id))
      : { data: [] as { id: string; slug: string; parent_id: string | null }[] };

    const out: UrlEntry[] = cityRows.map((c) => ({ loc: `/${c.slug}`, changefreq: "daily" as const, priority: 0.9 }));

    for (const a of ((areas ?? []) as { id: string; slug: string; parent_id: string | null }[])) {
      const cs = a.parent_id ? citySlug.get(a.parent_id) : null;
      if (!cs) continue;
      // An area with nothing live is not put in the sitemap — the page itself
      // would be noindex, and advertising it wastes crawl budget.
      const { count } = await db().from("listings").select("id", { count: "exact", head: true })
        .eq("status", "live").eq("availability", "available").eq("area_id", a.id);
      if ((count ?? 0) === 0) continue;
      out.push({ loc: `/area/${a.slug}-${cs}`, changefreq: "daily", priority: 0.8 });
    }
    return out;
  }

  if (type === "landing") {
    // Already filtered to ≥3 live listings by enumerateLandings.
    const entries = await enumerateLandings();
    return entries.map((e) => ({
      loc: e.path,
      lastmod: e.lastmod,
      changefreq: "daily" as const,
      priority: e.count >= 10 ? 0.9 : 0.7,
    }));
  }

  // static — the pages that exist regardless of inventory. This is where the
  // blog and the legal pages belong: they are public, indexable and stable, and
  // leaving them out meant the site's largest organic surface was never
  // submitted (Doc10: "Guest-accessible + SEO").
  const today = new Date().toISOString();
  const [{ data: posts }, { data: legal }] = await Promise.all([
    db().from("blog_posts").select("slug, updated_at")
      .eq("status", "published").lte("published_at", today).order("published_at", { ascending: false }),
    db().from("cms_pages").select("slug, updated_at").eq("is_published", true).order("sort_order"),
  ]);

  return [
    { loc: "/", lastmod: today, changefreq: "daily", priority: 1.0 },
    { loc: "/search", lastmod: today, changefreq: "weekly", priority: 0.5 },
    { loc: "/blog", lastmod: today, changefreq: "weekly", priority: 0.8 },
    ...((posts ?? []) as { slug: string; updated_at: string }[]).map((p) => ({
      loc: `/blog/${p.slug}`,
      lastmod: p.updated_at,
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
    { loc: "/legal", lastmod: today, changefreq: "monthly", priority: 0.4 },
    ...((legal ?? []) as { slug: string; updated_at: string }[]).map((p) => ({
      loc: `/legal/${p.slug}`,
      lastmod: p.updated_at,
      changefreq: "monthly" as const,
      priority: 0.3,
    })),
  ];
}

export async function sitemapLastmod(type: SitemapType): Promise<string> {
  if (type === "static") return new Date().toISOString();
  const table = type === "projects" ? "projects" : "listings";
  const { data } = await db().from(table).select("updated_at")
    .eq("status", "live").order("updated_at", { ascending: false }).limit(1);
  return ((data ?? []) as { updated_at: string }[])[0]?.updated_at ?? new Date().toISOString();
}
