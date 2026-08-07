import { TemplatesScreen } from "@/components/admin/templates/TemplatesScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A21 — Templates & strings (Doc5 A21, template 2237-2322). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TemplatesPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="templates">
      <TemplatesScreen />
    </AdminPanels>
  );
}
