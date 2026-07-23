"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet, Button, Icon } from "@/components/billing/ui";
import { cn } from "@/lib/utils";

/**
 * P5 S5 — the photo editor sheet: Crop / Rotate / Brightness.
 *
 * The edit is applied to real pixels on a canvas and handed back as a JPEG
 * Blob; the caller re-uploads it through the normal presign → PUT → commit path
 * so the edited file goes through the same server-side magic-byte validation as
 * any other upload. Nothing is "edited" only in CSS.
 *
 * Crop aspects are the design's: 4:5 (recommended), 1:1, Original.
 */

export type CropAspect = "4:5" | "1:1" | "original";

const ASPECTS: { value: CropAspect; label: string }[] = [
  { value: "4:5", label: "4:5 recommended" },
  { value: "1:1", label: "1:1" },
  { value: "original", label: "Original" },
];

type Tool = "crop" | "rotate" | "brightness";

export function PhotoEditorSheet({
  open, src, onClose, onSave,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
  onSave: (blob: Blob) => void | Promise<void>;
}) {
  const [tool, setTool] = useState<Tool>("crop");
  const [aspect, setAspect] = useState<CropAspect>("4:5");
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTool("crop");
    setAspect("4:5");
    setRotation(0);
    setBrightness(100);
    setSaving(false);
  }, [open]);

  const dirty = aspect !== "4:5" || rotation !== 0 || brightness !== 100;

  function reset() {
    setAspect("4:5");
    setRotation(0);
    setBrightness(100);
  }

  async function save() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const blob = await renderEdit(img, { aspect, rotation, brightness });
      if (blob) await onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  // The live preview uses the same numbers the canvas will use, so what the
  // user approves is what gets written.
  const previewStyle: React.CSSProperties = {
    filter: `brightness(${brightness}%)`,
    transform: `rotate(${rotation}deg)`,
    aspectRatio: aspect === "4:5" ? "4 / 5" : aspect === "1:1" ? "1 / 1" : undefined,
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit photo">
      <div className="px-4">
        {/* 4:5 preview, no frame overlay — the aspect IS the frame (designs/P5) */}
        <div className="overflow-hidden rounded-8 bg-surface-3" style={{ aspectRatio: "4 / 5" }}>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              style={previewStyle}
              className="h-full w-full object-cover transition-[filter,transform] duration-150"
            />
          )}
        </div>

        {/* segmented control (design: one surface-2 track, 3px padding) */}
        <div className="mt-4 flex rounded-8 bg-surface-2 p-[3px]">
          {([
            ["crop", "Crop"],
            ["rotate", "Rotate"],
            ["brightness", "Brightness"],
          ] as [Tool, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={cn(
                // 6px is the design's inner radius for a segment inside the
                // 8px track; it is not one of Doc1's radius tokens.
                "h-8 flex-1 rounded-[6px] text-13 font-semibold leading-none",
                tool === t ? "bg-surface-1 text-ink-primary shadow-l1" : "bg-transparent text-ink-tertiary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tool === "crop" && (
          <div className="mt-3.5 flex gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                onClick={() => setAspect(a.value)}
                className={cn(
                  "h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-13 font-semibold leading-none",
                  aspect === a.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-ink-primary",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {tool === "rotate" && (
          <div className="mt-3.5 flex gap-3">
            <button
              aria-label="Rotate left"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              className="grid h-11 w-[52px] place-items-center rounded-8 border border-border bg-surface-2 text-ink-primary"
            >
              <Icon name="rotate-ccw" size={20} />
            </button>
            <button
              aria-label="Rotate right"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="grid h-11 w-[52px] place-items-center rounded-8 border border-border bg-surface-2 text-ink-primary"
            >
              <Icon name="rotate-cw" size={20} />
            </button>
          </div>
        )}

        {tool === "brightness" && (
          <input
            type="range"
            min={50}
            max={150}
            value={brightness}
            aria-label="Brightness"
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="mt-4 w-full accent-accent"
          />
        )}
      </div>

      {/* footer bar (design: Reset as an accent text link, Save fills the rest) */}
      <div className="mt-4 flex items-center gap-3 border-t border-border bg-surface-1 px-4 py-3">
        <button
          onClick={reset}
          disabled={!dirty}
          className={cn("text-15 font-semibold leading-none", dirty ? "text-accent" : "text-ink-disabled")}
        >
          Reset
        </button>
        <Button fullWidth loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </BottomSheet>
  );
}

/**
 * Bake the edit into pixels. Rotation is applied first (so the crop frames the
 * rotated image, which is what the preview shows), then the aspect crop is
 * taken from the centre, then brightness.
 */
async function renderEdit(
  img: HTMLImageElement,
  opts: { aspect: CropAspect; rotation: number; brightness: number },
): Promise<Blob | null> {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return null;

  const quarterTurned = opts.rotation % 180 !== 0;
  const rw = quarterTurned ? nh : nw;
  const rh = quarterTurned ? nw : nh;

  // Target crop box, centred on the rotated image.
  const ratio = opts.aspect === "4:5" ? 4 / 5 : opts.aspect === "1:1" ? 1 : rw / rh;
  let cw = rw;
  let ch = Math.round(cw / ratio);
  if (ch > rh) { ch = rh; cw = Math.round(ch * ratio); }

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.filter = `brightness(${opts.brightness}%)`;
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((opts.rotation * Math.PI) / 180);
  ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}

/**
 * The per-tile ⋯ sheet: Set as cover · Edit photo · Add label · Delete.
 * Exactly the four actions the design lists, in that order.
 */
export function PhotoTileSheet({
  open, isCover, label, onClose, onSetCover, onEdit, onLabel, onDelete,
}: {
  open: boolean;
  isCover: boolean;
  label: string | null;
  onClose: () => void;
  onSetCover: () => void;
  onEdit: () => void;
  onLabel: (text: string) => void;
  onDelete: () => void;
}) {
  const [labelling, setLabelling] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) { setLabelling(false); setText(label ?? ""); }
  }, [open, label]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Photo">
      {labelling ? (
        <div className="flex flex-col gap-3 p-4">
          <input
            value={text}
            autoFocus
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            placeholder="Master bedroom"
            className="h-11 w-full rounded-8 border border-border bg-surface-2 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary focus:border-accent"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setLabelling(false)}>Cancel</Button>
            <Button className="flex-1" onClick={() => onLabel(text.trim())}>Save label</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col pb-2">
          <SheetRow label="Set as cover" onClick={onSetCover} disabled={isCover} />
          <SheetRow label="Edit photo" onClick={onEdit} />
          <SheetRow label={label ? "Edit label" : "Add label"} onClick={() => setLabelling(true)} />
          <SheetRow label="Delete" onClick={onDelete} destructive />
        </div>
      )}
    </BottomSheet>
  );
}

function SheetRow({
  label, onClick, destructive, disabled,
}: { label: string; onClick: () => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 items-center px-4 text-left text-15 active:bg-surface-2",
        destructive ? "text-error" : "text-ink-primary",
        disabled && "opacity-40",
      )}
    >
      {label}
    </button>
  );
}
