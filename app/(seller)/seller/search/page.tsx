import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/** Seller-zone twin of the public search placeholder — see that file. */
export const metadata = { title: "Search" };

export default function SellerSearchPlaceholderPage() {
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
