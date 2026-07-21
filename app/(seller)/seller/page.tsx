import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/** Seller dashboard placeholder (built out across later modules). */
export default function SellerHome() {
  return (
    <AppShell header={<Header left={<Wordmark />} title="Dashboard" />}>
      <EmptyState
        title="Seller workspace ready"
        subtitle="Create, chat, leads, plans and profile land in later modules."
      />
    </AppShell>
  );
}
