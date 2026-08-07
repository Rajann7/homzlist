# ADMIN CRUD ↔ WEBSITE E2E PROMPT (reusable)

Vaparvani rit: niche no prompt copy karo ane `<<SCOPE>>` ni jagya e je test karavvu hoy ae
lakho — dakhla tarike: `Admin > Listings queue`, `Admin > Coupons`, `Admin > Users`,
`Admin > Ops (Tickets/Disputes/Trash)`, athva `Whole admin dashboard A-to-Z`.

Aa prompt no ek j matlab che: **admin ma je karo ae real website par kya-kya badlay ae
sabit karvu** — admin ni side pass thai gai etle done nahi. Ek screen ma je action che ane
je side panel ma je field che, badha ne ek-ek karine admin → API → DB → website → pachhu
ulto, ema chalavvana.

Do modes:
- **MODE: AUDIT** → khali test kare ane `docs/issues/` ma issue lakhe. Zero code change.
- **MODE: FIX** → logged issues P0→P3 fix kare, ane file ma ek pan OPEN bache tya sudhi chalu.

Aa file `docs/E2E-AUDIT-PROMPT.md` ne replace nathi karti — ae screen-level audit che,
aa admin-write → website-read na mirror par focus kare che.

---

## THE PROMPT — copy from here

```
SCOPE: <<SCOPE>>
MODE: AUDIT            (AUDIT = find + log only, zero code changes. FIX = fix everything logged.)

You are testing the ADMIN DASHBOARD as a control plane over a live product. The thing under
test is not the admin screen — it is the ROUND TRIP:

    admin action -> API route -> Supabase row -> every website surface that shows it
                 -> and back again when the action is reversed

An admin action that shows a success toast, updates its own list, and writes its row is
STILL A FAILURE if the public website, the seller dashboard, or any other surface does not
reflect it. That mismatch is the single most important class of bug this run must find.

===================================================================
0. RULES THAT OVERRIDE EVERYTHING
===================================================================
- CLAUDE.md + CHANGE-PROTOCOL.md apply in full. Design lock is absolute: report design
  deviations, never "improve" the design.
- Anything named in this prompt that does not exist in this product: IGNORE it silently.
  Every example here is an EXAMPLE — take the logic, do not hunt for the example itself.
- In MODE: AUDIT you change ZERO product files. The only file you write is the issue file.
- Everything is verified LIVE IN THE BROWSER and AGAINST THE REAL DATABASE. Reading code is
  how you find suspects, never how you confirm them. "The code looks correct", a green toast,
  a 200 response, or a passing type-check is NOT proof and must never appear as one.
- Run admin and the website SIDE BY SIDE, in separate tabs, at the same time:
    tab A: account.<host>  (admin/staff)
    tab B: the public website (guest, logged out)
    tab C: seller.<host>   (the actual owner/broker/builder the record belongs to)
  Plus real SQL against Supabase. An effect is only confirmed when you have SEEN it in the
  right tab after a real reload.
- NEVER pause to ask a question you can answer yourself. Pick the option you would recommend,
  state the assumption in the report, and continue.

===================================================================
1. BUILD THE CRUD LEDGER FIRST (do not test before this exists)
===================================================================
Enumerate SCOPE completely and write this table into the issue file before testing anything.
One row per ACTION, not per screen:

  | # | Admin screen | Where (list row / bulk / side panel / panel field) | Action (C/R/U/D/
    approve/reject/suspend/refund/restore/export/...) | API route | Table(s)+column(s)
    written | Audit/log row expected | WEBSITE SURFACES that must change | Who sees it
    (guest / owner / other roles / admin only) | Notification, email or job it promises |

Rules for building it:
  a. Open EVERY screen in SCOPE, and inside each screen open EVERY side panel, every tab of
     that panel, and every menu. The list screen is usually just filters — the real CRUD
     lives inside the panels. Panel fields are individually in scope, one by one.
  b. Include the quiet ones: bulk select, row overflow menu, restore from trash, hard delete,
     export, re-send, toggle in Settings, a row in MasterData, a template's text.
  c. For "website surfaces" be exhaustive — feed, search results + filters, area/city page,
     listing detail, share/OG preview, seller's own copy of the record, counts and badges,
     notification bell, email, and the admin's own other screens that show the same entity.
  d. Anything you cannot map to a surface: write "no visible effect" and then PROVE that in
     testing. An action with no observable effect anywhere is itself a finding.

Nothing is skipped for being minor. If the ledger and the app disagree, the app wins — fix
the ledger and log the surprise.

===================================================================
2. THE PER-ACTION LOOP — run all 9 steps on EVERY ledger row
===================================================================
Never batch. One action, all nine steps, then the next.

  1. BEFORE-STATE. Record the truth on all three tabs and in SQL before you touch anything:
     the row's current values, whether the website currently shows it, the current counts.
     Without a before-state, an "after" proves nothing.
  2. DO THE ACTION in admin, exactly as a real staff member would (including from the side
     panel, with real input).
  3. ADMIN UI, immediately. Correct optimistic state? Toast/inline feedback? Does the list
     row, the badge, and the count update — or only the panel? Does the panel close as
     designed? Does any other admin screen showing the same entity agree?
  4. ADMIN UI, AFTER RELOAD. Hard-reload and reopen. If the change vanished, the control was
     local state only — the #1 offender. If the panel still shows the old value while the
     list shows the new one (or vice versa), that is a stale-read issue.
  5. DATABASE. Query the exact row(s): the main table, the join/child rows, the audit/
     moderation log, and any counter/denormalised column. Paste the real rows. If any column
     the UI implied should change did not change, that is an issue.
  6. WEBSITE, EVERY MAPPED SURFACE. Go to tab B and tab C, reload properly, and check every
     surface listed in the ledger. Specifically watch for the cache traps: an SSR page that
     serves a stale row, a client re-read served from browser cache, a count that comes from
     a different query than the list.
  7. THE PROMISE. Whatever the action implied — a notification, an email, a credit, an
     expiry, a refund, a queued job — find it actually happening: the notification row, the
     bell, the seller's screen, the job. A promise with no trigger behind it is an issue even
     if the row was written correctly.
  8. PERMISSION. Does the effect reach exactly the right audience? A hidden/rejected record
     must be gone from guest surfaces but still reachable by its owner and admin as designed;
     private fields must be absent from the raw network response, not merely hidden by CSS.
     Try the endpoint logged out and as the wrong role: 401/403, never data. Try the same
     action with another user's id (IDOR) on both read and write.
  9. REVERSE IT. Undo the action (unapprove, reactivate, restore, un-suspend, re-publish,
     refund back). Re-run steps 5-7. A CRUD is only proven when the website goes back too.
     Where reversal is impossible by design, say so and check the UI warns before the point
     of no return.

===================================================================
3. WHAT ELSE TO CHECK WHILE YOU ARE IN THERE
===================================================================
- FIELD-BY-FIELD on every side panel: required, min/max, format, whitespace-only, emoji,
  very long text, 0 / negative / huge numbers, past & future dates, duplicate submit,
  double-click, rapid toggle, submit while offline, close panel mid-edit (is the edit lost
  silently?), edit the same row from two tabs (last-write-wins or a conflict?).
- STATE MACHINE: list every status the schema allows for the entity, then find in the live
  app what ENTERS and what EXITS each one. A status nothing exits is a trap — flag it,
  especially if a user paid to get there. Seed any status with 0 rows and look at both the
  admin screen and the website in that state.
- TWO-STEP OPERATIONS (our DB + a third party, or the reverse): force step 2 to fail and see
  what is left behind. Money must never move without the thing it bought, and vice versa.
- OPTION LISTS: every dropdown/chip/type/amenity/plan in admin must come from a table, and
  the SAME list must drive the website's form and its search filter. A list hardcoded in one
  place and queried in another is an issue even while the values happen to match.
- DELETE SEMANTICS: soft vs hard. What happens to records that referenced the deleted row —
  orphan chip, blank label, crash, or clean handling? Check the website, not just admin.
- CONSISTENCY: the same entity's label, status wording, price format, date format and badge
  must be identical in the admin table, the panel, the website card, the detail page, the
  notification and the email.
- RESPONSIVE: admin dashboard is all THREE layouts — verify each tested screen and panel at
  375 / 768 / 1024 / 1280 / 1440. Website side stays mobile (360-430). No clipping, no
  overflow, no content under the header/bottom nav, panel scrolls and its save button stays
  reachable with the keyboard open.
- CONSOLE + NETWORK read after every meaningful action, on both admin and website: zero
  errors, zero React warnings, zero failed requests, zero hydration mismatches.
- PRODUCTION BUILD: after the dev pass, run the real production build, start it, and re-walk
  the critical ledger rows on it. Anything that behaves differently between dev and prod is
  an issue, logged with the exact build output.

===================================================================
4. THE ISSUE FILE (the only thing MODE: AUDIT writes)
===================================================================
Write to: docs/issues/<<SCOPE-slug>>-crud-e2e.md   (append if it exists; never delete an
entry — only update its Status.)

Header: SCOPE, date, roles used, screens + panels covered, the CRUD ledger table from
section 1, and what was NOT covered and why.

Then one block per issue, numbered, most severe first:

  ### ISSUE-<n> — <one-line title>
  - **Severity:** P0 broken/data-loss/security | P1 major feature wrong | P2 state/edge/UX
    | P3 polish/copy/visual
  - **Category:** not-persisted | website-not-updated | stale-cache | reverse-broken |
    promise-missing | state-machine | permission | validation | consistency | responsive |
    design-lock | performance
  - **Admin action:** screen -> panel -> exact control
  - **Where it should have shown:** the surface that stayed wrong
  - **Steps to reproduce:** numbered, exact, including which tab and which role
  - **Expected / Actual:** with the proof — real SQL rows, real network body, console text,
    screenshots of both admin and website
  - **Blast radius:** every other surface sharing this code/data
  - **Status:** OPEN

End the file with a coverage table: ledger rows total / tested / passed / failed, plus the
OPEN/FIXED tally by severity.

Out-of-scope findings are STILL logged, in their own "OUT OF SCOPE (fixed in the same run)"
section, plus a line in docs/PENDING-INTEGRATIONS.md. Nothing is dropped.

===================================================================
5. MODE: FIX — what changes
===================================================================
- Read the issue file and fix every OPEN issue, P0 first.
- Follow CHANGE-PROTOCOL.md: find every affected surface first, trace DB -> API -> UI both
  directions, change all of them in one pass from a single source of truth. A fix that
  updates admin but not the website (or the reverse) is not a fix. Partial fixes are rejected.
- Re-verify each fix by re-running the full 9-step loop for that action — live browser, real
  DB rows, both tabs, including the reverse step.
- Update Status to FIXED with the proof inline. BLOCKED only for a missing credential, a
  third-party outage, or a decision that is mine — never for "belongs to another module".
- Fix the out-of-scope items too, same protocol, same proof, and close them in
  docs/PENDING-INTEGRATIONS.md.
- Re-run the production build clean, then RE-AUDIT the touched actions from scratch. Loop
  fix -> re-audit -> fix until ZERO OPEN issues and a clean re-audit. Only then report done.

===================================================================
6. FINAL REPORT FORMAT
===================================================================
1. The CRUD ledger with a pass/fail mark per row — this is the coverage proof.
2. Issues table: ID / severity / category / one-liner / status.
3. Real proof: for a representative set of actions, the before-row, the action, the after-row,
   and the website screenshot showing the effect — plus the reverse.
4. Console output showing zero errors, at every required viewport.
5. Production build output and which flows were re-walked on it.
6. What could NOT be tested and exactly why.
7. Out-of-scope ledger, ending with "Pending out-of-scope items: 0".
8. Assumptions made instead of asking.
9. Honest verdict. Do not report complete while any OPEN issue remains.
```

## end of prompt
