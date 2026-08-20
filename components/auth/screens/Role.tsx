"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

/**
 * S6 Role Selection (P1, pixel-exact). Step 1/2 dots · title 24/700 · sub 15
 * #555 · 3 cards (icon 48 accent-soft square + role 17/600 + line 13 #555 + ⓘ),
 * selected = accent 1.5px border + accent-soft. Continue disabled until selected.
 */
type Role = "owner" | "broker" | "builder";

const ROLES: Array<{ id: Role; icon: IconName; title: string; line: string; info: { title: string; body: string } }> = [
  { id: "owner", icon: "home", title: "Owner", line: "Buy, sell or rent my own property", info: { title: "Owner account", body: "Owners can list their own properties for sale or rent and manage inquiries directly. You get Phone and ID verification badges." } },
  { id: "broker", icon: "briefcase", title: "Broker", line: "List and manage client properties", info: { title: "Broker account", body: "Brokers can list client properties and get a verified badge after RERA verification. You can request verification anytime from your profile." } },
  { id: "builder", icon: "building", title: "Builder", line: "Post my projects and reach buyers", info: { title: "Builder account", body: "Builders can post projects with units, floor plans and RERA details, and reach matched buyers. RERA verification unlocks the verified badge." } },
];

export function Role({ onContinue }: { onContinue: (role: Role) => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [info, setInfo] = useState<(typeof ROLES)[number]["info"] | null>(null);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page px-4 md:min-h-0 md:bg-transparent md:px-0">
      <div className="mt-6 flex gap-2 md:mt-0">
        <span className="h-1 w-5 rounded-full bg-accent" />
        <span className="h-1 w-5 rounded-full bg-surface-3" />
      </div>

      <h1 className="mt-6 text-24 font-bold text-ink-primary">I am a…</h1>
      <p className="mt-2 text-15 text-ink-secondary">Choose how you&apos;ll use HomzList</p>

      <div className="mt-6 flex flex-col gap-3">
        {ROLES.map((r) => {
          const isSel = selected === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={cn(
                "relative flex items-center gap-3 rounded-8 border p-4 text-left transition-colors",
                isSel ? "border-[1.5px] border-accent bg-accent-soft" : "border-transparent bg-surface-1 shadow-l1 md:border-border md:shadow-none dark:border dark:border-border dark:shadow-none",
              )}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-8 bg-accent-soft">
                <Icon name={r.icon} size={26} className="text-accent" strokeWidth={1.7} />
              </span>
              <span className="flex-1">
                <span className="block text-17 font-semibold text-ink-primary">{r.title}</span>
                <span className="block text-13 text-ink-secondary">{r.line}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`About ${r.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setInfo(r.info);
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-tertiary"
              >
                <Icon name="info" size={18} strokeWidth={1.7} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />
      <Button className="mb-6 mt-6" fullWidth disabled={!selected} onClick={() => selected && onContinue(selected)}>
        Continue
      </Button>

      <ConfirmDialog open={!!info} onClose={() => setInfo(null)} onConfirm={() => setInfo(null)} title={info?.title ?? ""} body={info?.body} confirmLabel="Got it" hideCancel />
    </div>
  );
}
