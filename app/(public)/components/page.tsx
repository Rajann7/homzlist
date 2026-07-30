import type { Metadata } from "next";
import { ComponentsGallery } from "@/components/system/ComponentsGallery";

/**
 * P12 S9 — the components gallery. A design-system reference surface for design
 * and QA, not a product screen, so it is never indexed.
 */
export const metadata: Metadata = { title: "Components", robots: { index: false, follow: false } };

export default function ComponentsPage() {
  return <ComponentsGallery />;
}
