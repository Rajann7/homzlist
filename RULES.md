# HomzList — Master Build Rules (RULES.md)

> Give this file to Claude on every build session, together with CLAUDE.md.
> **Every change request executes through CHANGE-PROTOCOL.md** (map all surfaces → change
> all of them → verify A–H → report). That file governs the *process* of any change; this
> file governs the standards the result must meet.
>
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

## BACKEND & DATA LOCK (STRICT — highest priority, ALL modules, never violate)

Everything is backend/database-driven. NOTHING business-related is stored or
decided in the frontend or localStorage.

1. Source of truth = server + Supabase. The frontend only displays what the
   server returns; it never holds the source of truth. No business data, flags,
   prices, paid-status, roles, entitlements, counts, or locked content in
   frontend state or localStorage (UI-only prefs like theme/onboarding are fine).

2. Identity & data live in Supabase. User identity, role, and all user data live
   in Supabase (auth.users + tables). Signup/registration writes to Supabase
   server-side via the service-role key, NEVER to frontend state. profiles.id =
   auth.users.id.

3. Server-verified every request. Auth session, role and permissions are checked
   server-side on EVERY request. Access + refresh tokens are httpOnly cookies
   (refresh server-tracked, rotating). NEVER put session/refresh tokens or
   business data in localStorage/sessionStorage.

4. Two walls, always. (a) API authorization (server checks role + ownership) and
   (b) Supabase RLS on EVERY table. service_role key is server-only, never in the
   client bundle. Private fields (Views/Leads/numbers/docs/email/locked data) are
   stripped server-side before the payload — never hidden with CSS.

5. Real migrations, run. Every schema change is a file in supabase/migrations,
   and Claude applies it to the DEV Supabase project itself — don't leave a
   module blocked waiting on me. Production stays staged + human-run. No table
   ships without RLS.

6. A-to-Z DATABASE-DRIVEN. Every value the site shows — counts, labels, badges,
   prices, stats, lists, statuses, dropdown options — is a real Supabase query.
   BANNED: hardcoded counts, mock/sample arrays, `TODO: real data later` in a
   shipped screen, option lists hardcoded in a component. If the data source
   doesn't exist, BUILD it (table + endpoint). Never fake it in the frontend.

7. VERIFY FROM THE DATABASE, EVERY TIME. A feature is not done until the actual
   row(s) have been queried and shown. A green UI, a 200, or a passing typecheck
   is not proof. `npm run db:proof` + a targeted query, in every module report.

6. Never trust the browser. Every input validated + authorized server-side;
   generic responses (no enumeration leaks); secrets in env only. Prices/GST/
   entitlements computed server-side.

Rule of thumb: the frontend is a thin view over a server that owns and verifies
all truth.

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
- **Hunt for hidden issues on every module.** The module prompt is the starting point for
  finding what is silently broken, not a checklist to tick. For each item ask: is the control
  actually DB-backed, does every on-screen promise have a job behind it that something
  triggers, which state does nothing transition out of, what happens if step 2 of 2 fails
  after money moved, has each state ever had a real row, and does the UI copy match what the
  server actually did. Report what you FOUND, not only what you built — out-of-scope gaps go
  to docs/PENDING-INTEGRATIONS.md rather than being left for a real user to hit.
  (Full checklist: CLAUDE.md "HUNT FOR HIDDEN ISSUES".)