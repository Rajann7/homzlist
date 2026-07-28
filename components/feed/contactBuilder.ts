"use client";

import type { FeedCard } from "@/lib/feed/client";
import { listingsApi } from "@/lib/listings/client";

/**
 * Call / WhatsApp on a project card, wherever that card appears (feed, search).
 *
 * Same contract as the project detail's sticky bar: record the lead first —
 * fire-and-forget, because the call must connect whether or not the write lands
 * — then open the dialler or wa.me. The WhatsApp message names the project and
 * asks for details, so what arrives is a readable question and not a bare link
 * (Rajan, 28 Jul 2026).
 *
 * The number itself is server-supplied and withheld from guests, so a missing
 * number is a real "not shared", never a client-side guess.
 */
export function contactBuilder(card: FeedCard, via: "call" | "whatsapp", notify: (msg: string) => void) {
  const number = card.contactNumber ? String(card.contactNumber).replace(/\D/g, "") : "";
  if (!number) { notify("The builder hasn't shared a contact number"); return; }
  void listingsApi.recordProjectContact(card.id, via);
  if (via === "call") { window.location.href = `tel:${card.contactNumber}`; return; }
  const msg = `Hi, I'm interested in ${card.title ?? "your project"}${card.areaLabel ? ` at ${card.areaLabel}` : ""}. Could you share more details?`;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, "_blank");
}
