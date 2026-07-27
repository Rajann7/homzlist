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
import { AccountSwitchSheet, CreateFeaturedSheet, FeaturedCollectionSheet, ProfileMenuSheet, QRSheet } from "./ProfileSheets";
import { AccountStatus } from "./AccountStatus";
import { profileApi, type FeaturedCollection, type FeaturedItem, type OwnProfile as OwnProfileT } from "@/lib/profile/client";
import { authApi, type DeviceAccount } from "@/lib/auth/client";
import { listingsApi, type MyListing, type RequirementCard } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * S1 Own Profile (P9, pixel-exact). Header (username + switch + create + ⋯),
 * collapsing profile header (avatar 84, stats ×3, name+badges+role, bio, meta,
 * Edit/Share/QR), featured collections, role-based tabs + grid/list,
 * grid (empty until listings — Module 4), account-switch / menu / QR sheets,
 * view-as-visitor mode, account-status sub-screen. Backend-driven (/profile/me).
 */

/** Carries the design's post-switch toast across the reload. UI-only. */
const SWITCH_TOAST_KEY = "hz-switched-to";

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
  const [viewAs, setViewAs] = useState(false);
  const [subScreen, setSubScreen] = useState<null | "account-status">(null);
  // Multi-account (P9 S1). The list, and which one is active, is the server's
  // answer — nothing about the other accounts is kept in the browser.
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DeviceAccount | null>(null);
  // The grid is real data now (Module 4): the owner's listings and requirements,
  // filtered per tab. Nothing here is a placeholder count.
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [requirements, setRequirements] = useState<RequirementCard[] | null>(null);
  // P9 S1 featured collections — null while loading so the circles row never
  // flashes an empty state the profile doesn't actually have.
  const [collections, setCollections] = useState<FeaturedCollection[] | null>(null);
  const [createFeatured, setCreateFeatured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openedCollection, setOpenedCollection] = useState<FeaturedCollection | null>(null);
  const [collectionItems, setCollectionItems] = useState<FeaturedItem[] | null>(null);
  const [removeCollection, setRemoveCollection] = useState<FeaturedCollection | null>(null);
  /** The per-collection cap, taken from the server rather than assumed. */
  const [maxFeaturedItems, setMaxFeaturedItems] = useState(20);

  useEffect(() => {
    void (async () => {
      const [l, r, f] = await Promise.all([listingsApi.mine(), listingsApi.myRequirements(), profileApi.featured()]);
      setListings(l.ok ? l.data.items : []);
      setRequirements(r.ok ? r.data.items : []);
      setCollections(f.ok ? f.data.items : []);
      if (f.ok) setMaxFeaturedItems(f.data.maxItems);
    })();
  }, []);

  useEffect(() => {
    profileApi.me().then((r) => {
      if (r.ok) setP(r.data.profile);
      setLoading(false);
    });
  }, []);

  // A switch is a full page load, so the design's "Switched to <user>" toast is
  // handed across it. UI-only, cleared on read — no account data is stored.
  useEffect(() => {
    const to = sessionStorage.getItem(SWITCH_TOAST_KEY);
    if (!to) return;
    sessionStorage.removeItem(SWITCH_TOAST_KEY);
    show(`Switched to ${to}`);
  }, [show]);

  if (subScreen === "account-status") return <AccountStatus onBack={() => setSubScreen(null)} />;

  if (loading) return <ProfileSkeleton />;
  if (!p) return null;

  const tabs = TABS[p.role ?? "owner"];
  const roleLabel = p.role ? p.role[0].toUpperCase() + p.role.slice(1) : "";

  /** The sheet always asks the server who is signed in — it never renders a cache. */
  async function openSwitchSheet() {
    setSwitchSheet(true);
    setAccountsLoading(true);
    const r = await authApi.accounts();
    if (r.ok) setAccounts(r.data.accounts);
    setAccountsLoading(false);
  }

  async function switchTo(a: DeviceAccount) {
    setAccountBusy(a.id);
    const r = await authApi.switchAccount(a.id);
    if (r.ok) {
      // Hard navigation: every server-rendered page and cached payload on screen
      // belongs to the account being left, so none of it may survive the switch.
      sessionStorage.setItem(SWITCH_TOAST_KEY, a.username);
      window.location.href = "/profile";
      return;
    }
    setAccountBusy(null);
    // The server already dropped a dead session from the pool — mirror that here
    // instead of leaving a row that can never work.
    setAccounts((list) => list.filter((x) => x.id !== a.id));
    show(r.error.code === "NOT_FOUND" || r.error.code === "UNAUTHORIZED" ? "That account is signed out on this device" : "Couldn't switch account");
  }

  async function removeAccount(a: DeviceAccount) {
    setRemoveTarget(null);
    setAccountBusy(a.id);
    const r = await authApi.removeAccount(a.id);
    setAccountBusy(null);
    if (!r.ok) {
      show("Couldn't remove account");
      return;
    }
    setAccounts((list) => list.filter((x) => x.id !== a.id));
    show(`Removed ${a.username}`);
  }

  /** Tapping a circle: open it and ask the server what's inside, every time. */
  async function openCollection(c: FeaturedCollection) {
    setOpenedCollection(c);
    setCollectionItems(null);
    const r = await profileApi.featuredItems(c.id);
    setCollectionItems(r.ok ? r.data.items : []);
  }

  async function createCollection(name: string, listingIds: string[]) {
    setCreating(true);
    const r = await profileApi.createFeatured(name, listingIds);
    setCreating(false);
    if (!r.ok) {
      // The caps are the server's, so the message quotes what it enforced.
      show(r.error.field === "collections" ? `You can have up to ${r.error.max} collections` : "Couldn't create that collection");
      return;
    }
    setCreateFeatured(false);
    await refreshCollections();
    show("Featured created");
  }

  async function deleteCollection(c: FeaturedCollection) {
    setRemoveCollection(null);
    setOpenedCollection(null);
    const r = await profileApi.deleteFeatured(c.id);
    if (!r.ok) {
      show("Couldn't remove that collection");
      return;
    }
    await refreshCollections();
    show("Collection removed");
  }

  /** The circles are re-read from the server, never patched blind. */
  async function refreshCollections() {
    const fresh = await profileApi.featured();
    if (fresh.ok) setCollections(fresh.data.items);
  }

  async function logout() {
    const r = await authApi.logout();
    // With another account signed in on this device we land on it, not on /login.
    if (r.ok && r.data.switchedTo) {
      window.location.href = "/profile";
      return;
    }
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
        <button onClick={() => !viewAs && void openSwitchSheet()} className="flex items-center gap-1">
          <span className="text-17 font-semibold text-ink-primary">{p.username}</span>
          {!viewAs && <Icon name="chevron-down" size={18} className="text-ink-primary" strokeWidth={1.7} />}
        </button>
        {!viewAs && (
          <div className="flex items-center">
            <button aria-label="Create" onClick={() => router.push("/create")} className="grid h-11 w-11 place-items-center text-ink-primary">
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
          {/* Stats ×3 (×4 for builders, who keep their Projects tile).
              Owner + Broker: Listings · Requirements · Leads
              Builder:        Listings · Projects · Messages · Leads
              Every tile opens the screen it counts — no tile is decorative. */}
          <div className="flex flex-1 justify-around">
            {/* Tapping Listings opens the manager — that's where an under-review
                listing is visible (Doc4 §56). */}
            <Stat n={p.stats.listings} label="Listings" onClick={() => router.push("/listings")} />
            {/* A builder's projects live on their dashboard (FeedHome renders
                BuilderDashboard at "/" for builders), NOT in My Listings — the
                old destination showed listings and never a single project. */}
            {p.role === "builder" && <Stat n={p.stats.projects ?? 0} label="Projects" onClick={() => router.push("/")} />}
            {!viewAs &&
              (p.role === "builder" ? (
                <Stat n={p.stats.messages} label="Messages" onClick={() => router.push("/messages")} />
              ) : (
                <Stat n={p.stats.requirements} label="Requirements" onClick={() => router.push("/requirements/mine")} />
              ))}
            {!viewAs && <Stat n={p.stats.leads} label="Leads" onClick={() => router.push("/leads")} />}
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
              <Icon name="qr-code" size={20} strokeWidth={1.7} />
            </Button>
          </div>
        )}
      </div>

      {/* Featured circles (P9 S1): the owner's real collections, then "+ New".
          64px circle, name underneath, clipped to 64px like the design. */}
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4">
        {collections === null
          ? [0, 1].map((i) => (
              <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))
          : collections.map((c) => (
              <button key={c.id} onClick={() => void openCollection(c)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-ink-tertiary">
                  {c.coverUrl ? (
                    <Thumb url={c.coverUrl} className="h-full w-full" />
                  ) : (
                    <Icon name="home" size={22} strokeWidth={1.7} />
                  )}
                </span>
                <span className="chrome max-w-16 truncate text-11 text-ink-secondary">{c.name}</span>
              </button>
            ))}
        {!viewAs && (
          <button onClick={() => setCreateFeatured(true)} className="flex w-16 shrink-0 flex-col items-center gap-1">
            <span className="grid h-16 w-16 place-items-center rounded-full border-[1.5px] border-dashed border-border text-ink-tertiary">
              <Icon name="plus" size={22} strokeWidth={1.7} />
            </span>
            <span className="chrome text-11 text-ink-secondary">New</span>
          </button>
        )}
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

      {/* Grid content — the user's REAL listings/requirements for this tab */}
      <TabContent
        tab={tabs[tab]}
        view={view}
        viewAs={viewAs}
        listings={listings}
        requirements={requirements}
        onOpenListing={(id) => router.push(`/listings/${id}`)}
        onCreate={() =>
          router.push(tabs[tab] === "Requirements" ? "/requirements/new" : "/create")
        }
      />
      </div>
      {/* end scroll area */}

      <BottomNav />

      {/* Sheets & dialogs */}
      <AccountSwitchSheet
        open={switchSheet}
        onClose={() => setSwitchSheet(false)}
        // Until the server answers, the sheet still shows the account we already
        // know is active — it never renders an empty or wrong list.
        accounts={
          accounts.length
            ? accounts
            : [{ id: p.id, username: p.username ?? "", name: p.name ?? "", photoUrl: p.photoUrl, roleCity: [roleLabel, p.cityName].filter(Boolean).join(" · "), current: true }]
        }
        loading={accountsLoading}
        busyId={accountBusy}
        onSwitch={(a) => void switchTo(a)}
        onRequestRemove={(a) => setRemoveTarget(a)}
        onAddAccount={() => {
          setSwitchSheet(false);
          // Hard navigation on purpose: a soft push can render the auth flow
          // before the router has committed the `add` param, and this screen's
          // cached RSC payload belongs to the account we may be about to leave.
          window.location.href = "/login?add=1";
        }}
        onLogout={logout}
      />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) void removeAccount(removeTarget);
        }}
        title="Remove account?"
        body={`${removeTarget?.username ?? "This account"} will be signed out of this device. You can add it again with an OTP.`}
        confirmLabel="Remove"
        destructive
      />
      <ProfileMenuSheet
        open={menuSheet}
        onClose={() => setMenuSheet(false)}
        onNavigate={(href) => {
          setMenuSheet(false);
          router.push(href);
        }}
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
      {/* Featured collections (P9 S1): create, open, remove. */}
      <CreateFeaturedSheet
        open={createFeatured}
        onClose={() => setCreateFeatured(false)}
        // Only live+available listings can be grouped — a collection circle is
        // public, so a hidden or sold listing would render an empty shelf.
        listings={(listings ?? []).filter((l) => l.status === "live" && l.availability === "available")}
        maxItems={maxFeaturedItems}
        busy={creating}
        onCreate={(name, ids) => void createCollection(name, ids)}
      />
      <FeaturedCollectionSheet
        open={Boolean(openedCollection)}
        onClose={() => setOpenedCollection(null)}
        collection={openedCollection}
        items={collectionItems}
        loading={collectionItems === null}
        onOpenListing={(id) => {
          setOpenedCollection(null);
          router.push(`/listings/${id}`);
        }}
        onRemove={() => setRemoveCollection(openedCollection)}
      />
      <ConfirmDialog
        open={Boolean(removeCollection)}
        onClose={() => setRemoveCollection(null)}
        onConfirm={() => {
          if (removeCollection) void deleteCollection(removeCollection);
        }}
        title="Remove this collection?"
        body={`"${removeCollection?.name ?? ""}" disappears from your profile. The listings inside it stay live.`}
        confirmLabel="Remove"
        destructive
      />
      <QRSheet open={qrSheet} onClose={() => setQrSheet(false)} name={p.name ?? ""} roleCity={`${roleLabel} · ${p.cityName ?? ""}`} username={p.username ?? ""} onShare={() => show("Link copied")} />
      {/* The "What counts as a view?" dialog lived here for the Views tile.
          That tile is now Requirements/Messages, so nothing could open it —
          removed rather than left as unreachable code. Views themselves are
          unchanged and still shown per listing in the manager. */}
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

/**
 * The profile grid. Which items a tab shows is derived from the same rows the
 * My Listings screen uses — there is no separate count or cached number here,
 * so the tab can never disagree with the listing itself.
 */
function TabContent({
  tab, view, viewAs, listings, requirements, onOpenListing, onCreate,
}: {
  tab: string;
  view: "grid" | "list";
  viewAs: boolean;
  listings: MyListing[] | null;
  requirements: RequirementCard[] | null;
  onOpenListing: (id: string) => void;
  onCreate: () => void;
}) {
  const isRequirements = tab === "Requirements";

  // Still loading — show skeletons rather than an "empty" state that would be a
  // lie for a user who does have listings.
  if ((isRequirements ? requirements : listings) === null) {
    return (
      <div className={cn("p-1", view === "grid" ? "grid grid-cols-3 gap-1" : "flex flex-col gap-2 p-4")}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={view === "grid" ? "aspect-square w-full rounded-4" : "h-16 w-full rounded-8"} />
        ))}
      </div>
    );
  }

  if (isRequirements) {
    const items = requirements ?? [];
    if (!items.length) {
      return (
        <Empty
          title="No requirements yet"
          body="Post what you're looking for and matching properties will find you."
          cta="Post Requirement"
          viewAs={viewAs}
          onCreate={onCreate}
        />
      );
    }
    return (
      <div className="flex flex-col gap-2 p-4">
        {items.map((r) => (
          <div key={r.id} className="rounded-12 border border-border bg-surface-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-15 font-semibold text-ink-primary">
                {r.bhk ? `${r.bhk} BHK · ` : ""}{r.kindLabel}
              </span>
              <span className="text-11 font-semibold uppercase text-ink-tertiary">{r.badge.label}</span>
            </div>
            <div className="mt-1 text-13 text-ink-secondary">{r.budgetLabel}</div>
            {r.areaLabel && <div className="mt-0.5 text-11 text-ink-tertiary">{r.areaLabel}</div>}
          </div>
        ))}
      </div>
    );
  }

  // Sell / Rent / Projects tabs read the listing rows, filtered by kind.
  const all = listings ?? [];
  const items =
    tab === "Sell" ? all.filter((l) => l.kind === "sell")
    : tab === "Rent" ? all.filter((l) => l.kind === "rent")
    : all; // "Projects" and "Sell / Rent" (builder) show everything they own

  if (!items.length) {
    return (
      <Empty
        title="No listings yet"
        body="Post your first property — it stays live forever with the ₹999 plan."
        cta="Create Listing"
        viewAs={viewAs}
        onCreate={onCreate}
      />
    );
  }

  if (view === "list") {
    return (
      <div className="flex flex-col gap-2 p-4">
        {items.map((l) => (
          <button key={l.id} onClick={() => onOpenListing(l.id)} className="flex gap-3 rounded-12 border border-border bg-surface-1 p-3 text-left">
            <Thumb url={l.coverUrl} className="h-16 w-16 shrink-0 rounded-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-15 font-semibold text-ink-primary">{l.title ?? "Untitled listing"}</div>
              <div className="mt-0.5 text-13 text-ink-secondary">{l.price}</div>
              <div className="mt-0.5 truncate text-11 text-ink-tertiary">{l.areaLabel}</div>
            </div>
            <span className="shrink-0 self-start text-11 font-semibold uppercase text-ink-tertiary">{l.badge.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 p-1">
      {items.map((l) => (
        <button key={l.id} onClick={() => onOpenListing(l.id)} className="relative aspect-square">
          <Thumb url={l.coverUrl} className="h-full w-full rounded-4" />
          {l.badge.label !== "Live" && (
            <span className="absolute left-1 top-1 rounded-4 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
              {l.badge.label}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Thumb({ url, className }: { url: string | null; className?: string }) {
  if (!url) return <div className={cn("bg-surface-3", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={cn("object-cover", className)} />;
}

function Empty({
  title, body, cta, viewAs, onCreate,
}: { title: string; body: string; cta: string; viewAs: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <HousePlusArt />
      <h3 className="text-17 font-semibold text-ink-primary">{title}</h3>
      <p className="max-w-xs text-13 text-ink-secondary">{body}</p>
      {!viewAs && <Button className="mt-2" onClick={onCreate}>{cta}</Button>}
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
