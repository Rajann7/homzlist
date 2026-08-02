import { TrashScreen } from "@/components/admin/ops/TrashScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A29 — Trash (Doc5 A29, template 2692-2717). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="trash">
      <TrashScreen />
    </AdminPanels>
  );
}
