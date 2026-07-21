/**
 * Doc1 Design Foundation — the single source of truth for colours, in raw hex.
 *
 * These values are emitted as CSS variables in globals.css (light + dark) and
 * referenced everywhere else ONLY through Tailwind token classes (e.g.
 * `bg-surface-1`, `text-ink-primary`). Components never hardcode hex — dark mode
 * is a pure token swap with zero component changes (Doc1 §1.2 rule).
 *
 * This file exists so tooling / tests can read the palette programmatically; the
 * runtime styling path is the CSS variables, not these constants.
 */

export const lightTokens = {
  // Base & surfaces
  "bg-page": "#FFFFFF",
  "bg-page-desktop": "#FAFAFA",
  "surface-1": "#FFFFFF",
  "surface-2": "#F5F5F5",
  "surface-3": "#EFEFEF",
  border: "#DBDBDB",
  divider: "#EFEFEF",
  // Ink
  "ink-primary": "#111111",
  "ink-secondary": "#555555",
  "ink-tertiary": "#8E8E8E",
  "ink-disabled": "#C7C7C7",
  "ink-inverse": "#FFFFFF",
  // Accent (Trust Green — Option B)
  accent: "#0F9D58",
  "accent-pressed": "#0C7C46",
  "accent-soft": "#E6F4EC",
  "accent-disabled": "#A8D5BD",
  // Semantic
  error: "#ED4956",
  "error-soft": "#FDECEE",
  warning: "#F5A623",
  "warning-soft": "#FEF5E7",
  info: "#0095F6",
  "info-soft": "#E7F3FD",
} as const;

export const darkTokens = {
  "bg-page": "#000000",
  "bg-page-desktop": "#000000",
  "surface-1": "#121212",
  "surface-2": "#1E1E1E",
  "surface-3": "#262626",
  border: "#363636",
  divider: "#262626",
  "ink-primary": "#F5F5F5",
  "ink-secondary": "#B0B0B0",
  "ink-tertiary": "#8E8E8E",
  "ink-disabled": "#4D4D4D",
  "ink-inverse": "#FFFFFF",
  accent: "#1DB868",
  "accent-pressed": "#17A05A",
  "accent-soft": "#0E2B1C",
  "accent-disabled": "#A8D5BD",
  error: "#FF5C6A",
  "error-soft": "#2B1214",
  warning: "#FFB74D",
  "warning-soft": "#2B2210",
  info: "#3BA7F8",
  "info-soft": "#0F2233",
} as const;

/** Overlays & scrims (Doc1 §1.1) — same both modes. */
export const overlays = {
  "scrim-sheet": "rgba(0,0,0,0.40)",
  "scrim-viewer": "rgba(0,0,0,0.60)",
} as const;

export type TokenName = keyof typeof lightTokens;
