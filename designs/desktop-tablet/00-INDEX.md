# HomzList — Desktop + Tablet design set (non-admin) · INDEX

Read [`00-SPEC.md`](00-SPEC.md) first. Admin (`app/(admin)/**`) is **excluded** — it is
already built wide.

Every non-admin route in the live app is listed below, and every one of them is covered
by exactly one design file. Nothing is left out; when the last row says Done, the whole
product has a desktop and a tablet design.

Status: ⬜ not started · 🟨 in progress · ✅ done

---

## Batch 1 — the shell (everything else sits inside it)

| # | File | Covers | Status |
|---|---|---|---|
| 01 | `01-shell.html` | Browse header (2 rows) · console sidebar 240 · tablet icon rail 72 · right rail · footer · bottom-nav retirement · role + guest variants | ✅ |

## Batch 2 — entry and discovery

| # | File | Routes covered | Status |
|---|---|---|---|
| 02 | `02-auth-entry.html` | `/login`, `/seller/login`, `/offline`, `/seller/maintenance`, `/foundation` | ✅ |
| 03 | `03-home-feed.html` | `/` (feed, stories, sections, guest strip) | ✅ |
| 04 | `04-search.html` | `/search`, `/search/results`, `/search/coming-soon`, `/area/[slug]`, `/[landing]` | ✅ |

## Batch 3 — detail surfaces

| # | File | Routes covered | Status |
|---|---|---|---|
| 05 | `05-property-detail.html` | `/property/[id]`, `/seller/property/[id]` | ✅ |
| 06 | `06-project-detail.html` | `/project/[id]`, `/projects/[id]`, `/seller/project/[id]` | ✅ |
| 07 | `07-story-viewer.html` | `/story/[posterId]`, `/seller/story/[posterId]` | ✅ |

## Batch 4 — creation

| # | File | Routes covered | Status |
|---|---|---|---|
| 08 | `08-create-flow.html` | `/create`, `/seller/create/type`, `/form`, `/photos`, `/preview`, `/success`, `/drafts` | ✅ |
| 09 | `09-projects-create.html` | `/seller/projects/new`, `/seller/projects/[id]/insights` | ✅ |

## Batch 5 — the seller console core

| # | File | Routes covered | Status |
|---|---|---|---|
| 10 | `10-dashboard.html` | `/seller/dashboard` | ✅ |
| 11 | `11-my-listings.html` | `/seller/listings`, `/listings/[id]`, `/[id]/insights`, `/listings/trash`, `/seller/archived` | ✅ |
| 12 | `12-leads.html` | `/leads`, `/leads/[kind]/[id]`, `/leads/lead/[id]`, `/seller/visits`, `/seller/proposals` | ✅ |
| 13 | `13-requirements.html` | `/requirements/[id]`, `/seller/requirements`, `/mine`, `/new`, `/[id]`, `/[id]/proposals` | ✅ |

## Batch 6 — communication

| # | File | Routes covered | Status |
|---|---|---|---|
| 14 | — *(no design needed)* | `/messages`, `/seller/messages` — both are a **redirect to `/leads`**; chat was removed from the product, so there is no screen to design. Covered by `12-leads.html`. | ✅ |
| 15 | `15-notifications.html` | `/notifications`, `/seller/notifications` | ✅ |
| 16 | `16-saved-activity.html` | `/seller/saved`, `/seller/activity`, `/activity/saved-searches` | ✅ |

## Batch 7 — identity

| # | File | Routes covered | Status |
|---|---|---|---|
| 17 | `17-profile.html` | `/profile`, `/profile/[username]`, `/seller/profile`, `/profile/edit`, `/profile/verification` | ✅ |

## Batch 8 — money

| # | File | Routes covered | Status |
|---|---|---|---|
| 18 | `18-plans-checkout.html` | `/seller/plans`, `/plans/my`, `/seller/checkout`, `/checkout/success` | ✅ |
| 19 | `19-payments-boost.html` | `/seller/payments`, `/seller/boost`, `/boost/new` | ✅ |

## Batch 9 — the long tail

| # | File | Routes covered | Status |
|---|---|---|---|
| 20 | `20-settings.html` | `/seller/settings` + `/account`, `/account-status`, `/data`, `/language`, `/login-activity`, `/notifications`, `/privacy` | ✅ |
| 21 | `21-help-support.html` | `/seller/help`, `/help/[category]`, `/article/[slug]`, `/contact`, `/tickets`, `/tickets/[id]` | ✅ |
| 22 | `22-content.html` | `/blog`, `/blog/[slug]`, `/legal`, `/legal/[slug]`, `/seller/blog*`, `/seller/legal*` | ✅ |
| 23 | `23-components.html` | `/seller/settings/components` — every primitive at its desktop and tablet size | ✅ |

---

## Route coverage check

Non-admin `page.tsx` routes in the app: **99** (public 26 + seller 73, `/offline`
included). Every one appears in exactly one row above. `(public)` and `(seller)`
duplicates of the same screen (search, story, profile, blog, legal, property, project,
leads) share one design file because they render the same screen behind a different
route group.

Deliberately excluded: `app/(admin)/**` (27 routes) — already a wide console.

---

## For whoever implements this

Port in this order, and stop after each to look at the result in a real browser:

1. **`01-shell.html` first, on its own.** Until the 470px lock in
   `components/nav/AppShell.tsx` (`max-w-column`) and `components/nav/Header.tsx` opens
   up at `md:`, no screen design can appear. After only this step every screen becomes
   wide — plain, but wide. That is expected.
2. Then one batch at a time, in the numbered order.
3. Mobile is verified after every batch: at 390px the diff must be visually zero.

---

## Design rules this set follows (owner's, 20 Aug 2026)

1. **Carousels everywhere, never a card grid.** Every section on every screen is a rail with
   prev/next arrows — home sections, developers, brokers, dashboard tiles, plans, saved
   collections, blog topics. The only exceptions, and the reason for each:
   - **Search results, My Listings, Payments, Leads, Visits, Boosts** — wide **rows** in a
     vertical list. These are lists you scan and work through; 84 results inside a carousel
     cannot be read. They are not grids either.
   - **The photo tray** in the create flow — an upload surface, not a content list.
   - **One table**, in Payments, plus its sample in `23-components.html`.
2. **The header is the current project's `Header.tsx`, ported as-is** — logo + city on the
   left, primary nav centred, Dashboard · bell · saved · avatar · Post Property on the right,
   nav folding into the hamburger below 1080. Guests get "Log in" + Post Property with FREE*.
3. **Content is this app's own.** Every title, subtitle, field label, chip, empty state and
   button string was read out of the live app's components. Nothing was invented, and where a
   screen turned out not to exist (`/messages`) no screen was designed for it.
4. **Composition is free.** Where something sits on desktop is decided by what the screen is
   for, not by where it sits on the phone — sheets become sidebars and rails, the story viewer
   stays a phone-shaped player on a dark page, the guest gate becomes a modal.

## Files

| File | What it is |
|---|---|
| `00-SPEC.md` | Breakpoints, the two chromes, recomposition patterns, tokens |
| `00-INDEX.md` | This file — route coverage and status |
| `_kit.css` | Tokens + header + sidebar + carousel + every primitive |
| `_kit.js` | Icon sprite and the shared header / sidebar / footer / bottom-nav partials |
| `01`–`23` `.html` | The screens. Open any one in a browser; frames are real widths |

Every `.html` links `_kit.css` and `_kit.js`, so the folder must be kept together.
