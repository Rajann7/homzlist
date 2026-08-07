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
import { CardList, ListingCard, ProjectCard, TabCount } from "./ProfileRows";
import { profileApi, type FeaturedCollection, type FeaturedItem, type PublicProject } from "@/lib/profile/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * S2 Other User Profile (P9). PUBLIC only — no Views/Leads (server-stripped).
 * Message/Call/WhatsApp variants, About popup, live-only grid (empty here until
 * listings). Suspended → "unavailable"; deleted → "Deleted user". Report + block.
 */
const TABS: Record<string, string[]> = {
  owner: ["Sell", "Rent"],
  broker: ["Sell", "Rent"],
  // No "Sell / Rent" for a builder: since migration 0067 that role cannot hold
  // a live listing at all, so the tab could only ever render "No listings yet"
  // — a permanently empty tab on every builder profile. Their OWN profile keeps
  // it, because that is where they still see the rows 0067 hid.
  builder: ["Projects"],
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
    | {
        id: string; title: string | null; price: string; coverUrl: string | null;
        areaLabel: string | null; kind: "sell" | "rent"; photoCount: number;
        bhk: string | null; sqft: number | null;
      }[]
    | null
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
          Same language as the redesigned own-profile (29 Jul 2026). A visitor
          still sees only public facts — no status, no leads anywhere below. */}
      <div className="px-4 pt-5">
        <div className="flex items-start gap-3.5">
          <Avatar name={p.name ?? undefined} src={p.photoUrl ?? undefined} size={78} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="truncate text-17 font-bold tracking-[-0.2px] text-ink-primary">{p.name}</h2>
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
          </div>
        </div>

        {p.bio && <p className="mt-3.5 text-13 leading-[1.55] text-ink-secondary">{p.bio}</p>}

        {/* Counts — a real row with its own surface, so one stat looks
            deliberate instead of stranded. */}
        <div className="mt-4 flex items-stretch overflow-hidden rounded-8 border border-border bg-surface-1">
          {/* A builder's Listings count is now structurally 0 (0067), so the
              tile is theirs-only: Projects is the number that means something.
              Everyone else keeps both exactly as before. */}
          {p.role === "builder" ? (
            <Stat n={p.stats.projects ?? 0} label={(p.stats.projects ?? 0) === 1 ? "Project" : "Projects"} />
          ) : (
            <Stat n={p.stats.listings} label={p.stats.listings === 1 ? "Listing" : "Listings"} />
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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-6 border border-border text-ink-secondary active:bg-surface-2"
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
              <span className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-ink-tertiary">
                {c.coverUrl ? (
                  <Img src={c.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="home" size={24} strokeWidth={1.7} />
                )}
              </span>
              <span className="chrome line-clamp-2 w-full text-center text-11 leading-[1.3] text-ink-secondary">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs (live-only). Sticky so the list keeps its context while scrolling.
          A builder has exactly one tab, so it renders as a label rather than as
          a single full-width "tab" that looks like it should have siblings. */}
      {tabs.length === 1 ? (
        <div className="chrome sticky top-header z-sticky mt-5 flex items-center border-b border-border bg-surface-1 px-4 py-3">
          <b className="text-15 font-semibold text-ink-primary">{tabs[0]}</b>
          <TabCount n={projects?.length ?? 0} active />
        </div>
      ) : (
        <div className="chrome sticky top-header z-sticky mt-5 flex border-b border-border bg-surface-1">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "relative flex flex-1 items-center justify-center py-3 text-15 font-semibold transition-colors",
                i === tab ? "text-ink-primary" : "text-ink-tertiary",
              )}
            >
              {t}
              <TabCount
                n={(listings ?? []).filter((l) => (t === "Sell" ? l.kind === "sell" : l.kind === "rent")).length}
                active={i === tab}
              />
              {i === tab && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
            </button>
          ))}
        </div>
      )}
      {/* The list — tab-filtered, same row shapes as the owner's own profile
          minus every owner-only fact. The 2-column tile grid is gone (29 Jul
          2026): one layout, both profiles. */}
      {listings === null ? (
        <div className="flex flex-col gap-2.5 px-3.5 pt-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[138px] w-full rounded-8" />)}
        </div>
      ) : tabs[tab] === "Projects" ? (
        // Real projects, not the listings this tab used to borrow.
        projects === null ? (
          <div className="flex flex-col gap-2.5 px-3.5 pt-3">
            {[0, 1].map((i) => <Skeleton key={i} className="h-[350px] w-full rounded-8" />)}
          </div>
        ) : projects.length === 0 ? (
          <EmptyGrid title="No projects yet" body="This builder hasn't published a project." />
        ) : (
          <CardList>
            {projects.map((pr) => (
              <ProjectCard
                key={pr.id}
                onClick={() => router.push(`/project/${pr.id}`)}
                coverUrl={pr.coverUrl}
                photoCount={pr.photoCount}
                name={pr.name}
                config={publicProjectConfig(pr)}
                priceFrom={pr.priceFrom}
                areaLabel={pr.areaLabel}
                specs={publicProjectSpecs(pr)}
              />
            ))}
          </CardList>
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
          <CardList>
            {shown.map((l) => (
              <ListingCard
                key={l.id}
                onClick={() => router.push(`/property/${l.id}`)}
                coverUrl={l.coverUrl}
                photoCount={l.photoCount}
                price={l.price}
                title={l.title}
                bhk={l.bhk}
                sqft={l.sqft}
                areaLabel={l.areaLabel}
              />
            ))}
          </CardList>
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

/** "Apartments · 2 BHK, 3 BHK · 240 units" — only what the project carries. */
function publicProjectConfig(p: PublicProject) {
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

/** The fact chips on a public project card. RERA is public by design (Doc2 §6). */
function publicProjectSpecs(p: PublicProject) {
  const rera = p.rera ? (p.rera.exempt ? "RERA exempt" : p.rera.number ? `RERA ${p.rera.number}` : null) : null;
  return [
    p.buildStatusLabel,
    p.possessionLabel ? `Poss. ${p.possessionLabel}` : null,
    rera,
  ].filter((s): s is string => Boolean(s));
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
