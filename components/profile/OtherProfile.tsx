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
import { FeaturedCollectionSheet } from "./ProfileSheets";
import { profileApi, type FeaturedCollection, type FeaturedItem, type PublicProject } from "@/lib/profile/client";
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
// Display label → server reason code (reports.reason). Unknowns fall back to "other".
const REASON_CODE: Record<string, string> = {
  "Fake profile": "fake", "Spam": "spam", "Abusive behaviour": "abusive",
  "Fraud attempt": "fraud", "Impersonation": "other",
};

export function OtherProfile({ username, isGuest = false }: { username: string; isGuest?: boolean }) {
  const router = useRouter();
  const { show } = useToast();
  // On the public host the viewer is always a guest (middleware strips the
  // session). Block/Report/Message write or require auth, so a guest is sent to
  // login instead of hitting a 401.
  const guard = (fn: () => void) => { if (isGuest) { router.push("/login"); return; } fn(); };
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  // "Block user" was removed from the ⋯ menu. Blocking still exists where it has
  // context — inside a chat thread (P7) and the Blocked-users settings screen —
  // so the endpoint and `profileApi.blockUser` stay; only this entry point is gone.
  const [notFound, setNotFound] = useState(false);
  const [listings, setListings] = useState<
    { id: string; title: string | null; price: string; coverUrl: string | null; areaLabel: string | null; kind: "sell" | "rent" }[] | null
  >(null);
  // Builder-only. The Projects tab used to fall through to `listings`, so it
  // rendered exactly what the Sell / Rent tab did and a builder's projects were
  // nowhere on their public profile.
  const [projects, setProjects] = useState<PublicProject[] | null>(null);
  // Featured circles (P9 S2) — public, and only ones with something live in them.
  const [collections, setCollections] = useState<FeaturedCollection[] | null>(null);
  const [openedCollection, setOpenedCollection] = useState<FeaturedCollection | null>(null);
  const [collectionItems, setCollectionItems] = useState<FeaturedItem[] | null>(null);

  useEffect(() => {
    profileApi.publicProfile(username).then((r) => {
      if (r.ok) setP(r.data.profile);
      else setNotFound(true);
      setLoading(false);
    });
  }, [username]);

  // The grid: real live listings. Was a hardcoded "No listings to show yet."
  useEffect(() => {
    profileApi.publicListings(username).then((r) => setListings(r.ok ? r.data.items : []));
  }, [username]);

  // The featured circles this profile has published (P9 S2).
  useEffect(() => {
    profileApi.publicFeatured(username).then((r) => setCollections(r.ok ? r.data.items : []));
  }, [username]);

  // Projects are a Builder-only product (Doc2 §6), so only a builder's profile
  // pays for the extra request — and the tab that needs them isn't rendered for
  // anyone else anyway.
  useEffect(() => {
    if (p?.role !== "builder") return;
    profileApi.publicProjects(username).then((r) => setProjects(r.ok ? r.data.items : []));
  }, [username, p?.role]);

  /** Tapping a circle asks the server what's inside, every time. */
  async function openCollection(c: FeaturedCollection) {
    setOpenedCollection(c);
    setCollectionItems(null);
    const r = await profileApi.publicFeaturedItems(username, c.id);
    setCollectionItems(r.ok ? r.data.items : []);
  }

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

      {/* ---- Identity block -------------------------------------------------
          Name and role lead, avatar beside them, and the counts sit in their own
          balanced row underneath. The old layout put a single stat next to an
          84px avatar with `justify-around`, which left a wide dead gap on every
          non-builder profile and made the whole header read as unfinished. */}
      <div className="px-4 pt-5">
        <div className="flex items-start gap-3.5">
          <Avatar name={p.name ?? undefined} src={p.photoUrl ?? undefined} size={64} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-20 font-bold leading-tight text-ink-primary">{p.name}</h2>
              <ProfileBadges badges={p.badges} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {roleLabel && (
                <span className="chrome rounded-full bg-accent-soft px-2.5 py-1 text-11 font-semibold text-accent">{roleLabel}</span>
              )}
              {p.cityName && (
                <span className="chrome inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-11 font-medium text-ink-secondary">
                  <Icon name="pin" size={12} strokeWidth={2} />
                  {p.cityName}
                </span>
              )}
            </div>
          </div>
        </div>

        {p.bio && <p className="mt-3.5 text-13 leading-[1.55] text-ink-secondary">{p.bio}</p>}

        {/* Counts — a real row with its own surface, so one stat looks
            deliberate instead of stranded. */}
        <div className="mt-4 flex items-stretch overflow-hidden rounded-12 border border-border bg-surface-1">
          <Stat n={p.stats.listings} label={p.stats.listings === 1 ? "Listing" : "Listings"} />
          {p.role === "builder" && (
            <>
              <span className="w-px self-stretch bg-divider" />
              <Stat n={p.stats.projects ?? 0} label={(p.stats.projects ?? 0) === 1 ? "Project" : "Projects"} />
            </>
          )}
          <span className="w-px self-stretch bg-divider" />
          <StatText value={p.memberSince} label="Member since" />
        </div>

        {/* Message full-width (private number default — Call/WhatsApp gate on public number, Module 7) */}
        <div className="mt-3.5 flex items-center gap-2">
          <Button fullWidth onClick={() => guard(() => show("Open a property below to send an inquiry and chat"))}>
            <Icon name="message" size={18} strokeWidth={1.9} />
            Message
          </Button>
          <button
            aria-label="About this account"
            onClick={() => setAbout(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-8 border border-border text-ink-secondary active:bg-surface-2"
          >
            <Icon name="info" size={19} strokeWidth={1.8} />
          </button>
        </div>

        {p.responseLabel && (
          <p className="mt-2.5 flex items-center gap-1.5 text-11 text-ink-tertiary">
            <Icon name="clock" size={13} strokeWidth={1.8} />
            {p.responseLabel}
          </p>
        )}
      </div>

      {/* Featured circles (P9 S2 draws this row on the visitor profile too —
          same 64px circle + name, with no "+ New" because a visitor doesn't
          curate someone else's shelf). Only collections with something live in
          them come back from the server. */}
      {collections !== null && collections.length > 0 && (
        <div className="no-scrollbar mt-5 flex gap-3.5 overflow-x-auto px-4 pb-0.5">
          {collections.map((c) => (
            // The label used to be clipped to the 64px circle, so "Ready to move"
            // rendered as "Ready to m…". The column is wider than the ring now and
            // the name wraps to two lines before it truncates.
            <button key={c.id} onClick={() => void openCollection(c)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
              <span className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full bg-surface-2 text-ink-tertiary ring-1 ring-border">
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="home" size={24} strokeWidth={1.7} />
                )}
              </span>
              <span className="chrome line-clamp-2 w-full text-center text-11 leading-[1.3] text-ink-secondary">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs + grid (live-only, empty until listings). Sticky so the grid keeps
          its context while scrolling, and the indicator is inset to the label
          rather than spanning the full cell. */}
      <div className="chrome sticky top-header z-sticky mt-5 flex border-b border-border bg-page">
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
            {i === tab && <span className="absolute inset-x-6 bottom-0 h-[2px] rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      {/* Grid — tab-filtered. "Sell"/"Rent" filter by kind; the builder's
          "Sell / Rent" tab shows everything. Each tile opens the listing. */}
      {listings === null ? (
        <div className="grid grid-cols-2 gap-2 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-12" />)}
        </div>
      ) : tabs[tab] === "Projects" ? (
        // Real projects, not the listings this tab used to borrow.
        projects === null ? (
          <div className="grid grid-cols-2 gap-2 p-4">
            {[0, 1].map((i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-12" />)}
          </div>
        ) : projects.length === 0 ? (
          <EmptyGrid title="No projects yet" body="This builder hasn't published a project." />
        ) : (
          <div className="grid grid-cols-2 gap-2 p-4">
            {projects.map((pr) => (
              <button
                key={pr.id}
                onClick={() => router.push(`/project/${pr.id}`)}
                className="overflow-hidden rounded-12 border border-border bg-surface-1 text-left shadow-l1 active:opacity-90 dark:shadow-none"
                aria-label={pr.name}
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
                  {pr.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pr.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="building" size={26} /></span>
                  )}
                  {pr.buildStatusLabel && (
                    <span className="chrome absolute left-1.5 top-1.5 rounded-4 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3px] text-white">
                      {pr.buildStatusLabel}
                    </span>
                  )}
                </span>
                <span className="block px-2.5 py-2">
                  {/* A project with no priced unit yet leads with its name; the
                      name is not repeated underneath in that case. */}
                  <span className="block truncate text-15 font-bold leading-tight text-ink-primary">
                    {pr.priceFrom ? `From ${pr.priceFrom}` : pr.name}
                  </span>
                  {pr.priceFrom && <span className="mt-1 block truncate text-11 text-ink-secondary">{pr.name}</span>}
                  {pr.areaLabel && (
                    <span className="mt-0.5 flex items-center gap-1 text-11 text-ink-tertiary">
                      <Icon name="pin" size={11} strokeWidth={2} />
                      <span className="truncate">{pr.areaLabel}</span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )
      ) : (() => {
        const label = tabs[tab];
        const shown = label === "Sell" ? listings.filter((l) => l.kind === "sell")
          : label === "Rent" ? listings.filter((l) => l.kind === "rent")
          : listings;
        if (!shown.length) {
          return (
            <EmptyGrid
              title="Nothing here yet"
              body={label === "Rent" ? "No properties listed for rent right now." : "No properties listed for sale right now."}
            />
          );
        }
        return (
          // Two columns instead of three. At 375px a third column left each tile
          // ~124px wide, which is why "₹1.05 Cr · Negotiable" was clipping — the
          // price, the one thing a browser scans for, was the thing being cut.
          <div className="grid grid-cols-2 gap-2 p-4">
            {shown.map((l) => (
              <button
                key={l.id}
                onClick={() => router.push(`/property/${l.id}`)}
                className="group overflow-hidden rounded-12 border border-border bg-surface-1 text-left shadow-l1 active:opacity-90 dark:shadow-none"
                aria-label={l.title ?? l.price}
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
                  {l.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="home" size={26} /></span>
                  )}
                </span>
                <span className="block px-2.5 py-2">
                  {/* Price on its own line at full width, so it never truncates. */}
                  <span className="block truncate text-15 font-bold leading-tight text-ink-primary">{priceMain(l.price)}</span>
                  {l.areaLabel && (
                    <span className="mt-1 flex items-center gap-1 text-11 text-ink-tertiary">
                      <Icon name="pin" size={11} strokeWidth={2} />
                      <span className="truncate">{l.areaLabel}</span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ⋯ menu */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} hideHeader>
        <div className="flex flex-col pt-1">
          {/* "Copy link" was removed — it was byte-identical to Share profile
              (same clipboard write, same toast), so the sheet offered the same
              action twice under two names. */}
          <MenuRow icon="share" label="Share profile" onClick={() => { navigator.clipboard?.writeText(`homzlist.com/${p.username}`).catch(() => {}); show("Link copied"); setMenu(false); }} />
          <MenuRow icon="alert" label="Report profile" destructive onClick={() => { setMenu(false); guard(() => setReportSheet(true)); }} />
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
          <Button variant="destructive" className="mt-3" fullWidth disabled={!reportReason} onClick={async () => {
            const reason = REASON_CODE[reportReason ?? ""] ?? "other";
            setReportSheet(false); setReportReason(null);
            const res = await profileApi.reportUser(p.id, reason);
            show(res.ok ? "Report submitted — we'll review it" : "Couldn't submit that report");
          }}>
            Submit Report
          </Button>
        </div>
      </BottomSheet>

      {/* Tapping a featured circle — read-only here: no Remove for a visitor. */}
      <FeaturedCollectionSheet
        open={Boolean(openedCollection)}
        onClose={() => setOpenedCollection(null)}
        collection={openedCollection}
        items={collectionItems}
        loading={collectionItems === null}
        onOpenListing={(id) => {
          setOpenedCollection(null);
          router.push(`/property/${id}`);
        }}
      />
      <ConfirmDialog open={about} onClose={() => setAbout(false)} onConfirm={() => setAbout(false)} title="About this account" body={`Joined ${p.memberSince} · ${p.stats.listings} listings posted${p.cityName ? ` · Based in ${p.cityName}` : ""}`} confirmLabel="Got it" hideCancel />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5">
      <span className="text-17 font-bold leading-none text-ink-primary">{n.toLocaleString("en-IN")}</span>
      <span className="text-11 text-ink-tertiary">{label}</span>
    </div>
  );
}

/** Same tile shape as `Stat`, for a value that is a word rather than a count. */
function StatText({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5">
      <span className="max-w-full truncate text-15 font-bold leading-none text-ink-primary">{value}</span>
      <span className="text-11 text-ink-tertiary">{label}</span>
    </div>
  );
}

/**
 * The price a card leads with. The server sends "₹68 Lakh · Negotiable"; the
 * card shows the amount and drops the qualifier, which the detail page states in
 * full. Nothing is recomputed here — it is the server's own string, split.
 */
function priceMain(price: string) {
  return price.split("·")[0].trim();
}

function EmptyGrid({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-tertiary">
        <Icon name="home" size={26} strokeWidth={1.5} />
      </span>
      <p className="text-15 font-semibold text-ink-primary">{title}</p>
      <p className="max-w-[240px] text-13 text-ink-tertiary">{body}</p>
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
