import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/**
 * Search is P3 (Module 6) and isn't built yet — but Search is one of the five
 * canonical bottom-nav items, so the tap has to land somewhere. It used to hit
 * the 404 page on every screen with a nav (CLAUDE.md rule 10: no dead-ends).
 *
 * Deliberately the shell + EmptyState, the same pattern the feed placeholder
 * uses: the nav keeps all five items, so nothing about the design moves.
 */
export const metadata = { title: "Search" };

export default function SearchPlaceholderPage() {
  return (
    <AppShell header={<Header left={<Wordmark />} title="Search" centerTitle />}>
      <EmptyState
        title="Search is coming"
        subtitle="You'll be able to search by area, budget, BHK and property type. For now, browse from Home."
        cta={{ label: "Go to Home", href: "/" }}
      />
    </AppShell>
  );
}
