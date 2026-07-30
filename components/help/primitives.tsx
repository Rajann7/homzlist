"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * The pieces designs/P12 is built from, one component per design class, so every
 * screen in this module composes the same geometry rather than re-deriving it.
 *
 *   Row        → .lrow inside .lst (56px min, 16px gutter, hairline divider)
 *   SectionH   → .sec-h (13/600 uppercase +0.3px, 24/16/8 margins)
 *   Badge      → .badge (20px pill, 11/600 uppercase)
 *   Chip       → .chip / .chip.on
 *   Callout    → .co + .co-acc / .co-wrn / .co-inf / .co-err
 *   Accordion  → .acc-a max-height transition + .chd-i rotate
 *   Tabs       → .tabsbar / .tabb
 *   StillNeedHelp → the accent card that closes S1's three screens
 *   EmptyBlock → .emptyst
 */

/* ------------------------------------------------------------------ list row */

export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("[&>*]:border-b [&>*]:border-divider [&>*:last-child]:border-b-0", className)}>{children}</div>;
}

const ROW = "flex w-full min-h-[56px] items-center gap-3 px-4 py-2 text-left text-15 text-ink-primary transition-colors active:bg-surface-2";

export function Row({
  icon,
  iconTone = "tertiary",
  label,
  trail,
  chevron = true,
  href,
  onClick,
  className,
  children,
}: {
  icon?: IconName;
  iconTone?: "accent" | "secondary" | "tertiary";
  label?: React.ReactNode;
  trail?: React.ReactNode;
  chevron?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const tone =
    iconTone === "accent" ? "text-accent" : iconTone === "secondary" ? "text-ink-secondary" : "text-ink-tertiary";
  const inner = (
    <>
      {icon && <Icon name={icon} size={icon === "file" || icon === "shield" ? 20 : 24} className={tone} />}
      {children ?? <span className="flex-1 truncate">{label}</span>}
      {trail}
      {chevron && <Icon name="chevron-right" size={20} className="text-ink-tertiary" />}
    </>
  );
  if (href) {
    return <Link href={href} className={cn(ROW, "chrome", className)}>{inner}</Link>;
  }
  return (
    <button type="button" onClick={onClick} className={cn(ROW, "chrome bg-transparent", className)}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ headings */

export function SectionH({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("chrome mx-4 mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary", className)}>
      {children}
    </h2>
  );
}

/* -------------------------------------------------------------------- badge */

type BadgeTone = "accent" | "info" | "warn" | "error" | "muted";
const BADGE_TONE: Record<BadgeTone, string> = {
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  muted: "bg-surface-3 text-ink-secondary",
};

export function Badge({ tone = "muted", dot, children }: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "chrome inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-4 px-1.5 text-11 font-semibold uppercase tracking-[0.3px]",
        BADGE_TONE[tone],
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- chip */

export function P12Chip({
  on,
  onClick,
  children,
  className,
  as = "button",
}: {
  on?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  as?: "button" | "span";
}) {
  const cls = cn(
    "chrome inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-13 transition-transform active:scale-[0.98]",
    on ? "border-accent bg-accent-soft font-semibold text-accent" : "border-transparent bg-surface-2 text-ink-primary",
    className,
  );
  if (as === "span") return <span className={cls}>{children}</span>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("no-scrollbar flex gap-2 overflow-x-auto px-4 py-2", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ callout */

const CO: Record<"accent" | "warn" | "info" | "error", { box: string; icon: IconName; tint: string }> = {
  accent: { box: "bg-accent-soft", icon: "info", tint: "text-accent" },
  warn: { box: "bg-warning-soft", icon: "alert", tint: "text-warning" },
  info: { box: "bg-info-soft", icon: "info", tint: "text-info" },
  error: { box: "bg-error-soft", icon: "alert", tint: "text-error" },
};

export function Callout({
  tone = "accent",
  children,
  className,
}: {
  tone?: keyof typeof CO;
  children: React.ReactNode;
  className?: string;
}) {
  const c = CO[tone];
  return (
    <div className={cn("flex items-start gap-[10px] rounded-8 p-3 text-13 leading-[1.5] text-ink-primary", c.box, className)}>
      <Icon name={c.icon} size={18} className={cn("mt-px", c.tint)} />
      <span>{children}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- accordion */

/**
 * The design animates max-height from the measured scrollHeight, which is what
 * gives the accordion its 200ms open — a plain `hidden` toggle loses that.
 */
export function Accordion({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState("0px");

  useEffect(() => {
    if (!body.current) return;
    setMax(open ? `${body.current.scrollHeight}px` : "0px");
  }, [open]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(ROW, "chrome bg-transparent")}
      >
        <span className="flex-1 text-15 font-semibold">{title}</span>
        <Icon
          name="chevron-down"
          size={20}
          className={cn("text-ink-tertiary transition-transform duration-200 ease-out-quart", open && "rotate-180")}
        />
      </button>
      <div
        ref={body}
        style={{ maxHeight: max }}
        className="overflow-hidden transition-[max-height] duration-200 ease-out-quart"
      >
        <p className="px-4 pb-4 text-13 text-ink-secondary">{children}</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex border-b border-divider">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "chrome h-11 flex-1 border-b-2 text-15 font-semibold transition-colors",
            active === t.key ? "border-ink-primary text-ink-primary" : "border-transparent text-ink-tertiary",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- still need help card */

export function StillNeedHelp({ href = "/support/new" }: { href?: string }) {
  return (
    <div className="px-4" style={{ marginTop: 24 }}>
      <div className="flex items-center gap-3 rounded-12 bg-accent-soft p-4">
        <Icon name="headset" size={32} className="text-accent" />
        <div className="flex-1">
          <p className="text-15 font-semibold text-ink-primary">Still need help?</p>
          <p className="text-11 text-ink-secondary">Our team replies within 24 hours</p>
        </div>
        <Link
          href={href}
          className="chrome inline-flex h-9 shrink-0 items-center justify-center rounded-8 bg-accent px-3 text-13 font-semibold text-white active:bg-accent-pressed"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- empty state */

export function EmptyBlock({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-8 py-12 text-center", className)}>
      <Icon name={icon} size={96} strokeWidth={1} className="text-ink-tertiary" />
      <p className="mt-2 text-17 font-semibold text-ink-primary">{title}</p>
      {body && <p className="text-13 text-ink-secondary">{body}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------ relative timestamps */

/** "2h ago" · "yesterday" · "4 Jan" — the formats P12's ticket cards use. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${months[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

/** "12 Jan" or "12 Jan 2025" — blog/article meta. */
export function shortDate(iso: string, withYear = false): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}
