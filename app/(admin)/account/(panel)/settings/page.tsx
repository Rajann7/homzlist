import { SettingsScreen } from "@/components/admin/ops/SettingsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A22 — Settings & flags (Doc5 A22, template 2323-2426). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  await requireAdmin("super");
  return (
    <AdminPanels screen="settings">
      <SettingsScreen />
    </AdminPanels>
  );
}
