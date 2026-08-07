import { ContentScreen } from "@/components/admin/content/ContentScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A20 — Content (Doc5 A20, template 2161-2236). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ContentPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="cms">
      <ContentScreen />
    </AdminPanels>
  );
}
