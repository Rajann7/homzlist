/**
 * Auth line-art illustrations (Doc1 §12 / P1) — single-stroke ink-tertiary +
 * one accent element. 240px onboarding, 96px system screens.
 */
const S = "var(--ink-tertiary)";
const A = "var(--accent)";

export function HouseSearchArt({ size = 240 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <path d="M50 120 120 62l70 58v66a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4z" stroke={S} strokeWidth="3" strokeLinejoin="round" />
      <path d="M104 190v-34h32v34" stroke={S} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="150" cy="96" r="22" stroke={A} strokeWidth="3.5" />
      <path d="m166 112 16 16" stroke={A} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChatShieldArt({ size = 240 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <path d="M60 74h120a8 8 0 0 1 8 8v66a8 8 0 0 1-8 8h-58l-30 24v-24H60a8 8 0 0 1-8-8V82a8 8 0 0 1 8-8z" stroke={S} strokeWidth="3" strokeLinejoin="round" />
      <path d="M120 96l22 8v18c0 14-10 22-22 26-12-4-22-12-22-26v-18z" stroke={A} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="m112 122 6 6 12-12" stroke={A} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MatchingArt({ size = 240 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <rect x="44" y="70" width="60" height="46" rx="6" stroke={S} strokeWidth="3" />
      <rect x="136" y="124" width="60" height="46" rx="6" stroke={S} strokeWidth="3" />
      <path d="M104 93h20a12 12 0 0 1 12 12v19" stroke={A} strokeWidth="3.5" strokeLinecap="round" />
      <path d="m130 118 6 6 6-6" stroke={A} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="74" cy="93" r="6" stroke={S} strokeWidth="3" />
      <circle cx="166" cy="147" r="6" stroke={S} strokeWidth="3" />
    </svg>
  );
}

export function BrowserArt({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="14" y="20" width="68" height="56" rx="6" stroke={S} strokeWidth="3" />
      <path d="M14 34h68" stroke={S} strokeWidth="3" />
      <circle cx="22" cy="27" r="2" fill={A} />
      <path d="M40 58l8-8 8 8m-8-8v18" stroke={A} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MaintenanceArt({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path d="M40 40 24 56a8 8 0 0 0 11 11l16-16" stroke={S} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 44 68 28a10 10 0 0 0-13-13l-4 12-8 8 9 9z" stroke={A} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
