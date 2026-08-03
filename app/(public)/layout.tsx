import { MaintenanceGate } from "@/components/system/MaintenanceGate";

/**
 * (public) — homzlist.com. Fully SSR, SEO-first, guest-viewable (Doc6 §4).
 * Feed, search, detail, area/landing pages, blog and legal live here.
 * The desktop uses --bg-page-desktop outside the centred column (Doc1 §3).
 *
 * The maintenance gate wraps this tree for the same reason it wraps the seller
 * one: A20's switch has to reach the surface a visitor actually lands on, and
 * the Edge middleware cannot read the setting (Supabase is unreachable there).
 */
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-page md:bg-page-desktop">
      <MaintenanceGate>{children}</MaintenanceGate>
    </div>
  );
}
