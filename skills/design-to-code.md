# Skill: design-to-code

Load whenever implementing a screen from `designs/*.html`. Rules from Doc6 §5.

## Fidelity (mobile) — Doc6 §5.1
- Reproduce the mobile design EXACTLY: layout, spacing, sizing, colours, radii, shadows, type, hierarchy. Pull values from Doc1 tokens (don't eyeball). Nothing added/removed/moved.
- Every popup/sheet/dialog/toast/coach-mark/empty/loading/error/offline state in the design is implemented with the SAME appearance + position — only behaviour is wired.
- Keep the inline outline icon set (`components/ui/Icon.tsx`). One system font stack.

## Behaviour wiring — Doc6 §5.2
- Replace mock JS/fake data with real backend (Supabase queries / `/api/v1` routes).
- Every control works + routes correctly. No dead UI, no placeholder screens.
- Loading state holds until server responds (button spinner, width locked) even on slow network.
- Optimistic UI where Instagram does it (send/like/save) with revert on failure.
- transform/opacity animations only, 60fps; respect reduced-motion; preserve iOS momentum; no layout shift.

## Global fixes — Doc6 §5.3
- BottomNav = P3 canonical (`components/nav/BottomNav.tsx`), fixed, safe-area, nothing beneath it.
- Sheets/popups: never clipped; body scrolls inside; X/backdrop/swipe-down/back all close; stacked → back closes top only.
- `.chrome` (user-select:none) on UI chrome; readable content selectable.
- Correct any misalignment (technical fix, not redesign — use Doc1 tokens).

## Desktop/Tablet — Doc6 §5.4 (user-side only, Module 14)
Separate NATIVE layouts (multi-column/sidebar/wider), built from the mobile design as source of truth. Mobile stays 0% changed. Breakpoints: base / ≥768 / ≥1024. Admin (P13-14-15) exempt.

## Ask, never assume — Doc6 §5.5
If a design element is unclear/missing/conflicts with a spec, STOP and ask.
