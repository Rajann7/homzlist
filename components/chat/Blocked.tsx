"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi } from "@/lib/chat/client";

/**
 * P7 S1 ⋯ → Blocked users. Everyone the caller has blocked (chat_blocks), with
 * a direct Unblock. Server-driven; blocking is directional so this lists only
 * the people I blocked, not people who blocked me.
 */
export function Blocked({ base = "/messages" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<any[] | null>(null);

  const load = async () => { const res = await chatApi.blocked(); if (res.ok) setUsers(res.data.users); };
  useEffect(() => { load(); }, []);

  async function unblock(u: any) {
    setUsers((us) => (us ?? []).filter((x) => x.id !== u.id));
    await chatApi.unblockUser(u.id);
    toast.show(`Unblocked ${u.name}`, { variant: "success" });
  }

  return (
    <AppShell showNav={false}
      header={<Header left={<button aria-label="Back" onClick={() => router.push(base)} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>}
        title={<span>Blocked users</span>} />}>
      {users === null ? (
        <div className="pt-2">{Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-divider px-4 py-3"><div className="h-11 w-11 shrink-0 rounded-full bg-surface-2" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-surface-2" /></div></div>
        ))}</div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-24 text-center">
          <span className="mb-4 text-ink-tertiary"><Icon name="shield" size={64} /></span>
          <h2 className="text-17 font-semibold text-ink-primary">No blocked users</h2>
          <p className="mt-1 text-13 text-ink-secondary">People you block will appear here</p>
        </div>
      ) : (
        <div className="pb-nav-safe">
          <p className="px-4 py-2 text-11 text-ink-tertiary">Blocked people can&apos;t message you. Existing messages stay visible.</p>
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <button onClick={() => router.push(`/profile/${u.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar src={u.photo} name={u.name} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-15 font-semibold text-ink-primary">{u.name}</span>
                    {u.verified && <VerifiedBadge level="id" />}
                    <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary">{u.roleTag}</span>
                  </span>
                  <span className="text-11 text-ink-tertiary">Blocked {u.blockedAt}</span>
                </span>
              </button>
              <button onClick={() => unblock(u)} className="h-9 shrink-0 rounded-8 border border-border px-4 text-13 font-semibold text-ink-primary active:bg-surface-2">Unblock</button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
