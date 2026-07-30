import { MaintenanceGate } from "@/components/system/MaintenanceGate";

/**
 * (public) — homzlist.com. Fully SSR, SEO-first, guest-viewable (Doc6 §4).
 * Feed, search, detail, area/landing pages, blog, legal live here.
 * The desktop uses --bg-page-desktop outside the centred column (Doc1 §3).
 *
 * Wrapped in the maintenance gate (P12 S8) so the admin toggle actually takes
 * the public site down instead of leaving the page unreachable.
 */
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-page md:bg-page-desktop">
      <MaintenanceGate>{children}</MaintenanceGate>
    </div>
  );
}
