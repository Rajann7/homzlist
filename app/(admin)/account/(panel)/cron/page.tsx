import { SystemScreen } from "@/components/admin/ops/SystemScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A27 — System status (Doc5 A27, template 2602-2629). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="cron">
      <SystemScreen />
    </AdminPanels>
  );
}
