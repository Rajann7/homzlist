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
