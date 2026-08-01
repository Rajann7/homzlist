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
import { PlanEditPanelBody, PlanPurchasesPanelBody } from "../catalog/PlanEditPanel";
import { CouponEditPanelBody } from "../catalog/CouponEditPanel";

/**
 * P5a's editors need the plan catalog to render their scope pickers, and a
 * panel body has no props but its own entry — so the list is threaded in when
 * the provider is mounted, from the server component that already has it.
 */
function buildRegistry(planOptions: { code: string; name: string }[]): PanelRegistry {
  return { ...REGISTRY, ...catalogPanels(planOptions) };
}

const catalogPanels = (planOptions: { code: string; name: string }[]): PanelRegistry => ({
  planEdit: {
    // template 1273 — a new plan has no name yet
    crumb: (p) => String(p.data.name ?? "New plan"),
    body: (p) => <PlanEditPanelBody panel={p} />,
  },
  planPurchases: {
    crumb: (p) => `${p.data.name ?? "Plan"} · purchases`,
    body: (p) => <PlanPurchasesPanelBody panel={p} />,
  },
  couponEdit: {
    crumb: (p) => String(p.data.code ?? "New coupon"),
    body: (p) => <CouponEditPanelBody panel={p} planOptions={planOptions} />,
  },
});

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

export function AdminPanels({
  screen,
  children,
  planOptions = [],
}: {
  screen: string;
  children: ReactNode;
  /** only the catalog screens need it; every other screen passes nothing */
  planOptions?: { code: string; name: string }[];
}) {
  return (
    <PanelStackProvider registry={buildRegistry(planOptions)} screen={screen}>
      {children}
    </PanelStackProvider>
  );
}
