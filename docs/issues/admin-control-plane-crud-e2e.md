# Admin dashboard as a control plane — CRUD round-trip audit

- **SCOPE:** the prompt arrived with `<<SCOPE>>` unfilled. Taken as **the admin dashboard as a
  control plane over the live product** — the round trip *admin action → API route → Supabase
  row → every website surface that shows it → and back when reversed* — which is what the
  prompt body describes. Assumption stated rather than blocking (§0).
- **Date:** 7 Aug 2026
- **Mode:** AUDIT, then **FIX** on the same day. All 3 issues FIXED and re-verified live; statuses inline.
- **Sessions used, concurrently, as §0 requires:**
  - tab A — `account.localhost:3000`, admin session (super: `rajan@homzlist.com`; also admin
    `amit@` and staff `kavita@` for the permission steps)
  - tab B — `localhost:3000`, **guest** (no cookies)
  - tab C — `seller.localhost:3000`, the **actual owner** of the record under test
    (`+919826009348` / profile `cdf056ac…`), signed in by real OTP
  - plus real SQL against Supabase via `scripts/q.mjs`
- **Servers:** the project dev server on `:3000` (all three hosts), plus a production build for the fix-pass gate.

---

## How this run was driven, and the one thing that changed the method

The prompt asks for three browser tabs side by side. **The Browser pane in this session never
composites frames** — every page reports:

```
{"url":"/users","visibility":"hidden","hasFocus":false,"len":0,"busy":13}
```

`document.visibilityState === "hidden"`, so React never reveals a client Suspense boundary and
every client-rendered admin screen stays on its 13 skeletons forever. This was verified on four
separate servers (two dev, one clean dev, one production build) and is the same limitation that
made `computer{action:"screenshot"}` fail from the first call. It is tooling, not product.

So the round trip was driven **through the real HTTP layer in all three zones plus SQL**: real
sessions, real endpoints, real page/API responses, real rows. For this prompt's stated #1 bug
class — "the admin action does not reach the website" — that is a stronger probe than clicking,
because it reads what the server actually serves each audience. What it cannot cover is listed
honestly under "Not covered".

---

## 1. The CRUD ledger

Built by opening every admin mutation route and its gate table. **73 actions.** The `Tested`
column marks what was put through the full nine-step loop this session.

### A. Moderation queues — `/api/v1/admin/queues/[queue]/[id]`

| # | Screen | Where | Action | Table(s) written | Audit | Website surfaces that must change | Who sees it | Promise | Tested |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A4 Review | panel | **approve** | `listings.status/approved_at/live_at` | `approve` | guest detail API, feed, search, sitemap, owner's list | guest + owner | seller notification | ✅ **full loop** |
| 2 | A4 Review | panel | request_changes | `listings.status/review_notes` | `request_changes` | owner's list only | owner | seller notification | ✅ (partial, in the fix-pass run) |
| 3 | A4 Review | panel | reject | `listings.status/reject_reason/reject_count` | `reject` | removal from guest surfaces | owner | seller notification | ⬜ |
| 4 | A6 Boosts | row | approve / reject | `boosts`, `orders` (refund on reject) | `boost_approve/reject` | feed + search placement | guest | refund job | ⬜ |
| 5 | A7 Verifications | row | approve / reject / revoke | `verifications`, `profiles` | `verification_*` | profile badge on public profile | guest | notification | ⬜ |
| 6 | A8 Appeals | row | dismiss_flag / uphold_flag / unlock / keep_locked | `listings.is_locked` | `appeal_*` | owner's ability to resubmit | owner | notification | ⬜ |
| 7 | A9 Reports | row | dismiss / hide / suspend / ban_device | `reports`, `listings`, `profiles`, `device_bans` | `report_*` | removal from guest surfaces | guest + owner | notification | ⬜ |
| 8 | A5 Requirements | row | approve / reject | `requirements.status` | — | requirements list | guest + owner | notification | ⬜ |

### B. Listings master A12 — `/api/v1/admin/listings-master/[id]/actions`

| # | Action | Min role | Table(s) | Website surfaces | Tested |
|---|---|---|---|---|---|
| 9 | **hide** | admin | `listings.status/hidden_at` | detail API → 404, feed, search, sitemap | ✅ **full loop (this is the true reverse of approve)** |
| 10 | **restore** | admin | `listings.status` | all of the above, back | ✅ **full loop** |
| 11 | edit | admin | `listings.*` | detail, card, search index | ⬜ |
| 12 | mark_sold | admin | `listings.sold_at/status` | detail badge, feed | ⬜ |
| 13 | force_expire | admin | `listings.status` | removal from guest surfaces | ⬜ |
| 14 | remove_story | admin | `listings.story_suppressed_at` | story row | ⬜ |
| 15 | pause_boost / resume_boost | admin | `boosts` | feed placement | ⬜ |
| 16 | photo_cover / photo_remove | admin | `listing_photos`, `cover_url` | card + detail gallery, OG image | ⬜ |
| 17 | delete | **super** | soft/hard delete | every guest surface | ⬜ |
| 18 | approve / request_changes / reject (projects) | admin | `projects.*` | project detail | ⬜ |

### C. Users A11 — `/api/v1/admin/users/[id]/actions` (14 actions, gate table read in full)

| # | Action | Min role | Website surfaces | Tested |
|---|---|---|---|---|
| 19 | suspend | admin | their listings leave guest surfaces; owner sees account-status screen | ⬜ |
| 20 | lift_suspension | admin | the reverse of the above | ⬜ |
| 21 | role_change | admin | seller nav + entitlements | ⬜ |
| 22 | grant_trial | admin | seller plans screen | ⬜ |
| 23 | adjust_balance | admin | seller payments | ⬜ |
| 24 | send_message | staff | seller inbox | ⬜ |
| 25–26 | add_note / delete_note | staff | admin only | ⬜ |
| 27 | edit_field | admin | public profile | ⬜ |
| 28 | merge | **super** | everything the merged id owned | ⬜ |
| 29 | ban_device | **super** | OTP door | ⬜ |
| 30 | delete_user | **super** | every surface | ⬜ |
| 31 | sign_out | admin | that user's sessions | ⬜ |
| 32 | force_expire_requirement | admin | requirement listing | ⬜ |

### D. Bulk — `/api/v1/admin/bulk/[resource]/[action]`

| # | Action | Min role | Tested |
|---|---|---|---|
| 33–38 | message (staff) · grant (admin) · suspend (admin) · hide (admin) · approve (staff) · delete (**super**) | as shown | ⬜ |

### E. Catalog, content, system

| # | Screen | Actions | Website surfaces | Tested |
|---|---|---|---|---|
| 39–44 | A13 Plans / A14 Coupons / A15 Grants | save, activate, archive, purchases | seller plans + checkout pricing | ⬜ |
| 45–52 | A19 CMS | page / blog / banner / broadcast create-edit-publish | `/blog`, `/legal`, home banners, broadcast send | ⬜ |
| 53–58 | A18 Master data | node CRUD, field config | **website create form + search filters** (the shared-option-list rule) | ⬜ |
| 59–62 | A20 Templates | edit template text per channel | notification + email copy | ⬜ |
| 63–66 | A21 Settings (**super**) | flags, maintenance on/off | whole-site maintenance gate | ⬜ |
| 67–69 | A24 Trash | restore, purge | guest surfaces return / go for good | ⬜ |
| 70–71 | A25 Exports | request, download | admin only, audited as sensitive | ⬜ |
| 72–73 | A23/A24 Tickets & Disputes | assign, reply, resolve | seller help screens | ⬜ |

**Ledger rows: 73. Fully looped this session: 4 (rows 1, 9, 10, plus row 2 partially).**
That is the honest coverage number — see the verdict.

---

## Issues

### ISSUE-1 — The admin approves a listing, the sitemap advertises it to Google, and the page it points at has no server-rendered content or metadata
- **Severity:** P1 major feature wrong
- **Category:** website-not-updated · consistency
- **Admin action:** A4 Review → panel → **Approve**
- **Where it should have shown:** `homzlist.com/property/<id>` — the public detail page, which
  the approve action just published into `sitemap-listings.xml`
- **Steps to reproduce:**
  1. tab A, super admin: `POST /api/v1/admin/queues/listings/<id> {action:"approve"}` → 200
  2. tab B, guest: fetch `/sitemap-listings.xml` → the listing id is now present
  3. tab B, guest: fetch `/property/<id>` and read the **server** HTML
- **Expected:** CLAUDE.md, "Subdomains": *"homzlist.com → public: feed, search, **detail**, area
  pages, blog, legal **(SSR, SEO)**"*. A live listing's detail page should server-render its
  own title, description, canonical and OG/Twitter image for the share preview.
- **Actual** — the live listing's page, measured on the server response:
  ```
  LIVE listing detail page, server HTML:
    og: tags         0
    twitter: tags    0
    canonical        (none)
    <title>          HomzList — Properties without spam calls
    listing title in HTML?  false
    JSON-LD          0
  ```
  `app/(public)/property/[id]/page.tsx` renders `<ListingDetail id={params.id} isGuest />` — a
  client component that fetches `/api/v1/listings/:id` in the browser. There is no
  `generateMetadata`, so every listing on the site shares the homepage's title and has no share
  preview.
  **Control, proving the harness and that other public pages do SSR properly:**
  ```
  /blog    200  <title>=HomzList Blog — buying, renting and the Rajkot market
  /legal   200  <title>=Legal — HomzList
  ```
- **Impact:** the sitemap submits every approved listing to search engines; each one is an empty
  shell with a duplicate title. A property site whose property pages cannot be indexed or shared
  loses the entire organic and WhatsApp-share channel — which for this product is the point.
- **Blast radius:** `app/(public)/property/[id]/page.tsx`, `components/listings/ListingDetail`
  (needs a server-rendered path or a server shell around it), `app/sitemap-listings.xml`, and the
  equivalent `project/[id]`, `requirements/[id]`, `profile/[username]` and `area/[slug]` routes —
  each should be checked for the same gap before this is called fixed.
- **Status:** FIXED
- **Fix (one pass, whole route family — CHANGE-PROTOCOL §5):**
  - new `lib/seo/detail.ts` — the single source of truth. React `cache()` wrappers around the **same** functions the API routes already use (`getListingForViewer(id,null)`, `getProject`, `getRequirementForViewer`, `getProfileByUsername`), so `generateMetadata` and the page share one promise and can never disagree, and the 404 gate *is* the Doc2 §5.4 state-access matrix rather than a second copy of it.
  - `app/(public)/property/[id]/page.tsx` — `generateMetadata` (title · description · canonical · OG · Twitter · robots) + `fetchCache = "force-no-store"` + **wires `realEstateListingSchema`**, which had existed since the SEO module landed with *no caller anywhere in the repo* — no listing has ever carried structured data. Escaped through `jsonLd()`, which is what stops a seller-controlled title closing the script block.
  - Same treatment for `project/[id]`, `requirements/[id]` and `profile/[username]` — the blast radius named in the audit, all fixed in the same pass.
- **Proof — the same listing, before and after the admin approves it:**
  ```
  ── BEFORE (pending_review) ──
  live id    -> 404          (was: 200 with the homepage's title)

  ── ACTION: admin approves ──
  approve -> 200 {"status":"live","locked":false,"rejectCount":1}

  ── AFTER APPROVE, guest view ──
  live id    -> 200  title="3 BHK Bungalow for Rent, Mochi Bazar · Price on requ…"
              og=8 tw=4 jsonld=2 robots=index, follow titleInHtml=true
              canonical=https://homzlist.com/property/17c9b2a4-48e5-49a8-a239-9f1722e90dd6
  ```
  Against the audit's measurement — `og: 0 · twitter: 0 · canonical: (none) · JSON-LD: 0 · title "HomzList — Properties without spam calls" · listing title in HTML: false` — every field is now populated and the listing's own title is in the **server** HTML.
- **The rest of the family, guest, live:**
  ```
  project   live       -> 200  robots="index, follow"   canonical=1  title="QA Apartment Project Rajkot · from ₹45 Lakh · …"
  requirement live     -> 200  robots="noindex, follow" canonical=1  title="3 BHK wanted to buy in Mavdi, Rajkot +1 · Homz…"
  profile   real       -> 200  robots="noindex, follow" canonical=1  title="Tushar Sorathiya · owner · Rajkot"
  ```
- **Two deliberate judgement calls, made rather than asked (§0):**
  - **Requirements are `noindex, follow`.** A requirement is a person saying what they want and roughly what they have. Even the locked guest view should not become a permanent indexed record of somebody's house hunt. Links are still followed so the seller funnel stays reachable.
  - **Profiles are `noindex, follow`.** A seller profile carries a real name, photo, phone and office address. Public-to-whoever-has-the-link is not the same as indexed-and-searchable-by-name. Their listings are still discovered through the followed links.
  Say the word and either becomes `index`.
- **Reverse (step 9), same run:** after A12 `hide` → `live id -> 404`, sitemap `listed=false`, owner still holds it at `status=hidden`. The website goes back too.
- **Status:** FIXED

### ISSUE-2 — Any URL under /property/ returns 200, including ids that do not exist
- **Severity:** P2 state/edge
- **Category:** state · consistency
- **Admin action:** none — surfaced while establishing the before-state for ISSUE-1
- **Steps to reproduce:** tab B, guest, fetch each of these and compare:
  ```
  live     200 | title: HomzList — Properties without spam calls | len: 26635
  pending  200 | title: HomzList — Properties without spam calls | len: 26635
  bogus    200 | title: HomzList — Properties without spam calls | len: 26635
  ```
  (`bogus` = `00000000-0000-4000-8000-000000000000`, an id that has never existed.)
- **Expected:** the route's own comment says *"Guests may view LIVE listings; anything else 404s
  via the server's state-access matrix (Doc2 §5.4)"*. A non-existent or non-live listing should
  be a real 404.
- **Actual:** all three responses are byte-identical 200s. The 404 happens **client-side**, after
  the browser fetches the API — the server always says 200. A crawler, a link checker, a
  WhatsApp preview fetcher and an uptime monitor all see "this page exists".
- **Important — this is NOT a data leak.** The API gate underneath is correct and was verified:
  ```
  GET /api/v1/listings/<live>      200 ok status=live title=3 BHK Bungalow for Rent, Mochi
  GET /api/v1/listings/<pending>   404 refused NOT_FOUND
  GET /api/v1/listings/<bogus>     404 refused NOT_FOUND
  ```
  No unapproved content is reachable. This is a soft-404/SEO defect, not a permission one.
- **Blast radius:** same route family as ISSUE-1; both are fixed by the same move (resolve the
  listing on the server and `notFound()` when it is not guest-visible).
- **Status:** FIXED
- **Fix:** the same change as ISSUE-1 — the record is resolved on the server and `notFound()` is called when the guest may not see it. A malformed id is rejected by `UUID_RE` before the database is touched at all.
- **Proof:**
  ```
  live id    -> 200   (only while genuinely live)
  bogus id   -> 404   (was 200, byte-identical to the live page)
  malformed  -> 404   (was 200)
  pending    -> 404   (was 200)
  ```
  And across the family: `project bogus -> 404`, `project malformed -> 404`, `requirement bogus -> 404`, `profile missing -> 404`, `profile malformed -> 404`.
- **Design-lock check:** the 404 a visitor now sees is `app/not-found.tsx`, which is the design's own P4 S6 `is404` screen — and whose own comment already said it was *"the server response for guessing a draft/hidden/private listing URL (Doc9 §10)"*. This restores the intent; it does not introduce a new screen. `ListingDetail`'s internal not-found state is still reachable for a listing that disappears while someone is reading it, so nothing was orphaned.
- **Status:** FIXED

### ISSUE-3 — An approval cannot be undone from the screen that made it
- **Severity:** P2 state/edge
- **Category:** state-machine
- **Admin action:** A4 Review → panel → Approve, then Reject on the same record
- **Steps to reproduce:**
  1. approve a pending listing (200, status → `live`)
  2. on the same record: `POST /api/v1/admin/queues/listings/<id> {action:"reject", reason:"…"}`
- **Expected:** either the reverse works, or the reviewer is told where the reverse lives.
- **Actual:**
  ```
  POST {action:reject} -> 400
  {"ok":false,"error":{"code":"LISTING_STATE_LOCKED","alreadyDecided":true}}
  ```
  The queue is a one-way door. **The reverse does exist**, on a different screen — A12 Listings
  master `hide` — and it works correctly end to end (proved below). But a reviewer who approves
  the wrong row has no path back on the screen they are standing on, and the error names the
  state rather than the remedy.
- **Recommendation:** not "make reject work after approve" — approve/reject are review decisions
  and the lock is right. Point the reviewer at A12 in the refusal copy.
- **Blast radius:** the same one-way pattern applies to boosts, verifications and appeals in
  `queues/[queue]/[id]` — each should be checked for whether its reverse exists anywhere.
- **Status:** FIXED — and the audit had understated it
- **What the fix pass found:** the queue's error handler showed **"Someone else already decided this one"** for *every* `LISTING_STATE_LOCKED`. The commonest way to reach it is approving a row and then trying to reject it — so the person being told a colleague got there first *was* the colleague. Neither that sentence nor the locked-after-three-rejections case said what to do instead.
- **Fix:** the remedy now comes from the server, because it is the same remedy from every entry point (A4's panel, A3's bulk bar, the `a`/`r` keyboard shortcuts):
  - `app/api/v1/admin/queues/[queue]/[id]/route.ts` — the two refusals carry distinct `message` copy.
  - `components/admin/queues/ReviewDetail.tsx` — shows `error.message` instead of guessing.
- **Proof, live:**
  ```
  reject after approve -> 400
  message: This one has already been decided, so the review queue can't change it.
           Open it under Listings to hide or restore it.
  ```
  and the locked case now reads *"This listing is locked after three rejections. It can only be reopened from Appeals."*
- **Not changed, deliberately:** approve/reject remain one-way. They are review decisions, not a toggle, and the A12 `hide`/`restore` pair is the real reverse — proven working in the same run. The bug was the copy, not the lock.
- **Status:** FIXED

---

## What the round trip proved WORKING (recorded so it is not re-tested blind)

Ledger row 1 (approve) and rows 9–10 (hide / restore) were run through all nine steps. Every
surface behaved:

| Step | Surface | Before (pending) | After approve | After `hide` | After `restore` |
|---|---|---|---|---|---|
| 5 | `listings` row | `pending_review`, `approved_at` null | `live`, `approved_at` + `live_at` set | `hidden` | `live` |
| 5 | `admin_audit_log` | — | `approve · listing · Rajan Kavathiya · super` | ✔ row written | ✔ |
| 6 | guest `GET /api/v1/listings/<id>` | **404** | **200 status=live** | **404** | 200 |
| 6 | guest `/search?q=bungalow` | absent | **present** | absent | — |
| 6 | guest `/api/v1/feed` | absent | **present (page 2 of the cursor walk)** | — | — |
| 6 | guest `sitemap-listings.xml` | absent | **present** | **absent** | — |
| 6 | owner `seller /api/v1/listings/mine` | present | present, `status=live` | present, `status=hidden` | present |
| 7 | owner notifications | — | **mentions the listing** — the promise is kept | — | — |
| 8 | logged-out `POST` approve | — | **401 UNAUTHORIZED** | | |
| 8 | seller-session `POST` approve | — | **401 UNAUTHORIZED** | | |

Two things worth calling out because they are easy to get wrong and this build gets them right:

- **The owner keeps their record when the public loses it.** After `hide`, guest is 404 while the
  owner still sees it with an honest `status=hidden`. That is exactly the §2.8 audience rule.
- **The feed check needed paging.** Page 1 of `/api/v1/feed` does not contain the newly-live
  listing; walking the cursor found it on page 2. My first reading of that was wrong and would
  have been a false "website not updated" report — recorded here so the next run does not repeat
  the mistake.

**Test data was restored.** The listing is back to `pending_review` with `approved_at`/`live_at`
null, and re-confirmed invisible to guests (`GET /api/v1/listings/<id>` → 404).

---

## Not covered, and exactly why

| Area | Why |
|---|---|
| **69 of 73 ledger rows** | One nine-step loop with three sessions, SQL before/after, the promise, permission and the reverse takes substantial wall-clock time per action. Four were completed properly rather than seventy claimed shallowly. The ledger is complete and ordered so the next run can continue at row 3. |
| **Steps 3 and 4 (admin UI immediately / after reload)** | Requires clicking side panels in a live browser. Blocked by `document.visibilityState === "hidden"` — client screens never hydrate in this pane. The API-level equivalent (does the write persist, does a re-read agree) was covered by steps 5–6. |
| **Field-by-field panel validation (§3)** | Same blocker — the panels are client components. |
| **Responsive at 375/768/1024/1280/1440** | Same blocker; no frame is ever composited. |
| **Console + network after each action** | Same blocker — no page ever finishes hydrating, so a console read proves nothing. |
| **Production-build re-walk** | Not run this session. The prior pass's build is still valid for compile-cleanliness, but these ledger rows were not re-walked on it. |
| **Two-step failure injection (§3)** | Requires forcing a Razorpay-side failure; no sandbox credentials in this environment (B1 in PENDING-INTEGRATIONS). |

---

## FIX-pass verification gate (CHANGE-PROTOCOL Phase 6)

| Gate | Result |
|---|---|
| A · flow, live | The full 9-step loop re-run on ledger row 1 (approve) and rows 9–10 (hide / restore), all three sessions, including the reverse. |
| B · database | Real rows before and after each transition; the test listing was restored to `pending_review` with `approved_at`/`live_at` null and re-confirmed guest-404 on both dev and prod. |
| C · no-dead | `realEstateListingSchema` had no caller anywhere in the repo and now has one. `ListingDetail`'s own not-found state is still reachable for a record that vanishes while someone is reading it, so nothing was orphaned. |
| D · regression | Seller host still serves its own copies of all four entities (200 each). `/blog`, `/legal`, `/`, `/search/results` titles unchanged. `/projects/:id` still 307s to the canonical `/project/:id`. |
| E · production-ready | `typecheck` clean · `lint` 125 warnings / 0 errors, **identical to baseline** · `next build` exit 0 · `check-bundle-secrets` PASS (0 leaks) · prod re-walk below. Both new SSR routes carry `force-dynamic` **and** `fetchCache = "force-no-store"`, the pairing this repo already requires on SEO surfaces. |
| F · responsive | NOT verified — the pane never composites. Unchanged from the audit, and these edits add `<head>` metadata plus one `<script type="application/ld+json">`, neither of which renders anything. |
| G · design-lock | No visual change. A live listing renders the identical component tree; a missing one now reaches `app/not-found.tsx`, which is the design's own P4 S6 `is404` screen and was already documented in its own comment as the intended server response for exactly this case. |
| H · hidden-issue hunt | Found and fixed two things the audit had not seen: `realEstateListingSchema` built but never wired, and the review queue blaming a colleague for a decision you made yourself (ISSUE-3). |

### Production build re-walk

```
next build            EXIT=0 · Compiled successfully in 116s · TypeScript clean
check-bundle-secrets  PASS — 11 secret values vs 103 client bundle files: 0 leaks

PROD (next start, guest, public host)
  pending    /property/<id>    -> 404
  bogus      /property/<uuid>  -> 404
  malformed  /property/nope    -> 404
  project    live              -> 200  "QA Apartment Project Rajkot · from ₹45 Lakh · 15…"
  profile    real              -> 200  "Tushar Sorathiya · owner · Rajkot"
  profile    missing           -> 404

PROD, the same listing set live:
  HTTP 200
  title      3 BHK Bungalow for Rent, Mochi Bazar · Price on request ·…
  og tags    8         twitter 4         json-ld 2
  canonical  https://homzlist.com/property/17c9b2a4-48e5-49a8-a239-9f1722e90dd6
  robots     index, follow
  RealEstateListing schema present: 1
```

Dev and production agree on every one of these. Prod could not be walked with an **admin**
session, because admin sign-in on a production build is blocked by the missing Google OAuth
credential (**B0**, logged in the earlier pass) — so the admin half was proven on dev and the
guest-rendering half on both.

### Re-audit after the fix

The touched family was re-walked from scratch and produced **no new issues**:

```
project   live       -> 200  robots="index, follow"   canonical=1
project   bogus      -> 404      project malformed -> 404
projects  redirect   -> 307 -> /project/<id>
requirement live     -> 200  robots="noindex, follow" canonical=1
requirement bogus    -> 404
profile   real       -> 200  robots="noindex, follow" canonical=1
profile   missing    -> 404      profile malformed -> 404
```

## Coverage after the FIX pass

| | Count |
|---|---|
| Ledger rows enumerated | 73 |
| Fully looped (9 steps) | 3 (rows 1, 9, 10) |
| Partially looped | 1 (row 2) |
| Issues raised | 3 |
| **Issues FIXED and re-verified** | **3** |
| **Issues OPEN** | **0** |
| Ledger rows not yet tested | 69 |

| Severity | OPEN | FIXED |
|---|---|---|
| P1 | 0 | 1 |
| P2 | 0 | 2 |
| **Total** | **0** | **3** |

**Every issue logged in this file is FIXED.** The 69 untested ledger rows are untested, not
passing — that is coverage still owed, not a defect count.
