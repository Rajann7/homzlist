import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/**
 * Messages & Chat is P7 — **Module 7**, not built yet. The feed header's message
 * icon taps here, so without this route it 404'd. Shell + EmptyState (the
 * accepted `/search` pattern) — inquiries already persist in the `inquiries`
 * table (Module 6), Module 7 grows a thread from each one, so nothing sent
 * today is lost.
 */
export const metadata = { title: "Messages" };

export default function MessagesPlaceholderPage() {
  return (
    <AppShell header={<Header left={<Wordmark />} title="Messages" centerTitle />}>
      <EmptyState
        title="Chat is coming"
        subtitle="Your inquiries are saved. When chat opens, each one becomes a thread with the poster."
        cta={{ label: "Go to Home", href: "/" }}
      />
    </AppShell>
  );
}
