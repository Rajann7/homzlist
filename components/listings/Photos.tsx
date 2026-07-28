"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Header, Icon, Spinner, useToast } from "@/components/billing/ui";
import { listingsApi, uploadPhotos, type Photo } from "@/lib/listings/client";
import { PhotoEditorSheet, PhotoTileSheet } from "./PhotoEditor";
import { cn } from "@/lib/utils";

/**
 * P5 S5 — Photos, for a listing (`?listing=`) or a project (`?project=`).
 *
 * Cover = the first tile (Doc2 §5.2), so reordering IS choosing the cover.
 * Uploads go presign → direct-to-storage → commit, and a file that fails is
 * reported on its own tile with a retry rather than sinking the whole batch.
 * The per-role cap is the server's answer; this only reflects it.
 *
 * The project half is migration 0075: the project form has always told builders
 * "photos are added from the project's photo screen", and there was no such
 * screen, no endpoint and no table — a scheme carried one cover image. Rather
 * than a second grid that drifts from this one, the same screen points at the
 * project routes.
 */
export function Photos() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const projectId = params.get("project") ?? "";
  const isProject = Boolean(projectId);
  const listingId = projectId || (params.get("listing") ?? "");
  const subject = isProject ? "projects" as const : "listings" as const;

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [capacity, setCapacity] = useState<{ max: number | null; used: number; remaining: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [tile, setTile] = useState<{ photo: Photo; index: number } | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!listingId) return;
    const r = isProject ? await listingsApi.projectPhotos(listingId) : await listingsApi.photos(listingId);
    if (r.ok) {
      setPhotos(r.data.photos);
      // The "6 / 10" counter is the server's per-role cap, not a client guess.
      setCapacity(r.data.capacity ?? null);
    }
  }, [listingId, isProject]);

  /**
   * Once a listing has left `draft` it is queued for review, and the creation
   * steps must not be re-enterable — otherwise backing out of the success
   * screen drops you into the photo grid of an already-submitted listing.
   * Bounce to the manager instead, replacing history so back doesn't loop.
   */
  useEffect(() => {
    if (!listingId || isProject) return;
    void listingsApi.get(listingId).then((r) => {
      if (r.ok && r.data.listing.status !== "draft") router.replace("/listings");
    });
  }, [listingId, isProject, router]);

  useEffect(() => {
    void load();
    // One-time sample-photo guide (Doc2 §5.2). UI-only preference, so
    // localStorage is legitimate here — no business data involved.
    if (typeof window !== "undefined" && !localStorage.getItem("hz_photo_guide_seen")) {
      setGuideOpen(true);
      localStorage.setItem("hz_photo_guide_seen", "1");
    }
  }, [load]);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;

    // Take as many as still fit and say what was left out. Sending the whole
    // selection meant that picking 7 photos with 6 slots free was refused
    // wholesale at presign — the user got "you've reached the photo limit" and
    // NONE of the seven uploaded. The cap itself stays the server's (it re-checks
    // at presign and again at commit); this only stops us asking for the
    // impossible.
    let chosen = Array.from(files);
    const room = capacity?.remaining ?? null;
    if (room !== null && chosen.length > room) {
      const dropped = chosen.length - room;
      chosen = chosen.slice(0, room);
      toast.show(
        room === 0
          ? `You've already added the maximum of ${capacity?.max} photos`
          : `Only ${room} more photo${room > 1 ? "s" : ""} fit — ${dropped} weren't added`,
      );
      if (!room) return;
    }

    setBusy(true);
    setProgress({ done: 0, total: chosen.length });
    const res = await uploadPhotos(listingId, chosen, (done, total) => setProgress({ done, total }), subject);
    setBusy(false);
    setProgress(null);
    if (res.photos) setPhotos(res.photos);
    if (!res.ok) toast.show(res.error ?? "Upload failed");
    else if (res.failed.length) toast.show(`${res.failed.length} photo${res.failed.length > 1 ? "s" : ""} failed — tap retry`);
    // Never crop silently: tell the user, and point at the editor so they can
    // re-frame it themselves if our centre-crop cut the wrong part.
    else if (res.autoCropped) {
      toast.show(
        res.autoCropped === 1
          ? "1 photo was cropped to fit — tap ⋯ to adjust"
          : `${res.autoCropped} photos were cropped to fit — tap ⋯ to adjust`,
      );
    }
    void load();
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setPhotos(next); // optimistic — reverted by the reload if the server disagrees
    const r = isProject
      ? await listingsApi.reorderProjectPhotos(listingId, next.map((p) => p.id))
      : await listingsApi.reorderPhotos(listingId, next.map((p) => p.id));
    if (r.ok) setPhotos(r.data.photos);
    else void load();
  };

  const remove = async (photoId: string) => {
    const r = isProject ? await listingsApi.deleteProjectPhoto(listingId, photoId) : await listingsApi.deletePhoto(listingId, photoId);
    if (r.ok) setPhotos(r.data.photos);
    else toast.show("Couldn't remove that photo");
  };

  /** "Set as cover" = move to position 0 — the cover IS the first photo (Doc2 §5.2). */
  const setCover = async (index: number) => {
    setTile(null);
    await move(index, 0);
    toast.show("Cover updated");
  };

  const saveLabel = async (photoId: string, text: string) => {
    setTile(null);
    const r = isProject ? await listingsApi.labelProjectPhoto(listingId, photoId, text) : await listingsApi.labelPhoto(listingId, photoId, text);
    if (r.ok) setPhotos(r.data.photos);
    else toast.show("Couldn't save that label");
  };

  /**
   * An edited photo is a NEW upload: the edited bytes go through presign →
   * PUT → commit like any other file, so they get the same server-side
   * validation, and the original is removed only once the new one is in.
   */
  const saveEdit = async (original: Photo, blob: Blob) => {
    setEditing(null);
    setBusy(true);
    const file = new File([blob], `edited-${Date.now()}.jpg`, { type: "image/jpeg" });
    const res = await uploadPhotos(listingId, [file], undefined, subject);
    if (!res.ok) {
      setBusy(false);
      toast.show(res.error ?? "Couldn't save the edit");
      return;
    }
    const del = isProject ? await listingsApi.deleteProjectPhoto(listingId, original.id) : await listingsApi.deletePhoto(listingId, original.id);
    setBusy(false);
    if (del.ok) setPhotos(del.data.photos);
    else void load();
    toast.show("Photo updated");
  };

  const ready = photos.filter((p) => p.status !== "failed").length;
  // A builder is uncapped, so `max: null` is "never full" — not "full at null".
  const full = capacity?.max != null && photos.length >= capacity.max;
  // designs/P5 S5 puts "6 / 10" at the top-right; a builder is uncapped, so the
  // server sends max: null and the counter shows the count alone.
  const counter = capacity
    ? capacity.max === null
      ? String(photos.length)
      : `${photos.length} / ${capacity.max}`
    : "";

  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          // Not `router.back()`: by the time you reach this step the listing
          // EXISTS and has drawn a slot, and the entry before it was the form —
          // or, after a PLAN_REQUIRED bounce, the plan wall, which is how
          // backing out of the photo step offered a paying customer the plan
          // wall again. The manager is where the half-finished draft is, with a
          // Continue on it, so leaving the step lands somewhere it resumes.
          left={
            <button
              aria-label="Back"
              onClick={() => router.push(isProject ? `/project/${listingId}` : "/listings")}
              className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
            >
              <Icon name="arrow-left" size={22} strokeWidth={1.9} />
            </button>
          }
          title="Add photos"
          centerTitle
          right={<span className="px-2 text-13 leading-none text-ink-tertiary">{counter}</span>}
        />
      }
    >
      {/* creation step dots — photos is step 3 of 4. A project's gallery is
          reached from the project itself, not from a 4-step wizard, so it has
          no step indicator. */}
      {!isProject && (
        <div className="flex shrink-0 justify-center gap-1 py-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("h-1.5 w-1.5 rounded-full", i === 2 ? "bg-accent" : "bg-border")}
            />
          ))}
        </div>
      )}

      <div className="px-4 pb-28 pt-2">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) void move(dragIdx, i); setDragIdx(null); }}
              className={cn(
                "relative aspect-square overflow-hidden rounded-8 bg-surface-3",
                p.status === "failed" && "ring-2 ring-error",
              )}
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.altText ?? ""} className="h-full w-full object-cover" />
              )}

              {p.status === "processing" && (
                <span className="absolute inset-0 grid place-items-center bg-black/40">
                  <Spinner size={20} className="text-white" />
                </span>
              )}
              {p.status === "failed" && (
                <span className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-1.5 bg-error-soft px-1 text-center">
                  <span className="text-11 leading-[1.2] text-error">Couldn&apos;t process</span>
                  {/* This used to say "Retry" and open the file picker, which
                      uploads a DIFFERENT file and leaves the broken row on the
                      grid forever — a tile nothing can clear. The bytes are
                      gone, so the honest action is to remove it and add another
                      from the tile next door. */}
                  <button
                    onClick={() => void remove(p.id)}
                    className="h-[26px] rounded-full bg-accent px-2.5 text-11 font-semibold leading-none text-white"
                  >
                    Remove
                  </button>
                </span>
              )}

              {p.isCover && (
                <span className="absolute left-1.5 top-1.5 z-[3] rounded-4 bg-accent-soft px-1.5 py-[3px] text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
                  Cover
                </span>
              )}

              {/* ⋯ mini-button (design: top-right, 30px, black-60% circle) */}
              <button
                onClick={() => setTile({ photo: p, index: i })}
                aria-label="Photo options"
                className="absolute right-1.5 top-1.5 z-[4] grid h-[30px] w-[30px] place-items-center rounded-full bg-black/60 text-white"
              >
                <Icon name="more" size={16} />
              </button>

              {p.altText && (
                <span className="absolute inset-x-1.5 bottom-1.5 z-[3] truncate rounded-4 bg-black/60 px-1.5 py-[3px] text-11 leading-[1.2] text-white">
                  {p.altText}
                </span>
              )}
            </div>
          ))}

          {/* At the cap the tile goes away rather than opening a picker whose
              every choice would be refused. */}
          {full ? (
            <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-8 border-[1.5px] border-dashed border-border px-2 text-center text-ink-tertiary">
              <Icon name="check" size={20} className="text-accent" />
              <span className="text-11 leading-[1.2]">All {capacity?.max} added</span>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-8 border-[1.5px] border-dashed border-border text-ink-tertiary active:bg-surface-2"
            >
              {busy ? <Spinner size={22} /> : <Icon name="plus" size={24} />}
              <span className="text-11 leading-none">Add photos</span>
            </button>
          )}
        </div>

        {progress && (
          <div className="mt-3 text-center text-11 text-ink-tertiary">
            Uploading {progress.done} of {progress.total}…
          </div>
        )}

        {/* format hint (design: surface-2 row with an image glyph) */}
        <div className="mt-4 flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5">
          <Icon name="image" size={16} className="shrink-0 text-ink-tertiary" />
          <span className="text-11 leading-[1.4] text-ink-tertiary">
            Recommended 1200×1500 px or larger · JPG, PNG, HEIC · we compress automatically
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          hidden
          onChange={(e) => { void pick(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* The design keeps ONE label and disables it — a button that renames
          itself reads as a different button (designs/P5 S5). */}
      <div className="sticky bottom-0 z-sticky mt-auto border-t border-border bg-surface-1 px-4 py-3 shadow-l2 safe-bottom">
        <Button
          fullWidth
          disabled={!ready}
          onClick={() => router.push(isProject ? `/project/${listingId}` : `/create/preview?listing=${listingId}`)}
        >
          {isProject ? "Done" : "Continue to Preview"}
        </Button>
      </div>

      <PhotoTileSheet
        open={Boolean(tile)}
        isCover={tile?.index === 0}
        label={tile?.photo.altText ?? null}
        onClose={() => setTile(null)}
        onSetCover={() => void setCover(tile!.index)}
        onEdit={() => { setEditing(tile!.photo); setTile(null); }}
        onLabel={(text) => void saveLabel(tile!.photo.id, text)}
        onDelete={() => { const id = tile!.photo.id; setTile(null); void remove(id); }}
      />

      <PhotoEditorSheet
        open={Boolean(editing)}
        src={editing?.url ?? null}
        onClose={() => setEditing(null)}
        onSave={(blob) => saveEdit(editing!, blob)}
      />

      {/* First-run guide. The design is a CENTERED dialog with four example
          shots — not a bottom sheet (designs/P5 S5 `guideOpen`). */}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setGuideOpen(false)}
          className="fixed inset-0 z-dialog grid animate-scrim-in place-items-center bg-[color:var(--scrim-sheet)] p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full animate-toast-in rounded-12 bg-surface-1 p-4 shadow-l3 dark:border dark:border-border"
          >
            <div className="text-17 font-semibold leading-[1.3] text-ink-primary">
              Photos that get more inquiries
            </div>

            <div className="my-3.5 grid grid-cols-2 gap-2">
              {["Exterior / building", "Living room", "Kitchen", "Bedroom"].map((label) => (
                <div key={label}>
                  <div className="aspect-[4/3] rounded-8 bg-surface-2" />
                  <div className="mt-1 text-11 leading-none text-ink-tertiary">{label}</div>
                </div>
              ))}
            </div>

            <div className="mb-3.5 flex flex-col gap-1.5">
              {["Shoot in daylight", "Keep the room tidy", "Add at least 5 photos"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <Icon name="check" size={15} className="shrink-0 text-accent" />
                  <span className="text-13 leading-[1.3] text-ink-secondary">{t}</span>
                </div>
              ))}
            </div>

            <Button fullWidth onClick={() => setGuideOpen(false)}>Got it</Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
