import { AuditScreen } from "@/components/admin/ops/AuditScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { createServiceClient } from "@/lib/supabase/server";

/** A26 — Audit log (Doc5 A26, template 2565-2601). Super only. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AuditPage() {
  const gate = await screenGate("super");
  if (!gate.ok) return gate.lock;
  const db = createServiceClient();

  // Every filter option is a DISTINCT over what the log actually contains, so
  // no pill offers a value that returns nothing.
  const [{ data: staff }, { data: rows }] = await Promise.all([
    db.from("staff").select("profile_id, display_name").order("display_name"),
    db.from("admin_audit_log").select("action, entity_type").limit(5000),
  ]);

  const admins = ((staff ?? []) as { profile_id: string; display_name: string }[]).map((s) => ({
    value: s.profile_id,
    label: s.display_name,
  }));
  const seen = (rows ?? []) as { action: string; entity_type: string }[];
  const actions = [...new Set(seen.map((r) => r.action))].sort().map((v) => ({ value: v, label: v }));
  const entities = [...new Set(seen.map((r) => r.entity_type))].sort().map((v) => ({ value: v, label: v }));

  return (
    <AdminPanels screen="audit">
      <AuditScreen admins={admins} actions={actions} entities={entities} />
    </AdminPanels>
  );
}
