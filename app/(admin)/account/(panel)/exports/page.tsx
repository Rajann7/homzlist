import { ExportsScreen } from "@/components/admin/ops/ExportsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { createServiceClient } from "@/lib/supabase/server";

/** A30 — Exports (Doc5 A30, template 2719-2760). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ExportsPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  const { data } = await createServiceClient().from("exports").select("entity");
  const entities = [...new Set(((data ?? []) as { entity: string }[]).map((e) => e.entity))]
    .filter(Boolean)
    .sort()
    .map((value) => ({ value, label: value }));

  return (
    <AdminPanels screen="exports">
      <ExportsScreen entities={entities} />
    </AdminPanels>
  );
}
