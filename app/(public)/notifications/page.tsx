import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/**
 * Notifications is P11's notif screen — **Module 10**, not built yet. The feed
 * header's bell taps here (Module 6 wired the tap), so without this route the
 * bell 404'd. Shell + EmptyState, the accepted `/search` placeholder pattern —
 * no fabricated notification list (DB-lock: never fake rows).
 */
export const metadata = { title: "Notifications" };

export default function NotificationsPlaceholderPage() {
  return (
    <AppShell header={<Header left={<Wordmark />} title="Notifications" centerTitle />}>
      <EmptyState
        title="Notifications are coming"
        subtitle="Number requests, plan reminders and listing updates will land here."
        cta={{ label: "Go to Home", href: "/" }}
      />
    </AppShell>
  );
}
