"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, Toggle, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner } from "@/components/billing/primitives";
import { listingsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P4 S3 — project detail.
 *
 * Builder numbers are always public for projects (Doc2 §6), which is why the
 * sticky bar shows Call/WhatsApp unconditionally rather than the request-number
 * flow a normal listing uses.
 *
 * Every figure here — towers, floors, units, unit types, banks, amenities —
 * comes from the project row and `project_units`. Nothing is illustrative.
 */
export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [p, setP] = useState<any>(null);
  const [brochure, setBrochure] = useState<{ url: string | null; scanned: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  // "Update Units" was a toast. The PATCH endpoint has existed since Module 4's
  // first pass — this is the sheet that finally reaches it.
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitsBusy, setUnitsBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/projects/${id}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .catch(() => null);

    if (!res) { setOffline(true); setLoading(false); return; }
    if (!res.ok) { setNotFound(true); setLoading(false); return; }

    setP(res.data.project);
    if (res.data.project?.isOwner) {
      const b = await listingsApi.brochure(id);
      if (b.ok) setBrochure(b.data.brochure);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="aspect-[4/3] w-full rounded-12" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[120px] w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  if (notFound || !p) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-20 font-bold text-ink-primary">Project not found</h2>
          <p className="text-15 text-ink-secondary">It may have been removed or is not yet approved.</p>
          <Button className="mt-2" onClick={() => router.push("/listings")}>Go to My Listings</Button>
        </div>
      </Shell>
    );
  }

  const units: any[] = p.units ?? [];
  const priceBand = bandOf(units);

  // A builder's number is always public for a project (Doc2 §6), so contact is
  // direct: Call dials it, WhatsApp/Enquire opens a prefilled chat. No inquiry
  // thread — projects have no chat pipeline (that's for listings).
  const contactBuilder = (via: "call" | "whatsapp", unitType?: string) => {
    const number = p.contact?.number ? String(p.contact.number).replace(/\D/g, "") : "";
    if (!number) { toast.show("The builder hasn't shared a contact number"); return; }
    // Record the lead (migration 0051). Both buttons used to leave no trace at
    // all, which is why a builder's insights had nothing to count.
    // Fire-and-forget: the call must connect whether or not this write lands,
    // and the server drops it for a guest, the builder's own project, or a
    // non-live one.
    void listingsApi.recordProjectContact(id, via);
    if (via === "call") { window.location.href = `tel:${p.contact.number}`; return; }
    const msg = unitType
      ? `Hi, I'm interested in the ${unitType} at ${p.name}. Could you share more details?`
      : `Hi, I'm interested in ${p.name}. Could you share more details?`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Share only on a live project — any other status is owner-only, so the
  // shared link would 404 for whoever receives it.
  return (
    <Shell overlayTitle={p.name ?? ""} canShare={p.status === "live"}>
      {offline && <OfflineBanner />}

      {/* Cover — full-bleed 4:3 on black with the counter over it (designs/P4 S3) */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={40} /></span>
        )}
        {/* A project has ONE image — `projects.cover_url`; there is no project
            photo table, so this counter read `p.photoCount`, which the project
            DTO has never returned. `?? 0` makes that explicit instead of
            comparing undefined and quietly rendering nothing (tracked in
            docs/PENDING-INTEGRATIONS.md — project galleries are a module). */}
        {(p.photoCount ?? 0) > 1 && (
          <span className="absolute right-3 top-14 rounded-full bg-black/60 px-2.5 py-1.5 text-11 font-semibold leading-none text-white">
            1/{p.photoCount}
          </span>
        )}
      </div>

      <div className="p-4 pb-32">
        {/* Title block */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-24 font-bold leading-[1.15] text-ink-primary">{p.name}</h1>
          <span className="rounded-4 bg-info-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-info">
            New Project
          </span>
        </div>
        {p.builderName && (
          <div className="mt-[5px] text-13 leading-[1.3] text-ink-secondary">by {p.builderName}</div>
        )}
        {priceBand && <div className="mt-2.5 text-17 font-semibold leading-[1.2] text-ink-primary">{priceBand}</div>}

        {/* Status chips — a horizontal rail, not a wrapping row */}
        <div className="hz-x -mx-4 mt-3.5 flex gap-2 px-4">
          {p.buildStatusLabel && (
            <span className="inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-full bg-warning-soft px-3 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning">
              {p.buildStatusLabel}
            </span>
          )}
          {p.possessionLabel && (
            <span className="inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-full bg-surface-2 px-3 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-ink-secondary">
              Possession {p.possessionLabel}
            </span>
          )}
          {(p.rera?.number || p.rera?.exempt) && (
            <span className="inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-full bg-accent-soft px-3 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
              {p.rera.exempt ? "RERA Exempt" : "RERA Approved"}
            </span>
          )}
        </div>

        {/* RERA number — the design puts it in a surface-2 strip with a shield */}
        {p.rera?.number && (
          <div className="mt-3.5 flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5">
            <Icon name="shield" size={15} className="shrink-0 text-ink-tertiary" />
            <span className="selectable text-11 leading-[1.4] text-ink-tertiary">RERA No: {p.rera.number}</span>
          </div>
        )}
        {p.rera?.exempt && p.rera?.reason && (
          <div className="mt-3.5 flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5">
            <Icon name="shield" size={15} className="shrink-0 text-ink-tertiary" />
            <span className="text-11 leading-[1.4] text-ink-tertiary">RERA exempt — {p.rera.reason}</span>
          </div>
        )}

        {/* Facts strip — only the facts that exist */}
        {facts(p).length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-0.5 rounded-12 bg-surface-2 px-2 py-3.5">
            {facts(p).map((f) => (
              <div key={f.label} className="text-center">
                <div className="text-15 font-semibold leading-[1.1] text-ink-primary">{f.value}</div>
                <div className="mt-[3px] text-11 leading-[1.2] text-ink-tertiary">{f.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Unit types — expandable rows */}
        {units.length > 0 && (
          <section className="flex flex-col gap-2">
            <ProjectSection>Available Units</ProjectSection>
            {units.map((u) => {
              const open = openUnit === u.id;
              return (
                <div key={u.id} className="overflow-hidden rounded-8 border border-border">
                  <button
                    onClick={() => setOpenUnit(open ? null : u.id)}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <span className="min-w-0 flex-1 text-15 font-semibold text-ink-primary">
                      {[u.unitType, u.areaSqft && `${u.areaSqft.toLocaleString("en-IN")} sqft`, u.priceFrom && `${u.priceFrom} onwards`]
                        .filter(Boolean).join(" — ")}
                    </span>
                    <Icon name={open ? "chevron-down" : "chevron-right"} size={18} className="shrink-0 text-ink-tertiary" />
                  </button>

                  {/* design: floor-plan thumb on the LEFT, facts stacked beside it */}
                  {open && (
                    <div className="flex gap-3 px-3 pb-3">
                      {u.floorPlanUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.floorPlanUrl}
                          alt="Floor plan"
                          data-protected="true"
                          className="h-[88px] w-[88px] shrink-0 rounded-8 object-cover"
                        />
                      )}
                      <div className="flex-1">
                        {u.carpetSqft && (
                          <div className="text-13 leading-[1.5] text-ink-secondary">
                            Carpet area: {u.carpetSqft.toLocaleString("en-IN")} sqft
                          </div>
                        )}
                        {u.unitsAvailable !== null && u.unitsAvailable !== undefined && (
                          <div className="text-13 leading-[1.5] text-ink-secondary">
                            {u.unitsAvailable} units available
                          </div>
                        )}
                        <button
                          onClick={() => contactBuilder("whatsapp", u.unitType)}
                          className="mt-1 text-13 font-semibold leading-none text-accent"
                        >
                          Enquire about this unit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Banks */}
        {!!(p.bankApprovals ?? []).length && (
          <section className="flex flex-col gap-2">
            <ProjectSection>Bank approvals</ProjectSection>
            <div className="flex flex-wrap gap-2">
              {p.bankApprovals.map((b: string) => (
                <span key={b} className="rounded-full bg-accent-soft px-3 py-1.5 text-13 font-semibold text-accent">{b}</span>
              ))}
            </div>
          </section>
        )}

        {/* Amenities */}
        {!!(p.amenities ?? []).length && (
          <section className="flex flex-col gap-2">
            <ProjectSection>Amenities</ProjectSection>
            <div className="grid grid-cols-3 gap-3">
              {p.amenities.map((a: string) => (
                <div key={a} className="flex flex-col items-center gap-1.5 rounded-8 bg-surface-2 p-3 text-center">
                  <Icon name="check" size={18} className="text-accent" />
                  <span className="text-11 leading-tight text-ink-secondary">{a}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Brochure — owner sees a signed link; scanned state comes from the DB */}
        {p.isOwner && brochure?.url && (
          <a
            href={brochure.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 items-center gap-3 rounded-8 bg-surface-2 px-4"
          >
            <Icon name="file" size={20} className="text-ink-secondary" />
            <div className="flex-1">
              <div className="text-15 font-semibold text-ink-primary">Project Brochure</div>
              <div className="text-11 text-ink-tertiary">{brochure.scanned ? "Scanned ✓" : "Pending scan"}</div>
            </div>
            <Icon name="download" size={20} className="text-ink-secondary" />
          </a>
        )}

        {/* Location */}
        {(p.areaLabel || p.pincode) && (
          <div className="flex items-center gap-1.5 text-13 text-ink-secondary">
            <Icon name="pin" size={15} />
            {[p.areaLabel, p.pincode].filter(Boolean).join(" – ")}
          </div>
        )}
      </div>

      {/* Sticky bar — projects always expose the builder's number (Doc2 §6) */}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface-1 p-4">
        {p.isOwner ? (
          <>
            <Button variant="outline" className="flex-1" onClick={() => router.push(`/projects/new?edit=${p.id}`)}>Edit</Button>
            <Button variant="outline" className="flex-1" onClick={() => setUnitsOpen(true)}>
              Update Units
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => contactBuilder("call")} aria-label="Call">
              <Icon name="phone" size={18} />
            </Button>
            <Button variant="outline" onClick={() => contactBuilder("whatsapp")} aria-label="WhatsApp">
              <Icon name="whatsapp" size={18} />
            </Button>
            <Button className="flex-1" onClick={() => contactBuilder("whatsapp")}>
              Send Inquiry
            </Button>
          </>
        )}
      </div>

      {/* Per-unit availability. A sold-out 2 BHK is the update a builder makes
          most often, and it was a toast until now. */}
      <BottomSheet open={unitsOpen} onClose={() => setUnitsOpen(false)} title="Update units">
        <div className="flex flex-col gap-2 p-4 pb-2">
          {(p.units ?? []).map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 rounded-8 bg-surface-2 px-3.5 py-3">
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
                  if (r.ok) { setP(r.data.project); toast.show(on ? "Marked available" : "Marked sold out"); }
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
    </Shell>
  );
}

function Shell({
  children, overlayTitle, canShare = false,
}: { children: React.ReactNode; overlayTitle?: string; canShare?: boolean }) {
  return (
    <AppShell showNav={false} className="flex flex-col">
      {overlayTitle === undefined ? (
        <Header left={<BackButton fallback="/listings" />} title="Project" />
      ) : (
        <OverlayHeader title={overlayTitle} canShare={canShare} />
      )}
      {children}
    </AppShell>
  );
}

/**
 * designs/P4 S3 uses the same "morphing" bar as the property detail:
 * transparent over the cover, solid with the project name once scrolled.
 */
function OverlayHeader({ title, canShare }: { title: string; canShare: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 160);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const btn = cn(
    "grid h-11 w-11 shrink-0 place-items-center",
    solid ? "text-ink-primary" : "text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.5))]",
  );

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-header flex h-[52px] items-center gap-0.5 px-1.5 safe-top transition-colors duration-200",
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
          "Saved lists arrive with the Saved suite" toast — it persisted
          nothing, and `saves` is keyed to `listings`, so a project has never
          been savable. A control that only pretends is worse than no control,
          so it is gone; project saves are recorded in
          docs/PENDING-INTEGRATIONS.md rather than faked here. */}
      {canShare && (
        <button
          aria-label="Share"
          onClick={() => {
            const url = window.location.href;
            if (navigator.share) void navigator.share({ title, url });
            else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
          }}
          className={btn}
        >
          <Icon name="share" size={21} />
        </button>
      )}
    </div>
  );
}

/**
 * Section heading on the project detail: 13/600 ink2 in sentence case, with
 * the design's 24px above / 12px below. `SectionLabel` renders an uppercase
 * chrome label, which is a different thing (designs/P4 S3).
 */
function ProjectSection({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 mt-6 text-13 font-semibold leading-none text-ink-secondary">{children}</div>;
}

/** "₹45 Lakh – ₹78 Lakh" from the actual unit prices. */
function bandOf(units: any[]): string | null {
  const prices = units.map((u) => u.priceFromPaise).filter((n: unknown): n is number => typeof n === "number" && n > 0);
  if (!prices.length) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const fmt = (paise: number) => {
    const n = paise / 100;
    if (n >= 1_00_00_000) return `₹${+(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000) return `₹${+(n / 1_00_000).toFixed(2)} Lakh`;
    return `₹${n.toLocaleString("en-IN")}`;
  };
  return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
}

/** The 4-column facts strip, skipping anything the builder didn't fill in. */
function facts(p: any): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (p.towers) out.push({ label: "Towers", value: String(p.towers) });
  if (p.floors) out.push({ label: "Floors", value: `G+${p.floors}` });
  if (p.totalUnits) out.push({ label: "Units", value: String(p.totalUnits) });
  if (p.availableUnits !== null && p.availableUnits !== undefined) {
    out.push({ label: "Available", value: String(p.availableUnits) });
  }
  return out;
}
