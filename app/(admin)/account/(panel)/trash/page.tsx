import { TrashScreen } from "@/components/admin/ops/TrashScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A29 — Trash (Doc5 A29, template 2692-2717). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="trash">
      <TrashScreen />
    </AdminPanels>
  );
}
