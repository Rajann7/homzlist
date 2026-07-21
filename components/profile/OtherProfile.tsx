"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ProfileBadges } from "./ProfileBadges";
import { profileApi } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

/**
 * S2 Other User Profile (P9). PUBLIC only — no Views/Leads (server-stripped).
 * Message/Call/WhatsApp variants, About popup, live-only grid (empty here until
 * listings). Suspended → "unavailable"; deleted → "Deleted user". Report + block.
 */
const TABS: Record<string, string[]> = {
  owner: ["Sell", "Rent"],
  broker: ["Sell", "Rent"],
  builder: ["Projects", "Sell / Rent"],
};
const REPORT_REASONS = ["Fake profile", "Spam", "Abusive behaviour", "Fraud attempt", "Impersonation"];

export function OtherProfile({ username }: { username: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [blockDlg, setBlockDlg] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    profileApi.publicProfile(username).then((r) => {
      if (r.ok) setP(r.data.profile);
      else setNotFound(true);
      setLoading(false);
    });
  }, [username]);

  const header = (right?: React.ReactNode) => (
    <header className="chrome sticky top-0 z-header flex h-header items-center gap-2 border-b border-border bg-surface-1 px-4">
      <button aria-label="Back" onClick={() => router.back()} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
        <Icon name="arrow-left" size={24} strokeWidth={1.7} />
      </button>
      <h1 className="flex-1 truncate text-17 font-semibold text-ink-primary">{p?.username ?? username}</h1>
      {right}
    </header>
  );

  if (loading)
    return (
      <div className="mx-auto w-full max-w-column bg-page">
        {header()}
        <div className="p-4">
          <Skeleton className="h-[84px] w-[84px] rounded-full" />
          <Skeleton className="mt-4 h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
      </div>
    );

  if (notFound || !p)
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
        {header()}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-17 font-semibold text-ink-primary">Profile not found</p>
        </div>
      </div>
    );

  // Deleted / suspended states
  if (p.deleted)
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
        {header()}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Avatar size={84} />
          <p className="text-17 font-semibold text-ink-tertiary">Deleted user</p>
          <p className="text-13 text-ink-secondary">This account no longer exists</p>
        </div>
      </div>
    );
  if (p.suspended)
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
        {header()}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Icon name="alert" size={48} className="text-ink-tertiary" strokeWidth={1.5} />
          <p className="text-17 font-semibold text-ink-primary">This account is unavailable</p>
          <p className="text-13 text-ink-secondary">This profile is temporarily unavailable.</p>
        </div>
      </div>
    );

  const roleLabel = p.role ? p.role[0].toUpperCase() + p.role.slice(1) : "";
  const tabs = TABS[p.role ?? "owner"];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      {header(
        <button aria-label="More" onClick={() => setMenu(true)} className="grid h-11 w-11 place-items-center text-ink-primary">
          <Icon name="more" size={24} strokeWidth={1.7} />
        </button>,
      )}

      <div className="px-4 pt-4">
        <div className="flex items-center gap-4">
          <Avatar name={p.name ?? undefined} src={p.photoUrl ?? undefined} size={84} />
          <div className="flex flex-1 justify-around">
            <Stat n={p.stats.listings} label="Listings" />
            {p.role === "builder" && <Stat n={p.stats.projects ?? 0} label="Projects" />}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-15 font-semibold text-ink-primary">{p.name}</span>
          <ProfileBadges badges={p.badges} />
          {roleLabel && <span className="chrome rounded-full bg-surface-2 px-2 py-0.5 text-11 text-ink-secondary">{roleLabel}</span>}
        </div>
        {p.bio && <p className="mt-1 text-13 leading-[1.45] text-ink-secondary">{p.bio}</p>}
        <p className="mt-1 text-11 text-ink-tertiary">
          Member since {p.memberSince}
          {p.responseLabel ? ` · ${p.responseLabel}` : ""}
        </p>
        <button onClick={() => setAbout(true)} className="mt-1 flex items-center gap-1 text-11 text-ink-tertiary">
          <Icon name="alert" size={14} strokeWidth={1.7} /> About this account
        </button>

        {/* Message full-width (private number default — Call/WhatsApp gate on public number, Module 7) */}
        <div className="mt-4">
          <Button fullWidth onClick={() => show("Messaging comes in the chat module")}>
            Message
          </Button>
        </div>
      </div>

      {/* Tabs + grid (live-only, empty until listings) */}
      <div className="chrome mt-4 flex border-b border-border">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={cn("relative flex-1 py-3 text-15 font-semibold", i === tab ? "text-ink-primary" : "text-ink-tertiary")}>
            {t}
            {i === tab && <span className="absolute inset-x-0 bottom-0 h-[1.5px] w-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <p className="text-13 text-ink-tertiary">No listings to show yet.</p>
      </div>

      {/* ⋯ menu */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} hideHeader>
        <div className="flex flex-col pt-1">
          <MenuRow icon="share" label="Share profile" onClick={() => { navigator.clipboard?.writeText(`homzlist.com/${p.username}`).catch(() => {}); show("Link copied"); setMenu(false); }} />
          <MenuRow icon="copy" label="Copy link" onClick={() => { navigator.clipboard?.writeText(`homzlist.com/${p.username}`).catch(() => {}); show("Link copied"); setMenu(false); }} />
          <MenuRow icon="alert" label="Report profile" destructive onClick={() => { setMenu(false); setReportSheet(true); }} />
          <MenuRow icon="close" label="Block user" destructive onClick={() => { setMenu(false); setBlockDlg(true); }} />
        </div>
      </BottomSheet>

      {/* Report sheet */}
      <BottomSheet open={reportSheet} onClose={() => setReportSheet(false)} title="Report profile">
        <div className="flex flex-col">
          {REPORT_REASONS.map((r) => (
            <button key={r} onClick={() => setReportReason(r)} className="flex h-12 items-center justify-between text-left text-15 text-ink-primary">
              {r}
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", reportReason === r ? "border-accent" : "border-border")}>
                {reportReason === r && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </span>
            </button>
          ))}
          <Button variant="destructive" className="mt-3" fullWidth disabled={!reportReason} onClick={() => { setReportSheet(false); setReportReason(null); show("Report submitted — we'll review it"); }}>
            Submit Report
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog open={blockDlg} onClose={() => setBlockDlg(false)} onConfirm={() => { setBlockDlg(false); show(`${p.name} blocked`); }} title={`Block ${p.name}?`} body="They won't be able to message you. Existing chats stay visible but you can't message each other." confirmLabel="Block" destructive />

      <ConfirmDialog open={about} onClose={() => setAbout(false)} onConfirm={() => setAbout(false)} title="About this account" body={`Joined ${p.memberSince} · ${p.stats.listings} listings posted${p.cityName ? ` · Based in ${p.cityName}` : ""}`} confirmLabel="Got it" hideCancel />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center px-1">
      <span className="text-17 font-bold text-ink-primary">{n.toLocaleString("en-IN")}</span>
      <span className="text-11 text-ink-tertiary">{label}</span>
    </div>
  );
}

function MenuRow({ icon, label, destructive, onClick }: { icon: any; label: string; destructive?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex h-12 items-center gap-3 text-left text-15", destructive ? "text-error" : "text-ink-primary")}>
      <Icon name={icon} size={22} strokeWidth={1.7} />
      {label}
    </button>
  );
}
