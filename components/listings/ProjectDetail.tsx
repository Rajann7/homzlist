"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Icon, Skeleton, StatusBadge, Toggle, useToast } from "@/components/billing/ui";
import { OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { listingsApi, type Photo } from "@/lib/listings/client";
import { InquirySheet, LoginSheet, ReportSheet, ShareSheet } from "@/components/feed/sheets";
import type { FeedCard } from "@/lib/feed/client";
import { DETAIL_PAD, DetailHero, DetailSection, DetailSeparator, ProjectDetailBody } from "./detailBody";
import { PhotoViewer, useScrolledPastHero } from "./ListingDetail";
import { cn } from "@/lib/utils";

/**
 * P4 S3 — project detail (redesigned, Rajan 28 Jul 2026).
 *
 * Builder numbers are always public for projects (Doc2 §6), which is why the
 * sticky bar shows Call/WhatsApp unconditionally rather than the request-number
 * flow a normal listing uses.
 *
 * Every figure here — towers, floors, units, unit types, banks, amenities, the
 * scheme's own answers and its description — comes from the project row and
 * `project_units`. Nothing is illustrative. The last two of those were computed
 * by the server and rendered by nobody until this redesign: a plotting scheme
 * stored its land zone, NA/kheti status, plot approval, permissible floors,
 * total plots and booking amount, and the screen showed none of them.
 */
export function ProjectDetail({ id, isGuest = false }: { id: string; isGuest?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [p, setP] = useState<any>(null);
  const [brochure, setBrochure] = useState<{ url: string | null; scanned: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  // The gallery (migration 0075). A project used to carry one `cover_url`, so
  // this screen handed its hero `photos={[]}` and a buyer had nothing to swipe.
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [idx, setIdx] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [sheet, setSheet] = useState<null | "more" | "manage" | "share" | "report" | "units">(null);
  // "Contact builder" now opens an in-app conversation (migration 0084) instead
  // of handing the buyer to WhatsApp, where neither side could find it again.
  // Call and the WhatsApp shortcut are untouched.
  const [inquiry, setInquiry] = useState<{ unitType?: string; unitId?: string } | null>(null);
  const [loginSheet, setLoginSheet] = useState(false);
  // On the public host the viewer is always a guest (middleware strips the
  // session), so an action that writes opens the login sheet instead of firing
  // a request that can only come back 401 — the same gate ListingDetail uses.
  const askBuilder = (unitType?: string, unitId?: string) =>
    isGuest ? setLoginSheet(true) : setInquiry({ unitType, unitId });
  const [unitsBusy, setUnitsBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/projects/${id}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);

    if (!res) { setOffline(true); setLoading(false); return; }
    if (!res.ok) { setNotFound(true); setLoading(false); return; }

    const project = res.data.project;
    setP(project);
    // The brochure is a signed, short-lived URL. A LIVE project's brochure is
    // readable by anyone (it is the builder's own marketing PDF and the rest of
    // the payload is already public); anything not yet live stays owner-only,
    // and the endpoint — not this screen — is what enforces that.
    const ph = await listingsApi.projectPhotos(id);
    if (ph.ok) setPhotos(ph.data.photos);

    if (project?.hasBrochure) {
      const b = await listingsApi.brochure(id);
      if (b.ok) setBrochure(b.data.brochure);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Shell>
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8 w-48 rounded-4" />
          <Skeleton className="h-5 w-40 rounded-4" />
          <Skeleton className="mt-2 h-20 w-full rounded-4" />
          <Skeleton className="h-40 w-full rounded-4" />
        </div>
      </Shell>
    );
  }

  if (notFound || !p) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Icon name="building" size={80} className="text-ink-tertiary" />
          <h2 className="text-20 font-bold text-ink-primary">Project not found</h2>
          <p className="text-15 text-ink-secondary">It may have been removed, or it isn&apos;t approved yet.</p>
          <Button className="mt-2" onClick={() => router.push("/search")}>Browse projects</Button>
        </div>
      </Shell>
    );
  }

  const live = p.status === "live";

  // A builder's number is always public for a project (Doc2 §6), so contact is
  // direct: Call dials it, WhatsApp/Enquire opens a prefilled chat. No inquiry
  // thread — projects have no chat pipeline (that's for listings).
  const contactBuilder = (via: "call" | "whatsapp", unitType?: string) => {
    const number = p.contact?.number ? String(p.contact.number).replace(/\D/g, "") : "";
    if (!number) { toast.show("The builder hasn't shared a contact number"); return; }
    // Record the lead (migration 0051) — fire-and-forget, because the call must
    // connect whether or not this write lands. The server drops it for a guest,
    // the builder's own project, or a non-live one.
    void listingsApi.recordProjectContact(id, via);
    if (via === "call") { window.location.href = `tel:${p.contact.number}`; return; }
    const msg = unitType
      ? `Hi, I'm interested in the ${unitType} at ${p.name}. Could you share more details?`
      : `Hi, I'm interested in ${p.name}. Could you share more details?`;
    window.open(`https://wa.me/91${number.slice(-10)}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const share = () => {
    const url = window.location.href;
    if (navigator.share) void navigator.share({ title: p.name ?? "", url });
    else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
  };

  // The sheets are the feed's own, so they need a card-shaped view. They read
  // id/kind/title/price/area only.
  const card = {
    kind: "project",
    id: p.id,
    promoted: false,
    saved: false,
    coverUrl: p.coverUrl ?? null,
    photos: [],
    areaLabel: p.areaLabel ?? null,
    poster: { id: "", name: p.builderName ?? "", username: p.builder?.username ?? null, role: "builder", verified: Boolean(p.builder?.verified), avatarUrl: p.builder?.avatarUrl ?? null },
    postedAgo: "",
    title: p.name,
    meta: p.projectTypeLabel,
    priceFrom: p.priceFrom,
  } as unknown as FeedCard;

  return (
    <Shell>
      <OverlayHeader
        title={p.name ?? ""}
        canShare={live}
        onShare={share}
        onMore={() => setSheet(p.isOwner ? "manage" : "more")}
      />
      {offline && <OfflineBanner />}

      {/* The scheme's gallery — a real carousel since migration 0075, off
          `project_photos`. Photo #1 IS the cover, same rule a listing uses. */}
      <DetailHero
        photos={photos}
        cover={photos[idx]?.url ?? p.coverUrl}
        alt={photos[idx]?.altText ?? p.name ?? ""}
        idx={idx}
        onIdx={setIdx}
        onOpenPhoto={photos.length ? () => setViewer(true) : undefined}
      />

      {/* The body is shared with the builder's Preview screen (detailBody), so
          "this is what a buyer sees" cannot drift away from what a buyer sees. */}
      <ProjectDetailBody
        project={p}
        openUnit={openUnit}
        onToggleUnit={setOpenUnit}
        onEnquireUnit={(unitType, unitId) => askBuilder(unitType, unitId)}
        brochure={brochure}
        onOpenProfile={(username) => router.push(`/profile/${username}`)}
        notice={p.isOwner ? <OwnerNotice project={p} /> : null}
      />

      {/* Sticky bar — projects always expose the builder's number (Doc2 §6) */}
      <div className="sticky bottom-0 z-sticky mt-auto flex items-center gap-2 border-t border-border bg-surface-1 px-3 py-2.5 safe-bottom">
        {p.isOwner ? (
          <>
            <Button variant="outline" className="flex-1 px-0" onClick={() => router.push(`/projects/new?edit=${p.id}`)}>Edit</Button>
            <Button variant="outline" className="flex-1 px-0" onClick={() => setSheet("units")}>Update units</Button>
            <Button className="flex-1 px-0" onClick={() => router.push(`/projects/${p.id}/insights`)}>Insights</Button>
            <button
              aria-label="More options"
              onClick={() => setSheet("manage")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-4 border border-border text-ink-primary"
            >
              <Icon name="more" size={20} />
            </button>
          </>
        ) : (
          <>
            <button
              aria-label="Call"
              onClick={() => contactBuilder("call")}
              className="grid h-11 w-[52px] shrink-0 place-items-center rounded-4 border border-border bg-surface-1 text-ink-primary"
            >
              <Icon name="phone" size={20} />
            </button>
            <a
              aria-label="WhatsApp"
              onClick={(e) => { e.preventDefault(); contactBuilder("whatsapp"); }}
              href="#"
              className="grid h-11 w-[52px] shrink-0 place-items-center rounded-4 border border-accent bg-accent-soft text-accent"
            >
              <Icon name="whatsapp" size={20} />
            </a>
            <Button fullWidth onClick={() => askBuilder()}>Contact builder</Button>
          </>
        )}
      </div>

      {/* ---- Sheets ---------------------------------------------------- */}
      {/* In-app inquiry — the same sheet a property uses, with the project as
          the subject. A unit-level "Enquire" carries the unit into the message
          itself, because a thread's subject is the project, not the unit. */}
      <InquirySheet
        open={!!inquiry}
        onClose={() => { setInquiry(null); }}
        card={inquiry ? ({ ...card, title: inquiry.unitType ? `${inquiry.unitType} at ${p.name}` : p.name } as FeedCard) : null}
        unitId={inquiry?.unitId}
      />
      <LoginSheet open={loginSheet} onClose={() => setLoginSheet(false)} />

      <BottomSheet open={sheet === "more"} onClose={() => setSheet(null)} title="Options">
        <div className="flex flex-col pb-2">
          <SheetOption icon={<Icon name="share" size={22} className="text-ink-secondary" />} label="Share" onClick={() => setSheet("share")} />
          <SheetOption icon={<Icon name="alert" size={22} className="text-error" />} label="Report" destructive onClick={() => setSheet("report")} />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "manage"} onClose={() => setSheet(null)} title="Manage project">
        <div className="flex flex-col pb-2">
          <SheetOption icon={<Icon name="edit" size={22} className="text-ink-secondary" />} label="Edit project" onClick={() => { setSheet(null); router.push(`/projects/new?edit=${p.id}`); }} />
          <SheetOption icon={<Icon name="camera" size={22} className="text-ink-secondary" />} label="Manage photos" onClick={() => { setSheet(null); router.push(`/create/photos?project=${p.id}`); }} />
          <SheetOption icon={<Icon name="layers" size={22} className="text-ink-secondary" />} label="Update unit availability" onClick={() => setSheet("units")} />
          <SheetOption icon={<Icon name="eye" size={22} className="text-ink-secondary" />} label="Preview as a buyer" onClick={() => { setSheet(null); router.push(`/create/preview?project=${p.id}`); }} />
          <SheetOption icon={<Icon name="chart" size={22} className="text-ink-secondary" />} label="Insights" onClick={() => { setSheet(null); router.push(`/projects/${p.id}/insights`); }} />
          {live && (
            <SheetOption icon={<Icon name="share" size={22} className="text-ink-secondary" />} label="Share" onClick={() => setSheet("share")} />
          )}
          {/* A builder's projects are listed on their own profile (OwnProfile's
              Projects tab) — there is no /projects index route to send them to. */}
          <SheetOption icon={<Icon name="user" size={22} className="text-ink-secondary" />} label="All my projects" onClick={() => { setSheet(null); router.push("/profile"); }} />
        </div>
      </BottomSheet>

      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} card={card} />
      <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} card={card} />

      {/* Per-unit availability. A sold-out 2 BHK is the update a builder makes
          most often, and it was a toast until Module 4's second pass. */}
      <BottomSheet open={sheet === "units"} onClose={() => setSheet(null)} title="Update units">
        <div className="flex flex-col gap-2 p-4 pb-2">
          {(p.units ?? []).map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 rounded-4 border border-border px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-15 text-ink-primary">{u.unitType}</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">
                  {u.available ? "Available" : "Sold out"}
                  {u.unitsAvailable != null ? ` · ${u.unitsAvailable} units` : ""}
                </div>
              </div>
              <Toggle
                checked={Boolean(u.available)}
                disabled={unitsBusy}
                label={`${u.unitType} available`}
                onChange={async (on) => {
                  setUnitsBusy(true);
                  const r = await listingsApi.updateProjectUnits(p.id, [{ id: u.id, available: on }]);
                  setUnitsBusy(false);
                  if (r.ok) { setP((prev: any) => ({ ...r.data.project, ...ownerKeys(prev) })); toast.show(on ? "Marked available" : "Marked sold out"); }
                  else toast.show("Couldn't update that unit");
                }}
              />
            </div>
          ))}
          {!(p.units ?? []).length && (
            <p className="py-6 text-center text-13 text-ink-secondary">No unit types on this project yet.</p>
          )}
        </div>
      </BottomSheet>
      {viewer && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          index={idx}
          onIndex={setIdx}
          onClose={() => setViewer(false)}
          onShare={share}
        />
      )}
    </Shell>
  );
}

/**
 * `PATCH /projects/:id/units` answers with the plain project DTO — it has no
 * `isOwner`, `contact` or `builder` on it, because those are assembled by
 * `getProject` for a specific viewer. Splicing the response in wholesale
 * therefore logged the builder out of their own screen: the owner bar became
 * the buyer bar and Call had no number behind it. These keys are carried over.
 */
function ownerKeys(prev: any) {
  return {
    isOwner: prev?.isOwner,
    contact: prev?.contact,
    builder: prev?.builder,
    builderName: prev?.builderName,
    profileId: prev?.profileId,
    owner: prev?.owner,
    hasBrochure: prev?.hasBrochure,
    postedOn: prev?.postedOn,
  };
}

/** The builder's own status block — the badge and the review team's words. */
function OwnerNotice({ project }: { project: any }) {
  // Owner-only keys — a visitor's payload has no `owner` block at all.
  const notes = project.owner?.rejectReason || project.owner?.reviewNotes;
  return (
    <>
      <DetailSeparator />
      <DetailSection
        icon="lock"
        tone={project.status === "live" ? "accent" : "warning"}
        title="Only you can see this"
      >
        <div className={cn("flex items-center justify-between gap-3 py-2.5", DETAIL_PAD)}>
          <span className="text-13 leading-none text-ink-tertiary">Status</span>
          <StatusBadge kind={project.badge?.kind ?? "pending"} label={project.badge?.label} />
        </div>
        {project.status !== "live" && (
          <div className={cn("border-t border-divider py-3 text-13 leading-[1.45] text-ink-secondary", DETAIL_PAD)}>
            {project.status === "pending_review"
              ? "This project is under review. Only you can see it until it's approved."
              : "Only you can see this project right now."}
          </div>
        )}
        {notes && (
          <div className={cn("border-t border-divider py-3", DETAIL_PAD)}>
            <div className="text-11 uppercase leading-none tracking-[0.4px] text-ink-tertiary">From the review team</div>
            <p className="mt-1.5 text-13 leading-[1.45] text-ink-secondary">{notes}</p>
          </div>
        )}
      </DetailSection>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell showNav={false} className="flex flex-col">
      {children}
    </AppShell>
  );
}

/**
 * The same morphing bar as the property detail: transparent over the cover,
 * solid with the project name once scrolled. It shares
 * `useScrolledPastHero`, so the two headers cannot behave differently — and,
 * like that one, it no longer listens to a `window` scroll event that AppShell
 * never fires.
 */
function OverlayHeader({
  title, canShare, onShare, onMore,
}: { title: string; canShare: boolean; onShare: () => void; onMore: () => void }) {
  const router = useRouter();
  const solid = useScrolledPastHero();

  const btn = cn(
    "grid h-11 w-11 shrink-0 place-items-center",
    solid ? "text-ink-primary" : "text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.5))]",
  );

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-header mx-auto flex h-[52px] max-w-column items-center gap-0.5 px-1.5 safe-top transition-colors duration-200",
        solid
          ? "border-b border-border bg-surface-1"
          : "border-b border-transparent bg-gradient-to-b from-black/35 to-transparent",
      )}
    >
      <button aria-label="Back" onClick={() => router.back()} className={btn}>
        <Icon name="chevron-left" size={22} />
      </button>
      <span
        className={cn(
          "flex-1 truncate px-1 text-center text-15 font-semibold leading-[1.2] text-ink-primary transition-opacity duration-200",
          solid ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </span>
      {/* The Save control that used to sit here was a `useState` toggle with a
          "Saved lists arrive with the Saved suite" toast — it persisted nothing,
          and `saves` is keyed to `listings`, so a project has never been
          savable. A control that only pretends is worse than no control, so it
          is gone; project saves are recorded in docs/PENDING-INTEGRATIONS.md
          rather than faked here. */}
      {canShare && (
        <button aria-label="Share" onClick={onShare} className={btn}>
          <Icon name="share" size={21} />
        </button>
      )}
      <button aria-label="More" onClick={onMore} className={btn}>
        <Icon name="more" size={21} />
      </button>
    </div>
  );
}
