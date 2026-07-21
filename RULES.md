# HomzList — Master Build Rules (RULES.md)

> Give this file to Claude on every build session, together with CLAUDE.md.
> ROLE: You are a senior frontend + full-stack engineer. Your job is to implement
> my given wireframe/design EXACTLY. Do not add your own creativity, suggestions, or
> "improvements" to the design. What I provide IS the final design.

---

## DESIGN LOCK (STRICT — highest priority, never violate)

The mobile design I provided in designs/ is FINAL and LOCKED.

1. Implement the mobile design EXACTLY as given — same layout, spacing, sizing,
   colors, fonts, components, icons, popups, sheets, toasts, dialogs, notifications,
   positions, and hierarchy. Pixel-for-pixel. Zero creativity, zero "improvement",
   zero rearranging, zero adding, zero removing.

2. The mobile design must NOT change by even 0.001%. It is untouchable.

3. The ONLY thing allowed is FIXING genuine technical problems that break the design,
   WITHOUT changing the design's look:
   - overflow / clipping / cut-off text
   - broken alignment
   - unresponsive popup/sheet open-close
   - a dead/non-working button or flow
   - console errors
   These are FIXES (making the given design work correctly), not design changes.
   A fix must keep the exact same visual appearance — if a "fix" changes how it
   looks, it is NOT allowed; ask me first.

4. Desktop and tablet get SEPARATE native layouts (user-side only) — but building
   those must NEVER alter the mobile design in any way. Admin (P13-14-15) already
   has all 3 device layouts — implement as-is, don't re-design it.

5. If anything in the design is unclear or seems wrong, STOP and ASK me before
   changing anything. Never assume and build your own version.

Rule of thumb: I am the PAINTER (design is done). You are the ENGINEER (make it
work exactly as painted). Never repaint.

---

## PART A — DESIGN (follow strictly, every time)

1. I have provided the wireframe/design (mobile is final; tablet + desktop are built as
   separate native layouts per Doc 6 §5.4). This is a complete design, not a suggestion.
   Implement the exact same layout, spacing, sizing, components, colors, and hierarchy.
2. Do not add, remove, or rearrange anything on your own. If something in the design is
   missing or unclear, ASK ME FIRST — do not assume and build your own version.
3. Responsive: use the breakpoints defined in the wireframe/Doc 6 (mobile/tablet/desktop).
   Do not invent your own breakpoints.
4. If a technical issue appears during implementation (overflow, alignment break, etc.),
   FIX it without changing the design. Never take a shortcut that compromises the design.

## PART B — TESTING (self-check in preview/live mode, then report)

When you test in preview, manually verify all of the following and fix anything broken:
- At every breakpoint (mobile/tablet/desktop) the layout matches the wireframe.
- No text clipping / unwanted two-line wrap / overflow-hidden / cut-off.
- No element hidden, missing, or overlapping.
- Every button/link/component actually works — no dead UI, no dead buttons.
- The full user flow runs — no stopping point, no dead-end.
- Loading, empty, and error states are all handled.
- No horizontal scroll / unintended overflow anywhere.
- No console errors.
After testing, give a short report: what you checked, what you fixed, what still has an issue.

## PART C — FEATURE TOGGLE (admin control)

- If a feature / button / section is turned OFF from the admin side, there must be NO empty
  gap in its place. The layout auto-adjusts and the element cleanly auto-hides.

## PART D — ERROR HANDLING

- No error should ever be shown to the user in technical form. The user only sees a clean,
  friendly message or a graceful fallback.
- The actual error detail is captured on the admin/log side (console/logging).

## PART E — SECURITY (for AI features)

- If the site has any AI feature, handle prompt-injection / jailbreak attempts — never let
  user input override system instructions.
- Enforce access control on links/routes — no one can bypass a restricted page by guessing a URL.
- Input validation: empty, very long, weird characters, special symbols — handle every edge
  case gracefully.

---

DELIVERABLE: working code exactly according to the wireframe, plus your testing report.
Design change = ZERO. If anything is unclear, confirm with me BEFORE building.

---

## Additional standing rules (from full project scope)

- Architect for extreme concurrency (up to millions/100Cr live users): BullMQ queueing +
  rate-limit + retry + backpressure; load balancer + auto-scaling; DB optimization + Redis
  caching + connection pooling; CDN; k6/Artillery load testing. (See Doc 8.)
- Everything backend-driven. No business data/flags in frontend or localStorage. (See Doc 7 §19.)
- Full security per Doc 9 (RLS mandatory, IDOR-safe, bypass-sealed, no CAPTCHA).
- Instagram-level smoothness (60fps, no jank/lag/block); loading states hold on slow network.
- Nothing skipped: every screen, sheet, popup, state, and flow from the design + specs is built and working.