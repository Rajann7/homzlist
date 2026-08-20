# HomzList — Desktop + Tablet Responsive Spec (non-admin)

> **What this is.** The single set of rules every file in this folder obeys, and the
> rules an implementer must obey when porting these designs into the live app.
> Read this BEFORE opening any `.html` in this folder, and before writing any code.
>
> **What this is NOT.** Not a redesign. The live mobile app is deployed and correct.
> Nothing here changes content, fields, copy, routes, permissions, business logic or
> mobile layout. This describes **only what happens at ≥768px**.

---

## 0. The one rule that matters

**Recomposition, not scaling.**

Forbidden, everywhere, no exceptions:

- putting the mobile 470px column inside a wider box
- `grid-cols-1` → `grid-cols-4` with the same card, unchanged
- `flex-col` → `flex-row` as the whole desktop answer
- bigger fonts / more padding as the whole desktop answer
- bottom nav surviving above 768px
- full-bleed everything, or oceans of empty space

Required instead: at each breakpoint, ask **"what does this screen's job look like on
this device?"** and place the same content accordingly — sidebars, rails, split views,
master-detail, sticky action panels, tables instead of stacked cards.

---

## 1. Breakpoints

| Name | Range | Source of truth |
|---|---|---|
| Mobile | 320–767 | **the live app, untouched** |
| Tablet | 768–1199 | this folder |
| Desktop | 1200–1599 | this folder |
| Large desktop | 1600+ | this folder |

Implementation: Tailwind `md:` = 768, `lg:` = 1200, `xl:` = 1600.
`tailwind.config.ts` today declares `screens: { desktop: "1440px" }` — add
`xl: "1600px"` (or retune that entry) so the token matches this spec. It is not used by
mobile code, so this is a safe addition.

**Every desktop/tablet rule is added as a `md:` / `lg:` / `xl:` prefixed class. The
unprefixed classes are the mobile app and must not be edited.** That is what guarantees
the deployed mobile experience cannot regress.

---

## 2. Two chrome families (the central decision)

The app has two kinds of screen and they must NOT get the same desktop chrome.

### A. Browse chrome — public / discovery surfaces

`/` · `/search` · `/search/results` · `/area/[slug]` · `/[landing]` · `/property/[id]` ·
`/project/[id]` · `/projects/[id]` · `/story/[posterId]` · `/profile/[username]` ·
`/blog` · `/blog/[slug]` · `/legal` · `/legal/[slug]` · `/login`

- **No sidebar.** A real portal header, like the desktop portals users already know.
- Header row 1 (64px, sticky): wordmark · location pill · full search field · Post
  Property (accent) · notifications bell · avatar menu. Guest: "Log in" + "Post free".
- Header row 2 (48px, hairline top): the destinations that used to live in the bottom
  nav — Buy · Rent · Projects · Requirements · Leads — as text links with an accent
  underline on the active one.
- Content max-width **1600**, gutter 24 (tablet 20).
- Footer is full and multi-column (the mobile footer already carries the links).

### B. Console chrome — seller / account surfaces

`/seller/dashboard` · `/seller/listings*` · `/leads*` · `/requirements*` · `/create*` ·
`/projects/new` · `/plans*` · `/payments` · `/checkout*` · `/boost*` · `/saved` ·
`/activity*` · `/notifications` · `/messages` · `/profile` · `/profile/edit` ·
`/profile/verification` · `/settings/*` · `/help*` · `/visits` · `/proposals`

- **Left sidebar, 240px, fixed, full height.** Wordmark at top; nav groups below; role
  chip + avatar at the bottom.
  - Group 1 — Home, Search *(Search hidden for `builder`, exactly as the bottom nav
    already does)*
  - Group 2 — Dashboard, My Listings, Create
  - Group 3 — Leads, Requirements, Visits, Proposals, Messages, Notifications
  - Group 4 — Saved, Activity
  - Group 5 — Plans, Payments, Boost
  - Foot — Help, Settings, Profile
  - Badges (unseen leads, unread) ride the row, right-aligned — the same counts the
    bottom nav already fetches from `/feed/badges`.
- Content column max **1200**, plus an optional **right rail 320** (see §4).
- No footer inside the console (settings/help keep their in-page links).

**Tablet (768–1199) for console chrome:** the sidebar collapses to a **72px icon rail**
(icon + tooltip, same order, same badges). Content stays single-column, with the right
rail's content promoted inline where §4 says so.

**Bottom nav:** `hidden md:` — gone at 768 and above, in both families. Its five
destinations are re-homed as stated above, so nothing becomes unreachable.

---

## 3. Grids

Cards reflow by **auto-fill with a min width**, never by a hard column count, so a 1600
window adds a column instead of stretching cards.

| Card | min width | 768 | 1200 | 1600 |
|---|---|---|---|---|
| Property / project card | 260 → 300 → 330px | 2 | 4 | 4–5 |
| Person card (developer / broker) | 150 → 200px | 4 | 6 | 7 |
| News / blog card | 280 → 320px | 2 | 4 | 4 |
| Dashboard tile | 200 → 240px | 2 | 3 | 4 |

Gutters: 14 (mobile) → 18 (tablet) → 20 (desktop) → 24 (large).

---

## 4. Recomposition patterns (use these, do not invent new ones)

1. **List + detail (split view).** A list screen whose rows open a detail route shows
   the list at 380px on the left and the detail inline on the right at ≥1200. The detail
   route still exists and still works standalone (deep links, back button).
   *Used by:* leads, requirements, messages, tickets, notifications, listings.
2. **Form + live preview.** A create/edit form keeps one readable column (max 720) and
   the right side shows what the user is building.
   *Used by:* create form, photos, preview, projects/new, profile/edit, requirements/new.
3. **Content + sticky action panel.** Long content left, the decision box pinned right
   (max 380, `position: sticky`).
   *Used by:* property detail (contact/interest box), project detail, checkout (order
   summary), plans (selected plan), boost/new.
4. **Filters as a rail, not a sheet.** The mobile filter bottom-sheet becomes a 280px
   left rail, always open, at ≥1200; at 768–1199 it stays a sheet opened by a button.
   *Used by:* search results, my listings, leads, payments, activity.
5. **Cards → table.** A dense operational list becomes a real table at ≥1200 with
   sortable headers and a row action menu; stays cards at 768–1199.
   *Used by:* payments, my listings (list mode), tickets, login activity, trash.
6. **Rail for secondary content.** Anything the mobile screen shows *below* the fold
   because it had nowhere else to go moves to the 320px right rail: plan/usage summary,
   quick actions, tips, related items, recent activity.
   *Used by:* dashboard, my listings, leads, profile, saved.
7. **Steps → visible stepper.** A multi-step mobile flow shows all steps as a horizontal
   stepper at the top on desktop instead of a progress bar.
   *Used by:* create flow, verification.
8. **Full-screen viewer stays full-screen.** The story viewer and the photo lightbox do
   NOT get a sidebar; they centre their frame on a dimmed page.

---

## 5. Things that must not change

- Every route, param, permission gate and middleware rule.
- All copy, field labels, validation, error strings, empty states.
- Dark mode: every colour is a token; no new hex values anywhere.
- Icons: the existing `Icon` set. Nav uses the `nav-*` glyphs.
- Role behaviour: `builder` has no Search. Guests see the guest strip and the log-in CTA.

One deliberate exception, and only this one: `app/layout.tsx` sets
`maximumScale: 1, userScalable: false`. That is a mobile-PWA choice which also blocks
zoom on desktop, an accessibility failure once the app is a desktop product. Drop those
two fields (or gate them) as part of the shell change.

---

## 6. Tokens (verbatim from `app/globals.css`, do not add to)

Light: `--bg-page:#ffffff` `--bg-page-desktop:#fafafa` `--surface-1:#ffffff`
`--surface-2:#f5f5f5` `--surface-3:#efefef` `--border:#dbdbdb` `--divider:#efefef`
`--ink-primary:#111111` `--ink-secondary:#555555` `--ink-tertiary:#6e6e6e`
`--ink-disabled:#c7c7c7` `--accent:#0f9d58` `--accent-pressed:#0c7c46`
`--accent-soft:#e6f4ec` `--error:#ed4956` `--warning:#f5a623` `--info:#0095f6`
plus `--tone-*` (dashboard tiles) and `--avatar-1..8` (default avatars).

Dark (`.dark`): `--bg-page:#000000` `--surface-1:#121212` `--surface-2:#1e1e1e`
`--surface-3:#262626` `--border:#363636` `--ink-primary:#f5f5f5`
`--ink-secondary:#b0b0b0` `--ink-tertiary:#8e8e8e` `--accent:#1db868`.

`--bg-page-desktop` (#fafafa) is what the page sits on at ≥768 in console chrome; cards
stay `--surface-1`. On mobile the page stays `--bg-page`.

---

## 7. How to read the files in this folder

Each `.html` opens in a browser and shows the same screen in device frames you switch
with the buttons at the top (768 / 1024 / 1280 / 1440 / 1600), plus a dark toggle.
The frames use **container queries**, so a frame's width behaves exactly like a real
viewport width — what you see at 1280 is what a 1280px browser gets.

The dark strip at the top of each file is review chrome. It is not part of the design.
