/**
 * (public) — homzlist.com. Fully SSR, SEO-first, guest-viewable (Doc6 §4).
 * Feed, search, detail, area/landing pages, blog, legal live here (later modules).
 * The desktop uses --bg-page-desktop outside the centred column (Doc1 §3).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-page md:bg-page-desktop">{children}</div>;
}
