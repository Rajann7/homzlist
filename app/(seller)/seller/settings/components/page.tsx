import { ComponentsGallery } from "@/components/system/ComponentsGallery";

/**
 * P12 S9 — the components gallery. Reached from Settings; it is a design
 * reference rather than a user feature, but it is built from the real
 * components so a regression shows up here first.
 */
export const metadata = { title: "Components", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function SellerComponentsPage() {
  return <ComponentsGallery />;
}
