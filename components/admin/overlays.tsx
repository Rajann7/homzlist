"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * The overlay and form primitives every admin screen shares, built to the
 * design's own helpers (designs/P13-14-15: `modal`, `rightSheet`, `sheetMenu`,
 * `btn`, `chip`, `bdg`, `fLbl`, `fSel`, `shimmer`).
 *
 * A3 grew its own Modal inline and used it for sheets the design draws as
 * right-panels; A4–A9 need all three shapes, so they live here once and A3's
 * copy re-exports from this file. One place decides what a modal looks like.
 *
 * The design positions overlays with `position:absolute; inset:0` because the
 * prototype paints inside a device frame. In the real panel that has to be
 * `fixed`, or a sheet opened from a scrolled queue lands off-screen. That is a
 * technical fix, not a design change — it keeps the exact appearance.
 */

/** Esc closes, and the page behind must not scroll while an overlay is up. */
function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Modal({
  title,
  children,
  actions,
  onClose,
  width = 420,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative max-h-[88%] w-full overflow-y-auto rounded-16 border"
        style={{
          width,
          maxWidth: "100%",
          background: "var(--surface-1)",
          borderColor: "var(--border)",
          boxShadow: "0 8px 24px rgba(0,0,0,.16)",
        }}
      >
        <div className="px-5 pb-4 pt-5">
          {title && (
            <h2 className="mb-3 text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              {title}
            </h2>
          )}
          {children}
        </div>
        {actions && <div className="flex justify-end gap-2 px-5 pb-5">{actions}</div>}
      </div>
    </div>
  );
}

/** The design's right-hand panel: full-height on desktop, a bottom sheet on mobile. */
export function RightSheet({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l md:w-[420px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}
      >
        <div
          className="flex h-14 flex-none items-center gap-2 border-b px-4"
          style={{ borderColor: "var(--divider)" }}
        >
          <h2 className="flex-1 truncate text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center"
            style={{ color: "var(--ink-tertiary)" }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {actions && (
          <div className="flex flex-none gap-2 border-t p-4" style={{ borderColor: "var(--divider)" }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The design's anchored dropdown (its `savedviews` overlay / `topDrop` shape):
 *
 *   a click-catcher over the whole frame with NO dark scrim
 *   panel  width 240 · surface-1 · radius 12 · border · shadow L3 · padding 6
 *   items  padding 10px 12px · 14px · ink1 · radius 8
 *
 * The design hard-codes `top:150; right:60` because it paints inside a fixed
 * device frame. Anchoring to the trigger gives the same picture at any width, so
 * the caller wraps this in a `relative` element.
 */
export function Dropdown({
  children,
  onClose,
  width = 240,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useDismiss(onClose);
  return (
    <>
      {/* No scrim — the design dims nothing for a dropdown. */}
      <button type="button" className="fixed inset-0 z-[110] cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="absolute right-0 z-[111] mt-2 border p-[6px]"
        style={{
          width,
          maxWidth: "calc(100vw - 24px)",
          background: "var(--surface-1)",
          borderColor: "var(--border)",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,.16)",
        }}
        role="menu"
      >
        {children}
      </div>
    </>
  );
}

/** One row of a Dropdown — the design's `padding:10px 12px; 14px; radius 8`. */
export function DropdownItem({
  children,
  onSelect,
  accent,
  disabled,
  topBorder,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  /** The design's "+ Save current view": accent, 600. */
  accent?: boolean;
  disabled?: boolean;
  /** The design puts a divider above the save row, with 4px of space. */
  topBorder?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-8 px-3 py-[10px] text-left text-[14px] disabled:opacity-40 hover:bg-[var(--surface-2)]"
      style={{
        color: accent ? "var(--accent)" : "var(--ink-primary)",
        fontWeight: accent ? 600 : 400,
        ...(topBorder ? { borderTop: "1px solid var(--divider)", marginTop: 4, borderRadius: 0 } : {}),
      }}
    >
      {children}
    </button>
  );
}

/**
 * A menu that opens AT the control that opened it, on every viewport.
 *
 * Rajan's call (30 Jul 2026), and it overrides the design here: the design's
 * `sheetMenu()` slides every kebab menu up from the bottom of the screen, so a
 * dots button on row 14 of a table answered 600px away from your finger. These
 * menus now anchor to their own trigger, the way the saved-views dropdown
 * already did.
 *
 * Positioned `fixed` off the trigger's own rect rather than `absolute` inside a
 * relative parent, because most of these triggers live inside the queue tables'
 * `overflow-x-auto` wrapper, which would clip an absolutely-positioned menu.
 * It flips above the trigger when there is no room below, and stays inside the
 * viewport on both axes.
 */
export function AnchorMenu({
  anchor,
  items,
  onClose,
  width = 240,
}: {
  /** The element the menu belongs to — usually the dots button. */
  anchor: HTMLElement | null;
  items: Array<SheetItem | null>;
  onClose: () => void;
  width?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Escape closes it. Unlike the sheets this does NOT lock body scroll: a
  // dropdown is not modal, and locking would jump the page behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Measure after paint, when the menu's real height is known, so the flip
  // decision is made against the height it actually has.
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = menuRef.current?.offsetHeight ?? 0;
      const gap = 6;
      const below = window.innerHeight - a.bottom;
      const top = below >= h + gap + 8 || a.top < h + gap + 8 ? a.bottom + gap : a.top - h - gap;
      // Right-aligned to the trigger, which is what a kebab at the end of a row
      // wants, then clamped so it can never hang off either edge.
      const left = Math.min(Math.max(8, a.right - width), window.innerWidth - width - 8);
      setPos({ top: Math.max(8, Math.min(top, window.innerHeight - h - 8)), left });
    };
    place();
    window.addEventListener("resize", place);
    // Any scroll, including inside the table wrapper, moves the trigger.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width, items.length]);

  const shown = items.filter((i): i is SheetItem => Boolean(i));

  return (
    <>
      {/* No scrim — a menu dims nothing. The overlay only catches the next click. */}
      <button type="button" className="fixed inset-0 z-[110] cursor-default" aria-label="Close" onClick={onClose} />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[111] border p-[6px]"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width,
          maxWidth: "calc(100vw - 16px)",
          visibility: pos ? "visible" : "hidden",
          background: "var(--surface-1)",
          borderColor: "var(--border)",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,.16)",
        }}
      >
        {shown.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            title={it.disabled ? it.tooltip : undefined}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className="block w-full rounded-8 px-3 py-[10px] text-left text-[14px] hover:bg-[var(--surface-2)] disabled:opacity-40"
            style={{ color: it.danger ? "var(--error)" : "var(--ink-primary)" }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

export interface SheetItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown as a title attribute when disabled — the role-gate tooltip. */
  tooltip?: string;
}

/** The full-screen document viewer (A4's doc block, A7's certificate). */
export function DocViewer({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string | null;
  onClose: () => void;
}) {
  useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/90" role="dialog" aria-modal="true">
      <div className="flex h-[52px] flex-none items-center gap-3 px-4 text-white">
        <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
        {url && (
          <a href={url} download target="_blank" rel="noreferrer" aria-label="Download" className="text-white">
            <Icon name="download" size={20} />
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="text-white">
          <Icon name="close" size={22} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {url ? (
          <DocFrame url={url} />
        ) : (
          <p className="text-[13px] text-white/70">
            The document could not be signed for viewing. It is still stored privately.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A scan is an image or a PDF and the row does not say which, so both are
 * handled: an <img> that fails to decode falls back to the PDF frame rather
 * than leaving the reviewer looking at a broken icon.
 */
function DocFrame({ url }: { url: string }) {
  const isPdf = /\.pdf(\?|$)/i.test(url);
  if (isPdf) {
    return <iframe src={url} title="Document" className="h-full w-full rounded-8 bg-white" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Submitted document"
      className="max-h-full max-w-full rounded-8 object-contain"
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const frame = document.createElement("iframe");
        frame.src = url;
        frame.title = "Document";
        frame.className = "h-full w-full rounded-8 bg-white";
        el.parentElement?.appendChild(frame);
      }}
    />
  );
}

// ------------------------------------------------------------------- buttons

type BtnKind = "primary" | "secondary" | "outline" | "warn" | "danger" | "dangerFill";

const BTN_STYLES: Record<BtnKind, React.CSSProperties> = {
  primary: { background: "var(--accent)", color: "#fff", border: "none" },
  secondary: { background: "var(--surface-2)", color: "var(--ink-primary)", border: "none" },
  outline: { background: "transparent", color: "var(--ink-primary)", border: "1px solid var(--border)" },
  warn: { background: "transparent", color: "var(--warning)", border: "1px solid var(--warning)" },
  danger: { background: "transparent", color: "var(--error)", border: "1px solid var(--error)" },
  dangerFill: { background: "var(--error)", color: "#fff", border: "none" },
};

export function Btn({
  children,
  kind = "secondary",
  onClick,
  disabled,
  tooltip,
  style,
  type = "button",
}: {
  children: React.ReactNode;
  kind?: BtnKind;
  onClick?: () => void;
  disabled?: boolean;
  /** The role-gate tooltip ("Admin only" / "Super Admin only"). */
  tooltip?: string;
  style?: React.CSSProperties;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? tooltip : undefined}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-8 px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{ ...BTN_STYLES[kind], ...style }}
    >
      {children}
    </button>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px]"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "var(--surface-1)",
        color: active ? "var(--accent)" : "var(--ink-secondary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

/** The design's `bdg` — a small uppercase pill. */
export function Badge({
  children,
  bg,
  fg,
  plain,
  style,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
  /** Sentence case instead of the uppercase default (the design's `textTransform:none`). */
  plain?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-4 px-[7px] py-[3px] text-[11px] font-semibold"
      style={{
        background: bg,
        color: fg,
        textTransform: plain ? "none" : "uppercase",
        letterSpacing: plain ? 0 : "0.3px",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Shimmer({ height, width, radius = 8 }: { height: number; width?: number | string; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{
        height,
        width: width ?? "100%",
        borderRadius: radius,
        background: "linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 37%,var(--surface-2) 63%)",
      }}
    />
  );
}

// --------------------------------------------------------------- form fields

export function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="mb-[14px]">
      <div className="mb-[6px]">
        <span className="text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
          {label}
        </span>
        {helper && (
          <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--ink-tertiary)" }}>
            {helper}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  height = 70,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  height?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-none rounded-8 border p-[10px] text-[13px]"
      style={{
        height,
        borderColor: "var(--border)",
        background: "var(--surface-2)",
        color: "var(--ink-primary)",
        fontFamily: "inherit",
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-8 border px-[10px] text-[14px]"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-primary)" }}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-8 border px-[10px] text-[14px]"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-primary)" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The reason-radio list the reject / refund / suspend dialogs all render. */
export function RadioList({
  options,
  value,
  onChange,
  name,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-[2px]">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 px-1 py-2 text-[13px]"
          style={{ color: "var(--ink-primary)" }}
        >
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            style={{ accentColor: "var(--accent)" }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** The tinted note block the dialogs use to say what will happen. */
export function NoteBlock({
  tone,
  children,
  className,
}: {
  tone: "info" | "warning" | "accent" | "error";
  children: React.ReactNode;
  className?: string;
}) {
  const bg = `var(--${tone === "accent" ? "accent" : tone}-soft)`;
  return (
    <p
      className={`rounded-8 p-[10px] text-[11px] leading-[1.5] ${className ?? ""}`}
      style={{ background: bg, color: "var(--ink-secondary)" }}
    >
      {children}
    </p>
  );
}

/** A section heading in the review panel — uppercase, tertiary ink. */
export function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-[10px] mt-5 text-[13px] font-semibold uppercase tracking-[0.3px]"
      style={{ color: "var(--ink-tertiary)" }}
    >
      {children}
    </h3>
  );
}
