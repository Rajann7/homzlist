import { cn } from "@/lib/utils";

/**
 * Single outline icon set (Lucide/Feather class) — Doc1 §1.7.
 * 24px default, 1.5px stroke, round caps/joins. Fill-state pairs (outline→filled)
 * for save/heart/home/bell/message via the `filled` prop. Colour inherits
 * `currentColor` so callers set it with text-* token classes.
 *
 * NO cartoon / duotone / emoji icons anywhere (Doc1 §1.7).
 */

export type IconName =
  // property key-spec strip (designs/P4 S1)
  | "bed"
  | "bath"
  | "area"
  | "layers"
  | "home"
  | "search"
  | "plus"
  | "heart"
  | "user"
  | "bell"
  | "message"
  | "bookmark"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "share"
  | "more"
  | "check"
  | "verified"
  | "phone"
  | "copy"
  | "edit"
  | "trash"
  | "minus"
  | "file"
  | "shield"
  | "upload"
  | "rotate-ccw"
  | "rotate-cw"
  | "crop"
  | "sun"
  | "pin"
  | "camera"
  | "alert"
  | "wifi-off"
  | "image"
  | "arrow-left"
  // P11 billing/boost set (same Lucide-style outline family, 1.5px)
  | "tag"
  | "receipt"
  | "rocket"
  | "gift"
  | "clock"
  | "card"
  | "send"
  | "download"
  | "mail"
  | "filter"
  | "info"
  | "refund"
  | "lock"
  | "check-circle"
  | "x-circle";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
}

// Each entry renders inside a 24×24 viewBox. `f` = whether fill is applied.
const PATHS: Record<IconName, (f: boolean) => React.ReactNode> = {
  home: () => <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  plus: () => <path d="M12 5v14M5 12h14" />,
  heart: () => (
    <path d="M12 20.5 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
  ),
  user: () => (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </>
  ),
  bell: () => (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10.5 20a1.7 1.7 0 0 0 3 0" />
    </>
  ),
  message: () => <path d="M4 5h16v11H9l-5 4V5Z" />,
  bookmark: () => <path d="M6 3h12v18l-6-4-6 4z" />,
  close: () => <path d="M6 6l12 12M18 6 6 18" />,
  "chevron-right": () => <path d="m9 5 7 7-7 7" />,
  "chevron-down": () => <path d="m5 9 7 7 7-7" />,
  "chevron-up": () => <path d="m5 15 7-7 7 7" />,
  "chevron-left": () => <path d="m15 5-7 7 7 7" />,
  "arrow-left": () => <path d="M20 12H4m6-6-6 6 6 6" />,
  share: () => (
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3m-4 4 4-4 4 4" />
    </>
  ),
  more: () => (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  check: () => <path d="m5 12.5 4.5 4.5L19 7.5" />,
  verified: (f) => (
    <>
      <path d="m12 3 2.3 1.7 2.8-.3 1 2.7 2.4 1.5-.8 2.7.8 2.7-2.4 1.5-1 2.7-2.8-.3L12 21l-2.3-1.7-2.8.3-1-2.7L3.5 15.4l.8-2.7-.8-2.7 2.4-1.5 1-2.7 2.8.3z" />
      {!f && <path d="m8.5 12 2.3 2.3 4.7-4.6" fill="none" />}
    </>
  ),
  phone: () => (
    <path d="M6 3h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2Z" />
  ),
  // Added for the P5 photo editor + P6 project form (design-required controls).
  edit: () => (
    <>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
    </>
  ),
  trash: () => (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </>
  ),
  minus: () => <path d="M5 12h14" />,
  // Both paths lifted verbatim from designs/P5 section H.
  shield: () => <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />,
  upload: () => <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  file: () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  "rotate-ccw": () => (
    <>
      <path d="M4 5v5h5" />
      <path d="M4.5 10a8 8 0 1 1 1.2 6.3" />
    </>
  ),
  "rotate-cw": () => (
    <>
      <path d="M20 5v5h-5" />
      <path d="M19.5 10a8 8 0 1 0-1.2 6.3" />
    </>
  ),
  crop: () => (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  sun: () => (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  copy: () => (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  pin: () => (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  // Key-spec strip on the property detail (designs/P4 S1) — paths taken from
  // the design so the tiles are the drawing, not a lookalike.
  bed: () => (
    <>
      <path d="M2 10V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3" />
      <path d="M2 10h20v7M4 17v2M20 17v2M6 10V8h5v2M13 10V8h5v2" />
    </>
  ),
  bath: () => (
    <>
      <path d="M5 12V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 19l-1 2M18 19l1 2" />
    </>
  ),
  area: () => <path d="M3 3h18v18H3zM3 9h18M9 3v18" />,
  layers: () => <path d="M4 21V5a2 2 0 0 1 2-2h9l5 5v13M8 8h4M8 12h4M8 16h4" />,
  camera: () => (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  alert: () => (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 9v5M12 17.5v.5" />
    </>
  ),
  "wifi-off": () => (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 12.5a6 6 0 0 1 7 0M5 9a11 11 0 0 1 4-2.3M19 9a11 11 0 0 0-4.5-2.6" />
      <path d="M11 16a2 2 0 0 1 2 0" />
    </>
  ),
  image: () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 18 5-5 4 3 3-2 4 4" />
    </>
  ),
  // ---- P11 set (paths lifted from the P11 design's inline icons) ----------
  tag: () => (
    <>
      <path d="M20 10.5V5a1 1 0 0 0-1-1h-5.5a1 1 0 0 0-.7.3l-8 8a1 1 0 0 0 0 1.4l5.5 5.5a1 1 0 0 0 1.4 0l8-8a1 1 0 0 0 .3-.7z" />
      <path d="M16 8h.01" />
    </>
  ),
  receipt: () => (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1L4 2z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  rocket: () => (
    <>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 8-10c1.5.94 3.06 2.5 4 4a22 22 0 0 1-10 8z" />
      <path d="M9 12H5s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v4s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </>
  ),
  gift: () => (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v9h14v-9" />
      <path d="M12 8C12 8 12 3 8.5 3 6.5 3 6.5 6 8.5 6 11 6 12 8 12 8z" />
      <path d="M12 8s0-5 3.5-5C17.5 3 17.5 6 15.5 6 13 6 12 8 12 8z" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  card: () => (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  send: () => (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  download: () => <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  mail: () => (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </>
  ),
  filter: () => <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  refund: () => (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  lock: () => (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  "check-circle": () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  "x-circle": () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6m0-6 6 6" />
    </>
  ),
};

export function Icon({ name, size = 24, filled = false, strokeWidth = 1.5, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...rest}
    >
      {PATHS[name](filled)}
    </svg>
  );
}
