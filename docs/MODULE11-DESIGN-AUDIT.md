# MODULE 11 — design audit (mobile 390 / tablet 768 / desktop 1440)

Ran 31 Jul 2026 against `designs/P13-14-15 - ADMIN DASH FULL.html`.

## How the design was read (do this, don't screenshot)

The shipped design file is a **bundler archive** — the prototype is a JSON-encoded
`<script type="__bundler/template">`, which is why it looks like a blank green page
and why nobody had been reading the actual rules out of it.

```bash
node scripts/build-designcheck.mjs
```

now emits two things for P13-14-15:

- `public/_dx/P13.html` — the prototype, **runnable offline**, with its own DEV
  TOOLBAR (screen · theme · **Desktop/Tablet/Mobile** · role · state · overlays).
  Open it next to the app and drive both.
- `designs/_unpacked/P13.template.html` — 2,768 readable lines: the markup **and**
  the React render methods that decide every responsive branch. **This file is the
  spec.** Every claim below cites a line in it.

## The design's device contract

The prototype has no CSS breakpoints. It renders inside a frame whose width *is*
the device state (`renderVals`, line 398): `mobile 390 · tablet 768 · desktop 1440`,
and every layout switch is written against that state. Mapped to the repo's
breakpoints (`tailwind.config.ts`): mobile = unprefixed, tablet = `md:`,
desktop = `desktop:` (1440). **`lg:` is not part of this vocabulary** — a 1280px
laptop must get the design's *tablet* layout.

105 branch sites total. The ones that matter for built screens are below.

---

## ✅ Already design-exact (verified, no change needed)

| Screen | Checked against | Result |
|---|---|---|
| **Shell** (sidebar/header/drawer/main) | lines 74–159, 399–445 | sidebar 240/64 `!mobile`; header 56; `superWide` = super **and** desktop-only; main pad 16/24, max-w 1200; mobile bottom drawer w/ grabber. Matches. |
| **A2 Dashboard** | 515–592 | tiles `2 / 3 / 4`, stats `2 / 4`, chart+overdue `1fr` / `1.6fr 1fr`, strips `1fr` / `3×`, chart gap `8 / 16`. All six match. |
| **A4 Review** | 679, 805–808 | `twoCol = !mobile && !tablet` → `desktop:grid-cols-[3fr_2fr]`, gap 24. Matches. |
| **A10 Users** | 1019–1041 | mobile card list; `minWidth: tablet?820:0`; Verification/City/Leads/Joined hidden at tablet. Matches — **this screen is the reference for the other lists.** |
| **A5/A6/A7 queues** | 818–826 | design's `queueTable` has no mobile or tablet branch (plain table, `overflow:hidden`, no min-width). Impl agrees. |

---

## Status

| # | Deviation | State |
|---|---|---|
| 1 | A12 Listings — no mobile layout, wrong columns | ✅ fixed |
| 2 | A17 Payments — no mobile layout, wrong columns | ✅ fixed |
| 3 | A15 Grants — no mobile layout, wrong columns | ✅ fixed |
| 7 | A3 Queue Type column at `lg:` instead of `desktop:` | ✅ fixed |
| 4 | Detail screens are routes, not the design's panel stack | ⬜ open — biggest remaining piece |
| 5 | Bell is a dropdown, design wants a RightSheet | ⬜ open |
| 6 | Global search dropdown, design centres it at top:56 | ⬜ open |
| — | A12 has no select-all column / bulk bar (design line 1073 has both) | ⬜ open |

Verified after the fix by fetching each screen's real HTML (no screenshots):

```
/listings       mobile card list OK · table hidden below md: OK
                min-width tablet-only OK
                columns  Listing Type Price Location Poster Status Stats Posted Flags
                desktop-only  Type Location Stats Posted
/payments       … columns  Payment ID User Item Amount Method Status Date
                desktop-only  Method Date
/plans/grants   … columns  User Granted Duration Expires Reason Granted by Date State
                desktop-only  Duration Reason Granted by State
```

The two new DB-backed cells render real rows, not placeholders:
`4 views · 3 leads` on A12 (migration `0111_admin_listing_stats`), and
`13 days left` / `8 days left` on A15's expiry.

---

## ❌ Deviations found

### 1. A12 Listings Master — no mobile layout at all (worst offender)

`components/admin/ListingsMaster.tsx:261`

Design (line 1079): on mobile the table is **replaced** by a card list — thumb 48,
title 13/600, `#id · price`, status + Promoted badges.

Built: one table for all widths. Measured live at 390px:

```
main client width  390
table width       1049      ← 2.7× the screen
scroll box         356
columns  Listing · Price · Location · Poster · Posted · Status · ⋯
```

The admin has to drag sideways to reach Status. On top of that the column set
itself is wrong — design (line 1085) is 11 columns:
`☐ · Listing · Type · Price · Location · Poster · Status · Stats · Posted · Flags · ⋯`
with `!tablet` on Type/Location/Stats/Posted and `minWidth: tablet?900:0`. Built has
7, no checkbox column (so no bulk bar), no Type, no Stats, no Flags, and an
unconditional `min-width:860`.

### 2. A17 Payments — no mobile layout, wrong columns

`components/admin/PaymentsScreen.tsx:171`

Design (line 1131) has a mobile card: avatar + name + mono payment id + status
badge on row 1, item + amount on row 2, `errorSoft` background when Chargeback.
Built has none.

Columns — design (1135): `Payment ID · User · Item · Amount · Method · Status · Date · ⋯`,
`!tablet` on Method and Date, `minWidth: tablet?860:0`.
Built: `Payment · Payer · For · Amount · Method · When · Status` — renamed, Status
and Date swapped, no `⋯` column, no tablet hiding, `min-width:780` at every width.

### 3. A15 Grants — no mobile layout, wrong columns

`components/admin/GrantsScreen.tsx:116`

Design (1256) mobile card: avatar + name + role chip, granted contents joined by
`·`, expiry in `warning` when close. Built has none.

Columns — design (1260): `User · Granted · Duration · Expires · Reason · Granted by · Date · ⋯`
with `!tablet` on Duration/Reason/Granted by, `minWidth: tablet?900:0`.
Built: `To · Plan · For · Usage · Expires · Why · By · State · ⋯` — different set and
naming, no tablet hiding, `min-width:900` unconditional (so it also over-scrolls at
tablet *and* mobile).

### 4. Detail screens are pages; the design has a panel stack

`app/(admin)/account/(shell)/users/[id]/`, `payments/[id]/`,
`queues/listings/[id]/` (the last is A4 Review, which *is* a full screen in the
design — that one is correct).

Design `panelStackEl` (1278–1308): A11 user, A12 listing detail and A18 payment
detail are **stacked right-side panels**, not routes:

- width `mobile ? 100% : 480`, pinned `top:0;bottom:0`
- each older panel offset right by `(top - i) * 24` — the stack is visible
- 56px breadcrumb bar per panel: `Screen › Panel › Panel`, each crumb pops back to
  its level, `×` closes
- enter animation `slideRight .25s cubic-bezier(0.2,0,0,1)`; on mobile
  `slideUp .3s` and no offset
- backdrop `rgba(0,0,0,.4)` at `z 90+top`, click = pop one level

Nothing of this exists in the build.

### 5. Bell is a dropdown; the design makes it a right sheet

`components/admin/AdminBell.tsx:73` — a 380px dropdown anchored under the icon.

Design (1575–1578) calls `rightSheet('Notifications', …)` → full-height drawer,
420px on desktop/tablet, **100% width on mobile**, 56px titled header with `×`, and
a footer "Mark all read" button. `components/admin/overlays.tsx:82` already has a
correct `RightSheet` — the bell just doesn't use it.

### 6. Global search is a dropdown; the design centres it

`components/admin/AdminSearch.tsx:100` — `absolute right-0 mt-2 w-[min(480px,86vw)]`.

Design (1608): `top:56`, **centred** (`left:50%; translateX(-50%)`), width 480,
`scaleIn .18s`, and a footer strip of keyboard hints (`↑↓ navigate · ↵ open ·
esc close`). On mobile it is `left:12; right:12` instead.

### 7. A3 Queue hides its Type column at the wrong width

`components/admin/QueueScreen.tsx:465` uses `lg:table-cell` (1024px). The design
(line 654) hides Type on **tablet**, i.e. everything below 1440. Should be
`desktop:table-cell`, as `UsersScreen.tsx:805` already does. Today a 1280px laptop
gets a tablet layout everywhere except this one column.

---

## Not audited (screens not built yet)

P5/P6 of the part ledger. Their rules are already extracted, for when they land:

| Screen | Design rule |
|---|---|
| A13 Plans (1213) | cards `1fr` mobile / `1fr 1fr` up |
| A14 Coupons (1228–1238) | mobile cards; `!tablet` on Scope/Per-user/Validity; minWidth `tablet?900:0` |
| A16 Finance (1163–1165) | chart gap `8/16`; breakdowns `1fr` / `1.4fr 1fr` |
| A19 Master data (2074) | Locations: mobile drops the tree for a flat list |
| A20 CMS (2210, 2217) | FAQs mobile list; Banners `1fr` / `2×` |
| A22 Settings (2362, 2414) | Branding stacks on mobile; system actions `1fr` / `2×` |
| A26 Audit (2584) | row grid `1fr` mobile / `150px 150px 120px 1fr 40px` up |
| A27 Cron (2619, 2623) | health `2×` mobile / `4×` up; panels `1fr` / `1fr 1fr` |
| A28 Analytics (2668) | KPIs `2×` mobile / `4×` up |
| A19 dtable (2025) | shared master-data table, minWidth `tablet?820:0` |
