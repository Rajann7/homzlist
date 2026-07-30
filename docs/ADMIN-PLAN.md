# ADMIN PANEL — the remaining plan, part by part

Written 30 Jul 2026. Branch: **`admin-design`**. Read this first if you are picking
the work up in a new session.

## How to continue

1. `git pull` on `admin-design` — everything below marked ✅ is committed and pushed.
2. Read `PROOF.md` (the 5 gates + regression + propagation rules) and `CLAUDE.md`.
3. The design is the ONLY visual source of truth:
   `designs/P13-14-15 - ADMIN DASH FULL.html`. It is a bundled prototype — unpack it
   with the technique in `scripts/build-designcheck.mjs` (read the `__bundler/manifest`
   and `__bundler/template` script tags) to get the real JSX.
4. **Commit + push at the end of EVERY part.** Rajan switches accounts when his
   5-hour limit runs out, and an uncommitted part is a part that has to be redone.
   One commit per part, message describing what changed and what was found.

## Ground rules already agreed with Rajan

| Rule | Decision |
|---|---|
| Breakpoints | mobile `<768` · tablet `768–1439` · desktop `≥1440` (`desktop:` = 1440px, in tailwind.config) |
| Design authority | Reproduce the design exactly — layout, colour, text, size, border, radius, A to Z |
| Functionality | Change ONLY presentation. Never remove a working feature, endpoint, permission or route |
| Conflict | Where the design lacks a state real data produces, keep the feature and give it the design's own visual language. Record the deviation |
| A5 sub-tabs | KEPT (design has none) — styled as the design's own tab strip. Without them, rejected/changes-requested requirements are unreachable |
| Shell banners | Maintenance + offline banners BUILT (they are in the design) |
| Radius | Only Doc1 tokens exist: `rounded-4/6/8/12/16/full`. `rounded-lg/xl/2xl/md/sm` generate NOTHING — never use them |

---

# STAGE ONE — design conformance (finishing Module 11 P2) ✅ COMPLETE

## Part 1 ✅ DONE · commit `58bb118`
Breakpoints, shell, toast, banners.
- `desktop: 1440px` added to tailwind (extended, so user-side sm/md/lg untouched)
- Shell: header 56/pad 0 16/gap 12/non-sticky · `main` is the scroll container ·
  sidebar 240 + border-right divider + transition · search max-w 340 · bell 40 ink1 ·
  "N online" Super + desktop only · mobile drawer = grabber + nav, no header/footer
- Six per-screen toasts → one shared `AdminToast` (bottom 76, ink1/page, check icon)
- Maintenance banner (real `maintenance_settings`) + offline banner, "Turn off" wired
- Fixed: shell layout's bell reader was missing the `staff_id` scope

## Part 2 ✅ DONE · commit `58bb118`
A4 + the invented mobile cards.
- A4 two-column at DESKTOP only, measured 3fr:2fr (667.8 / 445.2), gap 24
- A4 carousel 260 mobile / 300 up (card), 240 / 300 (full)
- Removed from A4: top-bar StatusBadge, "Assigned to" badge, role-gate banner,
  is-locked banner, risk zero-state, poster RERA line + bio quote
- Existing field notes moved INTO the design's note icon (tint + tooltip), no chip
- A5/A6/A7: the mobile card lists were invented — the design's `queueTable` is
  viewport-blind. Removed; one table everywhere with `overflow-x-auto`

## Part 3 ✅ DONE · commits `58bb118` + `b36f0e4`
Radius + A3's overlay shapes.
- **Every radius in the panel computed to 0px** — 106 classes remapped, 530 elements
  on A3 now correct, none square
- A3: saved views → anchored dropdown (240/12/pad 6, no scrim) · columns → right-sheet
  + one Done · filters → right-sheet of chip groups + Clear/Apply · export → modal
  with Format radios + Fields list
- Filter chips are real `property_types` + LAUNCHED cities; export fields ride in
  `exports.filters`
- Fixed: the risk filter searched only the first 50 of 69 rows and showed 3 of 4
  matches. `queuePage` widens its read for computed filters and owns risk/role
- Deleted QueueScreen's duplicate Modal/GhostBtn/PrimaryBtn

## Part 4 ✅ DONE · commit `4f4d4b2`
A5–A9 sheet interiors, diffed against the design's own markup.
- A5: Risk block, Location section, Prior history and the masked-budget line all
  removed; the "X is reviewing this" banner goes the way Part 2 dropped A4's
- A6: Targeting is Area + Duration only; open-reports NoteBlock removed (the
  design's fourth eligibility check IS the report state)
- A7: zoom button gone (rotate only); recorded reason + decider survive as field
  rows instead of NoteBlocks, so a decided row keeps its real data
- A8: Hidden/Visible badge, not-locked NoteBlock and the unlock textarea removed
- A9: the "N different reasons" link removed
- KEPT deliberately: A6's "Not paid" badge (a real state the design's mock rows
  never show) and A9's reporters sheet + dots menu (the only place reporter rows
  exist — deleting it would remove a working feature)

## Part 5 ✅ DONE · commit `7c02526`
A1 + A2, neither of which had ever been diffed.
- A2: pageHead 24/700 + 13/400 date pill + bordered 40x40 refresh; grids on the
  ADMIN breakpoints (tiles 2/3/4, stats 2 then 4 from 768, chart row from 768);
  stat card value+sparkline on one row with the delta chip under; chart bars
  stacked plans/boosts/top-ups in a 34x110 column inside a 140 frame; legend
  dots 10x10 r3; overdue rows with dividers and a 36 thumb; strips at padding
  14; the design's 24/20/8/16 row rhythm
- A1: wordmark 24, ADMIN chip 3/7, subtitle at 6/1.4, surface-2 behind the card,
  the missing "Use a different account" link, the design's 18px spinner, a 72px
  revoked state with no footer, and the env chip
- Found: `var(--page)` and `var(--shadow-3)` do not exist; the anomaly banner
  rendered a hardcoded "Open" (now a column, 0108); two grid tracks could not
  shrink and overflowed at 768/390

## Part 6 ✅ DONE
Verification sweep. The short version:
- `npm run build` green · `tsc --noEmit` clean · lint clean
- No horizontal overflow on any of A1–A9 at 390 / 768 / 1440 (two real
  overflows found and fixed on the way: A4's grid column and its action bar)
- Console clean on every screen, light and dark
- Unauthenticated sweep: every touched admin endpoint answers a generic 404
  (Doc9 §API1 — probing must not confirm the zone exists)
- Capability probe as a Staff seat: ban device 403, dismiss report 200,
  requirement approve 200 — which is Doc3 §1.1 ("Staff = approval queues")
- Secret grep of the built bundle: only the anon key (role claim verified)
- A3's four overlays and A4's two-column body re-verified — Parts 2–3 intact

## Open questions for Rajan (do not guess)
1. **10px radius** — the designs draw `border-radius:10px` in 15 places across
   9 files and Doc1's scale has no 10. The user-side classes that spelled it
   (`rounded-10`) rendered square; they take 12 for now. Add a token, or accept
   the nearest one?
2. **Seeded rows the Part 6 probe mutated** — requirement `df039fae` is now
   live, boost `37c206bc` rejected with a refund queued, report `6058c5a9`
   dismissed. All three are correct endpoint behaviour under a Staff seat, but
   they were demo states. Say the word and `npm run seed:admin` puts them back.


---

# STAGE TWO — the rest of Module 11 (build, not conformance)

From `docs/MODULE11-INVENTORY.md` §2. Each part: build to the design, DB-verify every
control, security sweep, hidden-issue hunt, then **commit + push**.

## Part 7 — P3 People & content
- **A10 Users list** — saved views, column settings, export (personal-data warning),
  filters (role/status/plan/city/verification/joined), quick-stat hover card
- **A11 User detail** — 10 tabs and every flow in them
- **A12 Listings master** — the admin's own listing table + edit
- **A31 Impersonation** — "open in user view", read-only, audited both ends

## Part 8 — P4 Money
- **A13 Plans** · **A14 Coupons** · **A15 Grants & trials** (closes PENDING A2)
- **A16 Finance** · **A17 Payments list** · **A18 Payment detail** (refunds)

## Part 9 — P5 Config & content ops
- **A19 Master data** · **A20 CMS** · **A21 Templates & strings**

## Part 10 — P6 Platform & oversight
- **A22 Settings & flags** (also finishes the maintenance banner's other half)
- **A23 Tickets** · **A24 Disputes** · **A25 Staff** · **A26 Audit log**
- **A27 Cron** · **A28 Analytics** · **A29 Trash** · **A30 Exports**

## Cross-part obligations (PROOF.md propagation)
- Every flag / setting / CMS / branding / maintenance change must be READ by the
  public and seller sides from the same table — verify both directions
- Admin screens reuse Module 4's moderation endpoints and state machines, never fork
- Every option list a screen renders comes from its config table (rule 7)
