import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/** Seller-zone twin of the public saved placeholder — see that file. */
export const metadata = { title: "Saved" };

export default function SellerSavedPlaceholderPage() {
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
