"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Toggle, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { searchApi, filtersToQuery, type SavedSearchRow } from "@/lib/search/client";

/**
 * P10 S2b — Saved searches (Doc4 §58 / Doc7 §112). The list, match counts and
 * alert state are the server's (GET /search/saved). Flipping an alert PATCHes
 * and re-renders the returned list; tapping a row re-runs it by navigating to
 * the results screen with its stored filters; delete removes it. Nothing is kept
 * client-side.
 */
export function SavedSearches({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<SavedSearchRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedSearchRow | null>(null);

  const load = useCallback(async () => {
    const r = await searchApi.savedList();
    if (r.ok) { setItems(r.data.items); setOffline(false); }
    else { setOffline(r.error.code === "OFFLINE"); setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggleAlerts(s: SavedSearchRow, enabled: boolean) {
    setItems((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, alertsEnabled: enabled } : x)));
    setBusy(s.id);
    const r = await searchApi.setAlerts(s.id, enabled);
    setBusy(null);
    if (r.ok) setItems(r.data.items);
    else { setItems((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, alertsEnabled: !enabled } : x))); toast.show("Couldn't save that"); }
  }

  async function remove(s: SavedSearchRow) {
    setDeleteTarget(null);
    const r = await searchApi.removeSaved(s.id);
    if (r.ok) { setItems(r.data.items); toast.show("Search removed"); }
    else toast.show("Couldn't remove that");
  }

  function run(s: SavedSearchRow) {
    const qs = filtersToQuery(s.params);
    router.push(`${base}/search/results${qs ? `?${qs}` : ""}`);
  }

  const header = <Header left={<BackButton fallback={`${base}/activity`} />} title="Saved searches" centerTitle />;

  if (!items) {
    return (
      <AppShell header={header}>
        <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-12" />)}</div>
      </AppShell>
    );
  }

  if (items.length === 0) {
    return (
      <AppShell header={header}>
        {offline && <OfflineStrip />}
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Icon name="bell" size={64} className="text-ink-disabled" strokeWidth={1.3} />
          <h3 className="text-17 font-semibold text-ink-primary">No saved searches</h3>
          <p className="max-w-xs text-13 text-ink-secondary">Save a search from the results screen to get alerts when new matches appear.</p>
          <Button className="mt-2" onClick={() => router.push(`${base}/search`)}>Start a search</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      {offline && <OfflineStrip />}
      <div className="flex flex-col gap-2 p-4">
        {items.map((s) => (
          <div key={s.id} className="rounded-12 border border-border bg-surface-1 p-3">
            <div className="flex items-start gap-2">
              <button onClick={() => run(s)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-15 font-semibold text-ink-primary">{s.label}</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">
                  {s.lastMatchCount > 0 ? `${s.lastMatchCount} match${s.lastMatchCount === 1 ? "" : "es"}` : "No matches yet"}
                  {s.alertsEnabled ? " · alerts on" : ""}
                </div>
              </button>
              <button aria-label="Remove" onClick={() => setDeleteTarget(s)} className="grid h-8 w-8 shrink-0 place-items-center text-ink-tertiary">
                <Icon name="trash" size={18} strokeWidth={1.7} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-13 text-ink-secondary">New-match alerts</span>
              <Toggle checked={s.alertsEnabled} disabled={busy === s.id} onChange={(v) => void toggleAlerts(s, v)} />
            </div>
          </div>
        ))}
      </div>
      <div className="h-4" />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }}
        title="Remove this saved search?"
        body={`"${deleteTarget?.label ?? ""}" and its alerts are removed.`}
        confirmLabel="Remove"
        destructive
      />
    </AppShell>
  );
}

function OfflineStrip() {
  return (
    <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
      <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
    </div>
  );
}
