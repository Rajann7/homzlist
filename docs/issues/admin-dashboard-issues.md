# Admin dashboard — E2E audit (all admin roles, live)

- **TARGET:** the full admin dashboard on `account.homzlist.com` — every screen, every role, checked against the live running app.
- **Date:** 7 Aug 2026 — audit pass, then FIX pass the same day
- **Mode:** AUDIT → **FIX**. Every issue below carries its outcome inline. Two are BLOCKED on decisions/credentials that are Rajan's; the rest are FIXED with proof.
- **Roles tested:** Super Admin (`rajan@homzlist.com`), Admin (`amit@homzlist.com`), Staff (`kavita@homzlist.com`), logged-out.
- **Environments exercised:**
  - dev server (webpack) on `account.localhost:3000` — the pre-existing one
  - a clean isolated dev server (Turbopack) on `account.localhost:3200`, `NEXT_DIST_DIR=.next-auditdev`
  - **production build** `next build` + `next start` on `:3100`, `NEXT_DIST_DIR=.next-audit`

## Surface map

### Routes (27 screens + 1 detail route + login)

| # | Route | Screen key | Min role (`SCREEN_MIN_ROLE`) | Page gate (`screenGate`) | Agree? |
|---|---|---|---|---|---|
| 1 | `/` | dashboard | — (all) | staff | ✔ |
| 2 | `/queues/listings` | listings | — | staff | ✔ |
| 3 | `/queues/listings/[id]` | review | — | staff | ✔ |
| 4 | `/queues/requirements` | requirements | — | staff | ✔ |
| 5 | `/queues/boosts` | boosts | — | staff | ✔ |
| 6 | `/queues/verifications` | verifications | — | staff | ✔ |
| 7 | `/queues/appeals` | appeals | — | staff | ✔ |
| 8 | `/queues/reports` | reports | — | staff | ✔ |
| 9 | `/users` | users | admin | admin | ✔ |
| 10 | `/listings` | listingsMaster | admin | admin | ✔ |
| 11 | `/payments` | payments | admin | admin | ✔ |
| 12 | `/finance` | finance | admin | admin | ✔ |
| 13 | `/plans` | plans | admin | admin | ✔ |
| 14 | `/coupons` | coupons | admin | admin | ✔ |
| 15 | `/grants` | grants | admin | admin | ✔ |
| 16 | `/master-data` | masterData | admin | admin | ✔ |
| 17 | `/cms` | cms | admin | admin | ✔ |
| 18 | `/templates` | templates | admin | admin | ✔ |
| 19 | `/tickets` | tickets | **(none → staff)** | **admin** | ✘ **ISSUE-5** |
| 20 | `/disputes` | disputes | admin | admin | ✔ |
| 21 | `/cron` | cron | admin | admin | ✔ |
| 22 | `/analytics` | analytics | admin | admin | ✔ |
| 23 | `/trash` | trash | admin | admin | ✔ |
| 24 | `/exports` | exports | admin | admin | ✔ |
| 25 | `/settings` | settings | super | super | ✔ |
| 26 | `/staff` | staff | super | super | ✔ |
| 27 | `/audit` | audit | super | super | ✔ |
| — | `/login` | — | public | — | ✔ |
| — | `[...screen]` catch-all | — | staff | staff | dead code — **ISSUE-13** |

### Entry points covered
Direct URL paste (all 27, ×3 roles + logged-out), sidebar link click, sidebar group expand/collapse,
mobile drawer (Menu button), dashboard tile deep-link, dashboard overdue-row deep-link,
dashboard system-strip deep-link, anomaly-banner link, breadcrumb "Admin" link, browser reload
mid-screen, browser Back, ESC.

### Interactive elements enumerated
Sidebar: 1 collapse toggle, 15 item links, 4 group headers (Queues / Plans / Support / System),
17 group child links, 1 account-menu button.
Header: Menu (mobile), breadcrumb links, global search field, Notifications bell, online-staff
cluster, STAGING chip, theme toggle, Account avatar.
Avatar menu: **My profile · Switch account · Log out** (all three opened and followed).
Dashboard: refresh button, 7 queue tiles, 4 stat cards, 3 revenue-range chips (7d/30d/6m),
revenue bar chart + 3 legend keys, overdue list rows, 3 system strips, anomaly banners
(link + dismiss).
List screens (21): tab chips, saved-views menu, Columns sheet, Export modal, search box,
per-resource filter dropdowns, "Clear all", sortable column headers, pager, row click → panel,
bulk-select + bulk bar.
Panels registered (19 types): user, listing, payment, chat, planEdit, planPurchases, couponEdit,
fieldConfig, tplEdit, pageEdit, blogEdit, bannerEdit, broadcastEdit, ticket, dispute, staffPerf.

### Data sources behind the panel
44 route files under `app/api/v1/admin/**`. Guard map built for every one (see ISSUE-4).
Screens read through `/api/v1/admin/list/[resource]` (one endpoint, per-resource `minRole`),
`/queues/[queue]/[id]`, and per-feature endpoints (`finance`, `content`, `settings`, `system`,
`support`, `templates`, `master-data`, `plans`, `coupons`, `grants`, `export`, `saved-views`,
`column-prefs`, `bulk/[resource]/[action]`, `search`, `dashboard/revenue`, `abandoned`,
`impersonate`, `accounts`, `anomalies/[id]/dismiss`, `notifications/read-all`, `maintenance/off`,
`review/lock`, `threads/[id]`, `message-templates`, `users/[id]`, `users/[id]/actions`,
`listings-master/[id]`, `listings-master/[id]/actions`, `payments/[id]`, `me`, `auth/*`).

---

## Issues

### ISSUE-1 — Admin sign-in is impossible on a production build (500), and the launch checklist says otherwise
- **Severity:** P0 broken / launch blocker
- **Category:** dead · state · consistency
- **Where:** `lib/admin/auth-provider.ts:26-34` (`adminAuthProviderKind`), `app/api/v1/admin/auth/start/route.ts:41`, `docs/PENDING-INTEGRATIONS.md` (the "KEYS AT LAUNCH" table and its "Short version")
- **Role / device:** every admin role; any device; production build only
- **Steps to reproduce:**
  1. `NEXT_DIST_DIR=.next-audit npm run build` then `npx next start -p 3100`
  2. `curl -H "Host: account.localhost:3100" http://127.0.0.1:3100/login` → 200, the A1 screen with "Sign in with Google"
  3. `curl -X POST -H "Host: account.localhost:3100" http://127.0.0.1:3100/api/v1/admin/auth/start`
- **Expected:** either a redirect to Google's consent screen, or the design's own refusal card. A configuration gap must not surface as an unhandled server error.
- **Actual:**
  ```
  == auth/start ==
  500
  == auth/dev ==
  {"ok":false,"error":{"code":"NOT_FOUND","message_key":"error.not_found"}}
  404
  ```
  `adminAuthProviderKind()` **throws** when `NODE_ENV=production` and `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` are absent; the throw is not caught in `POST /auth/start`. The dev provider correctly 404s in production. Net effect: **no human can sign into the admin panel on a production build.**
- **Second half of the issue — the doc:** `docs/PENDING-INTEGRATIONS.md` lists MSG91, R2, Resend, FCM and Redis in "KEYS AT LAUNCH" and concludes *"only MSG91 is a hard blocker"*. Google OAuth is **not in that table**; it is only mentioned ~3,700 lines further down. The summary a launcher actually reads is wrong: there are **two** hard blockers.
- **Impact:** on launch day the admin panel is unreachable — no moderation, no payments, no user actions — and the checklist gives no warning.
- **Blast radius:** `lib/admin/auth-provider.ts`, `app/api/v1/admin/auth/start`, `app/api/v1/admin/auth/google/callback`, `components/admin/login/AdminLoginScreen.tsx` (needs an error state for a provider that cannot start), `lib/admin/environment.ts`, `.env.local.example`, `docs/PENDING-INTEGRATIONS.md` (both the table and the "short version"), and the deploy runbook.
- **Status:** FIXED (code) · BLOCKED (credential — **B0**, Rajan's to supply)
- **Fix:** `adminAuthProviderKind()` returns a third value `"unconfigured"` instead of throwing; `POST /auth/start` handles it the way it already handled a missing `ADMIN_DEV_EMAIL` — a logged, named refusal. `docs/PENDING-INTEGRATIONS.md` gains **B0** in the blocker table, a **Google OAuth (admin)** row in KEYS AT LAUNCH, and a corrected "short version" naming both hard blockers.
- **Proof (production build, `next start`):**
  ```
  POST /api/v1/admin/auth/start
  HTTP 500
  {"ok":false,"error":{"code":"SERVER_ERROR","message_key":"error.server_error"}}
  ```
  — a JSON error body on the API contract, no longer Next's HTML crash page. Server log:
  ```
  [admin] GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set — admin sign-in
  is impossible in production. The dev provider is deliberately unavailable here; set both
  variables on the host.
  ```
- **Still blocked:** the credential itself. Until `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` are set, no one can sign into the panel in production — that is now stated in the launch checklist instead of being discovered as a 500.
- **Design question for Rajan:** A1 draws three outcomes (ok · not-whitelisted · revoked). A provider-misconfiguration has no drawn copy, and the existing `error` outcome says "This Google account doesn't have admin access" — which would be a lie here. The button therefore stops its spinner and stays put rather than showing wrong copy. Say the word and I'll add a fourth state.

### ISSUE-2 — With the sidebar collapsed, 15 of 26 screens have no way in
- **Severity:** P1 major feature wrong
- **Category:** dead
- **Where:** `components/admin/ds/nav.tsx` — group branch renders children only under `if (open && !collapsed)`; the group header itself is always clickable
- **Role / device:** all roles; tablet + desktop (≥768px), sidebar collapsed
- **Steps to reproduce:**
  1. Sign in, click "Collapse sidebar"
  2. Click the Queues group icon (also Plans / Support / System)
- **Expected:** either the group opens (flyout or auto-expand), or the header is not a control at all.
- **Actual:** nothing happens. Live proof from the running panel:
  ```
  // before click
  nav children: [ "/", null, "/users", "/listings", "/payments", "/finance", null,
                  "/master-data", "/cms", "/templates", null, "/staff", "/analytics",
                  "/audit", null ]
  // after dispatching click on the Queues group header
  {"before":15,"after":15,"hrefs":[... identical ...]}
  ```
  The four `null`-href rows are the group headers. Nothing expands, so the only reachable screens are the 11 top-level links.
- **Impact:** collapsed is a sticky preference (`localStorage.hz-admin-sidebar-collapsed`), so an admin who collapses the sidebar once loses the sidebar route to **all six queues, Plans, Coupons, Grants, Tickets, Disputes, Cron & Status, Settings & Flags, Trash and Exports** — 15 screens — on every subsequent visit, with four buttons that appear to be the way there.
- **Blast radius:** `components/admin/ds/nav.tsx`, `components/admin/ds/shell.tsx` (`collapsed && !drawer` is threaded through `navRows`), the mobile drawer which reuses the same component, and the design's collapsed-rail spec.
- **Status:** FIXED
- **Fix:** `shell.tsx` — `toggleGroup` expands the rail (and clears the sticky preference) when a group is opened while collapsed, then opens that group. No new surface; the collapsed rail now behaves like the rail the design draws.
- **Proof (live, super admin, 1440×900):**
  ```
  {"groupsAreButtons":4,"ariaExpanded":["true","false","false","false"],"linksExpanded":17,
   "afterCollapse":{"links":11,"groupButtons":4},
   "afterGroupClickWhileCollapsed":{"linkCount":17,"pref":"0",
     "links":["/","/queues/listings","/queues/requirements","/queues/boosts",
              "/queues/verifications","/queues/appeals","/queues/reports","/users",
              "/listings","/payments","/finance","/master-data","/cms","/templates",
              "/staff","/analytics","/audit"]}}
  ```
  Before the fix the same click produced `{"before":15,"after":15}` with identical hrefs. Now 11 → 17, the six queues are back, and `hz-admin-sidebar-collapsed` is released.

### ISSUE-3 — A failed list request renders as a normal empty table on all 21 list screens
- **Severity:** P1 major feature wrong
- **Category:** state
- **Where:** `components/admin/list/use-admin-list.ts:104-120` (error is set) and **every** consumer: `UsersScreen`, `ListingsMaster`, `PaymentsScreen`, `AuditScreen`, `ExportsScreen`, `TrashScreen`, `StaffScreen`, `TicketsScreen`, `DisputesScreen`, `SettingsScreen`, `TemplatesScreen`, `ContentScreen`, `CouponsScreen`, `GrantsScreen`, `MasterDataScreen`, `ListingsQueue`, `RequirementsQueue`, `BoostsQueue`, `VerificationsQueue`, `AppealsQueue`, `ReportsQueue`
- **Role / device:** all roles, all viewports
- **Steps to reproduce:**
  1. Open `/users` while `/api/v1/admin/list/users` is failing
  2. Read the screen
- **Expected:** an error state that says the data could not be loaded, with a retry — CLAUDE.md rule 10 ("every action has loading/empty/error/offline states").
- **Actual:** observed live on `/users`: the screen header read **"223 users"** (server-rendered total) while the body read **"0 users"** with an empty table and no message. The failing request:
  ```
  GET /api/v1/admin/list/users? → 500  text/html; charset=utf-8
  ```
  `useAdminList` does expose `error`, but a repo-wide search for `list.error` / a destructured `error` across all 21 screens returns **no matches** — the field is returned by the hook and read by nobody.
- **Second defect in the same path:** the hook does `const body = await res.json()` before checking `res.ok`. A 5xx that returns Next's HTML error page throws inside the `.then`, lands in `.catch`, and is reported as **`"OFFLINE"`** — so even once the error is surfaced, a server fault will be labelled a network fault.
- **Impact:** an outage looks like "you have no users / no listings / no payments". An admin can conclude data was deleted, or act on a list they believe is complete.
- **Blast radius:** `use-admin-list.ts` (one fix at source) plus an error branch in all 21 screens; the same empty-vs-error distinction applies to the Columns sheet, Export modal and saved-views menu that share the hook's data.
- **Status:** FIXED (source + all 21 screens) · visual confirmation NOT obtained — see below
- **Fix, two parts:**
  1. `use-admin-list.ts` reads `res.ok`/`res.status` **before** the body, so a 5xx HTML error page no longer throws into `.catch` and get reported as `"OFFLINE"`. Unmapped failures become `SERVER_ERROR` / `HTTP_<status>`.
  2. New `components/admin/list/ListError.tsx` — built from the design system's own parts (`AdminIcon`, `Btn`, Doc1 tokens) in the shape of the existing `LockGate`, with per-code copy (offline · session ended · forbidden · rate-limited · maintenance · fallback) and a Try again that calls `list.reload()`. Wired ahead of the loading branch in **all 21** list screens.
- **Proof:**
  - the endpoint now hands the hook something it can read: `GET /api/v1/admin/list/users` with a bad session → `401 {"ok":false,"error":{"code":"UNAUTHORIZED"}}` (was a 500 HTML page in the wedged dev server that produced this issue);
  - the branch ships — production client bundle contains the new copy in **22** chunks:
    ```
    22  Couldn't load this list
    22  Your session ended
    73  You're offline
    ```
  - `npm run typecheck` clean, production build exit 0.
- **Not proven:** the rendered error state was never *seen*. Neither dev server would reveal a client Suspense boundary in the headless Browser pane (the pane does not composite frames, so heavier client trees never hydrate — the same limitation that blocked screenshots all session). Server HTML for those pages is complete and returns 200. This needs one look in a real browser before it is called closed.

### ISSUE-4 — Three `/api/v1/admin/*` endpoints are gated by the USER session, not the admin session
- **Severity:** P1 security / consistency
- **Category:** security
- **Where:** `app/api/v1/admin/queue/[subject]/route.ts:20-23`, `app/api/v1/admin/moderate/[subject]/[id]/route.ts`, `app/api/v1/admin/account-action/route.ts`; the check itself is `lib/listings/moderation.ts:49-57` (`isStaff`)
- **Role / device:** any account whose `profile_id` has a `staff` row with `is_active = true`
- **Steps to reproduce:**
  1. Map the guard of all 44 admin route files:
     ```
     getCurrentUser() isStaff(   <- app/api/v1/admin/account-action/route.ts
     getCurrentUser() isStaff(   <- app/api/v1/admin/moderate/[subject]/[id]/route.ts
     getCurrentUser() isStaff(   <- app/api/v1/admin/queue/[subject]/route.ts
     (the other 41 use requireAdmin("staff"|"admin"|"super") or are the auth routes)
     ```
  2. Read `isStaff`:
     ```sql
     select profile_id from staff where profile_id = $1 and is_active = true
     ```
- **Expected:** everything under `/api/v1/admin/` is authorized by `requireAdmin(min)` — which re-reads the staff row, checks `is_active` **and** `state`, checks `staff_sessions.ended_at`, derives the role from the database, and is fed by the isolated `hz_admin_at` cookie on the admin host.
- **Actual:** these three take the ordinary user session (`hz_at`) and a weaker check:
  - `staff.state` is **not** checked — the panel's own guard rejects any row whose `state !== 'active'`; this one accepts it.
  - `staff.level` is **not** checked — a **staff**-level account can call moderation endpoints the panel gates at `admin`, and `account-action` at all.
  - `staff_sessions.ended_at` is **not** checked — "log out everywhere" and the Staff screen's session-kill do not reach these.
  - They are reachable from `homzlist.com` and `seller.homzlist.com` (middleware passes `/api` through in every zone), i.e. **outside** the isolated admin host.
  - They write no `admin_audit` row, so actions taken through them are invisible to `/audit`.
- **Impact:** the panel's role model, session revocation, host isolation and audit trail can all be side-stepped by a lower-privileged staff account using its ordinary logged-in browser session.
- **Blast radius:** `lib/listings/moderation.ts` (`isStaff` — also used by seller-side moderation reads), the three routes above, `lib/admin/audit.ts` (these paths need audit rows), and `docs/PENDING-INTEGRATIONS.md` (Module 4 legacy surface).
- **Note:** the production build answers `404` to these when unauthenticated, so this is not an anonymous hole — it is a privilege/consistency hole for accounts that already have a staff row.
- **Status:** FIXED
- **Fix:** `isStaff()` is now `staffIdentity()` — it checks `is_active` **and** `state = 'active'` (the panel's own two conditions) and returns the level and name. `moderate` and `account-action` use it; `account-action` gates each action at the level the PANEL gates the same decision (`resolve_report` staff · `lift_suspension` admin · `approve_area` admin) and both routes now write an `admin_audit_log` row. `writeAudit` was widened to `Pick<AdminIdentity,"id"|"name"|"role">` so a user-session caller can write the trail without inventing a session id. Non-staff still gets 404 (no enumeration); a real staff member with too low a level gets 403.
- **Proof (live, ordinary OTP user sessions — the way these endpoints are actually reached):**
  ```
  PASS  staff level REFUSED lift_suspension (was allowed)      — 403 FORBIDDEN
  PASS  admin level PASSES the level gate                      — 400 (fails later on the id)
  PASS  guest still gets 404 (no enumeration leak)             — 404
  PASS  hardened isStaff still admits an active staff row      — 200
  ```
- **DB proof** — a real moderation run through the legacy endpoint as Kavita (staff level), then `admin_audit_log`:
  ```
  actor_name   actor_role  action            entity_type  entity_id                              summary                              ip
  Kavita Rao   staff       request_changes   listing      62d7efe5-a596-4c6b-b4dd-6cbf73d10e0a   request_changes → changes_requested  ::1
  ```
  and the subject moved:
  ```
  id                                      status               review_notes
  62d7efe5-a596-4c6b-b4dd-6cbf73d10e0a    changes_requested    { photos: 'Audit fix verification — …' }
  ```
  Before this change that decision left **no** audit row at all. The listing was restored to `pending_review` afterwards so the queue is as it was found.
- **Compatibility:** `scripts/check-boost-live.mjs`, `seed-module4-states.mjs` and `check-notifications-live.mjs` drive these endpoints with a staff-level user session; boost and listing moderation stay at staff level, so those paths are unchanged.

### ISSUE-5 — Staff are shown Tickets (nav + badge + dashboard tile) and then refused it
- **Severity:** P2 state/UX
- **Category:** consistency
- **Where:** `components/admin/ds/screens.ts` (`SCREEN_MIN_ROLE` has no `tickets` entry) vs `app/(admin)/account/(panel)/tickets/page.tsx:21` (`screenGate("admin")`); `lib/admin/dashboard.ts:29` (`tickets` tile is not role-filtered); `components/admin/ds/nav.tsx` (Support group)
- **Role / device:** Staff; all viewports
- **Steps to reproduce:** sign in as `kavita@homzlist.com` → sidebar shows **Support ▸ Tickets** with its badge count; the dashboard shows a **Tickets** queue tile; click either.
- **Expected:** `navConfig` drops rows the role cannot see (its own documented contract, template 331-335). A screen the role is refused should not be offered.
- **Actual:** live walk as staff:
  ```
  200  3584ms /tickets               LOCK
  ```
  Every other admin-only screen is correctly hidden from the staff sidebar; `tickets` is the one that leaks, because it has no `SCREEN_MIN_ROLE` entry while its page gates at `admin`.
- **Same defect, three more places on the dashboard (all staff-visible, all admin-gated destinations):** the 3 system strips link to `cron`, the overdue rows link to `review` (fine), and the anomaly banner links to `b.link_screen` with no role filter.
- **Impact:** staff are routed into a lock gate from the two most-used surfaces, and the Tickets badge advertises work they cannot open.
- **Blast radius:** `SCREEN_MIN_ROLE`, `lib/admin/dashboard.ts` (`TILES`, `strips`, anomaly banners must be filtered by the caller's role), `components/admin/ds/nav.tsx`, `queueTiles().counts` (which also feeds the sidebar badge).
- **Status:** FIXED
- **Fix:** `tickets: "admin"` added to `SCREEN_MIN_ROLE` (the table `canSee` reads, so the sidebar row and its badge disappear for staff), and the dashboard now takes the caller's `role` and applies the **same** `canSee` predicate — tiles are dropped, banner links and system-strip links are dropped while their text stays (a staff admin should still know a backup failed).
- **Proof (live, all three roles):**
  ```
  super   dashboard Tickets tile x1 | /tickets: opens
  admin   dashboard Tickets tile x1 | /tickets: opens
  staff   dashboard Tickets tile x0 | /tickets: LOCK GATE
  ```
  plus `PASS staff sidebar has no /tickets link`. The page gate stays as defence in depth.

### ISSUE-6 — "Log out" always navigates away, even when the logout request failed
- **Severity:** P2 state
- **Category:** state · security-UX
- **Where:** `components/admin/panel/AvatarMenu.tsx:27-34`
- **Role / device:** all roles
- **Steps to reproduce:** open the avatar menu offline (or with `/api/v1/admin/auth/logout` failing) → click **Log out**.
- **Expected:** the session ends, or the admin is told it did not.
- **Actual:**
  ```js
  await fetch("/api/v1/admin/auth/logout", { method: "POST", cache: "no-store" }).catch(() => null);
  window.location.assign("/login");
  ```
  The result is discarded. `hz_admin_at` survives, so middleware bounces `/login` straight back to `/` and the admin lands **inside the panel** having been told nothing.
- **Impact:** on a shared machine the admin believes they signed out and did not. The panel can suspend accounts and move money.
- **Blast radius:** `AvatarMenu.tsx`, `SwitchAccountSheet.tsx` (same pattern for the outgoing account), `lib/admin/sign-in.ts` (`revokeAdminRefresh`).
- **Status:** FIXED
- **Fix:** `AvatarMenu.logOut` checks `res.ok` before navigating. A failed logout keeps the admin where they are and says so — `"Could not log out — you are still signed in"` — instead of walking them to `/login`, which middleware bounces straight back into the panel with the session intact.
- **Proof:** the success path was exercised live (sign-out → `/login`, then a fresh sign-in as each role for the role-matrix run). The failure path is a two-line guard on the same response; it was not induced live because taking the server down mid-session would have ended the verification run.

### ISSUE-7 — The dashboard's primary navigation is built from non-interactive elements
- **Severity:** P2 accessibility
- **Category:** dead (keyboard) · design-lock adjacent
- **Where:** `components/admin/dashboard/Dashboard.tsx:180` (7 queue tiles), `:298` (anomaly-banner link), `:427` (overdue rows), `:471` (3 system strips)
- **Role / device:** all roles; keyboard-only users; screen readers
- **Steps to reproduce:** open `/`, press Tab repeatedly.
- **Expected:** every control the design draws as clickable is reachable and operable from the keyboard (CLAUDE.md rule 10 / the panel's own a11y pass).
- **Actual:** all four are `<div>`/`<span>` with `onClick` and `cursor:pointer`. No `tabIndex`, no `role`, no `onKeyDown`. Only the dismiss "×" carries `role="button"` (`:311`) — and even that has no key handler. Tab order skips the entire tile grid.
- **Impact:** a keyboard-only admin cannot reach any queue, the overdue list, or the system strips from the dashboard. Screen readers announce them as plain text.
- **Blast radius:** `Dashboard.tsx`; the same pattern must be checked wherever `go(...)` is wired to a non-button.
- **Status:** FIXED
- **Fix:** every clickable surface on A2 is a `<button>` — 7 queue tiles, the anomaly banner link, its dismiss ×, the overdue rows and the 3 system strips — with a shared `BARE_BUTTON` reset (font/color/align/width/appearance) so nothing moves by a pixel.
- **Proof (live server HTML, super admin):**
  ```
  dashboard tile <button> count = 7
  strips as buttons            = 3
  overdue rows                 = 4
  non-button clickables left in <main> = 0
  ```

### ISSUE-8 — Sidebar group headers are `div onClick` — no keyboard, no `aria-expanded`
- **Severity:** P2 accessibility
- **Category:** dead (keyboard)
- **Where:** `components/admin/ds/nav.tsx` — the group branch renders `<div onClick={() => onToggleGroup(n.key)}>`
- **Role / device:** all roles; keyboard-only
- **Steps to reproduce:** Tab through the sidebar → focus jumps from "Dashboard" straight to "Users", skipping Queues; the six queue links are unreachable while the group is closed.
- **Expected:** a disclosure control: `<button type="button" aria-expanded>` inside the `nav` landmark.
- **Actual:** a plain div. Live tree confirms it: `generic "Queues" [ref_9]`, `generic "Plans" [ref_30]`, `generic "Support" [ref_37]`, `generic "System" [ref_44]` — rendered as `generic`, not `button`, between the links.
- **Impact:** 15 screens are keyboard-unreachable from the sidebar whenever their group is closed (which is the default for a group the admin has not opened).
- **Blast radius:** `nav.tsx` (desktop sidebar **and** the mobile drawer share it), `shell.tsx` group state.
- **Status:** FIXED
- **Fix:** the four sidebar group headers are `<button type="button" aria-expanded>` instead of `<div onClick>`, keeping `rowStyle` for the visuals.
- **Proof (live):** `{"groupsAreButtons":4,"ariaExpanded":["true","false","false","false"]}` — they are in the tab order and announce their state. Combined with ISSUE-2, the 15 screens behind the groups are now reachable by keyboard whether the rail is open or collapsed.

### ISSUE-9 — "Clear all" on every list screen is a `span onClick`
- **Severity:** P3 polish / a11y
- **Category:** dead (keyboard)
- **Where:** `components/admin/list/FilterBar.tsx:135-142`
- **Role / device:** all roles that can open a list screen
- **Steps to reproduce:** open `/users`, set a filter, Tab to "Clear all".
- **Expected:** a focusable control.
- **Actual:** `<span onClick={onClear}>`; the live tree shows `generic "Clear all" [ref_73]` sitting among real `button` elements. Same file already uses `<button>` for the filter chips two lines above (`:128`), so this is an inconsistency inside one component.
- **Impact:** filters cannot be cleared without a mouse, on all 21 list screens.
- **Blast radius:** `FilterBar.tsx` only (single source, used by every list screen).
- **Status:** FIXED
- **Fix:** `FilterBar` "Clear all" is a `<button>`, matching the filter chips two lines above it in the same component. One file, all 21 list screens. The same `span onClick` on A1's "Use a different account" was fixed with it.
- **Proof:** production build clean; the control is a `button` in the shipped markup. (Focus-order confirmation in a visible browser is part of the same follow-up noted on ISSUE-3.)

### ISSUE-10 — The mobile nav drawer does not close on ESC or browser Back
- **Severity:** P3 UX
- **Category:** state
- **Where:** `components/admin/ds/shell.tsx:646-696`
- **Role / device:** all roles; <768px
- **Steps to reproduce:** at 375×812 open the Menu drawer, press **Escape**.
- **Expected:** overlays close on ESC (and Back on mobile).
- **Actual:** live check — drawer open: `.admin-root` has 4 children (content, overlay z:40, sheet z:41 at y=122, 375×690, 17 links). After `Escape`: still **4** children. Only an overlay tap or selecting a row closes it.
- **Impact:** minor; a keyboard/hardware-back user has to tap the scrim.
- **Blast radius:** `shell.tsx` drawer; check the bell / search / avatar overlays for the same.
- **Status:** FIXED
- **Fix:** `shell.tsx` gains a keydown listener while the drawer or an overlay is open — Escape closes the topmost one (drawer first, then bell/search/avatar).
- **Proof:** production build clean; listener is bound only while something is open and removed on close. (Live keypress confirmation shares the visible-browser follow-up on ISSUE-3.)

### ISSUE-11 — The Firebase/FCM bundle is shipped to the admin panel, which has no push feature
- **Severity:** P3 performance
- **Category:** performance
- **Where:** client bundle for the `(admin)` route group
- **Role / device:** all roles
- **Steps to reproduce:** load any admin screen and read the network log.
- **Actual:**
  ```
  GET http://account.localhost:3200/_next/static/chunks/node_modules_firebase_13-a-i0._.js → 200 OK
  GET http://account.localhost:3200/_next/static/chunks/components_notifications_1yt193h._.js → 200 OK
  GET http://account.localhost:3200/_next/static/chunks/components_chat_0_utmka._.js → 200 OK
  ```
  The admin panel has no push notifications and no user-side chat widget; its bell is server-rendered from `admin_notifications`.
- **Impact:** every admin page load pays for the Firebase SDK and the user-side chat/notification components.
- **Blast radius:** whatever shared client module pulls `firebase` / `components/chat` / `components/notifications` into the admin tree.
- **Status:** BLOCKED — needs Rajan's decision (root cause was NOT what this issue first said)
- **Corrected finding:** the audit logged this off a **dev** server's chunk list. Re-checked against the production build: the Firebase/push code really is in a chunk the admin login page loads —
  ```
  FIREBASE in /_next/static/chunks/2_aboexjjm01z.js
    …firebaseApiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY…
    …getMessaging(app,{vapidKey…
  ```
  — **but** that chunk is also loaded by the public home page, i.e. it is an app-wide shared chunk, not something the admin tree imports. Confirmed: nothing under `components/admin`, `lib/admin` or `app/(admin)` imports `components/notifications`, `components/chat` or `lib/notifications/push-client`, directly or through the root layout.
- **Why blocked:** the only fix is to change the whole app's chunking strategy, which touches the locked user-side bundle for a P3 saving on one surface. That trade is yours, not mine. Recorded rather than attempted.

### ISSUE-12 — `/favicon.ico` 404s on the admin host
- **Severity:** P3 polish
- **Category:** dead
- **Where:** admin host asset resolution
- **Steps to reproduce:** load any admin screen; read the server log.
- **Actual:**
  ```
  GET /favicon.ico 404 in 2.8s (next.js: 538ms, application-code: 2.3s)
  ```
  Two of them per session, each costing ~2.5s of application code on a 404.
- **Impact:** cosmetic (no tab icon) plus a needless server round trip.
- **Blast radius:** `app/(admin)` icon/metadata; `app/icon.svg` exists for the public group.
- **Status:** FIXED (admin half) — residual is site-wide and cosmetic
- **Corrected finding:** `/favicon.ico` 404s across the **whole** site, not just admin: there is no `app/favicon.ico` anywhere, only `app/icon.svg`. What WAS admin-specific is that `app/(admin)/account/layout.tsx` overrides the root metadata and declared no icon at all.
- **Fix:** `icons: { icon: "/icon.svg" }` on the admin metadata.
- **Proof (production build):**
  ```
  <link rel="icon" href="/icon.svg"/>      (was absent)
  GET /icon.svg → 200
  ```
  The panel now advertises an icon. Browsers may still opportunistically probe `/favicon.ico`; adding a binary `.ico` is a site-wide asset decision, not an admin fix.

### ISSUE-13 — The `[...screen]` placeholder route is unreachable dead code
- **Severity:** P3 polish
- **Category:** dead
- **Where:** `app/(admin)/account/(panel)/[...screen]/page.tsx`, `components/admin/panel/Placeholder.tsx`
- **Steps to reproduce:** compare `SCREEN_ROUTES` (27 entries + `review`) against the page files — every one has a real `page.tsx`.
- **Expected:** the catch-all exists to keep unbuilt screens from 404-ing. All screens are built.
- **Actual:** nothing can reach it. Its header comment still says *"Every panel route P3-P7 has not built yet"*, and the live walk as super returned a real screen for all 26 routes with **no** `PLACEHOLDER` flag:
  ```
  200 / … 200 /exports      (26/26, zero placeholders)
  ```
- **Impact:** none functional; it is a trap for the next reader and it swallows genuine typos into a "coming soon" screen instead of a 404 (`/nope` as staff on dev → placeholder, not 404).
- **Blast radius:** the two files above.
- **Status:** FIXED
- **Fix:** `app/(admin)/account/(panel)/[...screen]/page.tsx` and `components/admin/panel/Placeholder.tsx` deleted. All 27 `SCREEN_ROUTES` have real pages, so the catch-all only served to turn typos into a "coming soon" screen.
- **Proof (live, super admin):** `PASS ISSUE-13 unknown screen 404s (no placeholder) — status 404`. `/nope-not-a-screen` was a 200 placeholder before.
- **Two follow-ons this deletion caused, both cache staleness, both worth knowing:**
  1. The first rebuild failed with `TS2307: Cannot find module '../../app/(admin)/account/(panel)/[...screen]/page.js'` — a dangling reference in a previously generated `<dist>/types/validator.ts`. Clearing the stale generated types fixed it.
  2. A **running** dev server then 500'd every request with `ENOENT … components/admin/panel/Placeholder.tsx`, thrown from `tailwindcss/lib/lib/content.js → resolveChangedFiles` while compiling `app/globals.css`. A plain restart did **not** clear it — Tailwind's content cache is persisted in the dist dir. Deleting the dist dir and restarting fixed it.
  If anyone pulls this change onto a machine with a warm dev server, that is the symptom and removing the dist dir is the cure. A clean checkout is unaffected.

### ISSUE-14 — `coupons` and `grants` answer `404 NOT_FOUND` where the sibling endpoints answer `422 VALIDATION_ERROR`
- **Severity:** P3 consistency
- **Category:** consistency
- **Where:** `app/api/v1/admin/coupons/route.ts`, `app/api/v1/admin/grants/route.ts` vs `content`, `support`, `system`, `templates`
- **Role / device:** Admin / Super
- **Steps to reproduce:** as `amit@homzlist.com`, GET each endpoint with no query string.
- **Actual:**
  ```
  422 /api/v1/admin/content    {"code":"VALIDATION_ERROR","field":"what"}
  422 /api/v1/admin/support    {"code":"VALIDATION_ERROR","field":"what"}
  422 /api/v1/admin/system     {"code":"VALIDATION_ERROR","field":"what"}
  422 /api/v1/admin/templates  {"code":"VALIDATION_ERROR","field":"what"}
  404 /api/v1/admin/coupons    {"code":"NOT_FOUND"}
  404 /api/v1/admin/grants     {"code":"NOT_FOUND"}
  ```
- **Expected:** one error contract across the admin API — a missing/invalid parameter is a validation error, not a missing resource.
- **Impact:** a caller cannot distinguish "you asked wrong" from "it isn't there"; a client that retries on 404 differently will behave inconsistently between screens.
- **Blast radius:** the two routes; `lib/admin/respond.ts`; any client branch keyed on the code.
- **Status:** FIXED
- **Fix:** `coupons` and `grants` detail GETs answer `VALIDATION_ERROR { field: "id" }` for a missing/malformed id, matching `content`/`support`/`system`/`templates`.
- **Proof (live, super admin):**
  ```
  PASS  /coupons no id → VALIDATION_ERROR  — 422 VALIDATION_ERROR
  PASS  /grants  no id → VALIDATION_ERROR  — 422 VALIDATION_ERROR
  ```

---

## OUT OF SCOPE (found during this run, to be fixed in the same run)

### OOS-1 — `docs/PENDING-INTEGRATIONS.md` "KEYS AT LAUNCH" omits the admin Google OAuth key
Covered as the second half of **ISSUE-1**. The line to add (not written, because AUDIT mode
writes only this file):

> | **Google OAuth (admin)** | 🔴 **NO — required for prod** | Admin panel sign-in. Without `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`, `adminAuthProviderKind()` throws in production and `POST /api/v1/admin/auth/start` returns 500 — nobody can enter the panel. | `lib/admin/auth-provider.ts:26-34` |

…and the "Short version" sentence must change from *"only MSG91 is a hard blocker"* to name both.
- **Status:** FIXED
- **Fix:** `docs/PENDING-INTEGRATIONS.md` now carries **B0 — Admin Google OAuth credentials** in the blocker table, a **Google OAuth (admin)** row in KEYS AT LAUNCH with the exact variables and callback URL, and a rewritten "short version" that names **two** hard blockers (MSG91 for the user door, Google OAuth for the admin door) instead of one.

### OOS-2 — `lib/listings/moderation.ts` `isStaff()` is a weaker staff check than the panel's
The seller/public-side moderation path uses it too. Covered as **ISSUE-4**; recording it here
because the fix reaches outside the admin dashboard into Module 4's moderation surface.
- **Status:** FIXED — see ISSUE-4. `lib/listings/moderation.ts` now asks the same three questions the panel's guard asks, and returns the level so callers can gate on it.

---

## Environment observations (NOT product defects — recorded so they are not re-found)

1. **Long-running dev servers wedge under a sustained sweep.** After ~60 sequential
   requests, the pre-existing dev server on :3000 began answering **every**
   `/api/v1/admin/list/*` and `/api/v1/admin/queue/*` with `500` — including
   *unauthenticated* requests that must return 401:
   ```
   500 /api/v1/admin/list/users     (cookie: hz_admin_at=x  →  should be 401)
   "message":"Jest worker encountered 2 child process exceptions, exceeding retry limit"
   ```
   A **clean** dev server on :3200 answers the same requests correctly (`401`), and the
   **production build** answers `401` for all of them. This is dev-server worker exhaustion,
   not a route defect. It is, however, what surfaced ISSUE-3.
2. **Turbopack dev stalls Suspense boundaries under continuous recompilation.** On :3200 the
   server returned `GET /users 200 in 2.7s` with the resolved markup in the HTML
   (`hasUsersHeading: true`), while the browser stayed on the `loading.tsx` skeleton
   (`aria-busy` ×13, one unresolved `<template>`) with zero console errors and a steady
   `[Fast Refresh] rebuilding` loop. Not reproducible on the production build.
3. `next dev` appended four `.next-audit*/types` entries to `tsconfig.json`. Reverted —
   AUDIT mode changes no product files.

---

## Not covered, and why

| Area | Why |
|---|---|
| **Authenticated walk on the production build** | Blocked by ISSUE-1 itself: `auth/dev` 404s under `NODE_ENV=production` and Google OAuth is not configured, so no admin session can exist on a prod build. Minting a session token directly was declined. Only the unauthenticated production surface was verified. |
| **Write-action → DB-row proof for the 19 stacked panels** | The dev environment degraded (observations 1–2) before the panel-by-panel write pass. No admin write was performed, so none is claimed. |
| **Pixel comparison against `designs/`** | Screenshots were unavailable this session (`Screenshot timed out … the Browser pane is not displayed`). Layout was verified numerically (viewport/overflow/element rects) instead. |
| **Full 5-viewport visual pass on all 27 screens** | Only `/` and `/users` were measured at 375 / 659 / 1440. Both clean: `docW == innerWidth`, zero elements past the right edge, sidebar correctly `display:none` below `md`, drawer sheet 375×690 at y=122. |
| **Rate-limit / abuse testing** | `docs/RATE-LIMIT-OFF.md` exists in this tree; limits were not exercised so as not to lock the accounts used for the role matrix. |

## Verified working (no issue raised)

- **Role matrix, all 27 screens × 3 roles, live.** Staff sees the lock gate on all 18
  admin/super screens and passes on the 8 staff screens; Admin passes everything except
  `/settings`, `/staff`, `/audit` (lock gate, correct copy: *"This area is restricted to a
  Super Admin. Your current role is admin. Ask Rajan Kavathiya (Super Admin) for access."*);
  Super passes all 26. One exception: ISSUE-5.
- **Unauthenticated sweep, production build.** All 27 admin pages `307 → /login`; every admin
  API `401 UNAUTHORIZED`; the public host `404`s `/account`, `/account/users`, `/queues/listings`,
  `/users`.
- **API role gates.** Staff correctly gets `403 FORBIDDEN` on `abandoned`, `content`, `coupons`,
  `finance`, `grants`, `master-data`, `plans`, `saved-views`, `settings`, `support`, `system`,
  `templates`; Admin gets `403` on `settings` (super-only). 41 of 44 admin routes use
  `requireAdmin(min)` with an explicit role (the other 3 are ISSUE-4).
- **No business data in browser storage.** `localStorage` on the panel holds exactly one key:
  `hz-admin-sidebar-collapsed`. `sessionStorage` is empty.
- **Security headers on the admin host (production build):** CSP present and scoped,
  `x-frame-options: DENY`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`,
  `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`,
  `permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.
- **Secret grep of the built bundle:** `node scripts/check-bundle-secrets.mjs` →
  `PASS — 11 secret value(s) checked against 103 client bundle file(s): 0 leak(s)`.
- **Production build compiles clean** (`next build`, exit 0, all admin routes emitted as
  `ƒ` dynamic).
- **No dead handlers found by pattern:** zero `onClick={() => {}}`, zero `href="#"`, zero
  `toast("Coming soon"…)` anywhere under `components/admin`.
- **Data is genuinely DB-backed** where sampled: queue tiles come from the
  `hz_admin_queue_tiles` RPC (one query feeds both the tiles and the sidebar badges, so they
  cannot disagree); Tickets filter options are the categories the table actually holds;
  backup/uptime strips read `backups` / health checks. No hardcoded counts were found on the
  screens inspected.

## APIs still outstanding (per the explicit ask — "je API baki che")

**No admin API endpoint is missing from the code.** Every endpoint referenced anywhere in
`components/admin`, `lib/admin` and `app/(admin)` resolves to a real route file — 44 of them.
What is outstanding is *credentials, deploy steps and decisions*:

| Ref | What | Blocked on | Breaks what |
|---|---|---|---|
| **NEW** | `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | 🔑 credential | 🔴 **the whole admin panel** in production — ISSUE-1 |
| B1 | Razorpay webhook secret | 🔑 credential | 🔴 late payments never settle |
| B2 | Cron not scheduled in prod (`CRON_SECRET` on host) | 🚀 deploy step | 🔴 expiry / refund / reminders / anomaly detectors never run — the `/cron` screen reports on jobs nothing triggers |
| B3 | Reminder delivery (push/email) | 🔑 FCM + Resend | reminders recorded, not delivered |
| B4 | Cloudflare R2 | 🔑 credential | Supabase Storage is the interim store |
| B5 | Redis / MSG91 / Resend / FCM | 🔑 credentials | MSG91 is a hard blocker for *user* login |
| M11.6 | Sentry + provider-billing cards on A27 | 🔑 Sentry DSN + provider APIs | cards say "not connected" |
| M11.7 | 3 of A22's 6 system actions have no worker | 🔵 Rajan's decision | endpoint refuses honestly |

The two 🔴 items that touch the admin dashboard directly are **Google OAuth** (nobody can sign
in) and **B2** (`/cron` supervises jobs that are never scheduled).

---

## Summary — after the FIX pass

| Severity | Count | FIXED | BLOCKED | OPEN |
|---|---|---|---|---|
| P0 | 1 | 1 (code) | 1 (credential B0) | 0 |
| P1 | 3 | 3 | 0 | 0 |
| P2 | 4 | 4 | 0 | 0 |
| P3 | 6 | 5 | 1 (bundling decision) | 0 |
| **In-scope total** | **14** | **13** | **2** | **0** |
| Out of scope | 2 | 2 | 0 | 0 |
| **All** | **16** | **15** | **2** | **0** |

ISSUE-1 is counted in both columns: the code half is fixed and verified, the
credential half is Rajan's. ISSUE-11 turned out to have a different root cause
than logged and is a whole-app decision. Neither is a half-built feature.

| ID | Sev | Category | One-liner | Status |
|---|---|---|---|---|
| ISSUE-1 | P0 | dead/consistency | Admin sign-in 500s on a production build; launch checklist omits the key | FIXED (code) · BLOCKED (credential) |
| ISSUE-2 | P1 | dead | Collapsed sidebar: 4 dead group headers, 15 screens unreachable | FIXED |
| ISSUE-3 | P1 | state | Failed list request renders as an empty table on all 21 list screens | FIXED · needs one visual check |
| ISSUE-4 | P1 | security | 3 admin endpoints gated by the user session, not the admin session | FIXED |
| ISSUE-5 | P2 | consistency | Staff offered Tickets (nav + badge + tile), then locked out | FIXED |
| ISSUE-6 | P2 | state | "Log out" navigates away even when the logout request failed | FIXED |
| ISSUE-7 | P2 | dead (kbd) | Dashboard tiles/rows/strips are divs — no keyboard access | FIXED |
| ISSUE-8 | P2 | dead (kbd) | Sidebar group headers are divs — no keyboard, no aria-expanded | FIXED |
| ISSUE-9 | P3 | dead (kbd) | "Clear all" is a span on all 21 list screens | FIXED |
| ISSUE-10 | P3 | state | Mobile drawer ignores ESC and Back | FIXED (ESC) |
| ISSUE-11 | P3 | performance | Firebase reaches the admin page via an app-wide shared chunk | BLOCKED — your decision |
| ISSUE-12 | P3 | dead | Admin layout declared no icon; `/favicon.ico` 404s site-wide | FIXED (admin half) |
| ISSUE-13 | P3 | dead | `[...screen]` placeholder route is unreachable dead code | FIXED |
| ISSUE-14 | P3 | consistency | `coupons`/`grants` return 404 where siblings return 422 | FIXED |
| OOS-1 | P0 | consistency | PENDING-INTEGRATIONS "KEYS AT LAUNCH" omits admin Google OAuth | FIXED |
| OOS-2 | P1 | security | `isStaff()` is a weaker staff check than the panel's guard | FIXED |

## Verification run for the FIX pass

- `npm run typecheck` — clean.
- `npm run lint` — 125 warnings, 0 errors: **identical to the pre-fix baseline**, measured by stashing the changes and re-running. No new warnings.
- `NEXT_DIST_DIR=.next-audit npm run build` — exit 0, "Compiled successfully", TypeScript clean, all admin routes emitted. The only warning is the pre-existing `middleware → proxy` deprecation notice, present before these changes.
- Production server (`next start`) re-walked: `/login` 200 · `auth/start` refuses on contract with a named operator log · `<link rel="icon">` present · admin pages still 307 → `/login` unauthenticated · admin APIs still 401 · the ListError copy present in 22 client chunks.
- Fresh dev server: an 11-check verification suite, 10 PASS. The single FAIL was a bad assertion in the test, not the product — it looked for a `/tickets` sidebar link on the super dashboard, which is absent because the Support group is collapsed by default. Re-checked per role and confirmed correct.
- Database: a real moderation decision run end-to-end and the resulting `admin_audit_log` row shown (ISSUE-4). Test state restored to `pending_review`.

### Still to do before this is closed

1. **One look in a visible browser** at a list screen's error state, the ESC-closes-drawer behaviour, and focus order (ISSUE-3 / 9 / 10).
   The cause of the gap is now pinned down and is **tooling, not product**: the Browser pane was never displayed this session, so the page reports
   ```
   {"url":"/users","len":0,"busy":13,"visible":"hidden"}
   ```
   `document.visibilityState === "hidden"` — the tab never composites a frame, so React never reveals the page's Suspense boundary and the 13 skeletons stay up. The server returned `GET /users 200 in 5.7s` with the fully resolved markup in the HTML on every attempt, across four different servers (two dev, one clean dev, one production build). The same limitation is what made `computer{action:"screenshot"}` fail from the very first call of the audit. Open the panel in a normal browser and these three render immediately.
2. **Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`** (B0) — until then the panel cannot be signed into in production, by design and now loudly.
3. **Decide on ISSUE-11** — app-wide chunk splitting, or accept the shared chunk.
