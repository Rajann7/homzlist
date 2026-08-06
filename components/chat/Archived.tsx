"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, Skeleton, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi } from "@/lib/chat/client";
import { cn } from "@/lib/utils";

/**
 * P7 S1 ⋯ → Archived chats. Every archived thread across all tabs; tap opens it
 * (which auto-unarchives on the next message), or Unarchive it in place. All
 * server-driven — no local state of truth.
 */
export function Archived({ base = "/messages" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);

  const load = async () => { const res = await chatApi.archived(); if (res.ok) setRows(res.data.rows); };
  useEffect(() => { load(); }, []);

  async function unarchive(r: any) {
    setRows((rs) => (rs ?? []).filter((x) => x.threadId !== r.threadId));
    const res = await chatApi.setState(r.threadId, { archived: false });
    if (res.ok) toast.show("Chat unarchived");
    // Put the row back (re-fetch the true list) if the server didn't take it,
    // rather than leaving the chat gone from Archived but still archived.
    else { toast.show("Couldn't unarchive — try again", { variant: "error" }); load(); }
  }

  return (
    <AppShell showNav={false}
      header={<Header left={<button aria-label="Back" onClick={() => router.push(base)} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>}
        title={<span>Archived</span>} />}>
      {rows === null ? (
        <div className="pt-2">{Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-divider px-4 py-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          </div>
        ))}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-24 text-center">
          <span className="mb-4 text-ink-tertiary"><Glyph name="archive" s={72} /></span>
          <h2 className="text-17 font-semibold text-ink-primary">No archived chats</h2>
          <p className="mt-1 text-13 text-ink-secondary">Chats you archive will appear here</p>
        </div>
      ) : (
        <div className="pb-nav-safe">
          <p className="px-4 py-2 text-11 text-ink-tertiary">Chats are archived automatically after 30 days of inactivity. A new message un-archives them.</p>
          {rows.map((r) => (
            <div key={r.threadId} className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <button onClick={() => router.push(`${base}/${r.threadId}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar src={r.person.photo} name={r.person.name} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-15 font-semibold text-ink-primary">{r.person.name}</span>
                    {r.person.verified && <VerifiedBadge level="id" />}
                    <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary">{r.person.roleTag}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {r.previewKind === "photo" && <Icon name="image" size={14} className="shrink-0 text-ink-tertiary" />}
                    <span className={cn("truncate text-13", r.pending ? "text-warning" : "text-ink-tertiary")}>{r.pending ? "Waiting to accept" : r.declined ? "Inquiry declined" : r.preview}</span>
                  </span>
                </span>
                <span className="shrink-0 text-11 text-ink-tertiary">{r.timeLabel}</span>
              </button>
              <button onClick={() => unarchive(r)} aria-label="Unarchive" className="grid h-11 w-11 shrink-0 place-items-center rounded-8 bg-surface-2 text-ink-secondary"><Glyph name="archive" s={18} /></button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
