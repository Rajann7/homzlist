"use client";

/**
 * The four panel types P4 introduces, registered once.
 *
 * The design calls `pushPanel` 58 times and every one of them lands on one of
 * these: a user, a listing, a payment, a chat. Registering them here — rather
 * than per screen — is what lets a payment opened from A11 push the USER panel
 * back on top of itself, which is the design's "onward drill infinite"
 * (Doc5 A11).
 *
 * The crumb is what the breadcrumb bar prints for each level (template 1273).
 */

import type { ReactNode } from "react";
import { PanelStackProvider, type PanelRegistry } from "@/components/admin/ds";
import { UserPanelBody } from "../users/UserPanel";
import { ListingPanelBody } from "../listings/ListingPanel";
import { PaymentPanelBody } from "./PaymentPanel";
import { ChatPanelBody } from "./ChatPanel";

const REGISTRY: PanelRegistry = {
  user: {
    crumb: (p) => String(p.data.name ?? "User"),
    body: (p) => <UserPanelBody panel={p} />,
  },
  listing: {
    crumb: (p) => String(p.data.title ?? "Listing"),
    body: (p) => <ListingPanelBody panel={p} />,
  },
  payment: {
    crumb: (p) => String(p.data.label ?? "Payment"),
    body: (p) => <PaymentPanelBody panel={p} />,
  },
  chat: {
    crumb: (p) => `Chat · ${String(p.data.who ?? "")}`.trim(),
    body: (p) => <ChatPanelBody panel={p} />,
  },
};

export function AdminPanels({ screen, children }: { screen: string; children: ReactNode }) {
  return (
    <PanelStackProvider registry={REGISTRY} screen={screen}>
      {children}
    </PanelStackProvider>
  );
}
