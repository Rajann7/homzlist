"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BottomNav } from "@/components/nav/BottomNav";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProfileBadges } from "./ProfileBadges";
import { AccountSwitchSheet, ProfileMenuSheet, QRSheet } from "./ProfileSheets";
import { AccountStatus } from "./AccountStatus";
import { profileApi, type OwnProfile as OwnProfileT } from "@/lib/profile/client";
import { authApi } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * S1 Own Profile (P9, pixel-exact). Header (username + switch + create + ⋯),
 * collapsing profile header (avatar 84, stats ×3, name+badges+role, bio, meta,
 * Edit/Share/QR), featured circles, pinned strip, role-based tabs + grid/list,
 * grid (empty until listings — Module 4), account-switch / menu / QR sheets,
 * view-as-visitor mode, account-status sub-screen. Backend-driven (/profile/me).
 */

const TABS: Record<string, string[]> = {
  owner: ["Sell", "Rent", "Requirements"],
  broker: ["Sell", "Rent", "Requirements"],
  builder: ["Projects", "Sell / Rent", "Requirements"],
};

export function OwnProfile() {
  const router = useRouter();
  const { show } = useToast();
  const [p, setP] = useState<OwnProfileT | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [switchSheet, setSwitchSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);
  const [qrSheet, setQrSheet] = useState(false);
  const [viewsInfo, setViewsInfo] = useState(false);
  const [viewAs, setViewAs] = useState(false);
  const [subScreen, setSubScreen] = useState<null | "account-status">(null);

  useEffect(() => {
    profileApi.me().then((r) => {
      if (r.ok) setP(r.data.profile);
      setLoading(false);
    });
  }, []);

  if (subScreen === "account-status") return <AccountStatus onBack={() => setSubScreen(null)} />;

  if (loading) return <ProfileSkeleton />;
  if (!p) return null;

  const tabs = TABS[p.role ?? "owner"];
  const roleLabel = p.role ? p.role[0].toUpperCase() + p.role.slice(1) : "";

  async function logout() {
    await authApi.logout();
    window.location.href = "/login";
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-column flex-col overflow-hidden bg-page">
      {/* View-as-visitor strip (pinned above the scroll area) */}
      {viewAs && (
        <div className="chrome flex shrink-0 items-center justify-between bg-surface-3 px-4 py-2 text-11 text-ink-secondary">
          Viewing as visitor
          <button onClick={() => setViewAs(false)} className="font-semibold text-accent">
            Exit
          </button>
        </div>
      )}

      {/* Scroll area — header + tabs stick inside it; the bottom nav (in-flow
          below) never scrolls, so it stays pinned on every device. */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
      {/* Header */}
      <header className="chrome sticky top-0 z-header flex h-header items-center justify-between border-b border-border bg-surface-1 px-4">
        <button onClick={() => !viewAs && setSwitchSheet(true)} className="flex items-center gap-1">
          <span className="text-17 font-semibold text-ink-primary">{p.username}</span>
          {!viewAs && <Icon name="chevron-down" size={18} className="text-ink-primary" strokeWidth={1.7} />}
        </button>
        {!viewAs && (
          <div className="flex items-center">
            <button aria-label="Create" onClick={() => show("Create — coming in the listings module")} className="grid h-11 w-11 place-items-center text-ink-primary">
              <Icon name="plus" size={24} strokeWidth={1.9} />
            </button>
            <button aria-label="Menu" onClick={() => setMenuSheet(true)} className="grid h-11 w-11 place-items-center text-ink-primary">
              <Icon name="more" size={24} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </header>

      {/* Profile header block */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-4">
          <Avatar name={p.name ?? undefined} src={p.photoUrl ?? undefined} size={84} />
          {/* Stats ×3 */}
          <div className="flex flex-1 justify-around">
            <Stat n={p.stats.listings} label="Listings" onClick={() => show("My listings — coming in the listings module")} />
            {p.role === "builder" && <Stat n={p.stats.projects ?? 0} label="Projects" onClick={() => {}} />}
            {!viewAs && <Stat n={p.stats.views} label="Views" onClick={() => setViewsInfo(true)} />}
            {!viewAs && <Stat n={p.stats.leads} label="Leads" onClick={() => show("Leads — coming in the chat module")} />}
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

        {/* Button row */}
        {!viewAs && (
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={() => router.push("/profile/edit")}>
              Edit profile
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard?.writeText(`homzlist.com/${p.username}`).catch(() => {});
                show("Link copied");
              }}
            >
              Share profile
            </Button>
            <Button variant="outline" size="default" aria-label="QR code" className="w-11 px-0" onClick={() => setQrSheet(true)}>
              <Icon name="image" size={20} strokeWidth={1.7} />
            </Button>
          </div>
        )}
      </div>

      {/* Featured circles (empty until listings — only "+ New") */}
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4">
        <button onClick={() => show("Featured collections need listings — coming in the listings module")} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-border text-ink-tertiary">
            <Icon name="plus" size={22} strokeWidth={1.7} />
          </span>
          <span className="chrome text-11 text-ink-tertiary">New</span>
        </button>
      </div>

      {/* Pinned (empty) */}
      <div className="mt-5 px-4">
        <p className="chrome text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Pinned</p>
        <p className="mt-2 text-11 text-ink-tertiary">Pin up to 3 listings to the top of your profile.</p>
      </div>

      {/* Tabs + grid/list toggle */}
      <div className="chrome sticky top-header z-sticky mt-4 flex items-center border-b border-border bg-surface-1">
        <div className="flex flex-1">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "relative flex-1 py-3 text-15 font-semibold transition-colors",
                i === tab ? "text-ink-primary" : "text-ink-tertiary",
              )}
            >
              {t}
              {i === tab && <span className="absolute inset-x-0 bottom-0 mx-auto h-[1.5px] w-full bg-accent" />}
            </button>
          ))}
        </div>
        <div className="flex items-center px-2">
          <button aria-label="Grid" onClick={() => setView("grid")} className={cn("grid h-9 w-9 place-items-center", view === "grid" ? "text-ink-primary" : "text-ink-tertiary")}>
            <Icon name="image" size={20} strokeWidth={1.7} />
          </button>
          <button aria-label="List" onClick={() => setView("list")} className={cn("grid h-9 w-9 place-items-center", view === "list" ? "text-ink-primary" : "text-ink-tertiary")}>
            <Icon name="more" size={20} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {/* Grid content — empty until listings (Module 4) */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <HousePlusArt />
        <h3 className="text-17 font-semibold text-ink-primary">No listings yet</h3>
        <p className="max-w-xs text-13 text-ink-secondary">
          {tabs[tab] === "Requirements"
            ? "Post what you're looking for and matching properties will find you."
            : "Post your first property — it stays live forever with the ₹999 plan."}
        </p>
        {!viewAs && (
          <Button className="mt-2" onClick={() => show("Create — coming in the listings module")}>
            {tabs[tab] === "Requirements" ? "Post Requirement" : "Create Listing"}
          </Button>
        )}
      </div>
      </div>
      {/* end scroll area */}

      <BottomNav />

      {/* Sheets & dialogs */}
      <AccountSwitchSheet
        open={switchSheet}
        onClose={() => setSwitchSheet(false)}
        current={{ username: p.username ?? "", roleCity: `${roleLabel} · ${p.cityName ?? ""}`, name: p.name ?? "", photoUrl: p.photoUrl }}
        onAddAccount={() => show("Add account — sign in with another number")}
        onLogout={logout}
      />
      <ProfileMenuSheet
        open={menuSheet}
        onClose={() => setMenuSheet(false)}
        onAccountStatus={() => {
          setMenuSheet(false);
          setSubScreen("account-status");
        }}
        onViewAsVisitor={() => {
          setMenuSheet(false);
          setViewAs(true);
        }}
        onQr={() => {
          setMenuSheet(false);
          setQrSheet(true);
        }}
        onPlaceholder={(what) => show(`${what} — coming in a later module`)}
      />
      <QRSheet open={qrSheet} onClose={() => setQrSheet(false)} name={p.name ?? ""} roleCity={`${roleLabel} · ${p.cityName ?? ""}`} username={p.username ?? ""} onShare={() => show("Link copied")} />
      <ConfirmDialog
        open={viewsInfo}
        onClose={() => setViewsInfo(false)}
        onConfirm={() => setViewsInfo(false)}
        title="What counts as a view?"
        body="Views = unique property detail opens per day. Your own views aren't counted."
        confirmLabel="Got it"
        hideCancel
      />
    </div>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center px-1">
      <span className="text-17 font-bold text-ink-primary">{n.toLocaleString("en-IN")}</span>
      <span className="text-11 text-ink-tertiary">{label}</span>
    </button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-column bg-page px-4 pt-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-[84px] w-[84px] rounded-full" />
        <div className="flex flex-1 justify-around">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 flex-1" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-[2px]">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}

function HousePlusArt() {
  const S = "var(--ink-tertiary)";
  const A = "var(--accent)";
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path d="M20 48 44 28l24 20v26a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2z" stroke={S} strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 76V60h12v16" stroke={S} strokeWidth="3" />
      <circle cx="70" cy="30" r="12" fill="var(--bg-page)" stroke={A} strokeWidth="3" />
      <path d="M70 25v10M65 30h10" stroke={A} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
