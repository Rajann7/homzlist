# Skill: design-system

Load when building any UI. Condensed Doc1. Full detail: `docs/Doc1 - Design Foundation.md`.
Implementation lives in `tailwind.config.ts` (tokens) + `app/globals.css` (CSS vars) +
`components/` (library). NEVER hardcode hex — use token classes; dark mode = pure token swap.

## Tokens (use Tailwind classes, never raw hex)
- Surfaces: `bg-page` `bg-page-desktop` `bg-surface-1/2/3` · `border-border` `border-divider`
- Ink: `text-ink-primary/secondary/tertiary/disabled/inverse`
- Accent: `bg-accent` `bg-accent-soft` `text-accent` `accent-pressed` `accent-disabled` (light #0F9D58 / dark #1DB868)
- Semantic: `error` `warning` `info` (+ `-soft`)
- Radius: `rounded-4/8/12/16/full` · Shadow: `shadow-l1/l2/l3` (dark → border outline)
- Spacing: ONLY 4/8/12/16/24/32 (`1 2 3 4 6 8`)
- Type: `text-11/13/15/17/20/24`; one font stack (Tailwind `font-sans`)
- Z: `z-header z-nav z-sheet z-dialog z-toast z-viewer z-coach`
- Motion: `ease-out-quart`, durations 150/200/250/300; transform/opacity only (60fps)

## Layout (Doc1 §3)
- Mobile 100% + 16px gutters; desktop/tablet centred `max-w-column` (470px), `bg-page-desktop` outside.
- Header 56px (`h-header`) + safe-top; BottomNav = P3 canonical (`components/nav/BottomNav.tsx`) 52px + safe-bottom, fixed.
- Touch targets ≥44px. Safe-area insets on every fixed element (`.safe-top/.safe-bottom/.pb-nav-safe`).

## States (every interactive component — Doc1 §5)
default / pressed / loading / disabled / active-selected / error / focus (2px accent ring, offset 2).

## Rules
- `.chrome` class = `user-select:none` on nav/buttons/labels/chips/badges; readable content stays selectable.
- Icons: `components/ui/Icon.tsx` (single outline set, 1.5px, round caps). No emoji/duotone/cartoon.
- Every screen ships loading/empty/error/offline (Doc1 §10).
