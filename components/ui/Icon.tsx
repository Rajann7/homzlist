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
  | "chevron-left"
  | "share"
  | "more"
  | "check"
  | "verified"
  | "phone"
  | "copy"
  | "pin"
  | "camera"
  | "alert"
  | "wifi-off"
  | "image"
  | "arrow-left";

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
