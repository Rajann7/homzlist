"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, Toggle, BottomSheet, ConfirmDialog, Skeleton, useToast } from "@/components";
import { PhotoViewer } from "./PhotoViewer";
import { chatApi } from "@/lib/chat/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

const REPORT_REASONS = ["Spam", "Abusive language", "Fraud attempt", "Asking for payment off-platform", "Fake identity"];

/** P7 S4 — Chat Details: participant, shared media, block/report/delete rows. */
export function Details({ threadId, base = "/messages" }: { threadId: string; base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [blockDialog, setBlockDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportNote, setReportNote] = useState("");

  const load = useCallback(async () => {
    const res = await chatApi.details(threadId);
    if (res.ok) setD(res.data);
  }, [threadId]);
  useEffect(() => { void load(); }, [load]);

  if (!d) return <AppShell showNav={false} header={<Header left={<Back onClick={() => router.back()} />} title="Chat details" />}><div className="space-y-3 p-4"><Skeleton className="h-40 w-full rounded-12" /><Skeleton className="h-24 w-full rounded-12" /></div></AppShell>;
  const p = d.person;

  return (
    <AppShell showNav={false} header={<Header left={<Back onClick={() => router.push(`${base}/${threadId}`)} />} title="Chat details" />}>
      <div className="space-y-4 p-4 pb-10">
        {/* participant */}
        <div className="rounded-12 border border-border bg-surface-1 p-4 text-center">
          <div className="flex justify-center"><Avatar src={p.photo} name={p.name} size={64} /></div>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <span className="text-17 font-semibold text-ink-primary">{p.name}</span>
            {p.verified && <VerifiedBadge level="id" />}
            {p.roleTag && <span className="rounded-full bg-surface-2 px-1.5 text-11 text-ink-secondary">{p.roleTag}</span>}
          </div>
          {p.responseLabel && <p className="mt-0.5 text-11 text-accent">{p.responseLabel}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push(`/profile/${p.id}`)} className="h-10 flex-1 rounded-8 border border-border text-13 font-semibold text-ink-primary">View profile</button>
            {d.numberAllowed && d.otherNumber && <a href={`tel:${d.otherNumber}`} className="grid h-10 flex-1 place-items-center rounded-8 border border-border text-13 font-semibold text-ink-primary">Call</a>}
          </div>
        </div>

        {/* pinned property / project / requirement card (Doc4 §39). The subject's
            own href comes sealed from the server (getThread) — the three kinds go
            to /property, /projects and /requirements respectively, so we never
            rebuild it here (a project used to be sent to /requirements → 404). */}
        {d.pinnedCard && (
          <button
            onClick={() => d.pinnedCard.href && router.push(d.pinnedCard.href)}
            disabled={!d.pinnedCard.href}
            className="flex w-full items-center gap-3 rounded-12 border border-border bg-surface-1 p-3 text-left disabled:active:bg-transparent"
          >
            {d.pinnedCard.cover ? <Img src={d.pinnedCard.cover} alt="" className="h-14 w-14 rounded-8 object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-8 bg-surface-2"><Icon name={d.pinnedCard.type === "project" ? "building" : d.pinnedCard.type === "requirement" ? "search-list" : "home"} size={20} className="text-ink-tertiary" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-15 font-semibold text-ink-primary">{d.pinnedCard.title}</span>
              {d.pinnedCard.priceLabel && <span className="block text-13 text-ink-tertiary">{d.pinnedCard.priceLabel}</span>}
            </span>
            <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
          </button>
        )}

        {/* shared photos */}
        <div>
          <p className="mb-2 text-13 font-semibold uppercase text-ink-tertiary">Shared photos ({d.sharedPhotos.length})</p>
          {d.sharedPhotos.length === 0 ? (
            <p className="text-13 text-ink-tertiary">No photos shared yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">{d.sharedPhotos.slice(0, 6).map((ph: any) => <Img key={ph.id} src={ph.url} alt="" onClick={() => setViewPhoto(ph.url)} className="aspect-square w-full cursor-pointer rounded-4 object-cover" />)}</div>
          )}
        </div>

        {/* shared listings (Doc4 §39) */}
        {d.sharedListings?.length > 0 && (
          <div>
            <p className="mb-2 text-13 font-semibold uppercase text-ink-tertiary">Shared listings ({d.sharedListings.length})</p>
            <div className="space-y-2">
              {d.sharedListings.map((l: any) => (
                <button key={l.id} onClick={() => router.push(`/property/${l.id}`)} className="flex w-full items-center gap-3 rounded-8 bg-surface-2 px-3 py-2 text-left">
                  {l.cover ? <Img src={l.cover} alt="" className="h-10 w-10 rounded-4 object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-4 bg-surface-3"><Icon name="home" size={18} className="text-ink-tertiary" /></span>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-13 font-semibold text-ink-primary">{l.title}</span><span className="block text-11 text-ink-tertiary">{l.priceLabel}</span></span>
                  <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* settings rows */}
        <div className="overflow-hidden rounded-12 border border-border">
          <Row label="Mute notifications" trailing={<Toggle checked={d.myState.muted} onChange={async (v) => { await chatApi.setState(threadId, { muted: v }); load(); }} />} />
          <Row label="Pin chat" trailing={<Toggle checked={d.pinned} onChange={async (v) => { await chatApi.setState(threadId, { pinned: v }); load(); }} />} />
          <Row label="Archive chat" chevron onClick={async () => { await chatApi.setState(threadId, { archived: true }); toast.show("Chat archived"); router.push(base); }} />
          <Row label="Search in chat" chevron onClick={() => router.push(`${base}/${threadId}?search=1`)} />
          <Row label={d.block?.iBlocked ? "Unblock user" : "Block user"} danger onClick={() => setBlockDialog(true)} />
          <Row label="Report" danger onClick={() => setReportOpen(true)} />
          <Row label="Delete chat" danger onClick={() => setDeleteDialog(true)} last />
        </div>
      </div>

      <ConfirmDialog open={blockDialog} onClose={() => setBlockDialog(false)}
        onConfirm={async () => { setBlockDialog(false); await chatApi.block(threadId, d.block.iBlocked ? "unblock" : "block"); toast.show(d.block.iBlocked ? "Unblocked" : `Blocked ${p.name}`); load(); }}
        title={d.block.iBlocked ? `Unblock ${p.name}?` : `Block ${p.name}?`} body={d.block.iBlocked ? undefined : "They won't be able to message you. Existing messages stay visible."} destructive={!d.block.iBlocked} confirmLabel={d.block.iBlocked ? "Unblock" : "Block"} />

      <ConfirmDialog open={deleteDialog} onClose={() => setDeleteDialog(false)}
        onConfirm={async () => { setDeleteDialog(false); await chatApi.deleteThread(threadId); toast.show("Chat deleted"); router.push(base); }}
        title="Delete this chat?" consequence="This can't be undone." destructive confirmLabel="Delete" />

      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report">
        <div className="p-4">
          {REPORT_REASONS.map((r) => (
            <button key={r} onClick={() => setReportReason(r)} className="flex w-full items-center gap-3 border-b border-divider py-2.5 text-left text-15 text-ink-primary">
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", reportReason === r ? "border-accent" : "border-border")}>{reportReason === r && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}</span>{r}
            </button>
          ))}
          <textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="mt-3 w-full rounded-8 bg-surface-2 p-3 text-15 text-ink-primary outline-none" />
          <button onClick={async () => { setReportOpen(false); await chatApi.reportUser(threadId, reportReason, reportNote); toast.show("Report submitted", { variant: "success" }); }} className="mt-3 h-11 w-full rounded-8 bg-error text-15 font-semibold text-ink-inverse">Submit Report</button>
        </div>
      </BottomSheet>

      <PhotoViewer url={viewPhoto} onClose={() => setViewPhoto(null)} />
    </AppShell>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return <button aria-label="Back" onClick={onClick} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>;
}
function Row({ label, trailing, chevron, danger, onClick, last }: { label: string; trailing?: React.ReactNode; chevron?: boolean; danger?: boolean; onClick?: () => void; last?: boolean }) {
  const cls = cn("flex h-14 w-full items-center px-4 text-left", !last && "border-b border-divider");
  const inner = (
    <>
      <span className={cn("flex-1 text-15", danger ? "text-error" : "text-ink-primary")}>{label}</span>
      {trailing}
      {chevron && <Icon name="chevron-right" size={18} className="text-ink-tertiary" />}
    </>
  );
  // A row with an interactive `trailing` (Toggle = a button) must NOT be a button
  // itself — nested buttons are invalid HTML and break hydration. Toggle rows are
  // a plain div (the Toggle owns the tap); action rows stay real buttons.
  if (trailing) return <div className={cls}>{inner}</div>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
