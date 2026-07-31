MODULE 11 — ADMIN PANEL (P13-14-15)
Read: designs/P13-14-15 (single file, already 3-device — DO NOT re
viewport), design-prompts/
p13/p14/p15, docs/Doc3 (admin), docs/Doc5 (A1-A31 + flows), build/Doc7
(admin endpoints),
build/Doc9 (admin security — highest).
Build the admin panel EXACTLY per the admin design (implement its
mobile+tablet+desktop as-is):
Login (Google-only, whitelist, unauthorized/revoked), Dashboard (pending
tiles+SLA, stats+deltas,
anomalies, revenue chart, cron/backup strips), all queues
(Listings/Requirements/Boosts/
Verifications/Appeals/Reports — risk-score, review detail with exact
user-render + per-field notes +
3 actions + auto-advance + lock), Users list + User detail (deep-drill
panels, all tabs, read-only
chats, suspend/role/impersonate-disabled-sends/adjust-balance/grant),
Listings master (edit-with
diffs + reason + re-review), Plans/Coupons/Grants, Finance
(revenue/churn/reconciliation), Payments
list+detail (refund full-only + type-to-confirm), Master data (location
tree + adjacency mapper +
JSON field-config editor + blocklist + number-regex + area-requests),
CMS (pages+versioning+re
acceptance, blog, FAQs, banners, broadcasts), Templates+strings,
Settings & flags (features/
branding/rates/limits/retention-legal-locks/maintenance/system-actions),
Tickets (+grievance SLA),
Disputes (Section-79 stance + evidence preserve), Staff (Google-only add
+ permission matrix),
Audit log, Cron & system, Analytics
(funnel/events/stories/cities/definitions), Trash, Exports,
Impersonation.
Security (Doc9 — CRITICAL): account.homzlist.com fully isolated; Google
auth whitelist server
checked; every admin action permission-checked server-side + audit
logged; admin chats READ-ONLY
enforced at API (no send even in impersonation); admin↔
public sync
(every setting/toggle/content
change reflects on public site correctly). Run auditors hard. Report.
Ask

# MODULE 11 ADDENDUM — read this BEFORE the Doc6 prompt, and obey it over it

Doc6's Module 11 prompt asks for 31 screens in one pass. Do not attempt that.
It also says "already 3-device — DO NOT re-viewport". That line means: do not
INVENT new breakpoints. It does NOT mean the device work is done. **You must
implement all three of the design's device layouts.** A previous attempt read
that line as "skip it" and shipped a 1049px-wide table on a 390px screen.

This addendum overrides any instinct to interpret, improve, simplify or
re-create. The last attempt used the design as *reference* and invented its own
layout, icons, spacing, sizing, scroll and click flow. Preventing that is the
whole purpose of this document.

## §0 — RESTORE THE TOOLING, THEN UNPACK THE DESIGN. FIRST. BEFORE PLANNING.

`designs/P13-14-15 - ADMIN DASH FULL.html` is a bundler ARCHIVE. Opened
directly it is a blank green page. Working from screenshots or "what it looks
like" is how the last attempt failed.

Restore from `../homzlist-keep/`: `_unpacked/`, `gen-admin-icons.mjs`,
`MODULE11-DESIGN-AUDIT.md`, and re-add the `P13` entry to
`scripts/build-designcheck.mjs`. Then:

node scripts/build-designcheck.mjs

Produces:
- `public/_dx/P13.html` — the prototype RUNNING, offline, with its own DEV
TOOLBAR (screen · theme · **Desktop/Tablet/Mobile** · role · state · overlays).
Drive it. Open every screen, every overlay, every width.
- `designs/_unpacked/P13.template.html` — 2,768 readable lines: the markup AND
the React render methods deciding every layout, size, colour and branch.

**That template is THE SPEC.** Every decision must cite a line number in it.
Cannot cite a line? You are inventing. Stop.

Also read `docs/MODULE11-DESIGN-AUDIT.md` — the list of exactly what the last
attempt got wrong. Do not repeat any of it.

## §0b — THE DEV TOOLBAR IS THE STATE CHECKLIST. IT IS NOT A TOY.

`public/_dx/P13.html` ships the design's own DEV TOOLBAR. Every switch on it is
a state the design ALREADY DRAWS — which means it is a state you must build and
prove. Do not decide for yourself which states matter.

Screens 27, dashboard → exports
Drill panels user · listing · payment
Login default · unauth · revoked · loading
Theme Light · Dark
View Desktop · Tablet · Mobile
Role Super · Admin · Staff
App state normal · skeleton · empty · offline · locked · sla · reported
Row variants active · suspended · deleted · trial · no-plan · multi-plan
Payment states success · pending · failed · refunded · chargeback
Overlays bell · avatar · search · export · bulk · approve · reject ·
changes · docviewer · filter

For every screen in your part, walk the toolbar and, for EACH switch that
applies to it, open the design in that state and build the same state:

- **Theme** — both light and dark. Tokens only, so dark is not a second design.
- **Role** — Super / Admin / Staff each see a different panel. Role-gating is
server-enforced; the design's disabled buttons and tooltips are the UI half,
never the whole of it.
- **App state** — skeleton, empty, offline, locked, SLA-overdue, reported are
DESIGNED screens, not fallbacks you invent. Build each as drawn.
- **Row variants / payment states** — a status with 0 rows in the database has
never run. **Seed every one and look at it** before calling the screen done.
- **Overlays** — each is a specific surface type (§5). Open each from the design
first, then build it.

In the part report, give a state matrix: rows = the part's screens, columns =
the toolbar switches that apply, each cell ✅ with its pixel-diff number. An
unticked cell is an unbuilt state — say so rather than reporting the screen done.

## §1 — PARTS. ONE AT A TIME. NEVER MERGE THEM.

Build in this order. A part closes only when its gate passes. Do not start the
next part with the previous one unproven — every later part stands on it.

- **P0 — Design system.** Icons, primitives, shell, panel stack, overlays,
toast, the three device bands. NO screens.
- **P1 — Shared table engine.** Data table + filters + search + sort + saved
views + column settings + export sheet + bulk bar, built ONCE and reusable.
- **P2 — A1 Login + A2 Dashboard.**
- **P3 — A3–A9** (all queues + review detail).
- **P4 — A10, A11, A12, A31** (users, user detail, listings master, impersonation).
- **P5 — A13–A18** (plans, coupons, grants, finance, payments list + detail).
- **P6 — A19–A21** (master data, CMS, templates & strings).
- **P7 — A22–A30** (settings, tickets, disputes, staff, audit, cron, analytics,
trash, exports).

If a part is too big for one pass, split it further and say so. Never deliver a
part half-done and call it done.

## §2 — P0 AND P1 ARE NOT OPTIONAL PREP. THEY ARE THE MODULE.

**P0 — the design ships its own design system. PORT it, do not rebuild it.**
Rebuilding it is the #1 cause of "icons, sizes and spacing are all different".

*Icons — 57.* The design has `const P = {…}` of exact SVG markup and one
`SVG(inner,size)` helper (viewBox 0 0 24 24, stroke 1.5, round caps, 20px
default). Generate, never draw:

node scripts/gen-admin-icons.mjs → components/admin/ds/icons.tsx

Do NOT use the user-side `components/ui/Icon` anywhere in admin.

*Primitives — port each verbatim,* keeping exact px, radii, weights, colours:
`bdg` `chip` `btn` `gatedBtn` `avatar` `thumb` `statusBadge` `riskBadge`
`roleChip` `verifCluster` `pageHead` `psecH` `prow` `miniCard` `shimmer`
`usageBar` `shareBar` `copyBtn` `noteStrip` `sw`/`swT` `stepperInline`
`modal` `rightSheet` `sheetMenu` `topDrop` `backdrop` `queueTable` `dtable`
`toolCol` `lockGate`.

*The panel stack (`panelStackEl`) — the design calls `pushPanel` **58 times**.*
It is the backbone of the whole panel, not a detail. Build it in P0, exactly:
pinned top/bottom; 480px on tablet+desktop; full width and slide-**UP** on
mobile; each older panel offset right by `(top-i)*24` so the stack is visible;
its own 56px breadcrumb bar (`Screen › Panel › Panel`) where each crumb pops to
that level; `×` closes; backdrop `rgba(0,0,0,.4)` and a backdrop click pops one
level; enter `slideRight .25s cubic-bezier(0.2,0,0,1)`, mobile `slideUp .3s`.

**P1 — the design's list controls are real, and there are many.** 5 filter
sheets, 3 saved-view menus, 3 column-setting sheets, 4 export sheets, 4 bulk
bars, 9 tab/filter state keys, 13 search boxes. Build them ONCE as a shared,
server-driven engine so no screen invents its own.

## §3 — EVERY CONTROL WORKS IN THE PASS THAT INTRODUCES IT

A filter that renders but filters nothing is a FAILURE, not "wiring left for
later". In the same pass a screen ships:

- **Filters** narrow the actual query, server-side, and the result count matches.
- **Search** queries the server. Not an in-memory `.filter()` over one page.
- **Sort** sorts in the database, across all pages — not the visible rows.
- **Tabs / status chips** re-query, and every chip's count is a real count over
the whole table, so a chip can never promise rows the table then fails to show.
- **Pagination** works with filters applied, and page 2 respects them.
- **Saved views** persist to a table and reload.
- **Column settings** persist per admin and survive reload.
- **Export** produces a real file from the filtered set.
- **Bulk bar** acts on the selected ids, enforces the design's cap, and logs.
- **Every row click** opens what the design opens (see §5).

No `useState` that persists nothing. No mock array. No `TODO: real data later`.
If the data source does not exist, build the table and endpoint — never fake it.

## §4 — COPY VALUES, NEVER PARAPHRASE

- Every px (height, padding, gap, radius, font-size, icon size, panel width,
min-width) is written in the design. Use that number, not a Tailwind class
that is "about right".
- Every colour is a design token (`--s1 --s2 --s3 --border --divider --ink1
--ink2 --ink3 --accent --error --warning --info --L1 --L2 --L3` …). No
hardcoded hex, no substituted token.
- Every string — titles, labels, empty states, helper text, buttons, toasts,
dialog wording — copied CHARACTER FOR CHARACTER.
- Animation curves are specified. Use exactly those.

## §5 — WHERE A CLICK LANDS IS PART OF THE DESIGN, NOT YOUR CHOICE

Classify every clickable thing as one of these five, then match it:

1. **Stacked side panel** (`pushPanel` → `panelStackEl`) — 58 of these. A user,
a listing detail, a payment detail open as PANELS.
**A new URL loading instead is a BUG, not an implementation choice.**
2. **Right sheet** (`rightSheet`) — 420px, full height, 56px titled header,
footer buttons. Includes the notifications bell. Not a dropdown.
3. **Bottom sheet** (`sheetMenu`) — full width mobile, 380px with 24px bottom
margin above. Not a dropdown.
4. **Centred overlay** — e.g. global search at `top:56`, centred, 480px, with
its keyboard-hint footer. Not a dropdown under the trigger.
5. **Full screen route** (`this.go(...)`) — e.g. the review screen.

Every back / close / breadcrumb path must work and land where the design lands.

## §6 — THE THREE DEVICE STATES ARE IN THE CODE. DO NOT GUESS THEM.

No CSS breakpoints in the prototype: it renders in a frame whose width IS the
state — **mobile 390 · tablet 768 · desktop 1440**. Map to:

mobile < 768px unprefixed
tablet 768 – 1439px md:
desktop ≥ 1440px desktop: (already in tailwind.config.ts)

`sm: lg: xl:` are not part of this vocabulary. A 1280px laptop gets the TABLET
layout — intended.

There are **105 viewport branches** in the template. Extract every one for the
screens in your part and reproduce it. Shapes they take, all of which the last
attempt got wrong:

- a table that becomes a CARD LIST on mobile (`if(mobile){…}`) — a 1000px table
on a 390px screen is a FAILURE
- columns that disappear on tablet (`!tablet && th('Type')`)
- `minWidth: tablet ? 900 : 0` — a min-width belonging to ONE band only
- grid counts per band (`tileCols = mobile?2:tablet?3:4`)
- layouts that exist only on desktop (`twoCol = !mobile && !tablet`)
- gaps, heights, panel widths that change per band

Also reproduce exact wrapping/truncation (`whiteSpace:'nowrap'`,
`textOverflow:'ellipsis'`, `maxWidth:180`). No clipping, and **no horizontal
page scroll at any width** — only the containers the design says may scroll.

## §7 — ONLY THE DATA MAY DIFFER FROM THE DESIGN

The prototype hardcodes demo arrays (`const rows=[…]`). Those — and only those —
become real Supabase reads. Everything around them stays byte-for-byte.

Where the design shows a field the product no longer has, or the product has one
the design does not show: **STOP AND ASK.** Never silently add, drop, rename or
re-order. Known product changes (boost rules, pinning removed, builder
requirements) are in CLAUDE.md and the memory notes — confirm before assuming.

## §8 — MIGRATIONS START AT 0091

The database was reset to migration `0090`. Admin core (0088–0090) and its
~19,250 seeded rows already exist — do not recreate them. Your first new
migration is `0091`. RLS on every new table, no exceptions.

## §9 — DEFINITION OF DONE, PER PART. MACHINE-VERIFIED.

A part closes only when ALL of these pass:

1. **Pixel diff.** Extend `scripts/pixdiff.mjs` (it already does design-vs-app
diffing for Module 4: headless CDP, real cookies, drives the prototype's own
state) to P13, and run every screen in the part at **390, 768 and 1440**.
Paste the numbers. A screen nobody diffed is not done.
2. **Branch checklist.** The design's viewport branches for each screen, each
with a template line-number citation and a ✅ per band.
3. **Control checklist (§3).** Every filter, search, sort, tab, chip count,
pagination, saved view, column setting, export and bulk action listed, with
proof it hit the server and changed the result.
4. **Click-flow replay (§5).** Every click opened the right KIND of surface, and
every close/back path returned to the right place.
5. **PROOF.md's 5 gates** on every control (click → network → DB row → console
→ reload), plus the regression and propagation sweeps.
6. **Security:** unauthenticated sweep (401s), IDOR probe, secret-grep of the
built bundle, permission matrix enforced SERVER-side, audit row per mutation,
admin chat read-only at the API even while impersonating.
7. **No horizontal page scroll, no clipped text, no console errors** at all
three widths.

Report what you FOUND, not only what you built — including out-of-scope gaps,
which go to `docs/PENDING-INTEGRATIONS.md`.

## §10 — WHEN IN DOUBT, STOP AND ASK

If the design is unclear, contradicts a documented product change, or seems
wrong: ASK. One question costs a minute. An invented layout costs the module.

Never report a part done while any item in §9 is missing. Say plainly what is
not done instead.