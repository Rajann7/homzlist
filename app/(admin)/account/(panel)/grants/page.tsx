import { GrantsScreen } from "@/components/admin/catalog/GrantsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A15 — Grants & trials (Doc5 A15, template 1252-1272). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function GrantsPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="grants">
      <GrantsScreen />
    </AdminPanels>
  );
}
