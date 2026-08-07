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
import { AccountSwitchSheet, CreateFeaturedSheet, FeaturedCollectionSheet, ProfileMenuSheet } from "./ProfileSheets";
import { AccountStatus } from "./AccountStatus";
import { CardList, ListingCard, ProjectCard, RequirementCard, SectionHeader, TabCount } from "./ProfileRows";
import { profileApi, type FeaturedCollection, type FeaturedItem, type OwnProfile as OwnProfileT } from "@/lib/profile/client";
import { authApi, type DeviceAccount } from "@/lib/auth/client";
// `RequirementCard` is also the name of the card COMPONENT above, so the DTO
// type is aliased rather than shadowed.
import { listingsApi, type MyListing, type MyProject, type RequirementCard as RequirementCardT } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";
import { NetworkStatus } from "@/components/pwa/NetworkStatus";
import { ScrollRestore } from "@/components/nav/ScrollRestore";

/**
 * S1 Own Profile (P9, redesigned — designs/_samples/P9-profile-redesign-sample.html).
 *
 * Same wireframe order as before (header → identity → featured → tabs →
 * content → bottom nav) and every control still does what it did. What changed
 * (Rajan, 29 Jul 2026):
 *  - the count tiles beside the avatar are gone; that space is name +
 *    verification + role + city,
 *  - content is proper CARDS instead of bare square tiles,
 *  - the QR button is gone from the button row AND from the ⋯ menu,
 *  - the grid/list toggle is gone; a profile is a LIST, one layout, all roles,
 *  - no view counts on a property card,
 *  - a Builder has ONE tab, Projects — the Sell/Rent tab could only ever be
 *    empty for them (migration 0067) and Requirements lives in the ⋯ menu,
 *  - smaller radii, and green now means "live" rather than decoration.
 *
 * Every destination, sheet and handler is the one that was already here — the
 * count tiles' three targets (My Listings, My requirements, Leads) are all rows
 * in the ⋯ menu, so nothing became unreachable.
 */

/** Carries the design's post-switch toast across the reload. UI-only. */
const SWITCH_TOAST_KEY = "hz-switched-to";

const TABS: Record<string, string[]> = {
  owner: ["Sell", "Rent", "Requirements"],
  broker: ["Sell", "Rent", "Requirements"],
  builder: ["Projects"],
};

/**
 * What "View as visitor" must show — P9 S2's tab set, not P9 S1's.
 *
 * A visitor has no Requirements tab (a requirement is never on a public
 * profile) and, with the live-only filter below, sees exactly the rows
 * `OtherProfile` renders. Before this, view-as kept the OWNER's tabs and the
 * owner's rows: a broker "previewing" their profile counted 34 Sell / 15 Rent
 * against the 11 a stranger can actually load, with UNDER REVIEW badges and
 * lead counts on cards that aren't public at all.
 */
const VISITOR_TABS: Record<string, string[]> = {
  owner: ["Sell", "Rent"],
  broker: ["Sell", "Rent"],
  builder: ["Projects"],
};

export function OwnProfile() {
  const router = useRouter();
  const { show } = useToast();
  const [p, setP] = useState<OwnProfileT | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [switchSheet, setSwitchSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);
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
  const [requirements, setRequirements] = useState<RequirementCardT[] | null>(null);
  // Builder-only. The Projects tab used to render the same LISTINGS the other
  // two tabs show, so a builder's projects were nowhere on their own profile.
  const [projects, setProjects] = useState<MyProject[] | null>(null);
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
      // `/listings/mine` carries a builder's PROJECTS too (the My Listings
      // manager shows both). Here they have their own tab, fed by
      // `myProjects()` below — so the Sell / Rent grid keeps only properties
      // rather than drawing every scheme twice.
      setListings(l.ok ? l.data.items.filter((i) => i.subjectKind !== "project") : []);
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

  // Projects are a Builder-only product (Doc2 §6), so only a builder pays for
  // the extra request — and the tab that needs them can't render before the
  // role is known anyway.
  useEffect(() => {
    if (p?.role !== "builder") return;
    void listingsApi.myProjects().then((r) => setProjects(r.ok ? (r.data.items as MyProject[]) : []));
  }, [p?.role]);

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

  const tabs = (viewAs ? VISITOR_TABS : TABS)[p.role ?? "owner"];
  // Requirements is index 2, which the visitor tab set doesn't have — without
  // this, turning view-as on from that tab renders `tabs[2] === undefined`.
  const tabIndex = Math.min(tab, tabs.length - 1);
  const roleLabel = p.role ? p.role[0].toUpperCase() + p.role.slice(1) : "";

  // What a stranger's request would return: live and still available. The
  // preview filters the same rows the public payload does, so the counts beside
  // the tabs are the visitor's counts too.
  const publicListings = listings === null ? null : listings.filter((l) => l.status === "live" && l.availability === "available");
  const publicProjects = projects === null ? null : projects.filter((pr) => pr.status === "live");
  const shownListings = viewAs ? publicListings : listings;
  const shownProjects = viewAs ? publicProjects : projects;

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
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
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
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
      window.location.href = "/profile";
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
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

      {/* Own profile is the third shell (AppShell / FeedShell / here), so it
          needs the shell-level pieces mounted too — Doc3 §98 / Doc8 §193. */}
      <NetworkStatus />

      {/* Scroll area — header + tabs stick inside it; the bottom nav (in-flow
          below) never scrolls, so it stays pinned on every device. */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
      <ScrollRestore />
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
              <Icon name="menu" size={24} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </header>

      {/* Identity block. The count tiles that used to sit beside the avatar are
          gone for all three roles; the space now holds name + verification +
          role + city. Their destinations (My Listings, My requirements, Leads)
          are all rows in the ⋯ menu, so nothing became unreachable. */}
      <div className="px-4 pt-4">
        <div className="flex items-start gap-3.5">
          <Avatar name={p.name ?? undefined} src={p.photoUrl ?? undefined} size={78} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-17 font-bold tracking-[-0.2px] text-ink-primary">{p.name}</span>
              <ProfileBadges badges={p.badges} />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-13 text-ink-secondary">
              {roleLabel && (
                <span className="chrome inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2.5 text-11 font-bold text-accent">
                  {roleLabel}
                </span>
              )}
              {p.cityName && (
                <>
                  <i className="h-[3px] w-[3px] rounded-full bg-ink-tertiary" />
                  <span className="truncate">{p.cityName}</span>
                </>
              )}
            </div>
            {/* Every level this role CAN earn, including the ones not earned yet
                — and each opens the screen that earns it (Doc2 §11), so no chip
                is decorative. RERA is a Broker/Builder level (Doc2 role table:
                Owner = Phone/ID), so an owner was being shown a permanently
                unearnable "✗ RERA" chip that led to a level they can't get.

                Owner-only: the row states which levels are still UNEARNED, and
                P9 S2 shows a stranger nothing but the earned tick (ProfileBadges
                above). So the visitor preview drops it rather than showing a
                "✗ ID" no visitor could ever see. */}
            <div className={cn("mt-2 flex flex-wrap gap-1.5", viewAs && "hidden")}>
              {([["Phone", p.badges.phone], ["ID", p.badges.id],
                 ...(p.role === "broker" || p.role === "builder" ? [["RERA", p.badges.rera] as const] : []),
                ] as const).map(([label, on]) => (
                <button
                  key={label}
                  onClick={() => !viewAs && router.push("/profile/verification")}
                  className={cn(
                    "chrome flex h-[22px] items-center gap-1 rounded-4 px-2 text-11 font-semibold",
                    on ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-secondary",
                  )}
                >
                  <Icon name={on ? "check" : "close"} size={11} strokeWidth={on ? 3 : 2.4} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {p.bio && <p className="mt-3 text-13 leading-[1.5] text-ink-primary">{p.bio}</p>}
        <p className="mt-1.5 text-11 text-ink-tertiary">
          Member since {p.memberSince}
          {p.responseLabel ? ` · ${p.responseLabel}` : ""}
        </p>

        {/* Button row — the QR square is removed (Rajan, 29 Jul 2026). */}
        {!viewAs && (
          <div className="mt-3.5 flex items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Featured circles (P9 S1): the owner's real collections, then "+ New". */}
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4 pb-0.5">
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

      {/* Tabs, each with its real count. The grid/list toggle that used to sit
          on the right is gone — the profile is a list, all roles. A Builder has
          exactly one tab, so it renders as a label rather than as a single
          full-width "tab" that looks like it should have siblings. */}
      {tabs.length === 1 ? (
        <div className="chrome sticky top-header z-sticky mt-3.5 flex items-center border-b border-border bg-surface-1 px-4 py-3">
          <b className="text-15 font-semibold text-ink-primary">{tabs[0]}</b>
          <TabCount n={tabCount(tabs[0], shownListings, requirements, shownProjects)} active />
        </div>
      ) : (
        <div className="chrome sticky top-header z-sticky mt-3.5 flex border-b border-border bg-surface-1">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "relative flex flex-1 items-center justify-center py-3 text-15 font-semibold transition-colors",
                i === tabIndex ? "text-ink-primary" : "text-ink-tertiary",
              )}
            >
              {t}
              <TabCount n={tabCount(t, shownListings, requirements, shownProjects)} active={i === tabIndex} />
              {i === tabIndex && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
            </button>
          ))}
        </div>
      )}

      {/* The user's REAL listings/requirements/projects for this tab */}
      <TabContent
        tab={tabs[tabIndex]}
        viewAs={viewAs}
        listings={shownListings}
        requirements={requirements}
        projects={shownProjects}
        // A tile on your OWN profile opens its insights (designs/P9 S1 →
        // `go('listingStats')`), not the public detail page — this is the
        // seller's own view of what the listing is doing. In view-as it opens
        // what the VISITOR would land on: the public detail page.
        onOpenListing={(id) => router.push(viewAs ? `/property/${id}` : `/listings/${id}/insights`)}
        // A project tile opens its insights, exactly as a property tile does.
        onOpenProject={(id) => router.push(viewAs ? `/project/${id}` : `/projects/${id}/insights`)}
        onOpenRequirement={(id) => router.push(`/requirements/${id}`)}
        onCreate={() =>
          router.push(
            tabs[tab] === "Requirements" ? "/requirements/new"
            : tabs[tab] === "Projects" ? "/projects/new"
            : "/create",
          )
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
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
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
      {/* The QR sheet was here. QR is gone from the profile entirely (Rajan,
          29 Jul 2026) — button, ⋯ menu row and sheet — rather than left as
          unreachable code. Share profile still copies the same link. */}
    </div>
  );
}

/**
 * The number beside a tab label. It counts the SAME array the tab renders, so
 * a tab can never claim a listing its own body doesn't show.
 */
function tabCount(
  tab: string,
  listings: MyListing[] | null,
  requirements: RequirementCardT[] | null,
  projects: MyProject[] | null,
) {
  if (tab === "Requirements") return requirements?.length ?? 0;
  if (tab === "Projects") return projects?.length ?? 0;
  const all = listings ?? [];
  if (tab === "Sell") return all.filter((l) => l.kind === "sell").length;
  if (tab === "Rent") return all.filter((l) => l.kind === "rent").length;
  return all.length;
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-column bg-page px-4 pt-4">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-[72px] w-[72px] rounded-8" />
        <div className="flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-28" />
          <Skeleton className="mt-3 h-3 w-44" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-64" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 flex-1" />
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[108px] w-full rounded-8" />
        ))}
      </div>
    </div>
  );
}

/**
 * One tab's rows. Which items a tab shows is derived from the same arrays the
 * My Listings screen uses — there is no separate count or cached number here,
 * so the tab can never disagree with the listing itself.
 *
 * One layout, all roles, all tabs: the grid/list toggle is gone.
 */
function TabContent({
  tab, viewAs, listings, requirements, projects,
  onOpenListing, onOpenProject, onOpenRequirement, onCreate,
}: {
  tab: string;
  viewAs: boolean;
  listings: MyListing[] | null;
  requirements: RequirementCardT[] | null;
  projects: MyProject[] | null;
  onOpenListing: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOpenRequirement: (id: string) => void;
  onCreate: () => void;
}) {
  const isRequirements = tab === "Requirements";
  const isProjects = tab === "Projects";

  // Still loading — show skeletons rather than an "empty" state that would be a
  // lie for a user who does have listings.
  const source = isRequirements ? requirements : isProjects ? projects : listings;
  if (source === null) {
    return (
      <div className="flex flex-col gap-2.5 px-3.5 pt-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={cn("w-full rounded-8", isProjects ? "h-[350px]" : "h-[138px]")} />
        ))}
      </div>
    );
  }

  // ---- Requirements --------------------------------------------------------
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
      <>
        <SectionHeader label="Your requirements" action={viewAs ? undefined : "Post requirement"} onAction={onCreate} />
        <CardList>
          {items.map((r) => {
            // `daysLeft` is the server's countdown; it prints beside the status
            // ("Active · 22d") only while the requirement is running.
            const badgeLabel =
              r.status === "live" && r.daysLeft !== null ? `${r.badge.label} · ${r.daysLeft}d` : r.badge.label;
            return (
              <RequirementCard
                key={r.id}
                onClick={() => onOpenRequirement(r.id)}
                budget={r.budgetLabel}
                sub={[r.bhk ? `${r.bhk} BHK` : null, r.kindLabel].filter(Boolean).join(" · ")}
                areas={(r.areaLabel ?? "").split(",").map((a) => a.trim()).filter(Boolean)}
                badge={{ kind: r.badge.kind, label: badgeLabel }}
                // Proposals only exist on a live requirement, so a paused or
                // expired one shows when it was posted rather than a fake "0".
                footer={
                  r.proposals
                    ? `${r.proposals.total} proposal${r.proposals.total === 1 ? "" : "s"}`
                    : r.createdOn
                    ? `Posted ${r.createdOn}`
                    : ""
                }
                newCount={r.proposals?.newCount}
              />
            );
          })}
        </CardList>
      </>
    );
  }

  // ---- Projects (builder) --------------------------------------------------
  if (isProjects) {
    const items = projects ?? [];
    if (!items.length) {
      return viewAs ? (
        <Empty title="No projects yet" body="This builder hasn't published a project." viewAs onCreate={onCreate} />
      ) : (
        <Empty
          title="No projects yet"
          body="List your project and it appears on your profile and in search."
          cta="Create Project"
          viewAs={viewAs}
          onCreate={onCreate}
        />
      );
    }
    return (
      <>
        {/* The section header is the OWNER's row (it carries "Add project"), so
            the visitor preview doesn't draw it — P9 S2 has no such header. */}
        {!viewAs && <SectionHeader label="Your projects" action="Add project" onAction={onCreate} />}
        <CardList>
          {items.map((pr) => (
            <ProjectCard
              key={pr.id}
              onClick={() => onOpenProject(pr.id)}
              coverUrl={pr.coverUrl}
              photoCount={pr.photoCount}
              name={pr.name}
              config={projectConfig(pr)}
              priceFrom={pr.priceFrom}
              areaLabel={pr.areaLabel}
              // Status badges and the boost strip are owner-only facts — a
              // visitor is never told a project is boosted or under review.
              badge={viewAs ? undefined : pr.promoted ? { kind: "promoted", label: "Boosted" } : pr.badge}
              specs={projectSpecs(pr)}
              boost={viewAs ? undefined : pr.boost}
            />
          ))}
        </CardList>
      </>
    );
  }

  // ---- Sell / Rent (owner, broker) -----------------------------------------
  const all = listings ?? [];
  const items =
    tab === "Sell" ? all.filter((l) => l.kind === "sell")
    : tab === "Rent" ? all.filter((l) => l.kind === "rent")
    : all;

  if (!items.length) {
    return viewAs ? (
      <Empty
        title="Nothing here yet"
        body={tab === "Rent" ? "No properties listed for rent right now." : "No properties listed for sale right now."}
        viewAs
        onCreate={onCreate}
      />
    ) : (
      <Empty
        title="No listings yet"
        body="Post your first property — it stays live forever with the ₹999 plan."
        cta="Create Listing"
        viewAs={viewAs}
        onCreate={onCreate}
      />
    );
  }

  return (
    <>
      {!viewAs && <SectionHeader label={`${tab} listings`} action="Add listing" onAction={onCreate} />}
      <CardList>
        {items.map((l) => (
          <ListingCard
            key={l.id}
            onClick={() => onOpenListing(l.id)}
            coverUrl={l.coverUrl}
            photoCount={l.photoCount}
            price={l.price}
            title={l.title}
            bhk={l.bhk}
            sqft={l.sqft}
            areaLabel={l.areaLabel}
            // A boost is what the card leads with when one is running;
            // otherwise it states the lifecycle status the server sent. None of
            // it — nor the lead count — is a visitor's to see (P9 S2 strips
            // Views/Leads server-side), so the preview drops all three.
            badge={viewAs ? undefined : l.promoted ? { kind: "promoted", label: "Boosted" } : l.badge}
            ribbon={viewAs || l.availability === "available" ? null : l.availability === "sold" ? "SOLD" : "RENTED"}
            // Leads, not views: the view count was dropped from this screen on
            // 29 Jul 2026. It is unchanged on the listing's own insights.
            leads={viewAs ? undefined : l.leads}
            boost={viewAs ? undefined : l.boost}
          />
        ))}
      </CardList>
    </>
  );
}

/** "Apartments · 2 BHK, 3 BHK · 240 units" — only the parts the project carries. */
function projectConfig(p: MyProject) {
  const unitTypes = Array.from(new Set((p.units ?? []).map((u) => u.unitType).filter((u): u is string => Boolean(u))));
  return (
    [
      p.projectTypeLabel,
      unitTypes.length ? unitTypes.join(", ") : null,
      p.totalUnits ? `${p.totalUnits} units` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** The fact chips on a project card — a chip only if it has a value. */
function projectSpecs(p: MyProject) {
  const rera = p.rera ? (p.rera.exempt ? "RERA exempt" : p.rera.number ? `RERA ${p.rera.number}` : null) : null;
  return [
    p.buildStatusLabel,
    p.possessionLabel ? `Poss. ${p.possessionLabel}` : null,
    rera,
  ].filter((s): s is string => Boolean(s));
}

function Thumb({ url, className }: { url: string | null; className?: string }) {
  if (!url) return <div className={cn("bg-surface-3", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <Img src={url} alt="" className={cn("object-cover", className)} />;
}

function Empty({
  title, body, cta, viewAs, onCreate,
}: { title: string; body: string; cta?: string; viewAs: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <HousePlusArt />
      <h3 className="text-17 font-semibold text-ink-primary">{title}</h3>
      <p className="max-w-xs text-13 text-ink-secondary">{body}</p>
      {!viewAs && cta && <Button className="mt-2" onClick={onCreate}>{cta}</Button>}
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
