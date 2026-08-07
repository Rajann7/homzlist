import { SystemScreen } from "@/components/admin/ops/SystemScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A27 — System status (Doc5 A27, template 2602-2629). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="cron">
      <SystemScreen />
    </AdminPanels>
  );
}
