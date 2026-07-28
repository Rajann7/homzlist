"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

/**
 * P11 billing primitives — the exact pieces the Plans/Billing designs are made
 * of, wired to Doc1 tokens. Appearance is fixed by the design; only behaviour
 * is ours (Doc6 §5.1/§5.2).
 */

/* ---- Appbar back button: 44×44, browser-back with a safe fallback ------- */
export function BackButton({
  fallback = "/",
  icon = "arrow-left",
  /**
   * Overrides the history pop. Needed where "back" would land on a URL that
   * re-renders the very screen being dismissed — the plan wall lives at
   * `/create?wall=1`, so popping history returns to the wall, not out of it.
   */
  onClick,
}: { fallback?: string; icon?: "arrow-left" | "close"; onClick?: () => void }) {
  const router = useRouter();
  return (
    <button
      aria-label="Back"
      onClick={() => {
        if (onClick) return onClick();
        // Deep-linked entry (no history to pop) must not dead-end (Doc6 §5.2).
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
    >
      <Icon name={icon} size={icon === "close" ? 20 : 22} strokeWidth={1.9} />
    </button>
  );
}

/* ---- Section label: 13/600 ink3 UPPERCASE +0.3px ------------------------- */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="chrome text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{children}</div>
  );
}

/* ---- UsageBar: label row (13/600 + 13 ink3) + 6px track, fill animates in -- */
export function UsageBar({
  label,
  value,
  pct,
  helper,
  action,
}: {
  label: string;
  value: string;
  pct: number;
  helper?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  // Width animates from 0 on mount (600ms) — transform-free but width-only on a
  // 6px bar costs nothing, and it's what the design specifies.
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(100, Math.max(0, pct))), 60);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="chrome text-13 font-semibold text-ink-primary">{label}</span>
        <span className="text-13 text-ink-tertiary">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[600ms] ease-out-quart"
          style={{ width: `${w}%` }}
        />
      </div>
      {(helper || action) && (
        <div className="text-11 text-ink-tertiary">
          {helper}
          {action && (
            <button onClick={action.onClick} className="font-semibold text-accent">
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Banner: 8px radius, 12px pad, soft-tinted -------------------------- */
export function Banner({
  tone,
  icon,
  title,
  sub,
  action,
  children,
}: {
  tone: "info" | "warn" | "accent";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const bg = { info: "bg-info-soft", warn: "bg-warning-soft", accent: "bg-accent-soft" }[tone];
  const fg = { info: "text-info", warn: "text-warning", accent: "text-accent" }[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-8 p-3", bg)}>
      {icon && <span className={cn("mt-px shrink-0", fg)}>{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="text-13 font-semibold text-ink-primary">{title}</div>}
        {sub && <div className="mt-1 text-11 leading-[1.4] text-ink-secondary">{sub}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

/* ---- Checklist: accent 18px checks + 15/400 rows ------------------------ */
export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="flex list-none flex-col gap-2.5 p-0">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-15 leading-[1.35] text-ink-primary">
          <Icon name="check" size={18} strokeWidth={2} className="mt-px shrink-0 text-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---- Micro badge (MOST POPULAR / BEST VALUE / RECOMMENDED) -------------- */
export function MicroBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "chrome rounded-4 bg-accent-soft px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---- Coupon row: closed → open → applied / invalid ---------------------- */
export function CouponRow({
  state,
  appliedLabel,
  errorText,
  onOpen,
  onApply,
  onRemove,
  busy,
}: {
  state: "closed" | "open" | "applied" | "invalid";
  appliedLabel?: string | null;
  errorText?: string | null;
  onOpen: () => void;
  onApply: (code: string) => void;
  onRemove: () => void;
  busy?: boolean;
}) {
  const [code, setCode] = useState("");

  if (state === "applied") {
    return (
      <div className="flex min-h-[48px] items-center gap-2.5 rounded-8 bg-accent-soft px-3.5">
        <Icon name="tag" size={20} className="text-accent" />
        <span className="flex-1 text-13 font-semibold text-accent">{appliedLabel}</span>
        <button onClick={onRemove} aria-label="Remove coupon" className="grid h-9 w-9 place-items-center text-accent">
          <Icon name="close" size={18} />
        </button>
      </div>
    );
  }

  if (state === "closed") {
    return (
      <button
        onClick={onOpen}
        className="chrome flex min-h-[48px] w-full items-center gap-2.5 rounded-8 bg-surface-2 px-3.5 text-left"
      >
        <Icon name="tag" size={20} className="text-ink-tertiary" />
        <span className="flex-1 text-15 text-ink-secondary">Have a coupon code?</span>
        <Icon name="chevron-down" size={20} className="text-ink-tertiary" />
      </button>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          autoCapitalize="characters"
          maxLength={24}
          className="h-11 flex-1 rounded-8 border border-border bg-surface-1 px-3.5 text-15 uppercase text-ink-primary outline-none focus:border-accent"
        />
        <button
          onClick={() => onApply(code)}
          disabled={busy || !code.trim()}
          className="h-11 rounded-8 border border-accent px-[18px] text-15 font-semibold text-accent disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {state === "invalid" && errorText && (
        <div className="mt-2 flex min-h-[44px] items-center rounded-8 bg-error-soft px-3.5">
          <span className="text-13 text-error">{errorText}</span>
        </div>
      )}
    </div>
  );
}

/* ---- Offline strip (every screen has one — CLAUDE.md rule 10) ----------- */
export function OfflineBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
      <Icon name="wifi-off" size={16} />
      You&apos;re offline — showing last saved data
    </div>
  );
}

/* ---- Success check-draw (600ms stroke draw) ----------------------------- */
export function CheckDraw({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle
        cx="36" cy="36" r="33" stroke="var(--accent)" strokeWidth="3"
        strokeDasharray="208" strokeDashoffset="208"
        style={{ animation: "hz-draw 500ms cubic-bezier(0.2,0,0,1) forwards" }}
      />
      <path
        d="M22 37l10 10 18-20" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="60" strokeDashoffset="60"
        style={{ animation: "hz-draw 400ms cubic-bezier(0.2,0,0,1) 350ms forwards" }}
      />
    </svg>
  );
}

/* ---- Segmented tabs (Boost status) ------------------------------------- */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, tabs.length]);

  return (
    <div ref={ref} className="chrome relative flex border-b border-divider bg-page">
      {tabs.map((t) => (
        <button
          key={t.key}
          data-tab={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "h-11 flex-1 text-15 font-semibold transition-colors duration-150",
            value === t.key ? "text-ink-primary" : "text-ink-tertiary",
          )}
        >
          {t.label}
        </button>
      ))}
      <span
        className="absolute bottom-0 h-0.5 bg-ink-primary transition-[left,width] duration-200 ease-out-quart"
        style={{ left: ind.left, width: ind.width }}
      />
    </div>
  );
}

/* ---- Radio dot (targeting rows / duration cards / payment methods) ------ */
export function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2",
        on ? "border-accent" : "border-border",
      )}
    >
      {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
    </span>
  );
}

/* ---- Options sheet rows (the ⋯ menus) ---------------------------------- */
export function SheetOption({
  label,
  icon,
  onClick,
  destructive,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "chrome flex w-full items-center gap-3 rounded-8 px-4 py-[15px] text-left text-15 active:bg-surface-2",
        destructive ? "text-error" : "text-ink-primary",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
