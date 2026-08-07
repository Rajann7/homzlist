"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, BottomSheet, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { savedApi, type SavedView, type SavedTile, type SavedCollection } from "@/lib/saved/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P10 S1 — Saved (Doc4 §57). The feed heart's wishlist, with private collection
 * chips and a real "changed" alert. Everything shown is the server's answer from
 * GET /saved: the tiles, the chip counts, and which saves changed. The screen
 * only holds the current collection filter and the "changed-only" view toggle.
 */
export function Saved({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<SavedView | null>(null);
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState<string | null>(null); // null = "All"
  const [changedOnly, setChangedOnly] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tileTarget, setTileTarget] = useState<SavedTile | null>(null);
  const [manageTarget, setManageTarget] = useState<SavedCollection | null>(null);
  const [renaming, setRenaming] = useState<SavedCollection | null>(null);
  const [renameText, setRenameText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedCollection | null>(null);

  const load = useCallback(async (collectionId: string | null) => {
    const r = await savedApi.list(collectionId);
    if (r.ok) { setView(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
  }, []);
  useEffect(() => { void load(active); }, [load, active]);

  const header = (
    <Header
      left={<BackButton fallback={`${base}/profile`} />}
      title="Saved"
      centerTitle
      right={
        <button aria-label="New collection" onClick={() => setNewOpen(true)} className="grid h-11 w-11 place-items-center text-ink-primary">
          <Icon name="plus" size={24} strokeWidth={1.9} />
        </button>
      }
    />
  );

  if (!view) {
    return (
      <AppShell header={header}>
        <div className="flex gap-2 overflow-x-auto p-4">{[70, 90, 80].map((w, i) => <Skeleton key={i} className="h-8 shrink-0 rounded-full" style={{ width: w }} />)}</div>
        <div className="grid grid-cols-3 gap-[2px]">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-none" />)}</div>
      </AppShell>
    );
  }

  const tiles = changedOnly ? view.tiles.filter((t) => t.changed) : view.tiles;

  async function createCollection() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    const r = await savedApi.createCollection(clean);
    setBusy(false);
    if (!r.ok) { toast.show(r.error.reason === "duplicate" ? "You already have a collection with that name" : "Couldn't create that"); return; }
    setNewOpen(false); setName("");
    await load(active);
    toast.show("Collection created");
  }

  async function moveTo(collectionId: string | null) {
    if (!tileTarget) return;
    const t = tileTarget; setTileTarget(null);
    const r = await savedApi.assign(t.saveId, collectionId);
    if (!r.ok) { toast.show("Couldn't move that"); return; }
    await load(active);
    toast.show(collectionId ? "Moved to collection" : "Removed from collection");
  }

  async function unsave() {
    if (!tileTarget) return;
    const t = tileTarget; setTileTarget(null);
    const r = await savedApi.remove(t.saveId);
    if (!r.ok) { toast.show("Couldn't remove that"); return; }
    await load(active);
    toast.show("Removed from Saved");
  }

  async function doRename() {
    if (!renaming) return;
    const clean = renameText.trim();
    if (!clean) { setRenaming(null); return; }
    const c = renaming; setRenaming(null);
    const r = await savedApi.renameCollection(c.id as string, clean);
    if (!r.ok) { toast.show(r.error.reason === "duplicate" ? "That name is taken" : "Couldn't rename"); return; }
    await load(active);
    toast.show("Renamed");
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const c = deleteTarget; setDeleteTarget(null);
    const r = await savedApi.deleteCollection(c.id as string);
    if (!r.ok) { toast.show("Couldn't delete that"); return; }
    if (active === c.id) setActive(null); else await load(active);
    toast.show("Collection deleted");
  }

  const isEmpty = view.tiles.length === 0 && active === null;

  return (
    <AppShell header={header}>
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
          <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
        </div>
      )}

      {/* Collection chips */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {view.collections.map((c) => (
          <Chip
            key={c.id ?? "all"}
            collection={c}
            active={(c.id ?? null) === active}
            onSelect={() => { setActive(c.id ?? null); setChangedOnly(false); }}
            onManage={c.id ? () => setManageTarget(c) : undefined}
          />
        ))}
        <button onClick={() => setNewOpen(true)} className="flex h-8 shrink-0 items-center gap-1 rounded-full border-[1.5px] border-dashed border-border px-3 text-13 font-medium text-ink-secondary">
          <Icon name="plus" size={15} strokeWidth={2} /> New
        </button>
      </div>

      {/* Changed alert (only when something actually changed) */}
      {view.changedCount > 0 && active === null && (
        <button
          onClick={() => setChangedOnly((v) => !v)}
          className="mx-4 mb-2 flex w-[calc(100%-32px)] items-center gap-2 rounded-8 bg-accent-soft px-3 py-2.5 text-left"
        >
          <Icon name="bell" size={18} className="text-accent" />
          <span className="flex-1 text-13 text-ink-primary">
            {changedOnly ? `Showing ${view.changedCount} changed ${view.changedCount === 1 ? "property" : "properties"}` : `${view.changedCount} saved ${view.changedCount === 1 ? "property" : "properties"} changed`}
          </span>
          <span className="text-13 font-semibold text-accent">{changedOnly ? "Show all" : "View"}</span>
        </button>
      )}

      {isEmpty ? (
        <Empty title="Nothing saved yet" body="Tap the bookmark on any property to save it here." cta="Explore properties" onCta={() => router.push(`${base}/`)} />
      ) : tiles.length === 0 ? (
        <Empty title={changedOnly ? "Nothing changed" : "This collection is empty"} body={changedOnly ? "None of your saved properties have changed." : "Long-press a saved property to move it in here."} />
      ) : (
        <div className="grid grid-cols-3 gap-[2px]">
          {tiles.map((t) => (
            <SavedTileView key={t.saveId} tile={t} onOpen={() => router.push(`${base}/property/${t.listingId}`)} onLong={() => setTileTarget(t)} />
          ))}
        </div>
      )}
      <div className="h-6" />

      {/* New collection sheet */}
      <BottomSheet open={newOpen} onClose={() => { setNewOpen(false); setName(""); }} title="New collection">
        <div className="flex flex-col pb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="e.g. For parents"
            className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary focus:border-accent"
          />
          <Button className="mt-3" fullWidth disabled={!name.trim() || busy} loading={busy} onClick={() => void createCollection()}>Create</Button>
        </div>
      </BottomSheet>

      {/* Tile actions */}
      <BottomSheet open={Boolean(tileTarget)} onClose={() => setTileTarget(null)} title="Saved property">
        <div className="flex flex-col pb-2">
          <div className="px-1 pb-1 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Move to</div>
          <button onClick={() => void moveTo(null)} className="flex h-12 items-center gap-3 text-left text-15 text-ink-primary active:bg-surface-2">
            <Icon name="close" size={20} strokeWidth={1.8} /> None
          </button>
          {view.collections.filter((c) => c.id).map((c) => (
            <button key={c.id} onClick={() => void moveTo(c.id)} className="flex h-12 items-center gap-3 text-left text-15 text-ink-primary active:bg-surface-2">
              <Icon name="bookmark" size={20} strokeWidth={1.7} />
              <span className="flex-1">{c.name}</span>
              {tileTarget?.collectionId === c.id && <Icon name="check" size={20} className="text-accent" strokeWidth={2} />}
            </button>
          ))}
          <span className="my-1 h-px bg-divider" />
          <button onClick={() => void unsave()} className="flex h-12 items-center gap-3 text-left text-15 text-error active:bg-surface-2">
            <Icon name="trash" size={20} strokeWidth={1.7} /> Remove from Saved
          </button>
        </div>
      </BottomSheet>

      {/* Collection manage (long-press a chip) */}
      <BottomSheet open={Boolean(manageTarget)} onClose={() => setManageTarget(null)} title={manageTarget?.name ?? ""}>
        <div className="flex flex-col pb-2">
          <button onClick={() => { const c = manageTarget; setManageTarget(null); setRenaming(c); setRenameText(c?.name ?? ""); }} className="flex h-12 items-center gap-3 text-left text-15 text-ink-primary active:bg-surface-2">
            <Icon name="edit" size={20} strokeWidth={1.7} /> Rename
          </button>
          <button onClick={() => { const c = manageTarget; setManageTarget(null); setDeleteTarget(c); }} className="flex h-12 items-center gap-3 text-left text-15 text-error active:bg-surface-2">
            <Icon name="trash" size={20} strokeWidth={1.7} /> Delete collection
          </button>
        </div>
      </BottomSheet>

      {/* Rename sheet */}
      <BottomSheet open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename collection">
        <div className="flex flex-col pb-2">
          <input
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            maxLength={40}
            className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent"
          />
          <Button className="mt-3" fullWidth disabled={!renameText.trim()} onClick={() => void doRename()}>Save</Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void doDelete()}
        title="Delete this collection?"
        body={`"${deleteTarget?.name ?? ""}" is removed. The properties inside it stay saved under All.`}
        confirmLabel="Delete"
        destructive
      />
    </AppShell>
  );
}

function Chip({ collection, active, onSelect, onManage }: { collection: SavedCollection; active: boolean; onSelect: () => void; onManage?: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  const start = () => {
    if (!onManage) return;
    fired.current = false;
    clear();
    timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onManage(); }, 500);
  };
  return (
    <button
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => { if (onManage) { e.preventDefault(); onManage(); } }}
      onClick={() => { if (fired.current) { fired.current = false; return; } onSelect(); }}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-13 font-medium",
        active ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
      )}
    >
      {collection.name}
      <span className={cn("text-11", active ? "text-page/70" : "text-ink-tertiary")}>{collection.count}</span>
    </button>
  );
}

function SavedTileView({ tile, onOpen, onLong }: { tile: SavedTile; onOpen: () => void; onLong: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  const start = () => { fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong(); }, 500); };
  const ribbon = tile.availability === "sold" ? "SOLD" : tile.availability === "rented" ? "RENTED" : null;
  return (
    <button
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => { e.preventDefault(); onLong(); }}
      onClick={() => { if (fired.current) { fired.current = false; return; } onOpen(); }}
      className="relative aspect-square overflow-hidden bg-surface-3 active:opacity-80"
    >
      {tile.coverUrl ? (
        <Img src={tile.coverUrl} alt="" data-protected="true" className={cn("h-full w-full object-cover", ribbon && "opacity-70")} />
      ) : (
        <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="home" size={30} /></span>
      )}
      <span className="chrome absolute bottom-1.5 left-1.5 rounded-4 bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{tile.price}</span>
      {tile.dropLabel && (
        <span className="chrome absolute right-1.5 top-1.5 rounded-4 bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{tile.dropLabel}</span>
      )}
      {ribbon && (
        <span className={cn("chrome pointer-events-none absolute -right-[26px] top-2.5 rotate-45 px-[30px] py-[3px] text-11 font-semibold tracking-[0.5px] text-white", ribbon === "RENTED" ? "bg-warning" : "bg-ink-primary")}>{ribbon}</span>
      )}
    </button>
  );
}

function Empty({ title, body, cta, onCta }: { title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Icon name="bookmark" size={64} className="text-ink-disabled" strokeWidth={1.3} />
      <h3 className="text-17 font-semibold text-ink-primary">{title}</h3>
      <p className="max-w-xs text-13 text-ink-secondary">{body}</p>
      {cta && onCta && <Button className="mt-2" onClick={onCta}>{cta}</Button>}
    </div>
  );
}
