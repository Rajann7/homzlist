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
  | "whatsapp"
  | "bookmark"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "share"
  | "more"
  | "menu"
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
  | "x-circle"
  | "briefcase"
  | "building"
  | "qr-code"
  | "key"
  | "search-list"
  // P3 search: the landing-page row marker and the ⋯ sheet's not-interested
  | "grid"
  // P9 S1: the profile tab bar's list-view toggle, and the photo-count marker
  // on a grid tile.
  | "list"
  | "stack"
  | "eye-off"
  | "type-flat"
  | "type-bungalow"
  | "type-tenement"
  | "type-farmhouse"
  | "type-office"
  | "type-shop"
  | "type-showroom"
  | "type-godown"
  | "type-plot-res"
  | "type-plot-com"
  | "type-plot-agri"
  | "type-plot-farm"
  | "type-pg"
  // P11 S7 notifications: the six lead icons the design uses that no earlier
  // screen needed (designs/P11 ICON map — same Lucide-style 1.5px family).
  | "hourglass"
  | "arrow-down"
  | "users"
  | "user-plus"
  | "log-out"
  | "bulb"
  | "chart"
  | "device"
  // P10 Settings suite (S6) — Lucide-style 1.5px family, same as the rest.
  | "settings"
  | "globe"
  | "moon"
  | "archive"
  | "flag"
  | "headset"
  | "star"
  | "external"
  | "shield-off"
  | "help-circle"
  | "eye";

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
  // Brand-recognisable WhatsApp mark, drawn in the same 1.5px outline family:
  // speech bubble with a tail + handset inside.
  whatsapp: () => (
    <>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
      <path d="M9 8.5c-.3 0-.6.1-.8.4-.3.3-.9.9-.9 2s.9 2.3 1 2.5c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.3-.2-.6-.4-.3-.2-1.5-.8-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.1-.3.2-.5.1-.3-.2-1.1-.5-2-1.3-.7-.6-1.2-1.4-1.4-1.7-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4z" />
    </>
  ),
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
  // Hamburger menu (three horizontal lines). Same 1.5px outline family.
  menu: () => (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
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
  briefcase: () => (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  building: () => (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </>
  ),
  "qr-code": () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M17 21h.01M21 17v4" />
    </>
  ),
  key: () => (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8 3 3M16 7l2 2" />
    </>
  ),
  "type-flat": () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" />
    </>
  ),
  "type-bungalow": () => (
    <>
      <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  "type-tenement": () => <path d="M4 21V8l5-4 5 4v13M14 21V11l6 4v6M4 21h16" />,
  "type-farmhouse": () => (
    <>
      <path d="M3 21V10l7-5 7 5v11M8 21v-6h4v6" />
      <path d="M17 21v-7l4 3v4" />
    </>
  ),
  "type-office": () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 7h3M8 11h3M8 15h3M14 7h2M14 11h2" />
    </>
  ),
  "type-shop": () => <path d="M4 9h16l-1-4H5zM5 9v11h14V9M9 20v-5h6v5" />,
  "type-showroom": () => <path d="M3 9l2-5h14l2 5M3 9v11h18V9M3 9h18M8 13h8" />,
  "type-godown": () => <path d="M3 21V8l9-4 9 4v13M3 21h18M7 21v-8h10v8" />,
  "type-plot-res": () => (
    <>
      <path d="M3 3h18v18H3z" strokeDasharray="3 3" />
      <path d="M9 15l3-4 3 4" />
    </>
  ),
  "type-plot-com": () => (
    <>
      <path d="M3 3h18v18H3z" strokeDasharray="3 3" />
      <path d="M8 16V9h3a2 2 0 0 1 0 4H8" />
    </>
  ),
  "type-plot-agri": () => <path d="M2 20h20M4 20c0-4 2-6 4-6M12 20c0-6 2-10 2-10M20 20c0-4-2-6-4-6" />,
  "type-plot-farm": () => <path d="M2 20h20M5 20v-6l3-2 3 2v6M14 20v-8l3-2 3 2v8" />,
  "type-pg": () => <path d="M3 20V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14M3 20h18M7 9h2M7 13h2M15 9h2M15 13h2" />,
  "search-list": () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2M8 11h6M8 8h6M8 14h3" />
    </>
  ),
  // designs/P3: the four-square marker on autocomplete "PAGES" rows and on the
  // results screen's landing-suggestion strip.
  grid: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  // designs/P9 `listic` — the grid/list toggle's list half.
  list: () => <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  // designs/P9 `stack` — "this tile has N photos".
  stack: () => <path d="M2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />,
  "eye-off": () => (
    <>
      <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s4 8 10 8a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M2 2l20 20" />
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
  hourglass: () => (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M6 3c0 5 6 5 6 9s-6 4-6 9" />
      <path d="M18 3c0 5-6 5-6 9s6 4 6 9" />
    </>
  ),
  "arrow-down": () => (
    <>
      <path d="M12 5v14" />
      <path d="m5 12 7 7 7-7" />
    </>
  ),
  users: () => (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 20a6.5 6.5 0 0 0-3-5.5" />
    </>
  ),
  // P9 S1 switch sheet: "Add account" (userplus) and "Log out" (logout).
  "user-plus": () => (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8.5v5M16.5 11h5" />
    </>
  ),
  "log-out": () => (
    <>
      <path d="M14.5 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8 6 12l4 4" />
      <path d="M6 12h9" />
    </>
  ),
  bulb: () => (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.5 1 2.5h6c0-1 .3-1.7 1-2.5A6 6 0 0 0 12 3z" />
    </>
  ),
  chart: () => (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l3-4 3 2 4-6" />
    </>
  ),
  device: () => (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h.01" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
    </>
  ),
  globe: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>
  ),
  moon: () => <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  archive: () => (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </>
  ),
  flag: () => (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 3 2 3H5" />
    </>
  ),
  headset: () => (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13a2 2 0 0 1 2 2v2a2 2 0 0 1-4 0v-2a2 2 0 0 1 2-2ZM20 13a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2Z" />
      <path d="M20 17v1a3 3 0 0 1-3 3h-3" />
    </>
  ),
  star: () => <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7Z" />,
  external: () => (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  "shield-off": () => (
    <>
      <path d="M20 12V5l-8-3-4.5 1.7M6.3 6.3 4 5v7c0 5 8 9 8 9a17 17 0 0 0 4.7-3.3" />
      <path d="m3 3 18 18" />
    </>
  ),
  "help-circle": () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.7-2.5 2-2.5 3.5" />
      <path d="M12 17.5h.01" />
    </>
  ),
  // "View as visitor" — the design's `eye`. The set only had `eye-off`.
  eye: () => (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
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
