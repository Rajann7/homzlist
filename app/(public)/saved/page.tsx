import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/**
 * Saved is P10 — **Module 6B** (added to Doc6 on 23 Jul 2026; P10 previously had
 * no module at all). Same reasoning as the search placeholder: the tab must land
 * somewhere. Module 6's `saves` table is already real — 6B builds the list/
 * collections UI on top of it, so nothing saved today is lost.
 */
export const metadata = { title: "Saved" };

export default function SavedPlaceholderPage() {
  return (
    <AppShell header={<Header left={<Wordmark />} title="Saved" centerTitle />}>
      <EmptyState
        title="Saved is coming"
        subtitle="Shortlist properties and group them into collections. Nothing you save today is lost — the list starts here."
        cta={{ label: "Go to Home", href: "/" }}
      />
    </AppShell>
  );
}
