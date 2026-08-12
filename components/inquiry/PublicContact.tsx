"use client";

import { useState } from "react";
import { BottomSheet, Icon, useToast } from "@/components/billing/ui";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

/**
 * The poster's number, when they chose to publish it.
 *
 * Two pieces, both from the design:
 *
 *  · PublicNumberCard — the number sits UNDER the person, on their card, with
 *    the badge that says it is public and a tap-to-copy. Not masked: the point
 *    of publishing a number is that people can read it.
 *
 *  · ConnectChoiceSheet — when a number IS public the buyer has three real
 *    ways to connect, so they are offered as three, and the buyer decides.
 *    Calling or messaging does not create a lead; Send Inquiry does, and the
 *    sheet says so rather than leaving it to be discovered.
 */

export interface PublicContact {
  number: string;
  whatsapp?: string | null;
}

export function PublicNumberCard({
  person, contact, className,
}: {
  person: { name: string; photoUrl?: string | null; line: string };
  contact: PublicContact;
  className?: string;
}) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(contact.number);
      toast.show("Number copied");
    } catch {
      toast.show("Couldn't copy — long-press the number instead");
    }
  };

  return (
    <div className={cn("rounded-12 border border-border bg-surface-1 p-3", className)}>
      <div className="flex items-center gap-3">
        <Avatar src={person.photoUrl ?? null} name={person.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-13 font-semibold text-ink-primary">{person.name}</div>
          <div className="mt-0.5 truncate text-12 text-ink-secondary">{person.line}</div>
        </div>
        <span className="chrome shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">
          Number public
        </span>
      </div>

      <button type="button" onClick={() => void copy()} className="chrome mt-2.5 flex w-full items-center gap-2 text-left">
        <Icon name="phone" size={16} className="shrink-0 text-accent" />
        <span className="flex-1 text-13 font-semibold tracking-wide text-ink-primary">{contact.number}</span>
        <span className="shrink-0 text-12 text-ink-secondary">Tap to copy</span>
      </button>
    </div>
  );
}

export function ConnectChoiceSheet({
  open, onClose, contact, subjectKind, onSendInquiry, onCall, onWhatsapp,
}: {
  open: boolean;
  onClose: () => void;
  contact: PublicContact;
  subjectKind: "listing" | "project";
  onSendInquiry: () => void;
  onCall: () => void;
  onWhatsapp: () => void;
}) {
  const whatsapp = contact.whatsapp || contact.number;
  return (
    <BottomSheet open={open} onClose={onClose} title="How would you like to connect?">
      <div className="flex flex-col gap-2 pb-2">
        <Choice
          icon="phone"
          tone="accent"
          title="Call now"
          subtitle={contact.number}
          onClick={() => { onClose(); onCall(); }}
        />
        <Choice
          icon="whatsapp"
          tone="whatsapp"
          title="WhatsApp"
          subtitle={`${whatsapp} · opens with a ready line`}
          onClick={() => { onClose(); onWhatsapp(); }}
        />
        <Choice
          icon="zap"
          tone="accent"
          title="Send Inquiry"
          subtitle="3 taps · they get a lead card, no typing"
          selected
          onClick={() => { onClose(); onSendInquiry(); }}
        />
        <p className="mt-1 flex items-start gap-2 rounded-8 border border-divider bg-surface-2 p-2.5 text-12 leading-snug text-ink-secondary">
          <Icon name="info" size={14} className="mt-0.5 shrink-0 opacity-80" />
          <span>
            You decide how to connect. Calling or WhatsApp doesn&apos;t tell the{" "}
            {subjectKind === "project" ? "builder" : "owner"} what you need — Send Inquiry does.
          </span>
        </p>
      </div>
    </BottomSheet>
  );
}

function Choice({
  icon, title, subtitle, onClick, selected, tone,
}: {
  icon: "phone" | "whatsapp" | "zap";
  title: string;
  subtitle: string;
  onClick: () => void;
  selected?: boolean;
  tone: "accent" | "whatsapp";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "chrome flex items-center gap-2.5 rounded-12 border p-3 text-left",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface-1",
      )}
    >
      <Icon name={icon} size={20} className={tone === "whatsapp" ? "text-[#25D366]" : "text-accent"} />
      <span className="min-w-0 flex-1">
        <span className="block text-14 font-semibold text-ink-primary">{title}</span>
        <span className="block truncate text-12 text-ink-secondary">{subtitle}</span>
      </span>
    </button>
  );
}
