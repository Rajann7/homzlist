import { AppShell, Header, Wordmark, Button, EmptyState } from "@/components";

/**
 * Foundation placeholder for the public home (feed lands here in Module 6).
 * This is NOT the real screen — it exists so routing + the shared shell render.
 */
export default function PublicHome() {
  return (
    <AppShell
      header={
        <Header
          left={<Wordmark />}
          right={
            <Button variant="icon" aria-label="Notifications">
              {/* icon slot — wired in later modules */}
            </Button>
          }
        />
      }
    >
      <EmptyState
        title="Foundation ready"
        subtitle="The design system, shell, and subdomain routing are in place. Feed lands in Module 6."
        cta={{ label: "Browse components", href: "/foundation" }}
      />
    </AppShell>
  );
}
