import { SettingsScreen } from "@/components/admin/ops/SettingsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A22 — Settings & flags (Doc5 A22, template 2323-2426). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const gate = await screenGate("super");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="settings">
      <SettingsScreen />
    </AdminPanels>
  );
}
