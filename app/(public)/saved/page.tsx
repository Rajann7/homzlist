import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/** Saved is P10 (Module 10). Same reasoning as the search placeholder. */
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
