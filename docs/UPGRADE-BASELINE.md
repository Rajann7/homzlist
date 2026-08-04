# Next.js upgrade — pre-upgrade baseline (Next 14.2.35)

Captured on 2026-08-04 at commit `1d84784`, **before** any upgrade work.

This file exists for one reason: after the 15 and 16 upgrades, the app must
behave *exactly* as it does here. Anything green below that turns red is a
regression the upgrade caused. Anything already red below was already red —
the upgrade is not allowed to make it worse, and is not responsible for it.

## Environment

| | Version |
|---|---|
| Next.js | 14.2.35 |
| React / React DOM | 18.3.1 |
| Node | v22.19.0 |
| npm | 11.6.2 |
| TypeScript | 5.6.3 |
| @supabase/ssr | 0.5.2 |

## Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS — zero errors |
| `npm run build` | PASS — full route table compiles, middleware 32.1 kB, shared JS 87.6 kB |
| `npm run db:proof` | PASS — 38 users with plans/listings/payments rows |

## Live check scripts (dev server on :3000)

| Script | Exit | Note |
|---|---|---|
| `check:notifications` | 0 | pass |
| `check:messages` | 0 | pass |
| `check:inbox` | 0 | pass |
| `check:builder-req` | 0 | pass |
| `check:my-listings` | 0 | pass |
| `check:project-lifecycle` | 0 | pass |
| `check:module12` | 0 | pass |
| `check:admin-p2` | 0 | pass |
| `check:admin-p4` | 0 | pass |
| `check:admin-p6` | 0 | pass |
| `check:admin-p7` | 0 | pass |
| `check:admin-surfaces` | 0 | pass |
| `check:story` | 1 | **pre-existing fail** |
| `check:roles` | 1 | **pre-existing fail** (1 check) |
| `check:search` | 1 | **pre-existing fail** (9 checks) |
| `check:fields` | 0 | reports 1 FAIL line but exits 0 |
| `check:boost` | 1 | **pre-existing fail** — seed dependency |
| `check:bundle-secrets` | 1 | **pre-existing fail — false positives, see below** |

## Pre-existing failures (NOT caused by the upgrade)

### `check:roles` — 1
- `story row has circles — 0 posters`

### `check:search` — 9
- `search returns cards for a guest — 0 total`
- `autocomplete suggestions`
- `autocomplete landing-page rows`
- `projects tab returns rows — 0`
- `brokers tab returns rows — 0`
- `areas tab returns rows — 0`
- `popular areas ranked by real inventory`
- `>=3 listings -> INDEXABLE`
- `schema ItemList present`

Every one of these is a `0 rows` shape. Consistent with an empty/stale search
index and expired stories (stories expire after 24h), not with broken code.

### `check:boost`
Fails in its own setup: `no builder with a live listing — run the earlier
module seeds first` (it shells out to `seed-module9.mjs`). A seed-data
dependency, not application code.

### `check:fields` — 1
`pg` kind reports `ORPHAN_SHOW_IF=["furnishing_details","parking_type"]` —
field-config rows referencing fields that are not in the `pg` field set.

### `check:bundle-secrets` — 49 "leaks", ALL FALSE POSITIVES

Verified by hand against `.next/static/chunks/`. Three env values in
`.env.local` are set to **the exact same string as the hardcoded fallback in
`lib/env.ts`**, so grepping the bundle for the value finds the source-code
default, not the secret:

| Var | Why it matched |
|---|---|
| `REDIS_URL` | equals the `?? "redis://127.0.0.1:6379"` default at `lib/env.ts:49` |
| `EMAIL_FROM` | equals the `?? "noreply@homzlist.com"` default at `lib/env.ts:70` |
| `FCM_PROJECT_ID` | a 12-char value that is a substring of the build path `...\homzlist-app\.next` |

The bundled code reads
`_process_env_REDIS_URL !== void 0 ? _process_env_REDIS_URL : "redis://127.0.0.1:6379"` —
Next.js replaces non-`NEXT_PUBLIC_` env reads with `undefined` in client
bundles, so only the literal default ships.

The real secrets (`SUPABASE_SERVICE_ROLE_KEY`, `JWT_ACCESS_SECRET`,
`RAZORPAY_KEY_SECRET`, `R2_SECRET_ACCESS_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`)
all default to `""` and appear nowhere in the client bundle. **The
`serverEnv()` guard holds. There is no leak.**

The gate itself is the problem: it fails on every run, and by its own comment
"a gate that always fails gets ignored". Tracked in
`docs/PENDING-INTEGRATIONS.md`.

## Upgrade surface found in this codebase

| Breaking change | Count | Files |
|---|---|---|
| sync `cookies()` | 37 callsites | auth routes, `lib/admin/session.ts`, `guard.ts`, `impersonation.ts`, `account-pool.ts`, `login-outcome.ts` |
| sync `headers()` | 4 callsites | `app/(public)/create/page.tsx`, `lib/admin/guard.ts`, `lib/admin/oauth.ts` |
| sync `params` | 117 files | every `[id]`/`[slug]` route (72 dynamic segments) |
| `searchParams` | 55 files | |
| `draftMode()` | 0 | not used |
| `@next/font` | 0 | not used |
| `next/image` | 0 | not used — all `next/image` config changes are no-ops |
| `NextRequest.geo` / `.ip` | 0 | not used |
| `useFormState` | 0 | not used |
| `serverRuntimeConfig` / `publicRuntimeConfig` | 0 | not used |
| AMP | 0 | not used |
| `revalidateTag` / `unstable_cache*` | 0 | not used |
| parallel route slots | 0 | no `@slot` dirs — `default.js` requirement is a no-op |
| `.scss` files | 0 | Sass changes are a no-op |
| custom `webpack` config | none | Turbopack-by-default will not fail the build on config grounds |
| `pages/` router | none | App Router only |

## Decisions locked before starting

1. **`middleware.ts` stays `middleware.ts` — it is NOT migrated to `proxy`.**
   Next 16 deprecates the `middleware` convention in favour of `proxy`, but
   the docs state plainly: *"The `edge` runtime is NOT supported in `proxy`.
   The `proxy` runtime is `nodejs`, and it cannot be configured. If you want
   to continue using the `edge` runtime, keep using `middleware`."*
   This middleware runs on the edge (`verifyAccessEdge`, `verifyAdminAccessEdge`,
   `edgeMaintenanceState`, all jose-based) and its matcher catches nearly every
   request. Moving it to Node would add a cold start to every page load.
   A deprecation warning is acceptable; a latency regression on every request
   is not.

2. `next dev` / `next build` keep a Webpack escape hatch (`--webpack`) available
   through the Next 16 step until Turbopack is proven against `sharp`, `bullmq`,
   `ioredis`, `firebase-admin` and `exceljs`.

3. The pre-existing failures above are recorded, not fixed, as part of the
   upgrade. Fixing them is separate work — mixing it in would make it
   impossible to tell an upgrade regression from a seed-data fix.

---

# Next 15 verification result (4 Aug 2026)

Baseline is the app as built at `1d84784`, served from a git worktree on
Next 14.2.35. `designs/` was never consulted — it is Rajan's and it moves.

## What is proven

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next build` (production) | clean, zero warnings |
| **App route manifest, production build** | **372 = 372**, none added, none missing |
| **API payloads, 64 probes × 4 actors** | **64 / 64 identical** — statuses and bodies |
| Authorization shape | guest 401, actors 200, `/visits` 404, `chat/threads` 422 — unchanged |
| **Guest screens, production build vs production build** | **14 / 16 pixel-identical at 0.000%** |
| Console errors | no new ones (the two sides differ only by port in the message text) |
| `db:proof` + every `check:*` | pass |

The 64/64 API result is the load-bearing one: the seller UI is a view over
those endpoints, and no component changed in this upgrade except a React 19
type widening on `FeedShell.scrollRef`.

The two guest screens that differ are `pub-feed` (26.98%) and
`pub-feed-desktop` (7.76%). The diff image shows header, city selector, bell,
saved icon, sign-in strip, story circle, home-loans banner, Property/Requirement
tabs, Buy/Rent chips, sort control and bottom nav all identical; only the
promoted listing's photo and text differ, because the feed rotates.

## What pixel comparison cannot settle here, and why

Authenticated screens cannot be captured against a production build at all:
`OTP_PROVIDER=dev` is refused in production by design
(`Dev OTP provider is not allowed in production — set OTP_PROVIDER=msg91`),
identically on both versions. So they were compared on dev servers, with every
route pre-warmed.

Several seller screens still differ between the two dev captures. A control run
— the same Next 14 server captured twice — settles what that means:

| Screen | Next 14 vs Next 15 | Next 14 vs ITSELF |
|---|---|---|
| `sel-owner-home` | 48.6% | **0.000%** |
| `sel-owner-listings` | 20.1% | **0.000%** |
| `sel-owner-profile` | 11.0% | **0.000%** |
| `sel-builder-profile` | 11.1% | **0.000%** |
| `sel-builder-requirements` | 22.2% | **0.000%** |
| `sel-builder-notifications` | 66.3% | **0.000%** |
| `sel-builder-messages` | 3.2% | **0.000%** |
| `sel-owner-create` | 1.7% | **0.000%** |
| `sel-builder-project-new` | 9.3% | 9.3% — inherently noisy |
| `sel-owner-requirements` | 17.4% | 31.3% — inherently noisy |

So the screens are deterministic; what moved between the two captures is
STATE, not rendering. The `sel-owner-home` diff image shows the cause plainly:
"Property/Requirement", "Buy/Rent" and "Latest" each appear twice, vertically
offset — the signature of the whole column shifting because the story row was
present in one capture and gone in the other (stories expire after 24h, and
`check:story` was already failing on Next 14 for that reason). The bell badge
and bottom-nav badge also differ, because notification counts changed. Content
moving vertically inflates a pixel percentage without a single style changing.

Holding state still is not possible against a live dev database that the
`check:*` scripts and seeds are also writing to. The honest statement is:
seller-screen pixel equality is not measurable in this environment, and the
functional equivalence of those screens rests on the 64/64 API result, the
route manifest, the clean build, and the passing check scripts.

## Defects found in the capture harness while building it

Eleven, each of which would have produced a confident but false report. Listed
because the same traps apply to any future upgrade:

1. `areas` is not a table — area pages are served off `locations`.
2. The area route is `/area/{areaSlug}-{citySlug}`; a bare slug 404s, and a
   404 captured on both sides compares as "identical".
3. `/seller/projects` has no index route, only `[id]` and `new`.
4. A flat post-load delay captured skeletons.
5. Access tokens expired mid-run, bouncing 20 screens to `/login` — identical
   on both sides, so the diff looked clean.
6. The settle detector keyed off `.animate-pulse`, which this app's skeletons
   do not use, so it accepted "no change for 0.75s" — the exact shape of a
   screen waiting on its first fetch. Screens were captured at 85 characters
   of text and matched each other at 0.000%.
7. Re-validating the session before every screen escalated to a fresh OTP
   sign-in and burned the 10/day budget (`SMS_PER_DAY_IP`), bouncing all 33
   authenticated screens.
8. Next's own dev indicator (drawn differently by 14 and 15, absent from
   production) cost a constant ~0.35% on every screen; the PWA install card,
   which appears only when Chrome fires `beforeinstallprompt`, cost ~2.2%.
9. Console errors were compared as raw strings, so the same warning on a
   different port read as a new one.
10. Dev-mode first-request compilation made results move between runs — the
    same screen scored 62% on one run and 0% on the next.
11. The disk filled to 100% mid-capture; `ENOSPC` does not throw on write, it
    silently truncates, so the capture kept "succeeding".
