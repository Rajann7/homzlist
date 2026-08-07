# E2E AUDIT PROMPT (global, reusable)

Vaparvani rit: niche na prompt ne copy karo, `<<TARGET>>` ni jagya e je audit karavvu hoy
ae lakho (dakhla tarike: `Feed screen`, `Property detail`, `Chat`, `Admin > Users`,
`Super Admin A-to-Z`, `Seller dashboard`, `Whole website`). Baki kaie badlvanu nathi.

Prompt ma be mode che:
- **MODE: AUDIT** → khali issues shodhe ane `docs/issues/` ma lakhe. Koi code change nahi.
- **MODE: FIX** → aagal ni audit file uthavi ne P0→P3 order ma badha issues fix kare,
  ane jya sudhi file ma ek pan OPEN issue bache tya sudhi chalu rakhe.

---

## THE PROMPT — copy from here

```
TARGET: <<TARGET>>
MODE: AUDIT            (AUDIT = find + log only, zero code changes. FIX = fix everything logged.)

You are the QA + engineering team for this product. Treat TARGET the way a real product
company treats a release candidate: you do not test "what the prompt listed", you test
everything that TARGET actually is, end to end, until nothing is left untried.

===================================================================
0. RULES THAT OVERRIDE EVERYTHING
===================================================================
- CLAUDE.md + CHANGE-PROTOCOL.md apply in full. Design lock is absolute: report design
  deviations, never "improve" the design.
- Anything named in this prompt that does not exist in this product: IGNORE it silently.
  This prompt is a way of thinking, not a feature list. Every example below is an EXAMPLE —
  take the LOGIC of the example, do not go looking for the example itself.
- In MODE: AUDIT you change ZERO product files. The only file you write is the issue file.
- In MODE: FIX, a fix may never break something else. Follow CHANGE-PROTOCOL.md: find every
  affected surface first, trace DB -> API -> UI both directions, change all of them in one
  pass from a single source of truth, then re-verify. Partial fixes are rejected.
- Verify from the real database and the real running app. A green UI, a 200 response, or a
  passing type-check is NOT proof. Paste real rows / real console output / real screenshots.
- EVERYTHING is verified in the LIVE BROWSER. Reading code is how you find suspects, not how
  you confirm them. Every screen must actually be opened, every control actually clicked,
  every flow actually walked, with console + network read after each action. "Code looks
  correct" is not a verification and must never appear as one.
- EVERYTHING is verified as DB-CONNECTED. For every value on screen, name the table/column
  and query it; for every action, query the row it wrote/changed. If a value has no query
  behind it, that is an ISSUE, no matter how right it looks.
- PRODUCTION-READY BUILD is part of the check, not an afterthought. Run the real production
  build and start it (`npm run build` + production start), and re-walk the critical flows of
  TARGET on that build — not only on dev. Build warnings, type errors, lint errors, failed
  static generation, env/config that only works in dev, dev-only fallbacks, missing runtime
  config, hydration mismatches that appear only in prod — all are ISSUES, logged with the
  exact build output.
- NEVER stop to ask me a question you can answer yourself. Where you would ask, pick the
  option you would recommend, state the assumption plainly in the report, and proceed. Only a
  genuinely irreversible or business-policy decision may be raised — and then raise it at the
  END, with your recommendation, not by pausing the work.

===================================================================
1. BUILD THE SURFACE MAP FIRST (do not test before this exists)
===================================================================
Before touching anything, enumerate TARGET completely and write the map into the issue file:
  a. Every route/screen inside TARGET, plus every role that can reach it
     (guest, owner, broker, builder, staff, admin, super admin — whichever apply)
     AND every role that must NOT reach it.
  b. Every entry point into each screen (nav, deep link, back from another screen,
     notification tap, share link, refresh mid-flow, direct URL paste).
  c. Every interactive element on each screen, one by one — buttons, icons, tabs, chips,
     filters, sort, search, dropdowns, toggles, sheets, modals, popups, toasts, banners,
     menus (open EVERY menu and list EVERY option in it), long-press / swipe / drag actions,
     pagination / infinite scroll, pull-to-refresh, back button, close (X), overlay-tap-close,
     hardware/browser back, ESC key.
  d. Every CRUD action reachable from TARGET (create, read, update, delete, archive,
     restore, duplicate, bulk select, export, share, report, block, etc.).
  e. Every data source behind TARGET: which table/endpoint feeds each visible value.
Nothing gets skipped for being "minor". A close button, an overlay tap, a disabled state,
a tooltip — all of it is in scope.

===================================================================
2. WHAT TO TEST — walk EVERY item from the map through ALL of these
===================================================================
For EVERY element and EVERY flow found in step 1, check all of the following. If a check
does not apply to that element, say so and move on — do not silently skip it.

A. DEAD / BROKEN
   - Does the control actually do something? No dead button, no dead link, no menu option
     that does nothing, no handler that only sets local state.
   - Does every flow have an exit? No dead-end screen, no trap state, no "back" that lands
     on the wrong place or loses the stack.
   - Open every menu option ONE BY ONE and follow it to its end, including the ones that
     "obviously work".

B. DATABASE TRUTH (hard rule)
   - Every displayed value is a real query. Hardcoded counts, mock arrays, placeholder
     screens, client-derived business values, hardcoded option lists = ISSUE.
   - Every write actually persists: perform the action, then query Supabase and show the row.
   - Every update/delete reflects back after reload and in every other surface that shows the
     same data (list + detail + count + badge + admin view must agree).
   - Realtime / cache: after a mutation, is the re-read stale anywhere?

C. STATE COVERAGE (the "what if there is nothing here" hunt)
   - Loading state: does a skeleton/loader exist, does it match the final layout, no CLS jump.
   - Empty state: for EVERY list, filter result, tab, section, dropdown, and count. What shows
     when a city has no properties, a user has no listings, a chat has no messages, a filter
     matches nothing, an admin table has no rows? Is the empty state designed, worded
     correctly, and does it offer the way out?
   - Error state: server 500, validation error, network failure, permission denied, expired
     session, deleted-while-you-were-looking-at-it.
   - Offline state and reconnect behaviour.
   - Partial data: missing image, missing price, missing name, null optional fields,
     very long text, very short text, 1 item vs 1000 items.
   - First-run vs returning user.

D. STATE MACHINE / PROMISES
   - List every status the schema allows for TARGET's entities, then find the code that
     ENTERS and EXITS each one. A status nothing exits is a trap — flag it.
   - Every promise the UI makes ("we'll notify you", "expires in 7 days", "auto-refund",
     "under review") must have real code AND a real trigger behind it. A cron endpoint
     nobody calls is not done.
   - Two-step operations (our DB + a third party, or vice versa): what happens if step 2
     fails? Money must never move without the thing it bought, and vice versa.

E. INPUT / VALIDATION / EDGE CASES
   - Every form field: required, min/max, format, whitespace-only, emoji, RTL text, 10k chars,
     negative numbers, 0, huge numbers, past/future dates, duplicate submit, double-tap,
     rapid-fire clicks, submit while offline.
   - File/photo upload: allowed types, size limit, count limit, wrong type, oversized file,
     corrupt file, cancel mid-upload, orientation, aspect ratio, what the UI shows while
     uploading, what happens on failure. Check the SAME rules are enforced on the server,
     not just the client, and that the same limits are stated consistently on every screen
     that uploads (if one screen says 10 photos and another says 8, that is an issue).
   - Search & filters: each filter alone, combinations, clear-all, filter + sort + pagination
     together, filters surviving back-navigation and refresh, result count matching the list.

F. SECURITY & ROLES
   - Every endpoint hit unauthenticated -> 401/redirect, never data.
   - IDOR: swap the id to another user's / another org's record on every read and write.
   - Role matrix: each role tries every screen and every action it must NOT have. Staff vs
     admin vs super admin permissions enforced SERVER-side, not by hiding a button.
   - RLS present on every table touched. service_role never in the client bundle.
   - Private fields (phone, email, docs, leads, paid-only content) stripped server-side,
     not hidden with CSS — check the raw network response, not the screen.
   - Rate limiting / abuse on anything that sends, posts, or costs money.

G. RESPONSIVE & VISUAL INTEGRITY
   - Website (user side): mobile is the locked design — verify at 360, 375, 390, 414, 430 px
     widths and at small heights. Admin dashboard: verify ALL THREE layouts (mobile, tablet,
     desktop) at 375 / 768 / 1024 / 1280 / 1440.
   - No text clipping, no wrapping that breaks a row, no overflow, no horizontal scroll, no
     content hidden under the bottom nav / header / safe area, no overlapping elements.
   - Long values: long name, long address, long price, long title, 3-line badge — everything
     must degrade gracefully (ellipsis/wrap as the design intends).
   - Sheets/modals: open, close by X, close by overlay, close by back, close by ESC; scroll
     inside them; keyboard open on mobile does not cover the submit button.
   - Dark mode / light mode if applicable. Zoom 200%. Keyboard-only navigation and focus
     visibility. Screen-reader labels on icon-only buttons.
   - Design lock: compare against designs/ — spacing, size, color tokens (no hardcoded hex),
     font, icon, position, hierarchy. Any deviation is an ISSUE, not a redesign opportunity.

H. CONSISTENCY ACROSS SURFACES (the "there it is like this, here it is like that" hunt)
   - The same entity, label, price format, date format, empty text, badge, status wording,
     icon, and validation rule must be identical everywhere it appears — list, detail, card,
     admin table, notification, email, share preview.
   - The same action must behave the same from every entry point.
   - If a rule exists in one place and is missing in the equivalent place, that is an ISSUE.

I. PERFORMANCE & QUALITY
   - Console: zero errors, zero React warnings, zero failed network requests, zero hydration
     mismatches on every screen visited.
   - No layout jank, 60fps on scroll/animation, no N+1 or unbounded query, no image loaded
     at full size into a thumbnail, list virtualisation where the list can grow.
   - Slow-network behaviour: does the UI lie (show success before the server answered)?

===================================================================
3. HOW TO ACTUALLY RUN IT
===================================================================
- Drive the real running app in the browser (dev server, real login, real data). Read pages,
  click, type, submit, check console + network + DB after each meaningful action.
- Seed whatever data a state needs. A status with 0 rows has never been proven — create the
  row, then look at the screen for that state.
- Test as EVERY relevant role, including logged-out.
- Work screen by screen, and inside a screen element by element, top to bottom. Do not batch
  guesses; each finding must come from something you actually observed.
- Run TWO passes: (1) dev server — full element-by-element walk, and (2) production build —
  build it, start it, and re-walk TARGET's critical flows, empty/error states and console on
  that build. Anything that behaves differently between the two passes is an ISSUE.

===================================================================
4. THE ISSUE FILE (the only thing MODE: AUDIT writes)
===================================================================
Write to: docs/issues/<<TARGET-slug>>-issues.md   (append to it if it already exists;
never lose previously logged issues, never delete an entry — only update its Status.)

Header of the file: TARGET, date, roles tested, screens/routes covered, what was NOT covered
and why.

Then one block per issue, numbered, most severe first:

  ### ISSUE-<n> — <one-line title>
  - **Severity:** P0 broken/data-loss/security | P1 major feature wrong | P2 state/edge/UX
    | P3 polish/copy/visual
  - **Category:** dead | db | state | state-machine | validation | security | responsive |
    consistency | performance | design-lock
  - **Where:** file path(s) + route + exact element
  - **Role / device:** which role, which viewport
  - **Steps to reproduce:** numbered, exact
  - **Expected:** what should happen (cite the doc/design if there is one)
  - **Actual:** what happens, with the proof (console text, network body, DB rows, screenshot)
  - **Impact:** what a real user loses
  - **Blast radius:** every other surface that shares this code/data and must change with it
  - **Status:** OPEN

At the end of the file keep a summary table: counts by severity, and the OPEN/FIXED tally.

Also: anything real but out of scope for TARGET is STILL logged here, in its own
"OUT OF SCOPE (to be fixed in the same run)" section, using the same issue block format —
plus a line in docs/PENDING-INTEGRATIONS.md. Nothing is dropped, and nothing is left as
"someone else's module": in FIX mode these get fixed too (see section 5).

===================================================================
5. MODE: FIX — what changes
===================================================================
When MODE is FIX (or after I say "now fix"):
- Read docs/issues/<<TARGET-slug>>-issues.md and fix every OPEN issue, P0 first.
- For each fix: identify ALL affected areas first (never edit just the file the issue points
  at), understand current behaviour, trace the complete data flow, plan all required updates,
  apply them consistently across every related component from one source of truth.
- Then re-verify: functionality, database rows, security, performance, responsiveness,
  design fidelity, and that nothing else broke (re-run the checks in section 2 for every
  surface in that issue's blast radius).
- Every fix is verified LIVE IN THE BROWSER and AGAINST THE DB — reopen the screen, redo the
  action, read console + network, query the row. Code-level reasoning is not a verification.
- Update the issue's Status to FIXED with the proof inline (DB row, console, screenshot).
  If it truly cannot be fixed, set Status: BLOCKED with the exact reason — never silently
  skip. "Blocked" is only for a missing credential, a third-party outage, or a decision that
  is mine to make; "it belongs to another module" is NOT a valid block.
- OUT-OF-SCOPE ITEMS GET FIXED TOO. At the end of the in-scope pass, work through the
  out-of-scope section the same way — same protocol, same verification, same proof. The run
  is not finished while any out-of-scope item is still pending. Whatever gets fixed here is
  also updated/closed in docs/PENDING-INTEGRATIONS.md.
- Do not pause to ask. Where a fix has a choice, apply the recommended option, note the
  assumption in the report, and continue.
- Re-run the PRODUCTION BUILD after the fixes: build must be clean (no errors, no new
  warnings) and the critical flows must be re-walked on the production build.
- After a fix pass, RE-AUDIT the touched screens from scratch (section 2 again). New issues
  found go into the same file as new numbered entries.
- Keep looping fix -> re-audit -> fix until the file has ZERO OPEN issues (in-scope AND
  out-of-scope), a clean production build, and a clean re-audit that produces no new ones.
  Only then report done.

===================================================================
6. FINAL REPORT FORMAT
===================================================================
1. Surface map: screens, roles, elements, flows covered — with the count of each.
2. Issues found: table of ID / severity / category / one-liner / status.
3. Proof, all of it real:
   - LIVE BROWSER: what was clicked/typed on each screen, plus screenshots at every required
     viewport and console output showing zero errors.
   - DB-CONNECTED: the actual query + the actual row(s) for every value shown and every
     action performed.
   - PRODUCTION BUILD: the real build output, and confirmation that TARGET's critical flows
     were re-walked on the production build with the same result as dev.
4. What I could NOT test and exactly why.
5. OUT-OF-SCOPE LEDGER: everything found outside TARGET, and for each one — fixed (with
   proof) or blocked (with the exact blocker). This section must end with the line
   "Pending out-of-scope items: 0". If it cannot, the run is not finished.
6. Assumptions I made instead of asking, each with the option chosen and why.
7. Honest verdict: if it is not fully done, say so plainly. Do not report complete while any
   OPEN issue remains — in-scope or out-of-scope.
```

## end of prompt
