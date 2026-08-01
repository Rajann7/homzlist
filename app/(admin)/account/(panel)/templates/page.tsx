import { TemplatesScreen } from "@/components/admin/templates/TemplatesScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A21 — Templates & strings (Doc5 A21, template 2237-2322). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TemplatesPage() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="templates">
      <TemplatesScreen />
    </AdminPanels>
  );
}
