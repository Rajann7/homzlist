import { DisputesScreen } from "@/components/admin/ops/DisputesScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A24 — Disputes (Doc5 A24, template 2484-2521). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="disputes">
      <DisputesScreen />
    </AdminPanels>
  );
}
