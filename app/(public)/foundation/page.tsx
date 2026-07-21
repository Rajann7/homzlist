"use client";

import { useState } from "react";
import {
  AppShell,
  Header,
  Wordmark,
  Button,
  Input,
  Chip,
  Toggle,
  BottomSheet,
  ConfirmDialog,
  useToast,
  Card,
  Avatar,
  StatusBadge,
  VerifiedBadge,
  Skeleton,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Icon,
} from "@/components";
import { useTheme } from "@/components/theme/ThemeProvider";

/**
 * Foundation gallery — a dev/QA surface (Doc1 §2 Component Gallery lives in P12).
 * Exercises every core component + its states so the design system can be
 * eyeballed at both breakpoints and in light/dark. Not a product screen.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-divider px-4 py-6">
      <h2 className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{title}</h2>
      {children}
    </section>
  );
}

export default function FoundationGallery() {
  const { resolved, toggle } = useTheme();
  const { show } = useToast();
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [on, setOn] = useState(true);
  const [selChip, setSelChip] = useState(true);

  return (
    <AppShell
      header={
        <Header
          left={<Wordmark />}
          title="Foundation"
          right={
            <Button variant="outline" size="small" onClick={toggle}>
              {resolved === "dark" ? "Light" : "Dark"}
            </Button>
          }
        />
      }
    >
      <Section title="Buttons — variants & states">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="text">Text link</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="icon" aria-label="More">
            <Icon name="more" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="small">Small</Button>
          <Button size="small" variant="secondary">
            Small
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="City" placeholder="Rajkot" hint="Where you're looking" />
        <Input label="Price" prefix="₹" placeholder="85,00,000" />
        <Input label="Phone" defaultValue="98abc" error="Enter a valid 10-digit number" />
        <Input label="Disabled" placeholder="—" disabled />
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip selected={selChip} showCheck onClick={() => setSelChip((s) => !s)}>
            Buy
          </Chip>
          <Chip leadingIcon="pin">Rajkot</Chip>
          <Chip count={3}>Filters</Chip>
          <Chip disabled>Disabled</Chip>
        </div>
      </Section>

      <Section title="Toggle">
        <Toggle checked={on} onChange={setOn} label="Requirement active" />
      </Section>

      <Section title="Badges & Avatar">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="promoted" />
          <StatusBadge kind="for-sale" />
          <StatusBadge kind="for-rent" />
          <StatusBadge kind="under-review" />
          <StatusBadge kind="sold" />
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Rank Rajan" size={48} ring="unseen" />
          <Avatar name="Amit B" size={48} />
          <Avatar size={48} />
          <span className="inline-flex items-center gap-1 text-13 font-semibold text-ink-primary">
            Priya <VerifiedBadge level="rera" />
          </span>
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Open bottom sheet
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open confirm dialog
          </Button>
          <Button variant="secondary" onClick={() => show("Saved to your collection", { action: { label: "View", onClick: () => {} } })}>
            Show toast
          </Button>
        </div>
      </Section>

      <Section title="Loading / Empty / Error">
        <div className="grid grid-cols-2 gap-4">
          <CardSkeleton />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <Card className="p-2">
          <EmptyState title="No saved listings yet" subtitle="Tap the bookmark on any listing to save it." cta={{ label: "Explore" }} />
        </Card>
        <Card className="p-2">
          <ErrorState onRetry={() => show("Retrying…")} />
        </Card>
      </Section>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Sort by">
        <div className="flex flex-col">
          {["Latest", "Nearby", "Price: low to high", "Price: high to low"].map((o) => (
            <button key={o} className="flex h-12 items-center text-15 text-ink-primary" onClick={() => setSheet(false)}>
              {o}
            </button>
          ))}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={dialog}
        onClose={() => setDialog(false)}
        onConfirm={() => {
          setDialog(false);
          show("Deleted");
        }}
        title="Delete requirement?"
        body="This will remove the requirement and its proposals."
        consequence="This still counts against your monthly quota."
        confirmLabel="Delete"
        destructive
      />
    </AppShell>
  );
}
